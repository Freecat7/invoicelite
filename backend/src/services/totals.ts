import { isZeroRated } from '../constants';

/**
 * Zentrale Summenberechnung fuer Rechnungen, Angebote und wiederkehrende
 * Rechnungen. Alle drei nutzen dieselbe Positionsstruktur, deshalb liegt die
 * Logik hier an einer Stelle.
 *
 * Rechenweg:
 *  1. Positionsnetto  = Menge * Einzelpreis (auf 2 Stellen gerundet)
 *  2. Rabatt (prozentual oder absolut) wird anteilig auf die Steuersatz-
 *     gruppen verteilt, damit die Steuer auf dem tatsaechlich zu zahlenden
 *     Netto berechnet wird.
 *  3. Steuer je Steuersatzgruppe auf das rabattierte Netto.
 *
 * Die Gruppenaufstellung (taxBreakdown) wird sowohl im PDF als auch fuer die
 * EN16931-XML der E-Rechnung gebraucht.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  taxRate?: number;
  position?: number;
}

export interface ComputedLine {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface TaxGroup {
  taxRate: number;
  /** Netto der Gruppe vor Rabatt */
  baseAmount: number;
  /** Anteiliger Rabatt dieser Gruppe */
  discountAmount: number;
  /** Netto der Gruppe nach Rabatt (Bemessungsgrundlage) */
  taxableAmount: number;
  taxAmount: number;
}

export interface Totals {
  lines: ComputedLine[];
  /** Summe der Positionsnettos vor Rabatt */
  subtotal: number;
  discountTotal: number;
  /** Netto nach Rabatt */
  netTotal: number;
  taxTotal: number;
  total: number;
  taxBreakdown: TaxGroup[];
}

export function computeTotals(
  rawLines: LineInput[],
  discountValue = 0,
  discountType: string = 'percent',
  taxRegime: string = 'standard',
): Totals {
  // Bei Kleinunternehmer (§ 19) und Reverse Charge (§ 13b) wird keine
  // Umsatzsteuer ausgewiesen - die Saetze der Positionen werden ignoriert.
  const zeroRated = isZeroRated(taxRegime);

  const lines: ComputedLine[] = (rawLines || []).map((l, idx) => {
    const quantity = Number(l.quantity ?? 0);
    const unitPrice = Number(l.unitPrice ?? 0);
    return {
      position: l.position ?? idx,
      description: l.description ?? '',
      quantity,
      unit: l.unit || 'Stk.',
      unitPrice,
      taxRate: zeroRated ? 0 : Number(l.taxRate ?? 0),
      lineTotal: round2(quantity * unitPrice),
    };
  });

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  let discountTotal = 0;
  if (discountValue > 0) {
    discountTotal =
      discountType === 'fixed'
        ? round2(Math.min(discountValue, subtotal))
        : round2((subtotal * discountValue) / 100);
  }

  // Positionen nach Steuersatz gruppieren.
  const groups = new Map<number, TaxGroup>();
  for (const line of lines) {
    const existing = groups.get(line.taxRate);
    if (existing) {
      existing.baseAmount = round2(existing.baseAmount + line.lineTotal);
    } else {
      groups.set(line.taxRate, {
        taxRate: line.taxRate,
        baseAmount: line.lineTotal,
        discountAmount: 0,
        taxableAmount: 0,
        taxAmount: 0,
      });
    }
  }

  const taxBreakdown = [...groups.values()].sort((a, b) => b.taxRate - a.taxRate);

  // Rabatt anteilig verteilen; Rundungsdifferenz auf die groesste Gruppe.
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
  const taxTotal = round2(
    taxBreakdown.reduce((sum, g) => sum + g.taxAmount, 0),
  );

  return {
    lines,
    subtotal,
    discountTotal,
    netTotal,
    taxTotal,
    total: round2(netTotal + taxTotal),
    taxBreakdown,
  };
}
