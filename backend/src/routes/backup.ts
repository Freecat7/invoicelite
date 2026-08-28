import archiver from 'archiver';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Router } from 'express';
import { config } from '../config';
import { prisma } from '../db';
import { requireSession } from '../middleware/auth';
import { asyncHandler } from './helpers';

export const backupRouter = Router();

/**
 * Vollstaendige Sicherung als ZIP: Datenbank und hochgeladene Dateien.
 *
 * Die Datenbankdatei wird nicht einfach kopiert - waehrend eines laufenden
 * Schreibvorgangs waere die Kopie unbrauchbar. "VACUUM INTO" erzeugt
 * stattdessen einen in sich stimmigen Abzug.
 *
 * Nicht enthalten ist die Datei mit dem Sitzungsgeheimnis: eine abhanden
 * gekommene Sicherung soll keine gueltigen Anmeldungen erzeugen koennen.
 * Beim Zurueckspielen entsteht es neu, alle Browser melden sich einmal neu an.
 *
 * Nur mit Browser-Anmeldung erreichbar - ein API-Token soll nicht den
 * gesamten Bestand herausgeben koennen.
 */
backupRouter.get(
  '/',
  requireSession,
  asyncHandler(async (_req, res) => {
    const stempel = new Date().toISOString().slice(0, 10);
    const arbeitsordner = await fs.mkdtemp(
      path.join(os.tmpdir(), 'invoicelite-backup-'),
    );
    const abzug = path.join(arbeitsordner, 'invoicelite.db');

    try {
      // Einfache Anfuehrungszeichen im Pfad verdoppeln, sonst bricht das
      // SQL-Literal auf. Der Pfad stammt zwar aus mkdtemp, aber die Regel
      // gehoert hierher und nicht in die Annahme.
      await prisma.$executeRawUnsafe(
        `VACUUM INTO '${abzug.replace(/'/g, "''")}'`,
      );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoicelite-sicherung-${stempel}.zip"`,
      );

      const archiv = archiver('zip', { zlib: { level: 9 } });
      archiv.on('error', (err: Error) => {
        console.error('[backup]', err);
        res.destroy();
      });
      archiv.pipe(res);

      archiv.file(abzug, { name: 'invoicelite.db' });

      // Logo und Belege; fehlt der Ordner, bleibt die Sicherung trotzdem gueltig.
      try {
        await fs.access(config.uploadDir);
        archiv.directory(config.uploadDir, 'uploads');
      } catch {
        // keine Uploads vorhanden
      }

      archiv.append(
        [
          'invoicelite - Sicherung',
          `erstellt am ${new Date().toLocaleString('de-DE')}`,
          '',
          'Inhalt:',
          '  invoicelite.db   Datenbank (stimmiger Abzug per VACUUM INTO)',
          '  uploads/         Logo und Ausgabenbelege',
          '',
          'Zurueckspielen: Container stoppen, beide Eintraege in das',
          'Volume /data legen, Container starten. Das Sitzungsgeheimnis',
          'ist bewusst nicht enthalten und wird neu erzeugt - alle',
          'Anmeldungen im Browser sind danach einmalig erneut noetig.',
          '',
        ].join('\n'),
        { name: 'LIESMICH.txt' },
      );

      await archiv.finalize();
    } finally {
      await fs.rm(arbeitsordner, { recursive: true, force: true });
    }
  }),
);
