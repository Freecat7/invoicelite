import QRCode from 'qrcode';

/**
 * EPC-QR-Code ("Girocode") nach EPC069-12 fuer SEPA-Ueberweisungen.
 *
 * Der Payload besteht aus bis zu 12 Zeilen in fester Reihenfolge:
 *   1  Service Tag        "BCD"
 *   2  Version            "002" (BIC ist damit innerhalb des EWR optional)
 *   3  Zeichensatz        "1" = UTF-8
 *   4  Identifikation     "SCT" (SEPA Credit Transfer)
 *   5  BIC                optional
 *   6  Empfaengername     max. 70 Zeichen
 *   7  IBAN               max. 34 Zeichen
 *   8  Betrag             z.B. "EUR123.45"
 *   9  Zweckcode          optional, max. 4 Zeichen
 *  10  Strukturierte Referenz   max. 35  \ nur eines von beiden
 *  11  Verwendungszweck (frei)  max. 140 /
 *  12  Hinweis an den Zahler    max. 70
 *
 * Der gesamte Payload darf 331 Byte nicht ueberschreiten.
 */

export interface EpcQrInput {
  beneficiaryName: string;
  iban: string;
  bic?: string;
  amount: number;
  currency: string;
  /** Freier Verwendungszweck, z.B. "Rechnung RE-0001" */
  remittanceText?: string;
  purposeCode?: string;
}

export const EPC_MAX_BYTES = 331;

function sanitize(value: string, maxLength: number): string {
  return (value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeIban(iban: string): string {
  return (iban || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Prueft, ob fuer den Beleg ueberhaupt ein EPC-QR-Code erzeugt werden kann.
 * Der Standard erlaubt ausschliesslich EUR-Betraege zwischen 0,01 und
 * 999.999.999,99.
 */
export function canBuildEpcQr(input: Partial<EpcQrInput>): boolean {
  const iban = normalizeIban(input.iban || '');
  const amount = Number(input.amount ?? 0);
  return (
    iban.length >= 15 &&
    (input.currency || '').toUpperCase() === 'EUR' &&
    !!(input.beneficiaryName || '').trim() &&
    amount >= 0.01 &&
    amount <= 999999999.99
  );
}

export function buildEpcPayload(input: EpcQrInput): string {
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    sanitize(input.bic || '', 11),
    sanitize(input.beneficiaryName, 70),
    normalizeIban(input.iban),
    `${(input.currency || 'EUR').toUpperCase()}${input.amount.toFixed(2)}`,
    sanitize(input.purposeCode || '', 4),
    '', // strukturierte Referenz - wir nutzen stattdessen Zeile 11
    sanitize(input.remittanceText || '', 140),
    '', // Hinweis an den Zahler
  ];

  // Leere Felder am Ende duerfen entfallen.
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const payload = lines.join('\n');
  if (Buffer.byteLength(payload, 'utf8') > EPC_MAX_BYTES) {
    // Verwendungszweck kuerzen, bis der Payload passt.
    const overflow =
      Buffer.byteLength(payload, 'utf8') - EPC_MAX_BYTES;
    const shortened = sanitize(
      input.remittanceText || '',
      Math.max(0, (input.remittanceText || '').length - overflow),
    );
    return buildEpcPayload({ ...input, remittanceText: shortened });
  }
  return payload;
}

/**
 * Liefert den QR-Code als Data-URL (PNG), die direkt in das PDF-Template
 * eingebettet werden kann. Fehlerkorrektur-Level M ist im Standard empfohlen.
 */
export async function buildEpcQrDataUrl(
  input: EpcQrInput,
): Promise<string | null> {
  if (!canBuildEpcQr(input)) return null;
  const payload = buildEpcPayload(input);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
  });
}
