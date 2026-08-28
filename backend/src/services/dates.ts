/**
 * Datumsrechnung fuer Belege.
 *
 * Alle Datumsfelder liegen als UTC-Mitternacht in der Datenbank (ein
 * ISO-Datum ohne Zeit wird so gelesen). Wird darauf mit den oertlichen
 * Gettern gerechnet, verschiebt sich das Ergebnis bei der Zeitumstellung um
 * einen Tag: 2026-03-03 plus ein Monat ergab in Europe/Berlin den 2026-04-02,
 * weil die Sommerzeit die UTC-Darstellung ueber Mitternacht zurueckzieht.
 * Deshalb wird hier durchgehend in UTC gerechnet.
 */

export function addTageUtc(date: Date, tage: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + tage,
    ),
  );
}

/**
 * Monate addieren, ohne einen Monat zu ueberspringen.
 *
 * Der 31. Januar plus ein Monat ergab bisher den "31. Februar", den
 * JavaScript in den 3. Maerz umrechnet - der Februar fiel damit aus. Hier
 * wird stattdessen auf den letzten Tag des Zielmonats begrenzt.
 */
export function addMonateUtc(date: Date, monate: number): Date {
  const jahr = date.getUTCFullYear();
  const monat = date.getUTCMonth() + monate;
  const tag = date.getUTCDate();
  // Tag 0 des Folgemonats ist der letzte Tag des Zielmonats.
  const letzterTag = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  return new Date(Date.UTC(jahr, monat, Math.min(tag, letzterTag)));
}

/** Naechster Termin einer wiederkehrenden Vorlage. */
export function addInterval(date: Date, frequency: string): Date {
  switch (frequency) {
    case 'weekly':
      return addTageUtc(date, 7);
    case 'quarterly':
      return addMonateUtc(date, 3);
    case 'yearly':
      return addMonateUtc(date, 12);
    case 'monthly':
    default:
      return addMonateUtc(date, 1);
  }
}
