import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Client, DocumentLine, Invoice, Product, Quote, Settings } from '../types';
import { QUOTE_STATUS_LABELS, TAX_REGIME_LABELS, addDays, dateInputValue, formatDate, today } from '../format';
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
  issueDate: string;
  validUntil: string;
  status: string;
  currency: string;
  taxRegime: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  notes: string;
  terms: string;
  footer: string;
  lines: DocumentLine[];
}

export function QuoteEditorPage({ settings }: { settings: Settings }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState<FormState>({
    clientId: 0,
    issueDate: today(),
    validUntil: addDays(today(), 30),
    status: 'draft',
    currency: settings.currency,
    taxRegime: settings.taxRegime,
    discountValue: 0,
    discountType: 'percent',
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

  const loadQuote = () => {
    if (!id) return;
    api
      .get<Quote>(`/quotes/${id}`)
      .then((loaded) => {
        setQuote(loaded);
        setForm({
          clientId: loaded.clientId,
          issueDate: dateInputValue(loaded.issueDate),
          validUntil: dateInputValue(loaded.validUntil),
          taxRegime: loaded.taxRegime,
          status: loaded.status,
          currency: loaded.currency,
          discountValue: loaded.discountValue,
          discountType: loaded.discountType,
          notes: loaded.notes,
          terms: loaded.terms,
          footer: loaded.footer,
          lines: loaded.lines,
        });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(loadQuote, [id]);

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
      if (isNew) {
        const created = await api.post<Quote>('/quotes', form);
        navigate(`/angebote/${created.id}`, { replace: true });
      } else {
        await api.put(`/quotes/${id}`, form);
        loadQuote();
        setNotice('Angebot gespeichert.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  /** Erzeugt eine Rechnung aus dem Angebot und springt direkt dorthin. */
  const convert = async () => {
    const ok = await confirm(
      'Aus diesem Angebot eine Rechnung erzeugen? Das Angebot wird als umgewandelt markiert.',
    );
    if (!ok) return;
    try {
      const invoice = await api.post<Invoice>(`/quotes/${id}/convert`);
      navigate(`/rechnungen/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umwandlung fehlgeschlagen');
    }
  };

  /** Verschickt das Angebot als PDF an den Kunden. */
  const perMailSenden = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/quotes/${id}/send`, {});
      setNotice('Angebot per Mail verschickt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm(`Angebot ${quote?.number} wirklich löschen?`);
    if (!ok) return;
    await api.delete(`/quotes/${id}`);
    navigate('/angebote');
  };

  return (
    <div>
      <PageHead
        title={isNew ? 'Neues Angebot' : `Angebot ${quote?.number ?? ''}`}
        subtitle={
          quote ? `Erstellt am ${formatDate(quote.issueDate)}` : undefined
        }
        actions={
          <>
            <button onClick={() => navigate('/angebote')}>Zurück</button>
            {!isNew && (
              <button
                onClick={() =>
                  api
                    .download(
                      `/quotes/${id}/pdf`,
                      `Angebot-${quote?.number}.pdf`,
                    )
                    .catch((err) => setError(err.message))
                }
              >
                PDF
              </button>
            )}
            {!isNew && (
              <button
                onClick={perMailSenden}
                disabled={busy}
                title="Verschickt das Angebot als PDF an den Kunden"
              >
                Per Mail senden
              </button>
            )}
            {!isNew && !quote?.convertedInvoiceId && (
              <button onClick={convert}>In Rechnung umwandeln</button>
            )}
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {quote?.convertedInvoiceId && (
        <Alert kind="info">
          Dieses Angebot wurde bereits in eine Rechnung umgewandelt.{' '}
          <a href={`/rechnungen/${quote.convertedInvoiceId}`}>Zur Rechnung</a>
        </Alert>
      )}

      <div className="card">
        <div className="card-body">
          <div className="grid-4">
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
            <TextInput
              label="Angebotsdatum"
              type="date"
              value={form.issueDate}
              onChange={(v) => patch({ issueDate: v })}
            />
            <TextInput
              label="Gültig bis"
              type="date"
              value={form.validUntil}
              onChange={(v) => patch({ validUntil: v })}
            />
            <Select
              label="Steuerregelung"
              value={form.taxRegime}
              onChange={(v) => patch({ taxRegime: v })}
              hint="Wird beim Anlegen festgehalten – ein verschicktes Angebot ändert sich nicht mehr."
              options={Object.entries(TAX_REGIME_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => patch({ status: v })}
              options={Object.entries(QUOTE_STATUS_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </div>
          {quote && (
            <div>
              <StatusBadge status={quote.status} kind="quote" />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">Positionen</div>
        <div className="card-body">
          <LineItemEditor
            taxRegime={form.taxRegime}
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
            label="Notiz auf dem Angebot"
            value={form.notes}
            onChange={(v) => patch({ notes: v })}
          />
          <div className="grid-2">
            <TextArea
              label="Bedingungen"
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

      {!isNew && (
        <div style={{ marginTop: 16 }}>
          <button className="danger small" onClick={remove}>
            Angebot löschen
          </button>
        </div>
      )}

      {dialog}
    </div>
  );
}
