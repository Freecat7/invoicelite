import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { RecurringExpense, Settings } from '../types';
import {
  FREQUENCY_LABELS,
  RECURRING_STATUS_LABELS,
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

export function RecurringExpensesPage({ settings }: { settings: Settings }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<RecurringExpense[]>([]);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const emptyTemplate = (): RecurringExpense => ({
    id: 0,
    vendor: '',
    category: '',
    amount: 0,
    taxRate: settings.defaultTaxRate,
    currency: settings.currency,
    description: '',
    frequency: 'monthly',
    nextRunDate: today(),
    endDate: null,
    remainingCycles: null,
    status: 'active',
    lastRunAt: null,
  });

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    api
      .get<RecurringExpense[]>(`/recurring-expenses?${params}`)
      .then(setTemplates)
      .catch((err) => setError(err.message));
  };

  useEffect(load, [status]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        vendor: editing.vendor,
        category: editing.category,
        amount: editing.amount,
        taxRate: editing.taxRate,
        currency: editing.currency,
        description: editing.description,
        frequency: editing.frequency,
        nextRunDate: editing.nextRunDate,
        endDate: editing.endDate || null,
        remainingCycles: editing.remainingCycles,
        status: editing.status,
      };
      if (editing.id) {
        await api.put(`/recurring-expenses/${editing.id}`, payload);
      } else {
        await api.post('/recurring-expenses', payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (template: RecurringExpense) => {
    const ok = await confirm(
      'Vorlage wirklich löschen? Bereits erzeugte Ausgaben bleiben erhalten.',
    );
    if (!ok) return;
    await api.delete(`/recurring-expenses/${template.id}`);
    load();
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ expensesCreated: number }>(
        '/recurring-invoices/run',
      );
      setNotice(`${result.expensesCreated} Ausgabe(n) erzeugt.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lauf fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const patch = (changes: Partial<RecurringExpense>) =>
    setEditing((current) => (current ? { ...current, ...changes } : current));

  // Ueber das Plus in der Seitenleiste: ?neu=1 oeffnet die Neuanlage
  // und wird danach wieder aus der Adresse entfernt.
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    setEditing(emptyTemplate());
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div>
      <PageHead
        title="Wiederkehrende Ausgaben"
        subtitle="Vorlagen für regelmäßige Kosten wie Miete oder Abos"
        actions={
          <>
            <button onClick={runNow} disabled={busy}>
              Fällige jetzt erzeugen
            </button>
            <button className="primary" onClick={() => setEditing(emptyTemplate())}>
              Neue Vorlage
            </button>
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(RECURRING_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-body tight">
          {templates.length === 0 ? (
            <EmptyState>Keine Vorlagen vorhanden.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Lieferant</th>
                  <th>Kategorie</th>
                  <th>Rhythmus</th>
                  <th>Nächster Lauf</th>
                  <th>Status</th>
                  <th className="num">Netto</th>
                  <th className="num">Erzeugt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <button className="link" onClick={() => setEditing(template)}>
                        {template.vendor || `Vorlage #${template.id}`}
                      </button>
                    </td>
                    <td>{template.category || '—'}</td>
                    <td>{FREQUENCY_LABELS[template.frequency]}</td>
                    <td className="nowrap">{formatDate(template.nextRunDate)}</td>
                    <td>
                      <StatusBadge status={template.status} kind="recurring" />
                    </td>
                    <td className="num">
                      {money(template.amount, template.currency)}
                    </td>
                    <td className="num">
                      {template._count?.generatedExpenses ?? 0}
                    </td>
                    <td className="actions">
                      <button className="link" onClick={() => remove(template)}>
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
        <FormModal
          title={editing.id ? 'Vorlage bearbeiten' : 'Neue wiederkehrende Ausgabe'}
          onClose={() => setEditing(null)}
          onSubmit={save}
          busy={busy}
        >
          <div className="grid-2">
            <TextInput
              label="Lieferant"
              value={editing.vendor}
              onChange={(v) => patch({ vendor: v })}
            />
            <TextInput
              label="Kategorie"
              value={editing.category}
              onChange={(v) => patch({ category: v })}
            />
          </div>
          <div className="grid-2">
            <TextInput
              label="Betrag (netto)"
              type="number"
              step="0.01"
              value={editing.amount}
              onChange={(v) => patch({ amount: Number(v) })}
            />
            <TextInput
              label="USt.-Satz (%)"
              type="number"
              step="0.1"
              value={editing.taxRate}
              onChange={(v) => patch({ taxRate: Number(v) })}
            />
          </div>
          <TextArea
            label="Beschreibung"
            value={editing.description}
            onChange={(v) => patch({ description: v })}
          />
          <div className="grid-2">
            <Select
              label="Rhythmus"
              value={editing.frequency}
              onChange={(v) => patch({ frequency: v })}
              options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Select
              label="Status"
              value={editing.status}
              onChange={(v) => patch({ status: v })}
              options={Object.entries(RECURRING_STATUS_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </div>
          <div className="grid-3">
            <TextInput
              label="Nächster Lauf"
              type="date"
              value={editing.nextRunDate.slice(0, 10)}
              onChange={(v) => patch({ nextRunDate: v })}
            />
            <TextInput
              label="Ende (optional)"
              type="date"
              value={editing.endDate?.slice(0, 10) ?? ''}
              onChange={(v) => patch({ endDate: v || null })}
            />
            <TextInput
              label="Durchläufe (optional)"
              type="number"
              min="0"
              value={editing.remainingCycles ?? ''}
              hint="Leer = unbegrenzt"
              onChange={(v) =>
                patch({ remainingCycles: v === '' ? null : Number(v) })
              }
            />
          </div>
        </FormModal>
      )}

      {dialog}
    </div>
  );
}
