import { DocumentLine, Product } from '../types';
import { UnitSelect } from './ui';
import { money, decimal } from '../format';
import { computeTotals, lineTotal } from '../totals';

/**
 * Positionseditor, der von Rechnungen, Angeboten und wiederkehrenden
 * Rechnungen gemeinsam genutzt wird. Zeigt zusaetzlich eine Live-Vorschau
 * der Summen inklusive Steueraufstellung.
 */
export function LineItemEditor({
  lines,
  onChange,
  products,
  currency,
  discountValue,
  discountType,
  onDiscountChange,
  defaultTaxRate,
  readOnly = false,
}: {
  lines: DocumentLine[];
  onChange: (lines: DocumentLine[]) => void;
  products: Product[];
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  onDiscountChange: (value: number, type: 'percent' | 'fixed') => void;
  defaultTaxRate: number;
  /** Festgeschriebener Beleg: alle Bedienelemente gesperrt. */
  readOnly?: boolean;
}) {
  const totals = computeTotals(lines, discountValue, discountType);

  const update = (index: number, patch: Partial<DocumentLine>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    onChange([
      ...lines,
      {
        description: '',
        quantity: 1,
        unit: 'Stk.',
        unitPrice: 0,
        taxRate: defaultTaxRate,
      },
    ]);
  };

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  /** Uebernimmt Beschreibung, Preis, Einheit und Steuersatz aus dem Produkt. */
  const applyProduct = (index: number, productId: string) => {
    const product = products.find((p) => String(p.id) === productId);
    if (!product) return;
    update(index, {
      description: product.description
        ? `${product.name}\n${product.description}`
        : product.name,
      unit: product.unit,
      unitPrice: product.unitPrice,
      taxRate: product.taxRate,
    });
  };

  return (
    <fieldset className="line-fieldset" disabled={readOnly}>
      <div>
        <table className="lines">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Beschreibung</th>
              <th className="num" style={{ width: 90 }}>Menge</th>
              <th style={{ width: 90 }}>Einheit</th>
              <th className="num" style={{ width: 110 }}>Einzelpreis</th>
              <th className="num" style={{ width: 80 }}>USt. %</th>
              <th className="num" style={{ width: 110 }}>Betrag</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <textarea
                    rows={2}
                    value={line.description}
                    placeholder="Leistung oder Artikel"
                    onChange={(e) => update(index, { description: e.target.value })}
                  />
                  {products.length > 0 && (
                    <select
                      value=""
                      style={{ marginTop: 4, fontSize: 12 }}
                      onChange={(e) => applyProduct(index, e.target.value)}
                    >
                      <option value="">Aus Produkten übernehmen…</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.sku ? ` (${product.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.001"
                    value={line.quantity}
                    onChange={(e) =>
                      update(index, { quantity: Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <UnitSelect
                    value={line.unit}
                    onChange={(v) => update(index, { unit: v })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) =>
                      update(index, { unitPrice: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.1"
                    value={line.taxRate}
                    onChange={(e) =>
                      update(index, { taxRate: Number(e.target.value) })
                    }
                  />
                </td>
                <td className="line-total">{money(lineTotal(line), currency)}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="link"
                    title="Nach oben"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="link"
                    title="Nach unten"
                    onClick={() => move(index, 1)}
                    disabled={index === lines.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="link"
                    title="Position entfernen"
                    onClick={() => removeLine(index)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ padding: '14px 6px' }}>
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <button type="button" className="small" onClick={addLine} style={{ marginTop: 8 }}>
          + Position hinzufügen
        </button>

        <div className="totals-box">
          <table>
            <tbody>
              <tr>
                <td>Zwischensumme (netto)</td>
                <td className="num">{money(totals.subtotal, currency)}</td>
              </tr>
              <tr>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>Rabatt</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountValue}
                      style={{ width: 90 }}
                      onChange={(e) =>
                        onDiscountChange(Number(e.target.value), discountType)
                      }
                    />
                    <select
                      value={discountType}
                      style={{ width: 'auto' }}
                      onChange={(e) =>
                        onDiscountChange(
                          discountValue,
                          e.target.value as 'percent' | 'fixed',
                        )
                      }
                    >
                      <option value="percent">%</option>
                      <option value="fixed">{currency}</option>
                    </select>
                  </div>
                </td>
                <td className="num">
                  {totals.discountTotal > 0
                    ? `− ${money(totals.discountTotal, currency)}`
                    : money(0, currency)}
                </td>
              </tr>
              {totals.discountTotal > 0 && (
                <tr>
                  <td>Netto nach Rabatt</td>
                  <td className="num">{money(totals.netTotal, currency)}</td>
                </tr>
              )}
              {totals.taxBreakdown.map((group) => (
                <tr key={group.taxRate}>
                  <td className="muted">
                    zzgl. {decimal(group.taxRate, 0)} % USt. auf{' '}
                    {money(group.taxableAmount, currency)}
                  </td>
                  <td className="num">{money(group.taxAmount, currency)}</td>
                </tr>
              ))}
              <tr className="grand">
                <td>Gesamtbetrag</td>
                <td className="num">{money(totals.total, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </fieldset>
  );
}
