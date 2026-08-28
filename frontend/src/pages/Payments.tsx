import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Invoice, Payment } from '../types';
import { PAYMENT_METHOD_LABELS, formatDate, money, today } from '../format';
import { PageHead } from '../components/Layout';
import {
  Alert,
  EmptyState,
  FormModal,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';

export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = () => {
    api
      .get<Payment[]>('/payments')
      .then(setPayments)
      .catch((err) => setError(err.message));
    // Nur noch offene Rechnungen zur Auswahl anbieten.
    Promise.all([
      api.get<Invoice[]>('/invoices?status=sent'),
      api.get<Invoice[]>('/invoices?status=partial'),
      api.get<Invoice[]>('/invoices?status=overdue'),
      api.get<Invoice[]>('/invoices?status=draft'),
    ])
      .then((groups) => setOpenInvoices(groups.flat()))
      .catch(() => undefined);
  };

  useEffect(load, []);

  const remove = async (payment: Payment) => {
    const ok = await confirm(
      `Zahlung über ${money(payment.amount)} wirklich löschen?`,
    );
    if (!ok) return;
    await api.delete(`/payments/${payment.id}`);
    load();
  };

  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

  // Ueber das Plus in der Seitenleiste: ?neu=1 oeffnet die Neuanlage
  // und wird danach wieder aus der Adresse entfernt.
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    setCreating(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div>
      <PageHead
        title="Zahlungen"
        subtitle={
          payments.length > 0
            ? `${payments.length} Zahlung(en) · ${money(total)}`
            : 'Erfasste Zahlungseingänge'
        }
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            Zahlung erfassen
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        <div className="card-body tight">
          {payments.length === 0 ? (
            <EmptyState>Noch keine Zahlungen erfasst.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Rechnung</th>
                  <th>Kunde</th>
                  <th>Zahlungsart</th>
                  <th>Referenz</th>
                  <th className="num">Betrag</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="nowrap">{formatDate(payment.date)}</td>
                    <td>
                      <Link to={`/rechnungen/${payment.invoiceId}`}>
                        {payment.invoice?.number}
                      </Link>
                    </td>
                    <td>{payment.invoice?.client?.name}</td>
                    <td>
                      {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
                    </td>
                    <td>{payment.reference || '—'}</td>
                    <td className="num">
                      {money(payment.amount, payment.invoice?.currency)}
                    </td>
                    <td className="actions">
                      <button className="link" onClick={() => remove(payment)}>
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

      {creating && (
        <CreatePaymentModal
          invoices={openInvoices}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {dialog}
    </div>
  );
}

function CreatePaymentModal({
  invoices,
  onClose,
  onSaved,
}: {
  invoices: Invoice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [invoiceId, setInvoiceId] = useState(0);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState('0');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = invoices.find((invoice) => invoice.id === invoiceId);

  /** Beim Wechsel der Rechnung den offenen Betrag vorbelegen. */
  const selectInvoice = (value: string) => {
    const id = Number(value);
    setInvoiceId(id);
    const invoice = invoices.find((i) => i.id === id);
    if (invoice) {
      setAmount((invoice.total - invoice.amountPaid).toFixed(2));
      setReference(invoice.number);
    }
  };

  const submit = async () => {
    if (!invoiceId) {
      setError('Bitte eine Rechnung auswählen.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/payments', {
        invoiceId,
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
      title="Zahlung erfassen"
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
    >
      {error && <Alert kind="error">{error}</Alert>}
      <Select
        label="Rechnung"
        value={invoiceId}
        onChange={selectInvoice}
        options={[
          { value: 0, label: '– bitte wählen –' },
          ...invoices.map((invoice) => ({
            value: invoice.id,
            label: `${invoice.number} · ${invoice.client?.name ?? ''} · offen ${money(
              invoice.total - invoice.amountPaid,
              invoice.currency,
            )}`,
          })),
        ]}
      />
      <div className="grid-2">
        <TextInput label="Datum" type="date" value={date} onChange={setDate} />
        <TextInput
          label={
            selected
              ? `Betrag (offen: ${money(selected.total - selected.amountPaid, selected.currency)})`
              : 'Betrag'
          }
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
