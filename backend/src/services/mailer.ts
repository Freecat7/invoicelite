import nodemailer, { Transporter } from 'nodemailer';
import { HttpError } from '../routes/helpers';
import { getSettings, prisma } from '../db';
import { entschluesseln } from './secrets';
import { generateInvoicePdf } from './pdf';
import { generateXRechnung, generateZugferdPdf } from './eInvoice';
import { generateQuotePdf } from './pdf';
import { legeInGesendetAb } from './sentFolder';

/**
 * Mailversand ueber das hinterlegte Postfach.
 *
 * Der taegliche Lauf nimmt sich nur Rechnungen, die *vor* dem heutigen Tag
 * freigegeben wurden. Damit bleibt zwischen Freigabe und Versand mindestens
 * eine Nacht - genug Zeit, einen Irrtum zu bemerken, bevor er beim Kunden
 * liegt.
 */

/**
 * Uebersetzt die Antwort des Mailservers in einen Satz, der weiterhilft.
 *
 * Ohne das landen SMTP-Fehler als "Interner Serverfehler" in der
 * Oberflaeche - der eigentliche Grund steht dann nur im Protokoll, wo ihn
 * niemand sucht.
 */
export function alsKlartext(err: unknown): HttpError {
  const e = err as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const antwort = e.response || e.message || String(err);

  // Absender passt nicht zum angemeldeten Konto - der haeufigste Stolperstein,
  // wenn das Postfach unter einer anderen Adresse laeuft als die Firmenadresse.
  if (
    e.responseCode === 553 ||
    /not owned by user|sender address rejected|not allowed to send as/i.test(
      antwort,
    )
  ) {
    return new HttpError(
      400,
      'Der Mailserver akzeptiert die Absenderadresse nicht: Sie muss zu dem ' +
        'Konto gehören, mit dem sich invoicelite anmeldet. Tragen Sie unter ' +
        `„Absenderadresse" dieselbe Adresse ein wie unter „Benutzername". ` +
        `Antwort des Servers: ${antwort}`,
    );
  }

  if (e.code === 'EAUTH' || e.responseCode === 535) {
    return new HttpError(
      400,
      'Der Mailserver hat die Anmeldung abgelehnt. Benutzername und Passwort ' +
        'prüfen – bei Konten mit Zwei-Faktor-Anmeldung wird ein eigens ' +
        `erzeugtes App-Passwort benötigt. Antwort des Servers: ${antwort}`,
    );
  }

  if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.code === 'EDNS') {
    return new HttpError(
      400,
      `Der Mailserver ist nicht erreichbar. Server und Port prüfen. (${antwort})`,
    );
  }

  if (e.code === 'ESOCKET' || /wrong version number|SSL/i.test(antwort)) {
    return new HttpError(
      400,
      'Die Verschlüsselung passt nicht zum Port. Port 587 arbeitet mit ' +
        `STARTTLS, Port 465 durchgehend verschlüsselt. (${antwort})`,
    );
  }

  if (e.responseCode === 550 || e.responseCode === 554) {
    return new HttpError(
      400,
      `Der Mailserver hat die Nachricht abgelehnt: ${antwort}`,
    );
  }

  return new HttpError(400, `Mailversand fehlgeschlagen: ${antwort}`);
}

export interface MailKonfiguration {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  bcc: string;
}

/** Liest die Zugangsdaten und entschluesselt das Passwort. */
export async function ladeKonfiguration(): Promise<MailKonfiguration> {
  const s = await getSettings();
  return {
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpSecure,
    user: s.smtpUser,
    password: entschluesseln(s.smtpPasswordEnc),
    fromName: s.mailFromName || s.companyName,
    // Ohne eigene Angabe das Postfachkonto nehmen: viele Mailserver
    // lassen nur die angemeldete Adresse als Absender zu.
    fromEmail: s.mailFromEmail || s.smtpUser || s.email,
    replyTo: s.mailReplyTo,
    bcc: s.mailBcc,
  };
}

export function pruefeKonfiguration(k: MailKonfiguration): string[] {
  const fehlt: string[] = [];
  if (!k.host) fehlt.push('Server');
  if (!k.port) fehlt.push('Port');
  if (!k.fromEmail) fehlt.push('Absenderadresse');
  // Benutzername und Passwort sind optional: manche Postfaecher im eigenen
  // Netz nehmen Mail ohne Anmeldung an.
  if (k.user && !k.password) fehlt.push('Passwort');
  return fehlt;
}

function baueTransport(k: MailKonfiguration): Transporter {
  return nodemailer.createTransport({
    host: k.host,
    port: k.port,
    secure: k.secure,
    auth: k.user ? { user: k.user, pass: k.password } : undefined,
    // Kein Wartenlassen: ein haengender Server soll den Lauf nicht blockieren.
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

function absender(k: MailKonfiguration): string {
  return k.fromName ? `"${k.fromName}" <${k.fromEmail}>` : k.fromEmail;
}

/** Prueft Erreichbarkeit und Anmeldung, ohne etwas zu verschicken. */
export async function pruefeVerbindung(): Promise<void> {
  const k = await ladeKonfiguration();
  const fehlt = pruefeKonfiguration(k);
  if (fehlt.length) {
    throw new HttpError(400, `Unvollständige Einstellungen: ${fehlt.join(', ')}`);
  }
  const transport = baueTransport(k);
  try {
    await transport.verify();
  } catch (err) {
    throw alsKlartext(err);
  } finally {
    transport.close();
  }
}

/** Verschickt eine Probemail an die angegebene Adresse. */
export async function sendeTestmail(an: string): Promise<void> {
  const k = await ladeKonfiguration();
  const fehlt = pruefeKonfiguration(k);
  if (fehlt.length) {
    throw new HttpError(400, `Unvollständige Einstellungen: ${fehlt.join(', ')}`);
  }
  const transport = baueTransport(k);
  try {
    await transport.sendMail({
      from: absender(k),
      to: an,
      subject: 'Testmail aus invoicelite',
      text:
        'Diese Nachricht bestätigt, dass der Mailversand eingerichtet ist.\n\n' +
        `Server: ${k.host}:${k.port}\n` +
        `Absender: ${k.fromEmail}\n`,
    });
  } catch (err) {
    throw alsKlartext(err);
  } finally {
    transport.close();
  }
}

/** Setzt Platzhalter im Betreff und im Text ein. */
function fuelle(
  vorlage: string,
  werte: Record<string, string>,
): string {
  return vorlage.replace(/\{(\w+)\}/g, (treffer, name: string) =>
    name in werte ? werte[name] : treffer,
  );
}

const STANDARD_TEXT = [
  'Sehr geehrte Damen und Herren,',
  '',
  'vielen Dank für Ihren Auftrag, Ihre Rechnung befindet sich im Anhang.',
  '',
  'Mit freundlichen Grüßen',
  '{firma}',
].join('\n');

/**
 * Holt eingebettete Bilder aus dem HTML und haengt sie stattdessen als
 * Anhang mit Content-ID an.
 *
 * Bilder als data:-URI sehen im Browser richtig aus, werden aber von den
 * verbreiteten Mailprogrammen nicht angezeigt: Gmail entfernt sie, Outlook
 * stellt sie nicht dar. Ein Anhang mit cid:-Verweis funktioniert dagegen
 * ueberall - deshalb wird hier umgeschrieben, statt sich auf data: zu
 * verlassen.
 */
function bilderAuslagern(html: string): {
  html: string;
  bilder: { filename: string; content: Buffer; cid: string }[];
} {
  const bilder: { filename: string; content: Buffer; cid: string }[] = [];
  let nummer = 0;

  const neu = html.replace(
    /src\s*=\s*"data:image\/(png|jpe?g|gif|webp);base64,([^"]+)"/gi,
    (_treffer, typ: string, daten: string) => {
      nummer += 1;
      // Der base64-Block darf umgebrochen sein - Leerraum muss weg.
      const roh = Buffer.from(daten.replace(/\s+/g, ''), 'base64');
      const endung = typ.toLowerCase() === 'jpeg' ? 'jpg' : typ.toLowerCase();
      const cid = `bild${nummer}@invoicelite`;
      bilder.push({
        filename: `bild${nummer}.${endung}`,
        content: roh,
        cid,
      });
      return `src="cid:${cid}"`;
    },
  );

  return { html: neu, bilder };
}

/**
 * Macht aus der HTML-Fassung eine lesbare Textfassung.
 *
 * Mailprogramme ohne HTML-Darstellung und Spamfilter erwarten beide Teile;
 * eine Mail nur mit HTML wird eher aussortiert.
 */
function alsText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((z) => z.trim())
    .join('\n')
    .trim();
}

/**
 * Baut die Nachricht einmal, verschickt sie und legt dieselbe Fassung im
 * Ordner "Gesendet" ab.
 *
 * Bewusst dieselbe Fassung: haette man sie zweimal erzeugt, unterschieden
 * sich Message-ID und Zeitstempel, und die Kopie waere nicht mehr der
 * Beleg dessen, was der Kunde bekommen hat.
 */
async function versendeUndLegeAb(
  k: MailKonfiguration,
  nachricht: Record<string, unknown>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MailComposer = require('nodemailer/lib/mail-composer');
  const roh: Buffer = await new MailComposer({
    ...nachricht,
    from: absender(k),
  }).compile().build();

  const transport = baueTransport(k);
  try {
    // "raw" schickt genau die erzeugte Fassung - envelope muss dann
    // getrennt mitgegeben werden, da der Transport sie nicht mehr ableitet.
    await transport.sendMail({
      envelope: {
        from: k.fromEmail,
        to: [
          ...(Array.isArray(nachricht.to) ? nachricht.to : [nachricht.to]),
          ...(nachricht.bcc ? [nachricht.bcc] : []),
        ].filter(Boolean) as string[],
      },
      raw: roh,
    });
  } catch (err) {
    throw alsKlartext(err);
  } finally {
    transport.close();
  }

  const s = await getSettings();
  if (s.imapCopyEnabled) {
    try {
      await legeInGesendetAb(roh);
    } catch (err) {
      // Die Mail ist beim Kunden - nur die Ablage fehlt. Das darf den
      // Versand nicht zurueckdrehen.
      console.warn(
        '[mail] Kopie im Ordner "Gesendet" fehlgeschlagen:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export interface VersandErgebnis {
  gesendet: number;
  fehler: number;
  details: string[];
}

/**
 * Verschickt eine einzelne Rechnung und setzt sie auf "versendet".
 * Schlaegt der Versand fehl, bleibt der Status auf "freigegeben" - der
 * naechste Lauf versucht es erneut.
 */
export async function sendeRechnung(invoiceId: number): Promise<void> {
  const s = await getSettings();
  const k = await ladeKonfiguration();
  const fehlt = pruefeKonfiguration(k);
  if (fehlt.length) {
    throw new HttpError(400, `Unvollständige Einstellungen: ${fehlt.join(', ')}`);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) throw new HttpError(404, 'Beleg nicht gefunden');
  if (!invoice.client?.email) {
    throw new HttpError(
      400,
      `Kunde „${invoice.client?.name ?? '?'}" hat keine E-Mail-Adresse`,
    );
  }

  const betrag = new Intl.NumberFormat(s.locale || 'de-DE', {
    style: 'currency',
    currency: invoice.currency,
  }).format(invoice.total);
  // Zweistellig wie auf dem Beleg: 09.09.2026, nicht 9.9.2026.
  const datum = (d: Date) =>
    d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  const werte = {
    nummer: invoice.number,
    kunde: invoice.client.contactName || invoice.client.name,
    firma: s.companyName,
    betrag,
    datum: datum(invoice.issueDate),
    faellig: datum(invoice.dueDate),
  };

  // Anhang nach Vorgabe: Sicht-PDF, ZUGFeRD-Hybrid oder reine XML.
  const anhaenge: { filename: string; content: Buffer }[] = [];
  if (s.mailAttachment === 'xrechnung') {
    anhaenge.push({
      filename: `${invoice.number}.xml`,
      content: Buffer.from(await generateXRechnung(invoiceId), 'utf8'),
    });
  } else if (s.mailAttachment === 'zugferd') {
    anhaenge.push({
      filename: `${invoice.number}.pdf`,
      content: await generateZugferdPdf(invoiceId),
    });
  } else {
    anhaenge.push({
      filename: `${invoice.number}.pdf`,
      content: await generateInvoicePdf(invoiceId),
    });
  }

  // Eingebettete Bilder in Anhaenge mit Content-ID umwandeln.
  let htmlTeil = '';
  let eingebetteteBilder: {
    filename: string;
    content: Buffer;
    cid: string;
  }[] = [];
  if (s.mailBodyHtml) {
    const aufbereitet = bilderAuslagern(fuelle(s.mailBodyHtml, werte));
    htmlTeil = aufbereitet.html;
    eingebetteteBilder = aufbereitet.bilder;
  }

  await versendeUndLegeAb(k, {
    to: invoice.client.email,
    ...(k.replyTo ? { replyTo: k.replyTo } : {}),
    ...(k.bcc ? { bcc: k.bcc } : {}),
    subject: fuelle(s.mailSubject || 'Rechnung {nummer}', werte),
    ...(s.mailBodyHtml
      ? {
          html: htmlTeil,
          text: fuelle(s.mailBody || alsText(s.mailBodyHtml), werte),
        }
      : { text: fuelle(s.mailBody || STANDARD_TEXT, werte) }),
    attachments: [...anhaenge, ...eingebetteteBilder],
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'sent',
      sentAt: invoice.sentAt ?? new Date(),
      mailedAt: new Date(),
      mailError: '',
    },
  });
}

/**
 * Taeglicher Lauf: verschickt alles, was vor heute freigegeben wurde.
 *
 * Bewusst nacheinander statt parallel - ein Postfach quittiert zu viele
 * gleichzeitige Verbindungen sonst mit einer Sperre.
 */
export async function sendeFreigegebene(): Promise<VersandErgebnis> {
  const ergebnis: VersandErgebnis = { gesendet: 0, fehler: 0, details: [] };
  const s = await getSettings();

  if (!s.mailEnabled) return ergebnis;

  const k = await ladeKonfiguration();
  const fehlt = pruefeKonfiguration(k);
  if (fehlt.length) {
    ergebnis.details.push(`Versand übersprungen: ${fehlt.join(', ')} fehlt`);
    return ergebnis;
  }

  const heuteBeginn = new Date();
  heuteBeginn.setHours(0, 0, 0, 0);

  const faellig = await prisma.invoice.findMany({
    where: {
      status: 'approved',
      docType: 'invoice',
      // Erst am Tag nach der Freigabe. Ohne Zeitstempel - etwa bei Belegen
      // aus der Zeit vor dieser Funktion - wird nicht verschickt, damit
      // niemand ungewollt eine Altlast beim Kunden landet.
      approvedAt: { not: null, lt: heuteBeginn },
    },
    orderBy: { id: 'asc' },
    include: { client: { select: { name: true, email: true } } },
  });

  for (const invoice of faellig) {
    try {
      await sendeRechnung(invoice.id);
      ergebnis.gesendet += 1;
      ergebnis.details.push(
        `${invoice.number} an ${invoice.client?.email} versendet`,
      );
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      ergebnis.fehler += 1;
      ergebnis.details.push(`${invoice.number}: ${text}`);
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          mailAttempts: { increment: 1 },
          mailError: text.slice(0, 500),
        },
      });
    }
  }

  return ergebnis;
}


const STANDARD_TEXT_ANGEBOT = [
  'Sehr geehrte Damen und Herren,',
  '',
  'vielen Dank für Ihre Anfrage. Unser Angebot {nummer} finden Sie im Anhang.',
  'Das Angebot gilt bis zum {gueltigbis}.',
  '',
  'Für Rückfragen stehen wir gern zur Verfügung.',
  '',
  'Mit freundlichen Grüßen',
  '{firma}',
].join('\n');

/**
 * Verschickt ein Angebot als PDF.
 *
 * Anders als bei der Rechnung wird der Status nicht angefasst: ein Angebot
 * geht oft mehrfach hinaus, etwa nach einer Rueckfrage. Wer es als
 * "versendet" fuehren will, setzt das weiterhin selbst.
 */
export async function sendeAngebot(quoteId: number): Promise<void> {
  const s = await getSettings();
  const k = await ladeKonfiguration();
  const fehlt = pruefeKonfiguration(k);
  if (fehlt.length) {
    throw new HttpError(400, `Unvollständige Einstellungen: ${fehlt.join(', ')}`);
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { client: true },
  });
  if (!quote) throw new HttpError(404, 'Angebot nicht gefunden');
  if (!quote.client?.email) {
    throw new HttpError(
      400,
      `Kunde „${quote.client?.name ?? '?'}" hat keine E-Mail-Adresse`,
    );
  }

  const betrag = new Intl.NumberFormat(s.locale || 'de-DE', {
    style: 'currency',
    currency: quote.currency,
  }).format(quote.total);
  const datum = (d: Date | null) =>
    d
      ? d.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
  const werte = {
    nummer: quote.number,
    kunde: quote.client.contactName || quote.client.name,
    firma: s.companyName,
    betrag,
    datum: datum(quote.issueDate),
    gueltigbis: datum(quote.validUntil),
  };

  const anhaenge = [
    {
      filename: `${quote.number}.pdf`,
      content: await generateQuotePdf(quoteId),
    },
  ];

  let htmlTeil = '';
  let bilder: { filename: string; content: Buffer; cid: string }[] = [];
  if (s.quoteMailBodyHtml) {
    const auf = bilderAuslagern(fuelle(s.quoteMailBodyHtml, werte));
    htmlTeil = auf.html;
    bilder = auf.bilder;
  }

  await versendeUndLegeAb(k, {
    to: quote.client.email,
    ...(k.replyTo ? { replyTo: k.replyTo } : {}),
    ...(k.bcc ? { bcc: k.bcc } : {}),
    subject: fuelle(s.quoteMailSubject || 'Angebot {nummer}', werte),
    ...(s.quoteMailBodyHtml
      ? {
          html: htmlTeil,
          text: fuelle(s.quoteMailBody || alsText(s.quoteMailBodyHtml), werte),
        }
      : { text: fuelle(s.quoteMailBody || STANDARD_TEXT_ANGEBOT, werte) }),
    attachments: [...anhaenge, ...bilder],
  });
}
