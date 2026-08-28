import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { RecurringInvoice } from '../types';
import {
  FREQUENCY_LABELS,
  RECURRING_STATUS_LABELS,
  formatDate,
} from '../format';
import { PageHead } from '../components/Layout';
import { Alert, EmptyState, StatusBadge } from '../components/ui';

export function RecurringInvoicesPage() {
  const [templates, setTemplates] = useState<RecurringInvoice[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    api
      .get<RecurringInvoice[]>(`/recurring-invoices?${params}`)
      .then(setTemplates)
      .catch((err) => setError(err.message));
  };

  useEffect(load, [status]);

  /** Erzeugt sofort alle faelligen Belege (sonst laeuft der Cron nachts). */
  const runNow = async () => {
    setBusy(true);
    setNotice('');
    try {
      const result = await api.post<{
        invoicesCreated: number;
        expensesCreated: number;
      }>('/recurring-invoices/run');
      setNotice(
        `${result.invoicesCreated} Rechnung(en) und ${result.expensesCreated} Ausgabe(n) erzeugt.`,
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lauf fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title="Wiederkehrende Rechnungen"
        subtitle="Vorlagen, aus denen automatisch Rechnungen erzeugt werden"
        actions={
          <>
            <button onClick={runNow} disabled={busy}>
              {busy ? 'Läuft…' : 'Fällige jetzt erzeugen'}
            </button>
            <Link className="btn primary" to="/wiederkehrende-rechnungen/neu">
              Neue Vorlage
            </Link>
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
            <EmptyState>
              Keine Vorlagen vorhanden.{' '}
              <Link to="/wiederkehrende-rechnungen/neu">Vorlage anlegen</Link>
            </EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Kunde</th>
                  <th>Rhythmus</th>
                  <th>Nächster Lauf</th>
                  <th>Status</th>
                  <th className="num">Erzeugt</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr
                    key={template.id}
                    className="clickable"
                    onClick={() =>
                      navigate(`/wiederkehrende-rechnungen/${template.id}`)
                    }
                  >
                    <td>{template.title || `Vorlage #${template.id}`}</td>
                    <td>{template.client?.name}</td>
                    <td>{FREQUENCY_LABELS[template.frequency]}</td>
                    <td className="nowrap">{formatDate(template.nextRunDate)}</td>
                    <td>
                      <StatusBadge status={template.status} kind="recurring" />
                    </td>
                    <td className="num">
                      {template._count?.generatedInvoices ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
