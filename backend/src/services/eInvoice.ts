import { InvoiceService } from '@e-invoice-eu/core';
import { getSettings, prisma } from '../db';
import { computeTotals, round2 } from './totals';
import {
  taxCategoryFor,
  taxExemptionReasonFor,
  unitCodeFor,
} from '../constants';
import { generateInvoicePdf } from './pdf';

/**
 * Erzeugt EN16931-konforme E-Rechnungen (E-Rechnung) aus einem Beleg.
 *
 * Unterstuetzt werden zwei Ausgabewege:
 *  - "zugferd"   -> Hybrid-PDF (Factur-X/ZUGFeRD Profil EN16931): das normale
 *                   Sicht-PDF mit eingebetteter XML, eine einzige Datei.
 *  - "xrechnung" -> reine UBL-XML nach XRechnung, z.B. fuer B2G-Empfaenger.
 *
 * Die Bibliothek @e-invoice-eu/core erwartet das Rechnungsobjekt in der
 * UBL-Struktur ("ubl:Invoice" mit cbc:/cac:-Schluesseln) und konvertiert
 * daraus intern auch nach CII fuer Factur-X.
 */

const FORMAT_XRECHNUNG = 'XRECHNUNG-UBL';
const FORMAT_ZUGFERD = 'Factur-X-EN16931';

/**
 * Kennung des angewandten Regelwerks (BT-24). XRechnung verlangt die
 * KoSIT-Auspraegung, sonst genuegt das allgemeine EN16931-Profil.
 */
const CUSTOMIZATION_EN16931 = 'urn:cen.eu:en16931:2017';
const CUSTOMIZATION_XRECHNUNG =
  // Die Kennung wechselte mit XRechnung 3.0 von "xoev-de" auf
  // "xeinkauf.de". Mit der alten Form aus 2.x findet ein Pruefwerkzeug kein
  // passendes Szenario und weist den Beleg ab, ohne ihn inhaltlich zu
  // pruefen - der offizielle KoSIT-Validator meldete "noScenarioMatched".
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

const logger = {
  log: (...args: unknown[]) => console.log('[e-invoice]', ...args),
  warn: (...args: unknown[]) => console.warn('[e-invoice]', ...args),
  error: (...args: unknown[]) => console.error('[e-invoice]', ...args),
};

export class EInvoiceError extends Error {}

/**
 * Uebersetzt Schema-Fehler der Bibliothek in eine lesbare Meldung, damit im
 * UI nicht nur "Interner Serverfehler" ankommt.
 */
function toEInvoiceError(err: unknown): EInvoiceError {
  if (err instanceof EInvoiceError) return err;

  const details = (err as { errors?: { instancePath?: string; message?: string }[] })
    .errors;
  if (Array.isArray(details) && details.length > 0) {
    const parts = details
      .slice(0, 3)
      .map((detail) => {
        const field = (detail.instancePath || '')
          .split('/')
          .filter(Boolean)
          .pop();
        return field ? `${field}: ${detail.message}` : detail.message;
      })
      .filter(Boolean);
    return new EInvoiceError(`Ungültige Rechnungsdaten (${parts.join('; ')})`);
  }

  return new EInvoiceError(
    err instanceof Error ? err.message : 'Unbekannter Fehler',
  );
}

function isoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function amount(value: number): string {
  return value.toFixed(2);
}

/**
 * Steuerkategorie eines Belegs nach EN16931. Die Kategorie haengt an der
 * Steuerregelung (Regelbesteuerung, § 19 Kleinunternehmer, § 13b Reverse
 * Charge) und dem Satz der Position.
 *
 * `withReason` erzeugt zusaetzlich die Befreiungsbegruendung (BT-121), die
 * bei den Kategorien E und AE Pflicht ist. In `cac:ClassifiedTaxCategory`
 * einer Position ist sie dagegen nicht erlaubt.
 */
function taxSchemeCategory(
  regime: string,
  taxRate: number,
  withReason = false,
) {
  const category = taxCategoryFor(regime, taxRate);
  const reason = withReason ? taxExemptionReasonFor(regime) : null;

  return {
    'cbc:ID': category,
    'cbc:Percent': String(taxRate),
    ...(reason ? { 'cbc:TaxExemptionReason': reason } : {}),
    'cac:TaxScheme': { 'cbc:ID': 'VAT' },
  };
}

type InvoiceWithRelations = NonNullable<
  Awaited<ReturnType<typeof loadInvoice>>
>;

function loadInvoice(invoiceId: number) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, lines: { orderBy: { position: 'asc' } } },
  });
}

/**
 * Prueft die Voraussetzungen fuer eine E-Rechnung und liefert alle
 * fehlenden Angaben zurueck, damit das UI konkret melden kann, was fehlt.
 */
export function validateForEInvoice(
  invoice: InvoiceWithRelations,
  settings: Awaited<ReturnType<typeof getSettings>>,
): string[] {
  const problems: string[] = [];

  if (!settings.companyName) problems.push('Firmenname fehlt in den Einstellungen');
  if (!settings.addressLine || !settings.city || !settings.postalCode) {
    problems.push('Vollständige Firmenanschrift fehlt in den Einstellungen');
  }
  if (!settings.vatId && !settings.taxNumber) {
    problems.push('USt-IdNr. oder Steuernummer fehlt in den Einstellungen');
  }
  // BR-DE-6: Die Telefonnummer des Verkaeufers (BT-42) ist bei XRechnung
  // Pflicht, BR-DE-27 verlangt mindestens drei Ziffern. Ohne sie weist ein
  // Pruefwerkzeug den Beleg ab - besser hier melden als beim Empfaenger.
  const ziffern = (settings.phone || '').replace(/\D/g, '');
  if (ziffern.length < 3) {
    problems.push(
      'Telefonnummer fehlt in den Einstellungen (für E-Rechnungen Pflicht, ' +
        'mindestens drei Ziffern)',
    );
  }
  if (!invoice.client.name) problems.push('Kundenname fehlt');
  if (!invoice.client.addressLine || !invoice.client.city || !invoice.client.postalCode) {
    problems.push('Vollständige Kundenanschrift fehlt');
  }
  if (invoice.lines.length === 0) problems.push('Die Rechnung enthält keine Positionen');

  // ZUGFeRD/Factur-X laesst keine negativen Rechnungsbetraege zu -
  // Gutschriften muessen als eigener Beleg mit positiven Werten laufen.
  const totals = computeTotals(
    invoice.lines,
    invoice.discountValue,
    invoice.discountType,
    invoice.taxRegime,
  );
  if (totals.total < 0) {
    problems.push(
      'Negative Gesamtbeträge sind in E-Rechnungen nicht zulässig (bitte separate Gutschrift anlegen)',
    );
  }

  return problems;
}

/** Baut das UBL-Rechnungsobjekt fuer @e-invoice-eu/core. */
export async function buildUblInvoice(
  invoiceId: number,
  customizationId: string = CUSTOMIZATION_EN16931,
) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) throw new EInvoiceError('Rechnung nicht gefunden');

  const settings = await getSettings();
  const problems = validateForEInvoice(invoice, settings);
  if (problems.length > 0) {
    throw new EInvoiceError(problems.join('; '));
  }

  const totals = computeTotals(
    invoice.lines,
    invoice.discountValue,
    invoice.discountType,
    invoice.taxRegime,
  );
  const currency = invoice.currency;
  const regime = invoice.taxRegime;

  const supplierParty: Record<string, unknown> = {
    'cbc:EndpointID': settings.email || settings.vatId,
    'cbc:EndpointID@schemeID': settings.email ? 'EM' : '9930',
    'cac:PartyName': { 'cbc:Name': settings.companyName },
    'cac:PostalAddress': {
      'cbc:StreetName': settings.addressLine,
      'cbc:CityName': settings.city,
      'cbc:PostalZone': settings.postalCode,
      'cac:Country': { 'cbc:IdentificationCode': settings.country || 'DE' },
    },
    'cac:PartyLegalEntity': {
      'cbc:RegistrationName': settings.companyName,
      ...(settings.taxNumber ? { 'cbc:CompanyID': settings.taxNumber } : {}),
    },
    'cac:Contact': {
      'cbc:Name': settings.companyName,
      ...(settings.phone ? { 'cbc:Telephone': settings.phone } : {}),
      ...(settings.email ? { 'cbc:ElectronicMail': settings.email } : {}),
    },
  };
  if (settings.vatId) {
    supplierParty['cac:PartyTaxScheme'] = [
      {
        'cbc:CompanyID': settings.vatId,
        'cac:TaxScheme': { 'cbc:ID': 'VAT' },
      },
    ];
  }

  const customerParty: Record<string, unknown> = {
    'cbc:EndpointID': invoice.client.email || invoice.client.vatId || invoice.client.name,
    'cbc:EndpointID@schemeID': invoice.client.email ? 'EM' : '9930',
    'cac:PartyName': { 'cbc:Name': invoice.client.name },
    'cac:PostalAddress': {
      'cbc:StreetName': invoice.client.addressLine,
      'cbc:CityName': invoice.client.city,
      'cbc:PostalZone': invoice.client.postalCode,
      'cac:Country': {
        'cbc:IdentificationCode': invoice.client.country || 'DE',
      },
    },
    'cac:PartyLegalEntity': { 'cbc:RegistrationName': invoice.client.name },
  };
  // Beim Kunden erwartet das Schema ein einzelnes Objekt, beim Lieferanten
  // dagegen eine Liste.
  if (invoice.client.vatId) {
    customerParty['cac:PartyTaxScheme'] = {
      'cbc:CompanyID': invoice.client.vatId,
      'cac:TaxScheme': { 'cbc:ID': 'VAT' },
    };
  }

  // Dokumentweiter Rabatt wird je Steuerkategorie ausgewiesen, damit die
  // Bemessungsgrundlagen zur Steueraufstellung passen.
  const allowances = totals.taxBreakdown
    .filter((group) => group.discountAmount > 0)
    .map((group) => ({
      'cbc:ChargeIndicator': 'false',
      'cbc:AllowanceChargeReasonCode': '95',
      'cbc:AllowanceChargeReason': 'Rabatt',
      // Wird eine Bemessungsgrundlage angegeben, verlangt EN16931 auch den
      // Prozentsatz dazu. Bei einem festen Rabatt ergibt er sich aus dem
      // Anteil an der Gruppe.
      'cbc:MultiplierFactorNumeric':
        group.baseAmount > 0
          ? round2((group.discountAmount / group.baseAmount) * 100).toFixed(2)
          : '0.00',
      'cbc:Amount': amount(group.discountAmount),
      'cbc:Amount@currencyID': currency,
      'cbc:BaseAmount': amount(group.baseAmount),
      'cbc:BaseAmount@currencyID': currency,
      'cac:TaxCategory': taxSchemeCategory(regime, group.taxRate, true),
    }));

  const ubl: Record<string, unknown> = {
    'cbc:CustomizationID': customizationId,
    'cbc:ProfileID': 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    'cbc:ID': invoice.number,
    'cbc:IssueDate': isoDate(invoice.issueDate),
    'cbc:DueDate': isoDate(invoice.dueDate),
    // 380 = Rechnung, 381 = Gutschrift
    'cbc:InvoiceTypeCode': invoice.docType === 'credit' ? '381' : '380',
    'cbc:DocumentCurrencyCode': currency,
    // Leitweg-ID / Bestellreferenz des Empfaengers (Pflicht bei XRechnung an
    // oeffentliche Auftraggeber).
    'cbc:BuyerReference': settings.buyerReference || invoice.number,
    // Leistungsdatum bzw. -zeitraum (BT-72 / BG-14)
    ...(invoice.serviceDateFrom
      ? {
          'cac:InvoicePeriod': {
            'cbc:StartDate': isoDate(invoice.serviceDateFrom),
            'cbc:EndDate': isoDate(
              invoice.serviceDateTo ?? invoice.serviceDateFrom,
            ),
          },
        }
      : {}),
    'cac:AccountingSupplierParty': { 'cac:Party': supplierParty },
    'cac:AccountingCustomerParty': { 'cac:Party': customerParty },
    'cac:TaxTotal': [
      {
        'cbc:TaxAmount': amount(totals.taxTotal),
        'cbc:TaxAmount@currencyID': currency,
        'cac:TaxSubtotal': totals.taxBreakdown.map((group) => ({
          'cbc:TaxableAmount': amount(group.taxableAmount),
          'cbc:TaxableAmount@currencyID': currency,
          'cbc:TaxAmount': amount(group.taxAmount),
          'cbc:TaxAmount@currencyID': currency,
          'cac:TaxCategory': taxSchemeCategory(regime, group.taxRate, true),
        })),
      },
    ],
    'cac:LegalMonetaryTotal': {
      'cbc:LineExtensionAmount': amount(totals.subtotal),
      'cbc:LineExtensionAmount@currencyID': currency,
      'cbc:TaxExclusiveAmount': amount(totals.netTotal),
      'cbc:TaxExclusiveAmount@currencyID': currency,
      'cbc:TaxInclusiveAmount': amount(totals.total),
      'cbc:TaxInclusiveAmount@currencyID': currency,
      ...(totals.discountTotal > 0
        ? {
            'cbc:AllowanceTotalAmount': amount(totals.discountTotal),
            'cbc:AllowanceTotalAmount@currencyID': currency,
          }
        : {}),
      'cbc:PayableAmount': amount(totals.total),
      'cbc:PayableAmount@currencyID': currency,
    },
    'cac:InvoiceLine': totals.lines.map((line, idx) => ({
      'cbc:ID': String(idx + 1),
      'cbc:InvoicedQuantity': String(line.quantity),
      'cbc:InvoicedQuantity@unitCode': unitCodeFor(line.unit),
      'cbc:LineExtensionAmount': amount(line.lineTotal),
      'cbc:LineExtensionAmount@currencyID': currency,
      'cac:Item': {
        'cbc:Name': (line.description || 'Position').slice(0, 100),
        'cac:ClassifiedTaxCategory': taxSchemeCategory(regime, line.taxRate),
      },
      'cac:Price': {
        'cbc:PriceAmount': amount(line.unitPrice),
        'cbc:PriceAmount@currencyID': currency,
      },
    })),
  };

  if (allowances.length > 0) {
    ubl['cac:AllowanceCharge'] = allowances;
  }

  // Lieferdatum (BT-72). Ohne dieses Element laesst die Bibliothek beim
  // ZUGFeRD-PDF "ApplicableHeaderTradeDelivery" weg - das ist in der
  // CII-Syntax aber Pflicht und in fester Reihenfolge vorgeschrieben, die
  // Datei fiel dadurch durch die Schemapruefung. Als Datum dient das Ende
  // des Leistungszeitraums, sonst das Rechnungsdatum.
  ubl['cac:Delivery'] = {
    'cbc:ActualDeliveryDate': isoDate(
      invoice.serviceDateTo ?? invoice.serviceDateFrom ?? invoice.issueDate,
    ),
  };

  if (settings.iban) {
    ubl['cac:PaymentMeans'] = [
      {
        // 58 = SEPA-Ueberweisung
        'cbc:PaymentMeansCode': '58',
        'cbc:PaymentID': `Rechnung ${invoice.number}`,
        'cac:PayeeFinancialAccount': {
          'cbc:ID': settings.iban.replace(/\s+/g, ''),
          'cbc:Name': settings.accountHolder || settings.companyName,
          ...(settings.bic
            ? {
                'cac:FinancialInstitutionBranch': { 'cbc:ID': settings.bic },
              }
            : {}),
        },
      },
    ];
  }

  if (invoice.terms) {
    ubl['cac:PaymentTerms'] = { 'cbc:Note': invoice.terms };
  }
  if (invoice.notes) {
    ubl['cbc:Note'] = [invoice.notes];
  }

  return { 'ubl:Invoice': ubl } as never;
}

/** Reine XRechnung-XML (UBL) als String. */
export async function generateXRechnung(invoiceId: number): Promise<string> {
  const input = await buildUblInvoice(invoiceId, CUSTOMIZATION_XRECHNUNG);
  const service = new InvoiceService(logger);
  let result: string | Uint8Array;
  try {
    result = await service.generate(input, {
      format: FORMAT_XRECHNUNG,
      lang: 'de-de',
      attachments: [],
    });
  } catch (err) {
    throw toEInvoiceError(err);
  }
  if (typeof result !== 'string') {
    throw new EInvoiceError('Unerwartetes Ausgabeformat für XRechnung');
  }
  return result;
}

/**
 * Hybrid-PDF nach ZUGFeRD/Factur-X: Sicht-PDF mit eingebetteter EN16931-XML.
 */
export async function generateZugferdPdf(invoiceId: number): Promise<Buffer> {
  const input = await buildUblInvoice(invoiceId);
  const invoice = await loadInvoice(invoiceId);
  const pdf = await generateInvoicePdf(invoiceId);

  const service = new InvoiceService(logger);
  let result: string | Uint8Array;
  try {
    result = await service.generate(input, {
      format: FORMAT_ZUGFERD,
      lang: 'de-de',
      attachments: [],
      pdf: {
        buffer: new Uint8Array(pdf),
        filename: `${invoice?.number ?? 'rechnung'}.pdf`,
        mimetype: 'application/pdf',
      },
    });
  } catch (err) {
    throw toEInvoiceError(err);
  }
  if (typeof result === 'string') {
    throw new EInvoiceError('Unerwartetes Ausgabeformat für ZUGFeRD');
  }
  return Buffer.from(result);
}
