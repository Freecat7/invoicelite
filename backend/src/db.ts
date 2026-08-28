import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  // Grosszuegige Fristen: bei SQLite warten gleichzeitige Schreiber
  // aufeinander, statt sofort abzubrechen.
  transactionOptions: { maxWait: 15_000, timeout: 20_000 },
});

/**
 * SQLite fuer den Mehrbenutzerbetrieb einstellen.
 *
 * Im Standardmodus sperrt ein Schreibvorgang die ganze Datei und parallele
 * Anfragen laufen sofort in einen Zeitfehler - bei zehn gleichzeitigen
 * Anlagen scheiterten sieben. WAL erlaubt Lesen waehrend geschrieben wird,
 * busy_timeout laesst Schreiber warten statt abzubrechen.
 */
export async function initDatabase(): Promise<void> {
  // $queryRawUnsafe, nicht $executeRawUnsafe: "PRAGMA journal_mode" gibt den
  // neuen Modus als Zeile zurueck, und Ergebniszeilen lehnt execute bei
  // SQLite ab.
  const pragmas = [
    'PRAGMA journal_mode = WAL',
    'PRAGMA busy_timeout = 10000',
    // Bei WAL ist NORMAL der uebliche Kompromiss: kein fsync je Transaktion,
    // aber nach einem Absturz bleibt die Datenbank stimmig.
    'PRAGMA synchronous = NORMAL',
    'PRAGMA foreign_keys = ON',
  ];

  for (const pragma of pragmas) {
    try {
      await prisma.$queryRawUnsafe(pragma);
    } catch (err) {
      // Auf manchen Dateisystemen laesst sich WAL nicht setzen. Die
      // Anwendung laeuft dann langsamer, aber sie laeuft - deshalb nur
      // warnen und nicht den Start abbrechen.
      console.warn(
        `[db] "${pragma}" nicht gesetzt:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const [modus] = (await prisma.$queryRawUnsafe(
    'PRAGMA journal_mode',
  )) as { journal_mode: string }[];
  console.log(`[db] Journalmodus ${modus?.journal_mode ?? 'unbekannt'}`);
}

/**
 * Liefert den Singleton-Datensatz der Firmeneinstellungen und legt ihn
 * beim ersten Aufruf mit Standardwerten an.
 */
export async function getSettings() {
  const existing = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.companySettings.create({ data: { id: 1 } });
}
