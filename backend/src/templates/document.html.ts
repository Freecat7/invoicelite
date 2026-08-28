/**
 * HTML-Vorlage fuer Rechnungen und Angebote. Wird von services/pdf.ts mit
 * Puppeteer nach PDF gerendert. Das Layout orientiert sich an DIN 5008
 * (Adressfeld links oben, Belegdaten rechts, Positionstabelle, Summenblock).
 */

export interface DocumentLineView {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface TaxGroupView {
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface DocumentView {
  kind: 'invoice' | 'quote';
  /** Ueberschrift, z.B. "Rechnung" oder "Angebot" */
  title: string;
  number: string;
  issueDate: Date;
  /** Faelligkeitsdatum (Rechnung) bzw. Gueltig-bis (Angebot) */
  secondaryDate?: Date | null;
  secondaryDateLabel: string;
  currency: string;
  locale: string;

  company: {
    companyName: string;
    addressLine: string;
    postalCode: string;
    city: string;
    country: string;
    vatId: string;
    taxNumber: string;
    ownerName: string;
    accentColor: string;
    countryName: string;
    email: string;
    phone: string;
    website: string;
    logoDataUrl?: string | null;
    bankName: string;
    iban: string;
    bic: string;
    accountHolder: string;
  };

  client: {
    name: string;
    contactName: string;
    addressLine: string;
    postalCode: string;
    city: string;
    country: string;
    vatId: string;
  };

  lines: DocumentLineView[];
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  taxTotal: number;
  total: number;
  taxBreakdown: TaxGroupView[];

  amountPaid?: number;
  amountDue?: number;
  /** Bankverbindung und QR-Code anzeigen (bei Gutschriften irrefuehrend) */
  showPaymentDetails?: boolean;

  notes: string;
  terms: string;
  footer: string;

  /** Leistungsdatum bzw. -zeitraum (Pflichtangabe nach § 14 UStG) */
  serviceDateFrom?: Date | null;
  serviceDateTo?: Date | null;
  /** Pflichthinweis bei § 19 / § 13b, sonst leer */
  taxRegimeNote?: string;

  qrDataUrl?: string | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wandelt Zeilenumbrueche in <br> um, nachdem der Text escaped wurde. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function money(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value ?? 0);
}

function numberFmt(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value ?? 0);
}

function dateFmt(value: Date | null | undefined, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

export function renderDocumentHtml(view: DocumentView): string {
  const { company, client, locale, currency } = view;

  const lineRows = view.lines
    .map(
      (line, idx) => `
      <tr>
        <td class="col-pos">${idx + 1}</td>
        <td class="col-desc">${multiline(line.description)}</td>
        <td class="col-num">${numberFmt(line.quantity, locale)} ${escapeHtml(line.unit)}</td>
        <td class="col-num">${money(line.unitPrice, currency, locale)}</td>
        <td class="col-num">${numberFmt(line.taxRate, locale)} %</td>
        <td class="col-num">${money(line.lineTotal, currency, locale)}</td>
      </tr>`,
    )
    .join('');

  // Bei Kleinunternehmer/Reverse-Charge waere eine "0 % USt."-Zeile
  // irrefuehrend - der Pflichthinweis unter der Tabelle erklaert es.
  const taxRows = (view.taxRegimeNote ? [] : view.taxBreakdown)
    .map(
      (group) => `
      <tr>
        <td>zzgl. ${numberFmt(group.taxRate, locale)} % USt. auf ${money(
          group.taxableAmount,
          currency,
          locale,
        )}</td>
        <td class="col-num">${money(group.taxAmount, currency, locale)}</td>
      </tr>`,
    )
    .join('');

  const discountRow =
    view.discountTotal > 0
      ? `<tr>
           <td>Rabatt</td>
           <td class="col-num">−${money(view.discountTotal, currency, locale)}</td>
         </tr>
         <tr>
           <td>Nettobetrag</td>
           <td class="col-num">${money(view.netTotal, currency, locale)}</td>
         </tr>`
      : '';

  const paidRows =
    view.kind === 'invoice' && (view.amountPaid ?? 0) > 0
      ? `<tr>
           <td>Bereits gezahlt</td>
           <td class="col-num">−${money(view.amountPaid ?? 0, currency, locale)}</td>
         </tr>
         <tr class="row-due">
           <td>Offener Betrag</td>
           <td class="col-num">${money(view.amountDue ?? 0, currency, locale)}</td>
         </tr>`
      : '';

  const bankBlock = company.iban
    ? `<div class="pay-details">
         <div class="block-title">Zahlungsinformationen</div>
         <table class="pay-table">
           ${company.accountHolder ? `<tr><th>Kontoinhaber</th><td>${escapeHtml(company.accountHolder)}</td></tr>` : ''}
           ${company.bankName ? `<tr><th>Bank</th><td>${escapeHtml(company.bankName)}</td></tr>` : ''}
           <tr><th>IBAN</th><td>${escapeHtml(company.iban)}</td></tr>
           ${company.bic ? `<tr><th>BIC</th><td>${escapeHtml(company.bic)}</td></tr>` : ''}
           <tr><th>Verwendungszweck</th><td>${escapeHtml(view.title)} ${escapeHtml(view.number)}</td></tr>
         </table>
       </div>`
    : '';

  const qrBlock = view.qrDataUrl
    ? `<div class="qr-block">
         <img src="${view.qrDataUrl}" alt="EPC-QR-Code">
         <div class="qr-caption">Mit Banking-App scannen<br>und Überweisung ausfüllen</div>
       </div>`
    : '';

  // Leistungsdatum: einzelner Tag oder Zeitraum.
  const serviceRow = view.serviceDateFrom
    ? `<tr><th>${
        view.serviceDateTo &&
        new Date(view.serviceDateTo).getTime() !==
          new Date(view.serviceDateFrom).getTime()
          ? 'Leistungszeitraum'
          : 'Leistungsdatum'
      }</th><td>${
        view.serviceDateTo &&
        new Date(view.serviceDateTo).getTime() !==
          new Date(view.serviceDateFrom).getTime()
          ? `${dateFmt(view.serviceDateFrom, locale)} – ${dateFmt(view.serviceDateTo, locale)}`
          : dateFmt(view.serviceDateFrom, locale)
      }</td></tr>`
    : '';

  const paymentSection =
    view.kind === 'invoice' &&
    view.showPaymentDetails !== false &&
    (bankBlock || qrBlock)
      ? `<section class="payment">${bankBlock}${qrBlock}</section>`
      : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escapeHtml(view.title)} ${escapeHtml(view.number)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "DejaVu Sans", "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.38;
    color: #1c2430;
    margin: 0;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16mm; }
  .logo img { max-height: 24mm; max-width: 60mm; object-fit: contain; }
  .company-head { text-align: right; font-size: 9pt; color: #55616f; white-space: pre-line; }
  .company-head strong { display: block; font-size: 11pt; color: #1c2430; margin-bottom: 2mm; }

  .addresses { display: flex; justify-content: space-between; gap: 12mm; margin-top: 9mm; }
  .address-field { width: 85mm; }
  .recipient { white-space: pre-line; }
  .recipient .name { font-weight: 600; }

  .meta { min-width: 62mm; }
  .meta table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  .meta th { text-align: left; font-weight: 500; color: #55616f; padding: 0.8mm 6mm 0.8mm 0; white-space: nowrap; }
  .meta td { text-align: right; padding: 0.8mm 0; white-space: nowrap; }

  h1 { font-size: 16pt; margin: 6mm 0 1mm; letter-spacing: 0.3pt; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 4.5mm; font-size: 9.5pt; }
  table.items thead th {
    text-align: left; font-weight: 600; font-size: 8.5pt; text-transform: uppercase;
    letter-spacing: 0.4pt; color: #55616f;
    border-bottom: 0.5mm solid #1c2430; padding: 2mm 1.5mm;
  }
  table.items tbody td { padding: 1.7mm 1.5mm; border-bottom: 0.2mm solid #e4e8ec; vertical-align: top; }
  table.items tbody tr:last-child td { border-bottom: 0.3mm solid #c9d0d8; }
  .col-pos { width: 8mm; color: #7b8794; }
  .col-num { text-align: right; white-space: nowrap; }
  .col-desc { width: auto; }

  .totals { display: flex; justify-content: flex-end; margin-top: 5mm; }
  .totals table { border-collapse: collapse; min-width: 78mm; font-size: 9.5pt; }
  .totals td { padding: 1.15mm 0; }
  .totals td.col-num { text-align: right; white-space: nowrap; padding-left: 8mm; }
  .totals tr.row-total td {
    border-top: 0.5mm solid #1c2430; font-weight: 700; font-size: 11.5pt; padding-top: 2.2mm;
  }
  .totals tr.row-due td { font-weight: 700; }

  /* Zahlungsblock soll nie zwischen zwei Seiten zerrissen werden. */
  .payment { display: flex; gap: 10mm; margin-top: 5mm; padding: 4mm 5mm; background: #f5f7f9;
             border-left: 1mm solid #1c2430; align-items: flex-start;
             break-inside: avoid; page-break-inside: avoid; }
  .block-title { font-weight: 600; font-size: 9pt; margin-bottom: 2mm; }
  .pay-details { flex: 1; }
  .pay-table { border-collapse: collapse; font-size: 9pt; }
  .pay-table th { text-align: left; font-weight: 500; color: #55616f; padding: 0.6mm 6mm 0.6mm 0; white-space: nowrap; }
  .pay-table td { padding: 0.6mm 0; }
  .qr-block { text-align: center; }
  .qr-block img { width: 30mm; height: 30mm; }
  .qr-caption { font-size: 7.5pt; color: #55616f; margin-top: 1.5mm; line-height: 1.3; }

  .notes { margin-top: 5mm; font-size: 9.5pt; }
  .notes .block { margin-bottom: 3.5mm; white-space: pre-line; break-inside: avoid; }
  .notes .block-title { color: #55616f; }
  .notes .tax-note { font-weight: 500; }

</style>
</head>
<body>

  <header class="head">
    <div class="logo">
      ${company.logoDataUrl ? `<img src="${company.logoDataUrl}" alt="Logo">` : ''}
    </div>
    <div class="company-head">
      <strong>${escapeHtml(company.companyName)}</strong>${[
        company.addressLine,
        `${company.postalCode} ${company.city}`.trim(),
        company.phone && `Tel. ${company.phone}`,
        company.email,
      ]
        .filter(Boolean)
        .map((l) => escapeHtml(l))
        .join('<br>')}
    </div>
  </header>

  <section class="addresses">
    <div class="address-field">
      <div class="recipient">
        <span class="name">${escapeHtml(client.name)}</span>${[
          client.contactName && `z. Hd. ${client.contactName}`,
          client.addressLine,
          `${client.postalCode} ${client.city}`.trim(),
          client.country && client.country !== company.country ? client.country : '',
        ]
          .filter(Boolean)
          .map((l) => escapeHtml(l))
          .join('<br>')
          .replace(/^/, '<br>')}
      </div>
    </div>

    <div class="meta">
      <table>
        <tr><th>${escapeHtml(view.title)}-Nr.</th><td>${escapeHtml(view.number)}</td></tr>
        <tr><th>Datum</th><td>${dateFmt(view.issueDate, locale)}</td></tr>
        ${
          view.secondaryDateLabel
            ? `<tr><th>${escapeHtml(view.secondaryDateLabel)}</th><td>${dateFmt(view.secondaryDate, locale)}</td></tr>`
            : ''
        }
        ${serviceRow}
        ${client.vatId ? `<tr><th>USt-IdNr. Kunde</th><td>${escapeHtml(client.vatId)}</td></tr>` : ''}
      </table>
    </div>
  </section>

  <h1>${escapeHtml(view.title)} ${escapeHtml(view.number)}</h1>

  <table class="items">
    <thead>
      <tr>
        <th class="col-pos">Pos.</th>
        <th class="col-desc">Beschreibung</th>
        <th class="col-num">Menge</th>
        <th class="col-num">Einzelpreis</th>
        <th class="col-num">USt.</th>
        <th class="col-num">Betrag</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || '<tr><td colspan="6" style="color:#7b8794">Keine Positionen</td></tr>'}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Zwischensumme (netto)</td>
        <td class="col-num">${money(view.subtotal, currency, locale)}</td>
      </tr>
      ${discountRow}
      ${taxRows}
      <tr class="row-total">
        <td>Gesamtbetrag</td>
        <td class="col-num">${money(view.total, currency, locale)}</td>
      </tr>
      ${paidRows}
    </table>
  </div>

  <section class="notes">
    ${
      view.taxRegimeNote
        ? `<div class="block tax-note">${escapeHtml(view.taxRegimeNote)}</div>`
        : ''
    }
    ${view.notes ? `<div class="block">${multiline(view.notes)}</div>` : ''}
    ${
      view.terms
        ? `<div class="block"><div class="block-title">${
            view.kind === 'quote' ? 'Angebotsbedingungen' : 'Zahlungsbedingungen'
          }</div>${multiline(view.terms)}</div>`
        : ''
    }
  </section>

  ${paymentSection}

</body>
</html>`;
}

/**
 * Fussleiste fuer Puppeteers `footerTemplate`. Chromium platziert sie im
 * unteren Seitenrand, dadurch kann sie den Inhalt nie ueberlappen und
 * erscheint auf jeder Seite.
 *
 * Gestaltung nach der bisherigen Vorlage: durchgehender farbiger Balken mit
 * hellem Text und drei Spalten (Inhaber/Kontakt, Anschrift, Bankverbindung).
 * Chromium rendert dieses Fragment isoliert, deshalb stehen alle Angaben
 * inline und die Schriftgroesse explizit.
 */
export function renderDocumentFooterHtml(view: DocumentView): string {
  const { company } = view;
  const bar = company.accentColor || '#2E2B2A';

  // Zeile nur ausgeben, wenn der Wert gefuellt ist.
  const row = (label: string, value: string) =>
    value ? `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>` : '';
  const plain = (value: string) =>
    value ? `<div>${escapeHtml(value)}</div>` : '';

  const contactColumn = [
    row('Inhaber/in', company.ownerName),
    row('E-Mail', company.email),
    row('Telefon', company.phone),
    row('Steuernummer', company.taxNumber),
    row('USt-IdNr.', company.vatId),
  ].join('');

  const addressColumn = [
    plain(company.companyName),
    plain(company.addressLine),
    plain(`${company.postalCode} ${company.city}`.trim()),
    plain(company.countryName),
  ].join('');

  const bankColumn = [
    company.bankName
      ? `<div><strong>${escapeHtml(company.bankName)}</strong></div>`
      : '',
    company.iban ? `<div>IBAN: ${escapeHtml(company.iban)}</div>` : '',
    company.bic ? `<div>BIC: ${escapeHtml(company.bic)}</div>` : '',
  ].join('');

  // Der Balken laeuft absichtlich 2mm ueber beide Seitenkanten hinaus und
  // wird dort beschnitten. Sonst bleibt rechts durch die Rundung der
  // Viewport-Breite ein heller Streifen stehen.
  return `<div style="
      width:calc(100vw + 6mm);
      margin:0 0 0 -3mm;
      padding:3mm 10mm 4mm 13mm;
      transform:translateY(5.5mm);
      box-sizing:border-box;
      background:${bar};
      color:#E4E2DD;
      font-family:'DejaVu Sans',Arial,sans-serif;
      font-size:6.8pt;
      line-height:1.45;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;margin-bottom:2mm;">
      <div>${view.footer ? multiline(view.footer) : ''}</div>
      <div style="white-space:nowrap;">
        Seite <span class="pageNumber"></span> von <span class="totalPages"></span>
      </div>
    </div>
    <!-- Drei Bloecke: linksbuendig, zentriert, rechtsbuendig. Dadurch reicht
         der Inhalt optisch von Rand zu Rand, unabhaengig von der Textlaenge. -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;">
      <div style="text-align:left;">${contactColumn}</div>
      <div style="text-align:center;">${addressColumn}</div>
      <div style="text-align:right;">${bankColumn}</div>
    </div>
  </div>`;
}
