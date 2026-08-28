import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { DashboardData, Kennzahl } from '../types';
import { formatDate, money } from '../format';
import { PageHead } from '../components/Layout';
import { VerlaufsDiagramm } from '../components/Chart';
import { Alert, EmptyState, StatusBadge } from '../components/ui';

/**
 * Veraenderung zum davorliegenden Zeitraum. Bei Ausgaben ist ein Anstieg
 * nichts Gutes - deshalb kehrt "invers" die Einfaerbung um.
 */
function Vergleich({
  kennzahl,
  vorLabel,
  invers = false,
}: {
  kennzahl: Kennzahl;
  vorLabel: string;
  invers?: boolean;
}) {
  if (kennzahl.changePct === null) {
    return <span className="muted">kein Vorwert ({vorLabel})</span>;
  }
  const hoch = kennzahl.changePct > 0;
  const gut = invers ? !hoch : hoch;
  const farbe =
    kennzahl.changePct === 0
      ? 'var(--text-muted)'
      : gut
        ? 'var(--accent)'
        : 'var(--danger)';
  return (
    <>
      <span style={{ color: farbe, fontWeight: 600 }}>
        {hoch ? '▲' : kennzahl.changePct < 0 ? '▼' : '·'}{' '}
        {Math.abs(kennzahl.changePct).toLocaleString('de-DE', {
          maximumFractionDigits: 1,
        })}
        %
      </span>{' '}
      <span className="muted">zu {vorLabel}</span>
    </>
  );
}

export function DashboardPage() {
  const heute = new Date();
  const [kind, setKind] = useState<'month' | 'year' | 'custom'>('month');
  // Vorbelegung des freien Zeitraums: laufender Monat.
  const [von, setVon] = useState(
    new Date(Date.UTC(heute.getFullYear(), heute.getMonth(), 1))
      .toISOString()
      .slice(0, 10),
  );
  const [bis, setBis] = useState(heute.toISOString().slice(0, 10));
  const [year, setYear] = useState(heute.getFullYear());
  const [month, setMonth] = useState(heute.getMonth() + 1);

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [runMessage, setRunMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    const q = new URLSearchParams(
      kind === 'custom'
        ? { period: 'custom', from: von, to: bis }
        : { period: kind, year: String(year), month: String(month) },
    );
    api
      .get<DashboardData>(`/dashboard?${q}`)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(load, [kind, year, month, von, bis]);

  /** Einen Zeitraum vor oder zurueck. */
  const blaettern = (richtung: -1 | 1) => {
    if (kind === 'year') {
      setYear((y) => y + richtung);
      return;
    }
    const m = month + richtung;
    if (m < 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else if (m > 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth(m);
    }
  };

  const aufHeute = () => {
    setYear(heute.getFullYear());
    setMonth(heute.getMonth() + 1);
  };

  /** Erzeugt faellige wiederkehrende Belege sofort, statt auf den Cron zu warten. */
  const runRecurring = async () => {
    setBusy(true);
    setRunMessage('');
    try {
      const result = await api.post<{
        invoicesCreated: number;
        expensesCreated: number;
      }>('/recurring-invoices/run');
      setRunMessage(
        `${result.invoicesCreated} Rechnung(en) und ${result.expensesCreated} Ausgabe(n) erzeugt.`,
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lauf fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <div className="muted">Lädt…</div>;

  const dueTotal = data.dueRecurringInvoices + data.dueRecurringExpenses;
  // Der Server teilt den freien Zeitraum ab zwei Monaten in Monate statt
  // Tage; die Beschriftung der Kurzinfo folgt dem.
  const achsenEinheit =
    kind === 'year'
      ? 'Monat'
      : kind === 'month'
        ? 'Tag'
        : data.series.some((p) => p.label.includes(' '))
          ? 'Monat'
          : 'Tag';
  const c = data.currency;
  const vor = data.period.previousLabel;
  const istAktuell =
    kind === 'custom' ||
    (year === heute.getFullYear() &&
      (kind === 'year' || month === heute.getMonth() + 1));

  return (
    <div>
      <PageHead
        title="Übersicht"
        subtitle="Kennzahlen des gewählten Zeitraums, verglichen mit dem davor"
        actions={
          <Link className="btn primary" to="/rechnungen/neu">
            Neue Rechnung
          </Link>
        }
      />

      {runMessage && <Alert kind="success">{runMessage}</Alert>}

      {dueTotal > 0 && (
        <Alert kind="warn">
          {dueTotal} wiederkehrende Vorlage(n) sind fällig.{' '}
          <button className="link" onClick={runRecurring} disabled={busy}>
            {busy ? 'Wird ausgeführt…' : 'Jetzt erzeugen'}
          </button>
        </Alert>
      )}

      <div className="period-bar">
        <div className="period-switch">
          <button
            className={kind === 'month' ? 'active' : ''}
            onClick={() => setKind('month')}
          >
            Monat
          </button>
          <button
            className={kind === 'year' ? 'active' : ''}
            onClick={() => setKind('year')}
          >
            Jahr
          </button>
          <button
            className={kind === 'custom' ? 'active' : ''}
            onClick={() => setKind('custom')}
          >
            Zeitraum
          </button>
        </div>
        {kind === 'custom' ? (
          <div className="period-nav">
            <input
              type="date"
              value={von}
              max={bis}
              onChange={(e) => setVon(e.target.value)}
            />
            <span className="muted">bis</span>
            <input
              type="date"
              value={bis}
              min={von}
              onChange={(e) => setBis(e.target.value)}
            />
          </div>
        ) : (
          <div className="period-nav">
            <button className="small" onClick={() => blaettern(-1)} title="Zurück">
              ‹
            </button>
            <span className="period-label">{data.period.label}</span>
            <button className="small" onClick={() => blaettern(1)} title="Vor">
              ›
            </button>
          </div>
        )}
        {!istAktuell && (
          <button className="small" onClick={aufHeute}>
            Heute
          </button>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Berechnet</div>
          <div className="value">{money(data.kpis.invoiced.value, c)}</div>
          <div className="meta">
            <Vergleich kennzahl={data.kpis.invoiced} vorLabel={vor} />
          </div>
        </div>

        <div className="stat">
          <div className="label">Zahlungseingänge</div>
          <div className="value">{money(data.kpis.payments.value, c)}</div>
          <div className="meta">
            <Vergleich kennzahl={data.kpis.payments} vorLabel={vor} />
          </div>
        </div>

        <div className="stat">
          <div className="label">Ausgaben</div>
          <div className="value">{money(data.kpis.expenses.value, c)}</div>
          <div className="meta">
            <Vergleich kennzahl={data.kpis.expenses} vorLabel={vor} invers />
          </div>
        </div>

        <div className="stat">
          <div className="label">Überschuss</div>
          <div className="value">{money(data.kpis.result.value, c)}</div>
          <div className="meta">Zahlungseingänge minus Ausgaben</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <span>Verlauf · {data.period.label}</span>
        </div>
        <div className="card-body">
          <VerlaufsDiagramm
            punkte={data.series}
            currency={c}
            einheit={achsenEinheit}
          />
        </div>
      </div>

      <div className="stats" style={{ marginTop: 18 }}>
        <div className="stat">
          <div className="label">Offene Forderungen</div>
          <div className="value">{money(data.outstanding, c)}</div>
          <div className="meta">
            {data.openInvoiceCount} offene Rechnung(en)
            {data.overdueInvoiceCount > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--danger)' }}>
                  {data.overdueInvoiceCount} überfällig
                </span>
              </>
            )}
          </div>
        </div>
        <div className="stat">
          <div className="label">Offene Angebote</div>
          <div className="value">{data.openQuoteCount}</div>
          <div className="meta">Entwürfe und versendete Angebote</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <span>Letzte Rechnungen</span>
          <Link to="/rechnungen">Alle anzeigen</Link>
        </div>
        <div className="card-body tight">
          {data.recentInvoices.length === 0 ? (
            <EmptyState>
              Noch keine Rechnungen.{' '}
              <Link to="/rechnungen/neu">Erste Rechnung anlegen</Link>
            </EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Kunde</th>
                  <th>Datum</th>
                  <th>Fällig</th>
                  <th>Status</th>
                  <th className="num">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/rechnungen/${invoice.id}`}>{invoice.number}</Link>
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
