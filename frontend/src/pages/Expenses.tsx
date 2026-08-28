import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useDebounced } from '../hooks';
import { Expense, Settings } from '../types';
import {
  EXPENSE_STATUS_LABELS,
  decimal,
  formatDate,
  money,
  today,
} from '../format';
import { PageHead } from '../components/Layout';
import {
  Alert,
  EmptyState,
  FormModal,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';

export function ExpensesPage({ settings }: { settings: Settings }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  // Erst nach kurzer Tipppause laden, statt bei jedem Zeichen.
  const debouncedSearch = useDebounced(search);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const emptyExpense = (): Expense => ({
    id: 0,
    date: today(),
    vendor: '',
    category: '',
    amount: 0,
    taxRate: settings.defaultTaxRate,
    taxAmount: 0,
    total: 0,
    currency: settings.currency,
    description: '',
    reference: '',
    attachmentPath: '',
    status: 'paid',
  });

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    if (debouncedSearch) params.set('search', debouncedSearch);
    api
      .get<Expense[]>(`/expenses?${params}`)
      .then(setExpenses)
      .catch((err) => setError(err.message));
    api.get<string[]>('/expenses/categories').then(setCategories).catch(() => undefined);
  };

  useEffect(load, [status, category, debouncedSearch]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        date: editing.date,
        vendor: editing.vendor,
        category: editing.category,
        amount: editing.amount,
        taxRate: editing.taxRate,
        currency: editing.currency,
        description: editing.description,
        reference: editing.reference,
        status: editing.status,
      };
      if (editing.id) {
        await api.put(`/expenses/${editing.id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (expense: Expense) => {
    const ok = await confirm('Ausgabe wirklich löschen?');
    if (!ok) return;
    await api.delete(`/expenses/${expense.id}`);
    load();
  };

  const patch = (changes: Partial<Expense>) =>
    setEditing((current) => (current ? { ...current, ...changes } : current));

  const totalGross = expenses.reduce((sum, expense) => sum + expense.total, 0);

  // Ueber das Plus in der Seitenleiste: ?neu=1 oeffnet die Neuanlage
  // und wird danach wieder aus der Adresse entfernt.
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    setEditing(emptyExpense());
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div>
      <PageHead
        title="Ausgaben"
        subtitle={
          expenses.length > 0
            ? `${expenses.length} Beleg(e) · ${money(totalGross)} brutto`
            : 'Betriebsausgaben erfassen'
        }
        actions={
          <button className="primary" onClick={() => setEditing(emptyExpense())}>
            Neue Ausgabe
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Suche nach Lieferant, Beschreibung…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-body tight">
          {expenses.length === 0 ? (
            <EmptyState>Keine Ausgaben gefunden.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Lieferant</th>
                  <th>Kategorie</th>
                  <th>Beschreibung</th>
                  <th>Status</th>
                  <th className="num">Netto</th>
                  <th className="num">USt.</th>
                  <th className="num">Brutto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="nowrap">{formatDate(expense.date)}</td>
                    <td>
                      <button className="link" onClick={() => setEditing(expense)}>
                        {expense.vendor || '—'}
                      </button>
                    </td>
                    <td>{expense.category || '—'}</td>
                    <td>{expense.description.slice(0, 60) || '—'}</td>
                    <td>
                      <StatusBadge status={expense.status} kind="expense" />
                    </td>
                    <td className="num">{money(expense.amount, expense.currency)}</td>
                    <td className="num">
                      {money(expense.taxAmount, expense.currency)}
                    </td>
                    <td className="num">{money(expense.total, expense.currency)}</td>
                    <td className="actions">
                      {expense.attachmentPath && (
                        <a
                          href={`/api/expenses/${expense.id}/attachment`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Beleg
                        </a>
                      )}
                      <button className="link" onClick={() => remove(expense)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <ExpenseModal
          expense={editing}
          categories={categories}
          busy={busy}
          onPatch={patch}
          onClose={() => setEditing(null)}
          onSubmit={save}
          onUploaded={load}
        />
      )}

      {dialog}
    </div>
  );
}

function ExpenseModal({
  expense,
  categories,
  busy,
  onPatch,
  onClose,
  onSubmit,
  onUploaded,
}: {
  expense: Expense;
  categories: string[];
  busy: boolean;
  onPatch: (changes: Partial<Expense>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onUploaded: () => void;
}) {
  const [uploadError, setUploadError] = useState('');
  const gross = expense.amount * (1 + expense.taxRate / 100);

  const upload = async (file: File) => {
    setUploadError('');
    try {
      await api.upload(`/expenses/${expense.id}/attachment`, 'attachment', file);
      onUploaded();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    }
  };

  return (
    <FormModal
      title={expense.id ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}
      onClose={onClose}
      onSubmit={onSubmit}
      busy={busy}
    >
      <div className="grid-2">
        <TextInput
          label="Datum"
          type="date"
          value={expense.date.slice(0, 10)}
          onChange={(v) => onPatch({ date: v })}
        />
        <TextInput
          label="Lieferant"
          value={expense.vendor}
          onChange={(v) => onPatch({ vendor: v })}
        />
      </div>

      <div className="field">
        <label>Kategorie</label>
        <input
          type="text"
          list="expense-categories"
          value={expense.category}
          onChange={(e) => onPatch({ category: e.target.value })}
        />
        <datalist id="expense-categories">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="grid-3">
        <TextInput
          label="Betrag (netto)"
          type="number"
          step="0.01"
          value={expense.amount}
          onChange={(v) => onPatch({ amount: Number(v) })}
        />
        <TextInput
          label="USt.-Satz (%)"
          type="number"
          step="0.1"
          value={expense.taxRate}
          onChange={(v) => onPatch({ taxRate: Number(v) })}
        />
        <Select
          label="Status"
          value={expense.status}
          onChange={(v) => onPatch({ status: v })}
          options={Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>

      <div className="muted" style={{ marginBottom: 14 }}>
        Brutto: <strong>{money(gross, expense.currency)}</strong> (USt.{' '}
        {money(gross - expense.amount, expense.currency)} bei{' '}
        {decimal(expense.taxRate, 0)} %)
      </div>

      <TextArea
        label="Beschreibung"
        value={expense.description}
        onChange={(v) => onPatch({ description: v })}
      />
      <TextInput
        label="Referenz / Belegnummer"
        value={expense.reference}
        onChange={(v) => onPatch({ reference: v })}
      />

      {expense.id > 0 && (
        <div className="field">
          <label>Beleg (PDF oder Bild)</label>
          {expense.attachmentPath && (
            <div style={{ marginBottom: 6 }}>
              <a
                href={`/api/expenses/${expense.id}/attachment`}
                target="_blank"
                rel="noreferrer"
              >
                Aktuellen Beleg öffnen
              </a>
            </div>
          )}
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          {uploadError && <div className="hint" style={{ color: 'var(--danger)' }}>{uploadError}</div>}
        </div>
      )}
    </FormModal>
  );
}
