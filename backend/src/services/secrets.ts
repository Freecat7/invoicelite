import crypto from 'crypto';
import { config } from '../config';

/**
 * Verschluesselt das SMTP-Passwort fuer die Ablage in der Datenbank.
 *
 * Der Schluessel wird aus dem Sitzungsgeheimnis abgeleitet, das ausserhalb
 * der Datenbank in /data/.jwt-secret liegt. Wer also nur die Datenbank in
 * die Haende bekommt - etwa ueber eine Sicherung, in der das Geheimnis
 * bewusst fehlt - kann das Passwort nicht lesen.
 *
 * AES-256-GCM, weil es die Aenderung des Textes mit erkennt. Nur Node-Bordmittel.
 */
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  if (!config.jwtSecret) {
    throw new Error('Kein Sitzungsgeheimnis vorhanden - Schlüssel nicht ableitbar');
  }
  // Feste Ableitung: derselbe Schluessel bei jedem Start, solange das
  // Geheimnis dasselbe ist.
  return crypto.createHash('sha256').update(`smtp:${config.jwtSecret}`).digest();
}

/** Liefert "iv:tag:geheimtext", alles base64. */
export function verschluesseln(klartext: string): string {
  if (!klartext) return '';
  const iv = crypto.randomBytes(12);
  const chiffre = crypto.createCipheriv(ALGO, key(), iv);
  const daten = Buffer.concat([
    chiffre.update(klartext, 'utf8'),
    chiffre.final(),
  ]);
  return [
    iv.toString('base64'),
    chiffre.getAuthTag().toString('base64'),
    daten.toString('base64'),
  ].join(':');
}

/**
 * Gegenstueck zu verschluesseln. Laesst sich der Wert nicht entschluesseln -
 * etwa weil das Sitzungsgeheimnis neu erzeugt wurde - kommt ein leerer
 * String zurueck. Der Versand meldet dann eine fehlende Anmeldung, statt mit
 * einem Absturz stehenzubleiben.
 */
export function entschluesseln(gespeichert: string): string {
  if (!gespeichert) return '';
  try {
    const [iv, tag, daten] = gespeichert.split(':');
    if (!iv || !tag || !daten) return '';
    const chiffre = crypto.createDecipheriv(
      ALGO,
      key(),
      Buffer.from(iv, 'base64'),
    );
    chiffre.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      chiffre.update(Buffer.from(daten, 'base64')),
      chiffre.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}
