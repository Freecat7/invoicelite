import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config';
import { getSettings, initDatabase, prisma } from './db';
import { requireAuth } from './middleware/auth';
import { HttpError } from './routes/helpers';
import { authRouter, ensureAdminUser } from './routes/auth';
import { settingsRouter } from './routes/settings';
import { apiTokenRouter } from './routes/apiTokens';
import { clientRouter } from './routes/clients';
import { productRouter } from './routes/products';
import { invoiceRouter } from './routes/invoices';
import { paymentRouter } from './routes/payments';
import { quoteRouter } from './routes/quotes';
import { recurringInvoiceRouter } from './routes/recurringInvoices';
import { expenseRouter } from './routes/expenses';
import { recurringExpenseRouter } from './routes/recurringExpenses';
import { dashboardRouter } from './routes/dashboard';
import { backupRouter } from './routes/backup';
import { reportRouter } from './routes/report';
import { mailRouter } from './routes/mail';
import { setupRouter } from './routes/setup';
import { planeMailversand } from './services/scheduler';
import { runRecurring } from './services/recurringRunner';
import { closeBrowser } from './services/pdf';

const app = express();

app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Der Name wird schon auf der Anmeldeseite gebraucht, also vor jeder
// Sitzung. Bewusst nur dieses eine Feld - alles Weitere bleibt geschuetzt.
app.get('/api/branding', async (_req, res) => {
  try {
    const s = await getSettings();
    res.json({ appName: s.appName || 'invoicelite' });
  } catch {
    res.json({ appName: 'invoicelite' });
  }
});

// Anmeldung liegt vor der Auth-Pruefung.
app.use('/api/auth', authRouter);

// Alles Weitere erfordert Cookie-Sitzung oder API-Token.
app.use('/api', requireAuth);
app.use('/api/settings', settingsRouter);
app.use('/api/tokens', apiTokenRouter);
app.use('/api/clients', clientRouter);
app.use('/api/products', productRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/quotes', quoteRouter);
app.use('/api/recurring-invoices', recurringInvoiceRouter);
app.use('/api/expenses', expenseRouter);
app.use('/api/recurring-expenses', recurringExpenseRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/backup', backupRouter);
app.use('/api/reports', reportRouter);
app.use('/api/mail', mailRouter);
app.use('/api/setup', setupRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpunkt nicht gefunden' });
});

// Gebautes React-Frontend ausliefern; unbekannte Pfade gehen an index.html,
// damit clientseitiges Routing funktioniert.
app.use(express.static(config.publicDir, { index: false }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'), (err) => {
    if (err) res.status(404).send('Frontend nicht gefunden');
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  const prismaCode = (err as { code?: string }).code;
  if (prismaCode === 'P2025') {
    return res.status(404).json({ error: 'Datensatz nicht gefunden' });
  }
  if (prismaCode === 'P2002') {
    return res.status(400).json({ error: 'Eintrag existiert bereits' });
  }
  if (prismaCode === 'P2003') {
    return res
      .status(400)
      .json({ error: 'Datensatz wird noch von anderen Einträgen verwendet' });
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

/**
 * JWT_SECRET muss ueber Neustarts stabil bleiben, sonst werden alle
 * Sitzungen ungueltig. Ohne gesetzte Variable wird einmalig eines erzeugt
 * und im Datenverzeichnis abgelegt.
 */
async function resolveJwtSecret(): Promise<void> {
  if (config.jwtSecret) return;
  const secretFile = path.join(config.dataDir, '.jwt-secret');
  try {
    config.jwtSecret = (await fs.readFile(secretFile, 'utf8')).trim();
    if (config.jwtSecret) return;
  } catch {
    // Datei existiert noch nicht.
  }
  config.jwtSecret = crypto.randomBytes(48).toString('hex');
  await fs.writeFile(secretFile, config.jwtSecret, { mode: 0o600 });
  console.log('JWT_SECRET erzeugt und in', secretFile, 'gespeichert');
}

async function start(): Promise<void> {
  await initDatabase();
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.uploadDir, { recursive: true });
  await resolveJwtSecret();
  await ensureAdminUser();

  if (!config.disableScheduler) {
    // Faellige wiederkehrende Belege erzeugen; standardmaessig taeglich
    // um 02:30. Ein ungueltiger Ausdruck wuerde den Lauf still
    // verschlucken - deshalb hier abbrechen statt ohne Scheduler zu starten.
    if (!cron.validate(config.recurringCron)) {
      throw new Error(
        `RECURRING_CRON ist kein gueltiger Cron-Ausdruck: "${config.recurringCron}"`,
      );
    }
    console.log(
      `[recurring] Zeitplan ${config.recurringCron} (${config.timezone})`,
    );
    cron.schedule(
      config.recurringCron,
      () => {
        runRecurring()
          .then((result) => {
            // Auch den Leerlauf protokollieren: sonst laesst sich im
            // Betrieb nicht unterscheiden, ob nichts faellig war oder der
            // Lauf gar nicht stattfand.
            console.log(
              `[recurring] Lauf beendet: ${result.invoicesCreated} Rechnung(en), ` +
                `${result.expensesCreated} Ausgabe(n)`,
            );
          })
          .catch((err) => console.error('[recurring] Lauf fehlgeschlagen:', err));
      },
      { timezone: config.timezone },
    );
  }

  if (!config.disableScheduler) {
    await planeMailversand();
  }

  const server = app.listen(config.port, () => {
    console.log(`invoicelite läuft auf Port ${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await closeBrowser();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
