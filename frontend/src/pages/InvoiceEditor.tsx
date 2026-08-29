import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  Client,
  DocumentLine,
  Invoice,
  Payment,
  Product,
  Settings,
} from '../types';
import {
  INVOICE_STATUS_LABELS,
  MANUAL_INVOICE_STATUSES,
  PAYMENT_METHOD_LABELS,
  TAX_REGIME_LABELS,
  TAX_REGIME_NOTE,
  addDays,
  dateInputValue,
  formatDate,
  isZeroRated,
  istFestgeschrieben,
  money,
  today,
} from '../format';
import { PageHead } from '../components/Layout';
import { LineItemEditor } from '../components/LineItemEditor';
import {
  Alert,
  FormModal,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';

interface FormState {
  clientId: number;
  docType: 'invoice' | 'credit';
  issueDate: string;
  dueDate: string;
  serviceDateFrom: string;
  serviceDateTo: string;
  taxRegime: string;
  status: string;
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  notes: string;
  terms: string;
  footer: string;
  lines: DocumentLine[];
}

export function InvoiceEditorPage({ settings }: { settings: Settings }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>({
    clientId: 0,
    docType: 'invoice',
    issueDate: today(),
    dueDate: addDays(today(), settings.paymentTermDays),
    serviceDateFrom: '',
    serviceDateTo: '',
    taxRegime: settings.taxRegime,
    status: 'draft',
    currency: settings.currency,
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients).catch(() => undefined);
    api.get<Product[]>('/products').then(setProducts).catch(() => undefined);
  }, []);

  const loadInvoice = () => {
    if (!id) return;
    api
      .get<Invoice>(`/invoices/${id}`)
      .then((loaded) => {
        setInvoice(loaded);
        setForm({
          clientId: loaded.clientId,
          docType: loaded.docType,
          issueDate: dateInputValue(loaded.issueDate),
          dueDate: dateInputValue(loaded.dueDate),
          serviceDateFrom: dateInputValue(loaded.serviceDateFrom),
          serviceDateTo: dateInputValue(loaded.serviceDateTo),
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

  useEffect(loadInvoice, [id]);

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
      const payload = { ...form, lines: form.lines };
      if (isNew) {
        const created = await api.post<Invoice>('/invoices', payload);
        navigate(`/rechnungen/${created.id}`, { replace: true });
      } else {
        await api.put(`/invoices/${id}`, payload);
        loadInvoice();
        setNotice('Rechnung gespeichert.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const download = async (path: string, filename: string) => {
    setError('');
    try {
      await api.download(path, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download fehlgeschlagen');
    }
  };

  const changeStatus = async (status: string) => {
    try {
      await api.post(`/invoices/${id}/status`, { status });
      loadInvoice();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statuswechsel fehlgeschlagen');
    }
  };

  /** Legt eine Kopie als neuen Entwurf an. */
  const duplicate = async () => {
    try {
      const copy = await api.post<Invoice>(`/invoices/${id}/duplicate`);
      navigate(`/rechnungen/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplizieren fehlgeschlagen');
    }
  };

  /** Erzeugt eine Gutschrift zu dieser Rechnung. */
  const createCredit = async () => {
    const ok = await confirm(
      `Gutschrift zu ${invoice?.number} erzeugen? Sie erhält eine eigene Nummer aus dem Gutschriftskreis.`,
    );
    if (!ok) return;
    try {
      const credit = await api.post<Invoice>(`/invoices/${id}/credit`);
      navigate(`/rechnungen/${credit.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gutschrift fehlgeschlagen');
    }
  };

  /** Verschickt den Beleg sofort, statt auf den taeglichen Lauf zu warten. */
  const sendeJetzt = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/invoices/${id}/send`, {});
      setNotice('Rechnung per Mail verschickt.');
      loadInvoice();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm(
      `Rechnung ${invoice?.number} endgültig löschen? Erfasste Zahlungen werden mitgelöscht.`,
    );
    if (!ok) return;
    try {
      await api.delete(`/invoices/${id}`);
      navigate('/rechnungen');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  };

  const amountDue = invoice ? invoice.total - invoice.amountPaid : 0;
  const isCredit = form.docType === 'credit';
  const docLabel = isCredit ? 'Gutschrift' : 'Rechnung';

  // Festgeschriebene Belege bleiben inhaltlich unveraendert; nur
  // Notizen, Bedingungen und Fusszeile sind noch offen.
  const gesperrt = !!invoice && istFestgeschrieben(invoice.status);

  return (
    <div>
      <PageHead
        title={
          isNew ? 'Neue Rechnung' : `${docLabel} ${invoice?.number ?? ''}`
        }
        subtitle={
          invoice
            ? `Erstellt am ${formatDate(invoice.issueDate)}`
            : 'Positionen erfassen und speichern'
        }
        actions={
          <>
            <button onClick={() => navigate('/rechnungen')}>Zurück</button>
            {!isNew && (
              <>
                <button
                  onClick={() =>
                    download(
                      `/invoices/${id}/pdf?einvoice=0`,
                      `${docLabel}-${invoice?.number}.pdf`,
                    )
                  }
                >
                  PDF
                </button>
                <button
                  onClick={() =>
                    download(
                      `/invoices/${id}/pdf?einvoice=1`,
                      `${docLabel}-${invoice?.number}-zugferd.pdf`,
                    )
                  }
                  title="PDF mit eingebetteter EN16931-XML (ZUGFeRD/Factur-X)"
                >
                  E-Rechnung (PDF)
                </button>
                <button
                  onClick={() =>
                    download(
                      `/invoices/${id}/xrechnung`,
                      `${docLabel}-${invoice?.number}.xml`,
                    )
                  }
                  title="Reine XRechnung-XML für B2G-Empfänger"
                >
                  XRechnung
                </button>
                <button onClick={duplicate} title="Kopie als neuen Entwurf anlegen">
                  Duplizieren
                </button>
                {!isCredit && (
                  <button onClick={createCredit} title="Gutschrift zu diesem Beleg">
                    Gutschrift
                  </button>
                )}
              </>
            )}
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {invoice?.mailError && (
        <Alert kind="warn">
          <strong>Mailversand fehlgeschlagen</strong> ({invoice.mailAttempts}{' '}
          Versuch{invoice.mailAttempts === 1 ? '' : 'e'}): {invoice.mailError}
          <br />
          Der Beleg bleibt freigegeben; der nächste Lauf versucht es erneut.
        </Alert>
      )}

      {gesperrt && (
        <Alert kind="info">
          Dieser Beleg ist festgeschrieben – Positionen und Beträge lassen sich
          nicht mehr ändern. Notizen, Zahlungsbedingungen und Fußzeile bleiben
          offen. Für eine inhaltliche Korrektur erzeugen Sie eine{' '}
          <strong>Gutschrift</strong> und schreiben den Beleg neu.
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
              label="Rechnungsdatum"
              type="date"
              value={form.issueDate}
              onChange={(v) =>
                patch({
                  issueDate: v,
                  dueDate: addDays(v, settings.paymentTermDays),
                })
              }
            />
            <TextInput
              label="Fällig am"
              type="date"
              value={form.dueDate}
              onChange={(v) => patch({ dueDate: v })}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => patch({ status: v })}
              options={
                // Automatisch gesetzte Status bleiben wählbar, solange der
                // Beleg gerade in einem solchen steht - sonst würde das
                // Speichern ihn ungewollt zurücksetzen.
                (MANUAL_INVOICE_STATUSES as readonly string[]).includes(
                  form.status,
                )
                  ? MANUAL_INVOICE_STATUSES.map((value) => ({
                      value,
                      label: INVOICE_STATUS_LABELS[value],
                    }))
                  : [
                      {
                        value: form.status,
                        label: `${INVOICE_STATUS_LABELS[form.status]} (automatisch)`,
                      },
                      ...MANUAL_INVOICE_STATUSES.map((value) => ({
                        value,
                        label: INVOICE_STATUS_LABELS[value],
                      })),
                    ]
              }
              hint="Teilzahlung, Bezahlt und Überfällig ergeben sich aus den Zahlungen."
            />
          </div>

          <div className="grid-4">
            <TextInput
              label="Leistungsdatum / -beginn"
              type="date"
              value={form.serviceDateFrom}
              hint="Pflichtangabe nach § 14 UStG"
              onChange={(v) => patch({ serviceDateFrom: v })}
            />
            <TextInput
              label="Leistungsende (optional)"
              type="date"
              value={form.serviceDateTo}
              hint="Nur bei einem Zeitraum ausfüllen"
              onChange={(v) => patch({ serviceDateTo: v })}
            />
            <Select
              label="Steuerregelung"
              value={form.taxRegime}
              onChange={(v) => patch({ taxRegime: v })}
              options={Object.entries(TAX_REGIME_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <Select
              label="Belegart"
              value={form.docType}
              onChange={(v) =>
                patch({ docType: v as 'invoice' | 'credit' })
              }
              options={[
                { value: 'invoice', label: 'Rechnung' },
                { value: 'credit', label: 'Gutschrift' },
              ]}
              hint={isNew ? 'Bestimmt den Nummernkreis' : 'Nachträglich nicht änderbar'}
            />
          </div>

          {isZeroRated(form.taxRegime) && (
            <Alert kind="info">
              {TAX_REGIME_NOTE[form.taxRegime]} Positionen werden ohne
              Umsatzsteuer berechnet; der Hinweis erscheint auf dem Beleg.
            </Alert>
          )}
          {!form.serviceDateFrom && (
            <Alert kind="warn">
              Ohne Leistungsdatum fehlt eine Pflichtangabe nach § 14 UStG.
            </Alert>
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
            readOnly={gesperrt}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">Texte</div>
        <div className="card-body">
          <TextArea
            label="Notiz auf der Rechnung"
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

      {!isNew && invoice && (
        <div className="detail-grid" style={{ marginTop: 18 }}>
          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-head">
              <span>Zahlungen</span>
              <button
                className="small primary"
                onClick={() => setPaymentOpen(true)}
                disabled={amountDue <= 0}
              >
                Zahlung erfassen
              </button>
            </div>
            <div className="card-body tight">
              {(invoice.payments?.length ?? 0) === 0 ? (
                <div className="empty">Noch keine Zahlungen erfasst.</div>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Art</th>
                      <th>Referenz</th>
                      <th className="num">Betrag</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments!.map((payment: Payment) => (
                      <tr key={payment.id}>
                        <td className="nowrap">{formatDate(payment.date)}</td>
                        <td>
                          {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                        </td>
                        <td>{payment.reference || '—'}</td>
                        <td className="num">
                          {money(payment.amount, invoice.currency)}
                        </td>
                        <td className="actions">
                          <button
                            className="link"
                            onClick={async () => {
                              const ok = await confirm('Zahlung wirklich löschen?');
                              if (!ok) return;
                              await api.delete(`/payments/${payment.id}`);
                              loadInvoice();
                            }}
                          >
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

          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-head">Status &amp; Summen</div>
            <div className="card-body">
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={invoice.status} kind="invoice" />
                </dd>
                <dt>Gesamtbetrag</dt>
                <dd>{money(invoice.total, invoice.currency)}</dd>
                <dt>Bereits gezahlt</dt>
                <dd>{money(invoice.amountPaid, invoice.currency)}</dd>
                <dt>Offen</dt>
                <dd>
                  <strong>{money(amountDue, invoice.currency)}</strong>
                </dd>
              </dl>

              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {invoice.status === 'draft' && (
                  <button
                    className="small primary"
                    onClick={() => changeStatus('approved')}
                    title="Gibt den Beleg zum Versand frei"
                  >
                    Freigeben
                  </button>
                )}
                {invoice.status === 'approved' && !isCredit && (
                  <button
                    className="small"
                    onClick={sendeJetzt}
                    disabled={busy}
                    title="Verschickt den Beleg sofort per Mail, ohne auf den täglichen Lauf zu warten"
                  >
                    Jetzt per Mail senden
                  </button>
                )}
                {['draft', 'approved'].includes(invoice.status) && (
                  <button className="small" onClick={() => changeStatus('sent')}>
                    Als versendet markieren
                  </button>
                )}
                {invoice.status !== 'cancelled' && (
                  <button
                    className="small"
                    onClick={() => changeStatus('cancelled')}
                  >
                    Stornieren
                  </button>
                )}
                {!gesperrt && (
                  <button className="small danger" onClick={remove}>
                    Löschen
                  </button>
                )}
              </div>

              {!settings.iban && (
                <Alert kind="warn">
                  Für den EPC-QR-Code auf dem PDF fehlt die IBAN in den
                  Einstellungen.
                </Alert>
              )}
            </div>
          </div>
        </div>
      )}

      {paymentOpen && invoice && (
        <PaymentModal
          invoice={invoice}
          amountDue={amountDue}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => {
            setPaymentOpen(false);
            loadInvoice();
          }}
        />
      )}

      {dialog}
    </div>
  );
}

function PaymentModal({
  invoice,
  amountDue,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  amountDue: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState(invoice.number);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/payments', {
        invoiceId: invoice.id,
        date,
        amount: Number(amount),
        method,
        reference,
        notes,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      title={`Zahlung zu ${invoice.number}`}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid-2">
        <TextInput label="Datum" type="date" value={date} onChange={setDate} />
        <TextInput
          label={`Betrag (offen: ${money(amountDue, invoice.currency)})`}
          type="number"
          step="0.01"
          value={amount}
          onChange={setAmount}
        />
      </div>
      <Select
        label="Zahlungsart"
        value={method}
        onChange={setMethod}
        options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
      />
      <TextInput label="Referenz" value={reference} onChange={setReference} />
      <TextArea label="Notiz" value={notes} onChange={setNotes} />
    </FormModal>
  );
}
