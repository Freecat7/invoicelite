import path from 'path';

const dataDir = process.env.DATA_DIR || '/data';

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  jwtSecret: process.env.JWT_SECRET || '',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  publicDir: path.resolve(__dirname, '..', 'public'),
  chromiumPath:
    process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  // Deaktiviert den taeglichen Scheduler fuer wiederkehrende Belege.
  disableScheduler: process.env.DISABLE_SCHEDULER === 'true',
  // Zeitzone fuer den Cron-Lauf.
  timezone: process.env.TZ || 'Europe/Berlin',
  // Zeitplan des taeglichen Laufs. Standard 02:30; per Cron-Ausdruck
  // aenderbar, damit sich der Lauf auch pruefen laesst, ohne bis nachts
  // zu warten.
  recurringCron: process.env.RECURRING_CRON || '30 2 * * *',
};
