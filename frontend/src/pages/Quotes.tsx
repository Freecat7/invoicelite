import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Quote } from '../types';
import { QUOTE_STATUS_LABELS, formatDate, money } from '../format';
import { PageHead } from '../components/Layout';
import { Alert, EmptyState, StatusBadge } from '../components/ui';

export function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    api
      .get<Quote[]>(`/quotes?${params}`)
      .then(setQuotes)
      .catch((err) => setError(err.message));
  }, [status]);

  return (
    <div>
      <PageHead
        title="Angebote"
        subtitle="Angebote erstellen und bei Annahme in Rechnungen umwandeln"
        actions={
          <Link className="btn primary" to="/angebote/neu">
            Neues Angebot
          </Link>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="card-body tight">
          {quotes.length === 0 ? (
            <EmptyState>
              Keine Angebote gefunden.{' '}
              <Link to="/angebote/neu">Neues Angebot anlegen</Link>
            </EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Kunde</th>
                  <th>Datum</th>
                  <th>Gültig bis</th>
                  <th>Status</th>
                  <th className="num">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr
                    key={quote.id}
                    className="clickable"
                    onClick={() => navigate(`/angebote/${quote.id}`)}
                  >
                    <td>{quote.number}</td>
                    <td>{quote.client?.name}</td>
                    <td className="nowrap">{formatDate(quote.issueDate)}</td>
                    <td className="nowrap">{formatDate(quote.validUntil)}</td>
                    <td>
                      <StatusBadge status={quote.status} kind="quote" />
                    </td>
                    <td className="num">{money(quote.total, quote.currency)}</td>
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
