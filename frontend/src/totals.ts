import { DocumentLine } from './types';

/**
 * Vorschau-Berechnung im Browser. Spiegelt bewusst die Logik aus
 * backend/src/services/totals.ts, damit der Nutzer die Summen sofort sieht.
 * Verbindlich bleiben immer die vom Server berechneten Werte.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface TaxGroup {
  taxRate: number;
  baseAmount: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface Totals {
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  taxBreakdown: TaxGroup[];
}

export function lineTotal(line: DocumentLine): number {
  return round2(Number(line.quantity || 0) * Number(line.unitPrice || 0));
}

/**
 * Bei Kleinunternehmer (§ 19) und Reverse Charge (§ 13b) wird keine
 * Umsatzsteuer ausgewiesen - genau wie im Backend. Fehlte das hier, zeigte
 * die Vorschau bis zum Speichern weiter 19 %, obwohl die Regelung schon
 * umgestellt war.
 */
function istNullsatz(regime: string): boolean {
  return regime === 'small_business' || regime === 'reverse_charge';
}

export function computeTotals(
  lines: DocumentLine[],
  discountValue = 0,
  discountType = 'percent',
  taxRegime = 'standard',
): Totals {
  const nullsatz = istNullsatz(taxRegime);
  const subtotal = round2(
    lines.reduce((sum, line) => sum + lineTotal(line), 0),
  );

  let discountTotal = 0;
  if (discountValue > 0) {
    discountTotal =
      discountType === 'fixed'
        ? round2(Math.min(discountValue, subtotal))
        : round2((subtotal * discountValue) / 100);
  }

  const groups = new Map<number, TaxGroup>();
  for (const line of lines) {
    const rate = nullsatz ? 0 : Number(line.taxRate || 0);
    const amount = lineTotal(line);
    const existing = groups.get(rate);
    if (existing) {
      existing.baseAmount = round2(existing.baseAmount + amount);
    } else {
      groups.set(rate, {
        taxRate: rate,
        baseAmount: amount,
        discountAmount: 0,
        taxableAmount: 0,
        taxAmount: 0,
      });
    }
  }

  const taxBreakdown = [...groups.values()].sort((a, b) => b.taxRate - a.taxRate);

  let distributed = 0;
  taxBreakdown.forEach((group, idx) => {
    let share: number;
    if (subtotal === 0) {
      share = 0;
    } else if (idx === taxBreakdown.length - 1) {
      share = round2(discountTotal - distributed);
    } else {
      share = round2((discountTotal * group.baseAmount) / subtotal);
      distributed = round2(distributed + share);
    }
    group.discountAmount = share;
    group.taxableAmount = round2(group.baseAmount - share);
    group.taxAmount = round2((group.taxableAmount * group.taxRate) / 100);
  });

  const netTotal = round2(subtotal - discountTotal);
  const taxTotal = round2(taxBreakdown.reduce((s, g) => s + g.taxAmount, 0));

  return {
    subtotal,
    discountTotal,
    netTotal,
    taxTotal,
    total: round2(netTotal + taxTotal),
    taxBreakdown,
  };
}
