import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  Client,
  DocumentLine,
  Product,
  RecurringInvoice,
  Settings,
} from '../types';
import {
  FREQUENCY_LABELS,
  GENERATE_AS_LABELS,
  RECURRING_STATUS_LABELS,
  dateInputValue,
  formatDate,
  money,
  today,
} from '../format';
import { PageHead } from '../components/Layout';
import { LineItemEditor } from '../components/LineItemEditor';
import {
  Alert,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';

interface FormState {
  clientId: number;
  title: string;
  frequency: string;
  nextRunDate: string;
  endDate: string;
  remainingCycles: string;
  status: string;
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  paymentTermDays: number;
  generateAs: string;
  notes: string;
  terms: string;
  footer: string;
  lines: DocumentLine[];
}

interface TemplateDetail extends RecurringInvoice {
  generatedInvoices?: {
    id: number;
    number: string;
    issueDate: string;
    status: string;
    total: number;
    currency: string;
  }[];
}

export function RecurringInvoiceEditorPage({ settings }: { settings: Settings }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [form, setForm] = useState<FormState>({
    clientId: 0,
    title: '',
    frequency: 'monthly',
    nextRunDate: today(),
    endDate: '',
    remainingCycles: '',
    status: 'active',
    currency: settings.currency,
    discountValue: 0,
    discountType: 'percent',
    paymentTermDays: settings.paymentTermDays,
    generateAs: 'draft',
    notes: settings.defaultNotes,
    terms: settings.defaultTerms,
    footer: settings.defaultFooter,
    lines: [],
  });

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => undefined);
    api.get<Product[]>('/products').then(setProducts).catch(() => undefined);
  }, []);

  const loadTemplate = () => {
    if (!id) return;
    api
      .get<TemplateDetail>(`/recurring-invoices/${id}`)
      .then((loaded) => {
        setTemplate(loaded);
        setForm({
          clientId: loaded.clientId,
          title: loaded.title,
          frequency: loaded.frequency,
          nextRunDate: dateInputValue(loaded.nextRunDate),
          endDate: dateInputValue(loaded.endDate),
          remainingCycles:
            loaded.remainingCycles === null ? '' : String(loaded.remainingCycles),
          status: loaded.status,
          currency: loaded.currency,
          discountValue: loaded.discountValue,
          discountType: loaded.discountType,
          paymentTermDays: loaded.paymentTermDays,
          generateAs: loaded.generateAs,
          notes: loaded.notes,
          terms: loaded.terms,
          footer: loaded.footer,
          lines: loaded.lines,
        });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(loadTemplate, [id]);

  const patch = (changes: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  const save = async () => {
    if (!form.clientId) {
      setError('Bitte einen Kunden auswählen.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...form,
        endDate: form.endDate || null,
        remainingCycles:
          form.remainingCycles === '' ? null : Number(form.remainingCycles),
      };
      if (isNew) {
        const created = await api.post<RecurringInvoice>(
          '/recurring-invoices',
          payload,
        );
        navigate(`/wiederkehrende-rechnungen/${created.id}`, { replace: true });
      } else {
        await api.put(`/recurring-invoices/${id}`, payload);
        loadTemplate();
        setNotice('Vorlage gespeichert.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm(
      'Vorlage wirklich löschen? Bereits erzeugte Rechnungen bleiben erhalten.',
    );
    if (!ok) return;
    await api.delete(`/recurring-invoices/${id}`);
    navigate('/wiederkehrende-rechnungen');
  };

  return (
    <div>
      <PageHead
        title={
          isNew
            ? 'Neue wiederkehrende Rechnung'
            : form.title || `Vorlage #${template?.id ?? ''}`
        }
        subtitle="Aus dieser Vorlage werden automatisch Rechnungen erzeugt"
        actions={
          <>
            <button onClick={() => navigate('/wiederkehrende-rechnungen')}>
              Zurück
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="card">
        <div className="card-body">
          <div className="grid-2">
            <TextInput
              label="Bezeichnung"
              value={form.title}
              hint="Nur zur internen Orientierung"
              onChange={(v) => patch({ title: v })}
            />
            <Select
              label="Kunde"
              value={form.clientId}
              onChange={(v) => patch({ clientId: Number(v) })}
              options={[
                { value: 0, label: '– bitte wählen –' },
                ...clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                })),
              ]}
            />
          </div>

          <div className="grid-4">
            <Select
              label="Rhythmus"
              value={form.frequency}
              onChange={(v) => patch({ frequency: v })}
              options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <TextInput
              label="Nächster Lauf"
              type="date"
              value={form.nextRunDate}
              onChange={(v) => patch({ nextRunDate: v })}
            />
            <TextInput
              label="Ende (optional)"
              type="date"
              value={form.endDate}
              onChange={(v) => patch({ endDate: v })}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => patch({ status: v })}
              options={Object.entries(RECURRING_STATUS_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </div>

          <div className="grid-2">
            <TextInput
              label="Verbleibende Durchläufe (optional)"
              type="number"
              min="0"
              value={form.remainingCycles}
              hint="Leer lassen für unbegrenzt"
              onChange={(v) => patch({ remainingCycles: v })}
            />
            <TextInput
              label="Zahlungsziel (Tage)"
              type="number"
              min="0"
              value={form.paymentTermDays}
              onChange={(v) => patch({ paymentTermDays: Number(v) })}
            />
          </div>

          <Select
            label="Erzeugte Rechnungen"
            value={form.generateAs}
            onChange={(v) => patch({ generateAs: v })}
            options={Object.entries(GENERATE_AS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            hint="Freigegebene Rechnungen können direkt von einem Versand-Workflow abgeholt werden."
          />

          {template && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <StatusBadge status={template.status} kind="recurring" />
              <span className="muted">
                Zuletzt ausgeführt: {formatDate(template.lastRunAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">Positionen</div>
        <div className="card-body">
          <LineItemEditor
            lines={form.lines}
            onChange={(lines) => patch({ lines })}
            products={products}
            currency={form.currency}
            discountValue={form.discountValue}
            discountType={form.discountType}
            onDiscountChange={(discountValue, discountType) =>
              patch({ discountValue, discountType })
            }
            defaultTaxRate={settings.defaultTaxRate}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">Texte</div>
        <div className="card-body">
          <TextArea
            label="Notiz"
            value={form.notes}
            onChange={(v) => patch({ notes: v })}
          />
          <div className="grid-2">
            <TextArea
              label="Zahlungsbedingungen"
              value={form.terms}
              onChange={(v) => patch({ terms: v })}
            />
            <TextArea
              label="Fußzeile"
              value={form.footer}
              onChange={(v) => patch({ footer: v })}
            />
          </div>
        </div>
      </div>

      {template && (template.generatedInvoices?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-head">Erzeugte Rechnungen</div>
          <div className="card-body tight">
            <table className="data">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Datum</th>
                  <th>Status</th>
                  <th className="num">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {template.generatedInvoices!.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/rechnungen/${invoice.id}`}>{invoice.number}</Link>
                    </td>
                    <td className="nowrap">{formatDate(invoice.issueDate)}</td>
                    <td>
                      <StatusBadge status={invoice.status} kind="invoice" />
                    </td>
                    <td className="num">
                      {money(invoice.total, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isNew && (
        <div style={{ marginTop: 16 }}>
          <button className="danger small" onClick={remove}>
            Vorlage löschen
          </button>
        </div>
      )}

      {dialog}
    </div>
  );
}
