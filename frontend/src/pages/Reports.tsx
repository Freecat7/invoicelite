import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, money } from '../format';
import { PageHead } from '../components/Layout';
import { Alert, EmptyState } from '../components/ui';

interface Einnahme {
  id: number;
  date: string;
  belegNummer: string;
  invoiceId: number;
  kunde: string;
  amount: number;
  method: string;
  reference: string;
}

interface Ausgabe {
  id: number;
  date: string;
  vendor: string;
  category: string;
  description: string;
  net: number;
  tax: number;
  gross: number;
}

interface Euer {
  year: number | null;
  currency: string;
  kleinunternehmer: boolean;
  einnahmen: Einnahme[];
  ausgaben: Ausgabe[];
  ausgabenJeKategorie: {
    category: string;
    net: number;
    tax: number;
    gross: number;
    count: number;
  }[];
  summen: {
    einnahmen: number;
    ausgabenBrutto: number;
    ausgabenNetto: number;
    vorsteuer: number;
    ueberschuss: number;
  };
  /** Beschriftung des Zeitraums; bei einem Jahr die Jahreszahl. */
  zeitraum: string;
  von: string;
  bis: string;
}

const METHODEN: Record<string, string> = {
  bank_transfer: 'Überweisung',
  cash: 'Bar',
  card: 'Karte',
  paypal: 'PayPal',
  direct_debit: 'Lastschrift',
  other: 'Sonstiges',
};

export function ReportsPage() {
  const jetzt = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(jetzt);
  // Freier Zeitraum als Alternative zum Jahr; vorbelegt mit dem laufenden.
  const [von, setVon] = useState(`${jetzt}-01-01`);
  const [bis, setBis] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Euer | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    const q =
      year === null
        ? `from=${von}&to=${bis}`
        : `year=${year}`;
    api
      .get<Euer>(`/reports/euer?${q}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [year, von, bis]);

  // Jahre kommen vom Server: alles mit Belegen, dazu das laufende und das
  // kommende Jahr. So steht nach dem Jahreswechsel sofort das neue Jahr
  // bereit, und ein Beleg mit Datum im naechsten Jahr ist auswaehlbar.
  const [jahre, setJahre] = useState<number[]>([jetzt]);
  useEffect(() => {
    api
      .get<number[]>('/reports/years')
      .then((liste) => setJahre(liste.length ? liste : [jetzt]))
      .catch(() => setJahre([jetzt]));
  }, [jetzt]);

  if (error) return <Alert kind="error">{error}</Alert>;

  const c = data?.currency ?? 'EUR';

  return (
    <div>
      <PageHead
        title="Einnahmen-Überschuss-Rechnung"
        subtitle="Nach § 4 Abs. 3 EStG – maßgeblich ist, wann Geld geflossen ist"
        actions={
          <a
            className="btn"
            href={
              year === null
                ? `/api/reports/euer.csv?from=${von}&to=${bis}`
                : `/api/reports/euer.csv?year=${year}`
            }
            download
          >
            CSV für die Steuerkanzlei
          </a>
        }
      />

      <div className="period-bar">
        <div className="period-switch">
          {jahre.map((j) => (
            <button
              key={j}
              className={j === year ? 'active' : ''}
              onClick={() => setYear(j)}
            >
              {j}
            </button>
          ))}
          <button
            className={year === null ? 'active' : ''}
            onClick={() => setYear(null)}
          >
            Zeitraum
          </button>
        </div>
        {year === null && (
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
        )}
      </div>

      {!data ? (
        <div className="muted">Lädt…</div>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">Einnahmen</div>
              <div className="value">{money(data.summen.einnahmen, c)}</div>
              <div className="meta">{data.einnahmen.length} Zahlungseingang/-eingänge</div>
            </div>
            <div className="stat">
              <div className="label">Betriebsausgaben</div>
              <div className="value">
                {money(
                  data.kleinunternehmer
                    ? data.summen.ausgabenBrutto
                    : data.summen.ausgabenNetto,
                  c,
                )}
              </div>
              <div className="meta">
                {data.kleinunternehmer
                  ? 'brutto – kein Vorsteuerabzug bei § 19'
                  : `netto · ${money(data.summen.vorsteuer, c)} Vorsteuer`}
              </div>
            </div>
            <div className="stat">
              <div className="label">Überschuss</div>
              <div className="value">{money(data.summen.ueberschuss, c)}</div>
              <div className="meta">Einnahmen minus Betriebsausgaben</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span>Ausgaben nach Kategorie</span>
            </div>
            <div className="card-body tight">
              {data.ausgabenJeKategorie.length === 0 ? (
                <EmptyState>Keine Ausgaben in {data.zeitraum}.</EmptyState>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Kategorie</th>
                      <th className="num">Belege</th>
                      <th className="num">Netto</th>
                      <th className="num">USt.</th>
                      <th className="num">Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ausgabenJeKategorie.map((k) => (
                      <tr key={k.category}>
                        <td>{k.category}</td>
                        <td className="num">{k.count}</td>
                        <td className="num">{money(k.net, c)}</td>
                        <td className="num">{money(k.tax, c)}</td>
                        <td className="num">{money(k.gross, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span>Einnahmen · {data.zeitraum}</span>
              <span className="muted">
                Summe {money(data.summen.einnahmen, c)}
              </span>
            </div>
            <div className="card-body tight">
              {data.einnahmen.length === 0 ? (
                <EmptyState>Keine Zahlungseingänge in {data.zeitraum}.</EmptyState>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Beleg</th>
                      <th>Kunde</th>
                      <th>Zahlungsart</th>
                      <th className="num">Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.einnahmen.map((e) => (
                      <tr key={e.id}>
                        <td className="nowrap">{formatDate(e.date)}</td>
                        <td>
                          <Link to={`/rechnungen/${e.invoiceId}`}>
                            {e.belegNummer}
                          </Link>
                        </td>
                        <td>{e.kunde}</td>
                        <td>{METHODEN[e.method] ?? e.method}</td>
                        <td className="num">{money(e.amount, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span>Ausgaben · {data.zeitraum}</span>
              <span className="muted">
                Summe {money(data.summen.ausgabenBrutto, c)} brutto
              </span>
            </div>
            <div className="card-body tight">
              {data.ausgaben.length === 0 ? (
                <EmptyState>Keine Ausgaben in {data.zeitraum}.</EmptyState>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Händler</th>
                      <th>Kategorie</th>
                      <th>Beschreibung</th>
                      <th className="num">Netto</th>
                      <th className="num">USt.</th>
                      <th className="num">Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ausgaben.map((a) => (
                      <tr key={a.id}>
                        <td className="nowrap">{formatDate(a.date)}</td>
                        <td>{a.vendor}</td>
                        <td>{a.category}</td>
                        <td>{a.description}</td>
                        <td className="num">{money(a.net, c)}</td>
                        <td className="num">{money(a.tax, c)}</td>
                        <td className="num">{money(a.gross, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <Alert kind="info">
            Maßgeblich ist das Zufluss- und Abflussprinzip: gezählt wird, wann
            das Geld geflossen ist, nicht wann die Rechnung geschrieben wurde.
            Offene Rechnungen tauchen hier deshalb nicht auf.
            {data.kleinunternehmer &&
              ' Bei der Kleinunternehmerregelung nach § 19 UStG gibt es keinen Vorsteuerabzug – Ausgaben zählen brutto.'}{' '}
            Die Auswertung ersetzt keine steuerliche Beratung.
          </Alert>
        </>
      )}
    </div>
  );
}
