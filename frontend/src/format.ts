/** Gemeinsame Formatierung fuer Betraege, Zahlen und Datumsangaben. */

let currentLocale = 'de-DE';
let currentCurrency = 'EUR';

export function setFormatDefaults(locale: string, currency: string): void {
  if (locale) currentLocale = locale;
  if (currency) currentCurrency = currency;
}

export function money(value: number | null | undefined, currency?: string): string {
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: currency || currentCurrency,
  }).format(value ?? 0);
}

export function decimal(value: number | null | undefined, digits = 2): string {
  return new Intl.NumberFormat(currentLocale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

export function quantity(value: number | null | undefined): string {
  return new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 3,
  }).format(value ?? 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(currentLocale, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

/** ISO-Datum (YYYY-MM-DD) fuer <input type="date">. */
export function dateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function today(): string {
  return dateInputValue(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso || new Date());
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  approved: 'Freigegeben',
  sent: 'Versendet',
  partial: 'Teilzahlung',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
  reversed: 'Storniert (nach Zahlung)',
};

/** Zielstatus wiederkehrender Rechnungen. */
export const GENERATE_AS_LABELS: Record<string, string> = {
  draft: 'Als Entwurf',
  approved: 'Direkt freigegeben',
};

/**
 * Status, die von Hand gesetzt werden. Teilzahlung, Bezahlt und Überfällig
 * ergeben sich aus den erfassten Zahlungen bzw. dem Zahlungsziel und werden
 * deshalb nicht zur Auswahl angeboten.
 */
export const MANUAL_INVOICE_STATUSES = [
  'draft',
  'approved',
  'sent',
  'cancelled',
] as const;

/**
 * Einheiten fuer Positionen. Bewusst kurz gehalten - was fehlt, kann ueber
 * die Produktverwaltung als Vorgabe hinterlegt werden. Bestehende Belege mit
 * abweichender Einheit behalten ihren Wert (siehe UnitSelect).
 */
/**
 * Ab diesen Status ist ein Beleg festgeschrieben: er gilt als in Verkehr
 * gebracht und darf inhaltlich nicht mehr geaendert werden (GoBD).
 * Muss zur Liste im Server passen.
 */
export const LOCKED_INVOICE_STATUSES = [
  'approved',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
  'reversed',
];

export function istFestgeschrieben(status: string): boolean {
  return LOCKED_INVOICE_STATUSES.includes(status);
}

export const UNITS = [
  'Std.',
  'Tag',
  'Stk.',
  'Pauschal',
  'Monat',
  'Jahr',
  'Lizenz',
  'km',
  'm',
  'm²',
  'kg',
  'l',
];

export const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Rechnung',
  credit: 'Gutschrift',
};

export const TAX_REGIME_LABELS: Record<string, string> = {
  standard: 'Regelbesteuerung',
  small_business: 'Kleinunternehmer (§ 19 UStG)',
  reverse_charge: 'Reverse Charge (§ 13b UStG)',
};

/** Hinweis, der bei den Regelungen ohne USt-Ausweis auf dem Beleg steht. */
export const TAX_REGIME_NOTE: Record<string, string> = {
  standard: '',
  small_business:
    'Gemäß § 19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.',
  reverse_charge:
    'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG).',
};

export function isZeroRated(regime: string): boolean {
  return regime === 'small_business' || regime === 'reverse_charge';
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  approved: 'Angenommen',
  declined: 'Abgelehnt',
  converted: 'Umgewandelt',
  expired: 'Abgelaufen',
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pending: 'Offen',
  paid: 'Bezahlt',
  reimbursed: 'Erstattet',
};

export const RECURRING_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  paused: 'Pausiert',
  finished: 'Beendet',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  quarterly: 'Vierteljährlich',
  yearly: 'Jährlich',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Überweisung',
  cash: 'Bar',
  card: 'Karte',
  paypal: 'PayPal',
  direct_debit: 'Lastschrift',
  other: 'Sonstiges',
};

/** Wie der Leistungszeitraum erzeugter Rechnungen bestimmt wird. */
export const SERVICE_PERIOD_LABELS: Record<string, string> = {
  none: 'Keiner',
  issueMonth: 'Monat des Rechnungsdatums',
  previousMonth: 'Vormonat',
  untilNextRun: 'Bis zum nächsten Lauf',
};
