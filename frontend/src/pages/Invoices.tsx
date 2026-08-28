import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useDebounced } from '../hooks';
import { Invoice } from '../types';
import {
  DOC_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  formatDate,
  money,
} from '../format';
import { PageHead } from '../components/Layout';
import { Alert, EmptyState, StatusBadge } from '../components/ui';

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [docType, setDocType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (docType) params.set('docType', docType);
    if (debouncedSearch) params.set('search', debouncedSearch);
    setLoading(true);
    api
      .get<Invoice[]>(`/invoices?${params}`)
      .then((rows) => {
        setInvoices(rows);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [status, docType, debouncedSearch]);

  // Gutschriften stellen keine Forderung dar und bleiben aussen vor.
  const openTotal = invoices.reduce(
    (sum, invoice) =>
      invoice.docType !== 'credit' &&
      ['sent', 'viewed', 'partial', 'overdue'].includes(invoice.status)
        ? sum + (invoice.total - invoice.amountPaid)
        : sum,
    0,
  );

  return (
    <div>
      <PageHead
        title="Rechnungen"
        subtitle={
          invoices.length > 0
            ? `${invoices.length} Beleg(e) · offen ${money(openTotal)}`
            : undefined
        }
        actions={
          <>
            <button
              onClick={() =>
                api
                  .download('/invoices/export.csv', 'rechnungen.csv')
                  .catch((err) => setError(err.message))
              }
              title="Belegliste als CSV für die Buchhaltung"
            >
              CSV-Export
            </button>
            <Link className="btn primary" to="/rechnungen/neu">
              Neue Rechnung
            </Link>
          </>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Suche nach Nummer oder Kunde…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="">Rechnungen und Gutschriften</option>
          {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-body tight">
          {loading ? (
            <EmptyState>Lädt…</EmptyState>
          ) : invoices.length === 0 ? (
            <EmptyState>
              Keine Belege gefunden.{' '}
              <Link to="/rechnungen/neu">Neue Rechnung anlegen</Link>
            </EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Art</th>
                  <th>Kunde</th>
                  <th>Datum</th>
                  <th>Fällig</th>
                  <th>Status</th>
                  <th className="num">Gesamt</th>
                  <th className="num">Offen</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="clickable"
                    onClick={() => navigate(`/rechnungen/${invoice.id}`)}
                  >
                    <td>{invoice.number}</td>
                    <td>
                      {invoice.docType === 'credit' ? (
                        <span className="badge blue">Gutschrift</span>
                      ) : (
                        <span className="muted">Rechnung</span>
                      )}
                    </td>
                    <td>{invoice.client?.name}</td>
                    <td className="nowrap">{formatDate(invoice.issueDate)}</td>
                    <td className="nowrap">{formatDate(invoice.dueDate)}</td>
                    <td>
                      <StatusBadge status={invoice.status} kind="invoice" />
                    </td>
                    <td className="num">
                      {money(invoice.total, invoice.currency)}
                    </td>
                    <td className="num">
                      {invoice.docType !== 'credit' &&
                      invoice.total - invoice.amountPaid > 0.005
                        ? money(invoice.total - invoice.amountPaid, invoice.currency)
                        : '—'}
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
