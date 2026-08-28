import cron, { ScheduledTask } from 'node-cron';
import { config } from '../config';
import { getSettings } from '../db';
import { sendeFreigegebene } from './mailer';

/**
 * Zeitplan des taeglichen Mailversands.
 *
 * Anders als der Lauf fuer wiederkehrende Belege steht die Uhrzeit hier
 * nicht in der Umgebung, sondern in den Einstellungen. Der Plan wird
 * deshalb beim Start gelesen und nach jeder Aenderung neu gesetzt.
 *
 * Eigenes Modul, damit die Einstellungen-Route ihn anstossen kann, ohne
 * ueber server.ts einen Ringschluss zu erzeugen.
 */
let aufgabe: ScheduledTask | null = null;

export async function planeMailversand(): Promise<void> {
  aufgabe?.stop();
  aufgabe = null;

  const settings = await getSettings();
  if (!settings.mailEnabled) {
    console.log('[mail] Versand ist ausgeschaltet');
    return;
  }

  const treffer = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(settings.mailSendTime);
  if (!treffer) {
    console.error(
      `[mail] Ungültige Uhrzeit "${settings.mailSendTime}" - Versand nicht geplant`,
    );
    return;
  }

  const ausdruck = `${Number(treffer[2])} ${Number(treffer[1])} * * *`;
  console.log(`[mail] Zeitplan ${settings.mailSendTime} (${config.timezone})`);

  aufgabe = cron.schedule(
    ausdruck,
    () => {
      sendeFreigegebene()
        .then((r) => {
          console.log(
            `[mail] Lauf beendet: ${r.gesendet} versendet, ${r.fehler} Fehler`,
          );
          for (const zeile of r.details) console.log(`[mail]   ${zeile}`);
        })
        .catch((err) => console.error('[mail] Lauf fehlgeschlagen:', err));
    },
    { timezone: config.timezone },
  );
}

export function stoppeMailversand(): void {
  aufgabe?.stop();
  aufgabe = null;
}
