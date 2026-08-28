import { ImapFlow } from 'imapflow';
import { getSettings } from '../db';
import { HttpError } from '../routes/helpers';
import { entschluesseln } from './secrets';

/**
 * Legt eine verschickte Nachricht im Ordner "Gesendet" ab.
 *
 * SMTP stellt nur zu - eine Kopie im eigenen Postfach entsteht dabei nicht.
 * Wer die Rechnung spaeter im Mailprogramm unter "Gesendet" sucht, findet
 * sonst nichts. Deshalb wird dieselbe Nachricht zusaetzlich per IMAP
 * abgelegt.
 *
 * Ein Fehlschlag hier darf den Versand nicht rueckgaengig machen: die Mail
 * ist beim Kunden, nur die Ablage fehlt. Der Aufrufer protokolliert das und
 * macht weiter.
 */

/** Gaengige Namen, falls der Server keinen Sonderordner meldet. */
const NAMEN = [
  'Sent',
  'Gesendet',
  'Sent Items',
  'Sent Messages',
  'Gesendete Elemente',
  'Gesendete Objekte',
  'INBOX.Sent',
  'INBOX.Gesendet',
];

export interface ImapKonfiguration {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  ordner: string;
}

export async function ladeImapKonfiguration(): Promise<ImapKonfiguration> {
  const s = await getSettings();
  return {
    host: s.imapHost,
    port: s.imapPort,
    secure: s.imapSecure,
    user: s.imapUser || s.smtpUser,
    // Ohne eigenes IMAP-Passwort das des Postausgangs nehmen - bei einem
    // Postfach ist es dasselbe Konto.
    password: entschluesseln(s.imapPasswordEnc) || entschluesseln(s.smtpPasswordEnc),
    ordner: s.imapSentFolder,
  };
}

export function pruefeImap(k: ImapKonfiguration): string[] {
  const fehlt: string[] = [];
  if (!k.host) fehlt.push('Server');
  if (!k.user) fehlt.push('Benutzername');
  if (!k.password) fehlt.push('Passwort');
  return fehlt;
}

function verbinde(k: ImapKonfiguration): ImapFlow {
  return new ImapFlow({
    host: k.host,
    port: k.port,
    secure: k.secure,
    auth: { user: k.user, pass: k.password },
    // Der Logger von imapflow wuerde sonst jede Anfrage ausgeben.
    logger: false,
  });
}

/**
 * Sucht den Ordner: zuerst ueber den Sonderordner \Sent (RFC 6154), den
 * die meisten Server melden, sonst ueber gaengige Namen. So trifft es
 * "Gesendet" genauso wie "Sent Items".
 */
async function findeOrdner(client: ImapFlow, vorgabe: string): Promise<string> {
  if (vorgabe) return vorgabe;

  const liste = await client.list();
  const sonder = liste.find(
    (m) => m.specialUse === '\\Sent' || m.flags?.has?.('\\Sent'),
  );
  if (sonder) return sonder.path;

  for (const name of NAMEN) {
    const treffer = liste.find(
      (m) => m.path.toLowerCase() === name.toLowerCase(),
    );
    if (treffer) return treffer.path;
  }
  const vorhandene = liste.map((m) => m.path).join(', ');
  throw new HttpError(
    400,
    'Kein Ordner für gesendete Nachrichten gefunden. Bitte den Namen in den ' +
      `Einstellungen eintragen. Vorhandene Ordner: ${vorhandene}`,
  );
}

/** Prueft Erreichbarkeit, Anmeldung und Ordner, ohne etwas abzulegen. */
/**
 * Uebersetzt IMAP-Fehler. Ohne das landen sie als "Interner Serverfehler"
 * in der Oberflaeche - derselbe Stolperstein wie beim Postausgang.
 */
function alsImapKlartext(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const e = err as { code?: string; responseText?: string; message?: string };
  const text = e.responseText || e.message || String(err);

  if (e.code === 'AUTHENTICATIONFAILED' || /auth/i.test(text)) {
    return new HttpError(
      400,
      'Der IMAP-Server hat die Anmeldung abgelehnt. Benutzername und Passwort ' +
        `prüfen – bei Zwei-Faktor-Anmeldung ein App-Passwort verwenden. (${text})`,
    );
  }
  if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
    return new HttpError(
      400,
      `Der IMAP-Server ist nicht erreichbar. Server und Port prüfen. (${text})`,
    );
  }
  if (/certificate|self.signed|SSL|wrong version/i.test(text)) {
    return new HttpError(
      400,
      'Die Verschlüsselung passt nicht zum Port. Port 993 arbeitet durchgehend ' +
        `verschlüsselt, Port 143 mit STARTTLS. (${text})`,
    );
  }
  return new HttpError(400, `Zugriff auf das Postfach fehlgeschlagen: ${text}`);
}

export async function pruefeImapVerbindung(): Promise<string> {
  const k = await ladeImapKonfiguration();
  const fehlt = pruefeImap(k);
  if (fehlt.length) {
    throw new HttpError(
      400,
      `Unvollständige Einstellungen für das Postfach: ${fehlt.join(', ')}`,
    );
  }
  const client = verbinde(k);
  try {
    await client.connect();
    return await findeOrdner(client, k.ordner);
  } catch (err) {
    throw alsImapKlartext(err);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Legt die fertige Nachricht als gelesen im Gesendet-Ordner ab. */
export async function legeInGesendetAb(nachricht: Buffer): Promise<string> {
  const k = await ladeImapKonfiguration();
  const fehlt = pruefeImap(k);
  if (fehlt.length) {
    throw new HttpError(
      400,
      `Unvollständige Einstellungen für das Postfach: ${fehlt.join(', ')}`,
    );
  }

  const client = verbinde(k);
  try {
    await client.connect();
    const ordner = await findeOrdner(client, k.ordner);
    await client.append(ordner, nachricht, ['\\Seen']);
    return ordner;
  } catch (err) {
    throw alsImapKlartext(err);
  } finally {
    await client.logout().catch(() => undefined);
  }
}
