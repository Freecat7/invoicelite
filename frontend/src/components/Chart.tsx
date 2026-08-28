import { useState } from 'react';
import { VerlaufsPunkt } from '../types';
import { money } from '../format';

/**
 * Gruppiertes Saeulendiagramm fuer den Verlauf eines Zeitraums.
 *
 * Bewusst als reines SVG ohne Diagramm-Bibliothek: es ist eine Form, die
 * Daten sind klein, und so bleibt das Buendel schlank. Die Farben kommen aus
 * einer geprueften Palette (siehe styles.css, .viz-root).
 */

const REIHEN = [
  { key: 'invoiced', label: 'Berechnet', farbe: 'var(--series-1)' },
  { key: 'payments', label: 'Eingegangen', farbe: 'var(--series-3)' },
  { key: 'expenses', label: 'Ausgaben', farbe: 'var(--series-2)' },
] as const;

/** Achsenteilung auf runde Werte - 0 / 500 / 1.000 statt 0 / 437 / 874. */
function achse(max: number): number[] {
  if (max <= 0) return [0, 1];
  const roh = max / 4;
  const groesse = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * groesse).find((s) => s >= roh)!;
  const obergrenze = Math.ceil(max / schritt) * schritt;
  const ticks: number[] = [];
  for (let v = 0; v <= obergrenze + 1e-9; v += schritt) ticks.push(v);
  return ticks;
}

function kurz(wert: number): string {
  if (wert >= 1000) return `${(wert / 1000).toLocaleString('de-DE')}k`;
  return wert.toLocaleString('de-DE');
}

export function VerlaufsDiagramm({
  punkte,
  currency,
  einheit,
}: {
  punkte: VerlaufsPunkt[];
  currency: string;
  einheit: string;
}) {
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);

  const max = Math.max(
    0,
    ...punkte.flatMap((p) => [p.invoiced, p.payments, p.expenses]),
  );
  const ticks = achse(max);
  const obergrenze = ticks[ticks.length - 1];

  // Feste Zeichenflaeche; das SVG skaliert ueber viewBox mit.
  const B = 1000;
  const H = 260;
  const links = 54;
  const unten = 26;
  const oben = 10;
  const breite = B - links - 8;
  const hoehe = H - unten - oben;

  const bandBreite = breite / Math.max(punkte.length, 1);
  // Saeulen duenn halten und den Rest als Luft stehen lassen.
  const saeule = Math.min(14, (bandBreite - 8) / REIHEN.length);
  const gruppe = saeule * REIHEN.length + 2 * (REIHEN.length - 1);

  const y = (wert: number) =>
    oben + hoehe - (obergrenze > 0 ? (wert / obergrenze) * hoehe : 0);

  const leer = max === 0;

  return (
    <div className="viz-root">
      <div className="viz-head">
        <div className="viz-legend">
          {REIHEN.map((r) => (
            <span key={r.key} className="viz-legend-item">
              <span className="viz-swatch" style={{ background: r.farbe }} />
              {r.label}
            </span>
          ))}
        </div>
        <button className="small" onClick={() => setTabelle((t) => !t)}>
          {tabelle ? 'Diagramm' : 'Tabelle'}
        </button>
      </div>

      {tabelle ? (
        <div className="viz-table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{einheit}</th>
                {REIHEN.map((r) => (
                  <th key={r.key} className="num">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {punkte.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="num">{money(p.invoiced, currency)}</td>
                  <td className="num">{money(p.payments, currency)}</td>
                  <td className="num">{money(p.expenses, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : leer ? (
        <div className="viz-empty">Für diesen Zeitraum liegen keine Werte vor.</div>
      ) : (
        <div className="viz-plot">
          <svg viewBox={`0 0 ${B} ${H}`} className="viz-svg" role="img"
               aria-label={`Verlauf je ${einheit}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={links} x2={B - 8} y1={y(t)} y2={y(t)}
                  className="viz-grid"
                />
                <text x={links - 8} y={y(t) + 4} className="viz-tick">
                  {kurz(t)}
                </text>
              </g>
            ))}

            {punkte.map((p, i) => {
              const bandX = links + i * bandBreite;
              const start = bandX + (bandBreite - gruppe) / 2;
              return (
                // Die Ereignisse liegen auf der Gruppe, nicht auf dem
                // Trefferrechteck: sonst gilt der Weg vom Rechteck auf eine
                // Saeule als Verlassen und die Kurzinfo verschwindet wieder.
                <g
                  key={p.label}
                  onMouseEnter={() => setAktiv(i)}
                  onMouseLeave={() => setAktiv(null)}
                >
                  {/* Grosszuegige Trefferflaeche fuer die Kurzinfo */}
                  <rect
                    x={bandX} y={oben} width={bandBreite} height={hoehe}
                    fill="transparent"
                  />
                  {aktiv === i && (
                    <rect
                      x={bandX} y={oben} width={bandBreite} height={hoehe}
                      className="viz-hover-band"
                    />
                  )}
                  {REIHEN.map((r, j) => {
                    const wert = p[r.key];
                    const hoehe1 = oben + hoehe - y(wert);
                    if (hoehe1 <= 0) return null;
                    return (
                      <rect
                        key={r.key}
                        x={start + j * (saeule + 2)}
                        y={y(wert)}
                        width={saeule}
                        height={hoehe1}
                        rx={Math.min(4, saeule / 2)}
                        fill={r.farbe}
                      />
                    );
                  })}
                  <text
                    x={bandX + bandBreite / 2}
                    y={H - 8}
                    className="viz-label"
                  >
                    {p.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {aktiv !== null && (
            <div
              className="viz-tip"
              style={{
                left: `${((links + (aktiv + 0.5) * bandBreite) / B) * 100}%`,
              }}
            >
              <div className="viz-tip-head">
                {einheit} {punkte[aktiv].label}
              </div>
              {REIHEN.map((r) => (
                <div key={r.key} className="viz-tip-row">
                  <span className="viz-swatch" style={{ background: r.farbe }} />
                  <span className="viz-tip-label">{r.label}</span>
                  <span className="viz-tip-value">
                    {money(punkte[aktiv][r.key], currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
