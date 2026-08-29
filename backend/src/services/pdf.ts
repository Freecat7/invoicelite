import fs from 'fs/promises';
import { HttpError } from '../routes/helpers';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { config } from '../config';
import { getSettings, prisma } from '../db';
import { computeTotals } from './totals';
import { TAX_REGIME_NOTE, taxRegimeNoteFor } from '../constants';
import { buildEpcQrDataUrl } from './epcQr';
import {
  DocumentView,
  renderDocumentFooterHtml,
  renderDocumentHtml,
} from '../templates/document.html';

let browserPromise: Promise<Browser> | null = null;

/**
 * Startet Chromium einmalig und haelt die Instanz offen, damit nicht bei
 * jedem PDF ein neuer Prozess hochgefahren werden muss.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath: config.chromiumPath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
          // Chromium ruft bei jedem Start Google-Dienste auf - gemessen
          // clients2.google.com, www.google.com, accounts.google.com und
          // mtalk.google.com je PDF. Die einschlaegigen Schalter allein
          // haben das nicht gestoppt, deshalb bekommt Chromium gar keine
          // Namensaufloesung mehr: Das Dokument bindet Schriften, Logo und
          // QR-Code ohnehin vollstaendig ein und braucht kein Netz.
          '--host-resolver-rules=MAP * ~NOTFOUND',
          '--disable-background-networking',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-client-side-phishing-detection',
          '--safebrowsing-disable-auto-update',
          '--disable-sync',
          '--disable-default-apps',
          '--no-first-run',
          '--no-default-browser-check',
          '--no-pings',
          '--metrics-recording-only',
          '--disable-breakpad',
        ],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => undefined);
  }
}

/**
 * Rendert das Dokument nach PDF. Die Fussleiste wird als `footerTemplate`
 * uebergeben: Chromium platziert sie im unteren Seitenrand, wodurch sie den
 * Inhalt nicht ueberlagern kann und auf jeder Seite erscheint.
 */
async function renderOnce(
  html: string,
  footerHtml?: string,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // "load" statt "networkidle0": das Dokument bindet alle Bilder als
    // data-URL ein, es gibt also keinen Netzwerkverkehr, auf dessen Ruhe
    // man warten koennte - networkidle0 lief dabei gelegentlich in den
    // Timeout.
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    // Schriften abwarten, damit das Layout nicht mit Ersatzschrift misst.
    // Als Ausdruck in Textform, damit im Backend keine DOM-Typen noetig sind.
    await page.evaluate('document.fonts && document.fonts.ready').catch(
      () => undefined,
    );
    const pdf = await page.pdf({
      // 209,5 x 296mm statt A4 - und das mit Absicht.
      //
      // Chromium rechnet die Seite in ganzen CSS-Pixeln und zeichnet nur so
      // weit; die MediaBox schreibt es aber mit dem krummen Rest. Bei A4
      // sind das 794,56px Seite gegen 794px Zeichenflaeche: rechts blieben
      // 0,169mm und unten 0,127mm unbemalt - eine feine weisse Linie neben
      // dem Fusszeilenbalken, die in jedem Betrachter als Pixelkante
      // sichtbar wird.
      //
      // Diese Masse ergeben glatte 792 x 1120 Pixel, damit deckt der Balken
      // die Seite vollstaendig. Die Schrittweite betraegt 32 Pixel, die
      // naechsten glatten Groessen liegen 8mm daneben - naeher an A4 kommt
      // man nicht. Der Unterschied von 0,45mm Breite und 0,67mm Hoehe
      // (0,2 %) faellt beim Drucken nicht auf.
      width: '209.5mm',
      height: '296mm',
      printBackground: true,
      margin: {
        top: '16mm',
        right: '18mm',
        // Der Fusszeilen-Balken braucht rund 26mm; 30mm lassen Luft.
        bottom: footerHtml ? '30mm' : '16mm',
        left: '18mm',
      },
      displayHeaderFooter: Boolean(footerHtml),
      headerTemplate: '<span></span>',
      footerTemplate: footerHtml ?? '<span></span>',
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Rendert das Dokument und wiederholt einen fehlgeschlagenen Versuch genau
 * einmal mit frischem Chromium. Ein haengender Renderer wuerde sonst einen
 * automatisierten Versandlauf abbrechen.
 */
export async function renderPdfFromHtml(
  html: string,
  footerHtml?: string,
): Promise<Buffer> {
  try {
    return await renderOnce(html, footerHtml);
  } catch (err) {
    console.warn(
      '[pdf] Rendern fehlgeschlagen, starte Chromium neu:',
      err instanceof Error ? err.message : err,
    );
    await closeBrowser();
    return renderOnce(html, footerHtml);
  }
}

/** Laedt das Firmenlogo als Data-URL, damit es ohne HTTP-Zugriff rendert. */
async function loadLogoDataUrl(logoPath: string): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const absolute = path.isAbsolute(logoPath)
      ? logoPath
      : path.join(config.uploadDir, logoPath);
    const data = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.svg'
          ? 'image/svg+xml'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Laendername fuer die Fusszeile; unbekannte Codes bleiben stehen. */
const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  NL: 'Niederlande',
  BE: 'Belgien',
  FR: 'Frankreich',
  LU: 'Luxemburg',
};

type SettingsRecord = Awaited<ReturnType<typeof getSettings>>;

async function buildCompanyView(settings: SettingsRecord) {
  return {
    companyName: settings.companyName,
    addressLine: settings.addressLine,
    postalCode: settings.postalCode,
    city: settings.city,
    country: settings.country,
    vatId: settings.vatId,
    taxNumber: settings.taxNumber,
    ownerName: settings.ownerName,
    accentColor: settings.accentColor,
    countryName:
      COUNTRY_NAMES[(settings.country || '').toUpperCase()] || settings.country,
    email: settings.email,
    phone: settings.phone,
    website: settings.website,
    logoDataUrl: await loadLogoDataUrl(settings.logoPath),
    bankName: settings.bankName,
    iban: settings.iban,
    bic: settings.bic,
    accountHolder: settings.accountHolder || settings.companyName,
  };
}

/**
 * Baut das View-Modell einer Rechnung inklusive EPC-QR-Code.
 * Der QR-Code enthaelt immer den noch offenen Betrag.
 */
export async function buildInvoiceView(invoiceId: number): Promise<DocumentView> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, lines: { orderBy: { position: 'asc' } } },
  });
  if (!invoice) throw new HttpError(404, 'Rechnung nicht gefunden');

  const settings = await getSettings();
  const totals = computeTotals(
    invoice.lines,
    invoice.discountValue,
    invoice.discountType,
    invoice.taxRegime,
  );
  const isCredit = invoice.docType === 'credit';
  const amountDue = Math.max(0, Number((totals.total - invoice.amountPaid).toFixed(2)));

  // Gutschriften und stornierte Belege bekommen keinen Zahlungs-QR-Code.
  const qrDataUrl =
    settings.showEpcQr &&
    !isCredit &&
    !['cancelled', 'reversed'].includes(invoice.status) &&
    amountDue > 0
      ? await buildEpcQrDataUrl({
          beneficiaryName: settings.accountHolder || settings.companyName,
          iban: settings.iban,
          bic: settings.bic,
          amount: amountDue,
          currency: invoice.currency,
          remittanceText: `Rechnung ${invoice.number}`,
        })
      : null;

  return {
    kind: 'invoice',
    title: isCredit ? 'Gutschrift' : 'Rechnung',
    number: invoice.number,
    issueDate: invoice.issueDate,
    secondaryDate: isCredit ? null : invoice.dueDate,
    secondaryDateLabel: isCredit ? '' : 'Fällig am',
    currency: invoice.currency,
    locale: settings.locale || 'de-DE',
    company: await buildCompanyView(settings),
    client: {
      name: invoice.client.name,
      contactName: invoice.client.contactName,
      addressLine: invoice.client.addressLine,
      postalCode: invoice.client.postalCode,
      city: invoice.client.city,
      country: invoice.client.country,
      vatId: invoice.client.vatId,
    },
    lines: totals.lines,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    netTotal: totals.netTotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    taxBreakdown: totals.taxBreakdown,
    amountPaid: invoice.amountPaid,
    amountDue,
    // Bei einer Gutschrift erstatten wir dem Kunden - die eigene
    // Bankverbindung waere hier irrefuehrend.
    showPaymentDetails: !isCredit,
    notes: invoice.notes,
    terms: invoice.terms,
    footer: invoice.footer,
    serviceDateFrom: invoice.serviceDateFrom,
    serviceDateTo: invoice.serviceDateTo,
    taxRegimeNote: TAX_REGIME_NOTE[invoice.taxRegime] || '',
    qrDataUrl,
  };
}

export async function buildQuoteView(quoteId: number): Promise<DocumentView> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { client: true, lines: { orderBy: { position: 'asc' } } },
  });
  if (!quote) throw new HttpError(404, 'Angebot nicht gefunden');

  const settings = await getSettings();
  const totals = computeTotals(
    quote.lines,
    quote.discountValue,
    quote.discountType,
    quote.taxRegime,
  );

  return {
    kind: 'quote',
    title: 'Angebot',
    number: quote.number,
    issueDate: quote.issueDate,
    secondaryDate: quote.validUntil,
    secondaryDateLabel: 'Gültig bis',
    currency: quote.currency,
    locale: settings.locale || 'de-DE',
    company: await buildCompanyView(settings),
    client: {
      name: quote.client.name,
      contactName: quote.client.contactName,
      addressLine: quote.client.addressLine,
      postalCode: quote.client.postalCode,
      city: quote.client.city,
      country: quote.client.country,
      vatId: quote.client.vatId,
    },
    lines: totals.lines,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    netTotal: totals.netTotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    taxBreakdown: totals.taxBreakdown,
    notes: quote.notes,
    terms: quote.terms,
    footer: quote.footer,
    taxRegimeNote: taxRegimeNoteFor(quote.taxRegime, 'quote'),
    qrDataUrl: null,
  };
}

export async function generateInvoicePdf(invoiceId: number): Promise<Buffer> {
  const view = await buildInvoiceView(invoiceId);
  return renderPdfFromHtml(
    renderDocumentHtml(view),
    renderDocumentFooterHtml(view),
  );
}

export async function generateQuotePdf(quoteId: number): Promise<Buffer> {
  const view = await buildQuoteView(quoteId);
  return renderPdfFromHtml(
    renderDocumentHtml(view),
    renderDocumentFooterHtml(view),
  );
}
