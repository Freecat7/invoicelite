/**
 * Belegstatus. Der Weg bis zum Versand ist dreistufig:
 *   draft    - in Arbeit
 *   approved - freigegeben, wartet auf den Versand
 *   sent     - versendet
 * Danach steuern erfasste Zahlungen bzw. das Zahlungsziel den Status.
 */
export const INVOICE_STATUSES = [
  'draft',
  'approved',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
  'reversed',
] as const;

/** Status, in dem wiederkehrende Belege erzeugt werden duerfen. */
export const GENERATE_AS_STATUSES = ['draft', 'approved'] as const;

/** Belegarten mit eigenem Nummernkreis. */
export const DOC_TYPES = ['invoice', 'credit'] as const;

/**
 * Umsatzsteuerliche Behandlung eines Belegs.
 *  standard       - Regelbesteuerung, Steuersaetze je Position
 *  small_business - Kleinunternehmer nach § 19 UStG, kein USt-Ausweis
 *  reverse_charge - Steuerschuldnerschaft des Leistungsempfaengers (§ 13b)
 */
export const TAX_REGIMES = [
  'standard',
  'small_business',
  'reverse_charge',
] as const;

export type TaxRegime = (typeof TAX_REGIMES)[number];

/** Pflichthinweis auf dem Beleg, wenn keine Umsatzsteuer ausgewiesen wird. */
export const TAX_REGIME_NOTE: Record<string, string> = {
  standard: '',
  small_business:
    'Gemäß § 19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.',
  reverse_charge:
    'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG).',
};

/**
 * Der Hinweis steht wortgleich auf Rechnung, Gutschrift und Angebot.
 *
 * Auf einem Angebot gibt es streng genommen noch keinen Rechnungsbetrag;
 * die einheitliche Formulierung ist aber bewusst so gewaehlt - der Kunde
 * liest denselben Satz spaeter auf der Rechnung wieder.
 */
export function taxRegimeNoteFor(regime: string, _kind: string): string {
  return TAX_REGIME_NOTE[regime] || '';
}

/**
 * EN16931-Steuerkategorie je Regelung:
 *  S = Regelsteuersatz, Z = Nullsatz,
 *  E = steuerbefreit, AE = Reverse Charge.
 */
export function taxCategoryFor(regime: string, taxRate: number): string {
  if (regime === 'reverse_charge') return 'AE';
  if (regime === 'small_business') return 'E';
  return taxRate > 0 ? 'S' : 'Z';
}

/** Begruendung der Steuerbefreiung (BT-121), Pflicht bei E und AE. */
export function taxExemptionReasonFor(regime: string): string | null {
  if (regime === 'reverse_charge') return 'Reverse charge';
  if (regime === 'small_business')
    return 'Kleinunternehmer gemäß § 19 UStG';
  return null;
}

/** Bei Kleinunternehmer/Reverse-Charge wird ohne Umsatzsteuer gerechnet. */
export function isZeroRated(regime: string): boolean {
  return regime === 'small_business' || regime === 'reverse_charge';
}

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'approved',
  'declined',
  'converted',
  'expired',
] as const;

export const EXPENSE_STATUSES = ['pending', 'paid', 'reimbursed'] as const;

export const RECURRING_STATUSES = ['active', 'paused', 'finished'] as const;

export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

export const PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'card',
  'paypal',
  'direct_debit',
  'other',
] as const;

export const E_INVOICE_FORMATS = ['off', 'zugferd', 'xrechnung'] as const;

/**
 * Abbildung der im UI verwendeten Einheiten auf UN/ECE-Rec-20-Codes,
 * die fuer EN16931-konforme E-Rechnungen benoetigt werden.
 */
export const UNIT_CODES: Record<string, string> = {
  'Stk.': 'H87',
  Stk: 'H87',
  Stueck: 'H87',
  'Std.': 'HUR',
  Std: 'HUR',
  Stunde: 'HUR',
  Stunden: 'HUR',
  Tag: 'DAY',
  Tage: 'DAY',
  Monat: 'MON',
  Jahr: 'ANN',
  kg: 'KGM',
  g: 'GRM',
  t: 'TNE',
  m: 'MTR',
  km: 'KMT',
  'm²': 'MTK',
  'm³': 'MTQ',
  l: 'LTR',
  Liter: 'LTR',
  Pauschal: 'LS',
  pauschal: 'LS',
  Km: 'KMT',
};

export function unitCodeFor(unit: string): string {
  return UNIT_CODES[unit?.trim()] || 'H87';
}

/**
 * Ab diesen Status gilt ein Beleg als in Verkehr gebracht: er darf inhaltlich
 * nicht mehr veraendert und nicht geloescht werden (GoBD, Grundsatz der
 * Unveraenderbarkeit). Korrekturen laufen ueber eine Gutschrift, das
 * Zurueckziehen ueber den Status "cancelled".
 */
export const LOCKED_INVOICE_STATUSES = [
  'approved',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
  'reversed',
] as const;

/** Felder, die auch an einem festgeschriebenen Beleg noch aenderbar sind. */
export const EDITABLE_WHEN_LOCKED = ['notes', 'terms', 'footer'] as const;
