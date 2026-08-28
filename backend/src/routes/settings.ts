import { Router } from 'express';
import { verschluesseln } from '../services/secrets';
import { planeMailversand } from '../services/scheduler';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { config } from '../config';
import { E_INVOICE_FORMATS, TAX_REGIMES } from '../constants';
import { asyncHandler, parseBody } from './helpers';

export const settingsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const settingsSchema = z.object({
  companyName: z.string().default(''),
  addressLine: z.string().default(''),
  postalCode: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('DE'),
  vatId: z.string().default(''),
  taxNumber: z.string().default(''),
  ownerName: z.string().default(''),
  setupCompleted: z.coerce.boolean().optional(),
  appName: z.string().trim().max(40).default('invoicelite'),
  uiAccentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Bitte einen Hex-Wert wie #2f6f4f angeben')
    .default('#2f6f4f'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Bitte eine Farbe als Hex-Wert angeben, z.B. #2E2B2A')
    .default('#2E2B2A'),
  email: z.string().default(''),
  phone: z.string().default(''),
  website: z.string().default(''),

  bankName: z.string().default(''),
  iban: z.string().default(''),
  bic: z.string().default(''),
  accountHolder: z.string().default(''),

  invoiceNumberPrefix: z.string().default('RE-'),
  invoiceNumberNext: z.coerce.number().int().min(1).default(1),
  invoiceNumberPadding: z.coerce.number().int().min(1).max(10).default(4),
  quoteNumberPrefix: z.string().default('AN-'),
  quoteNumberNext: z.coerce.number().int().min(1).default(1),
  quoteNumberPadding: z.coerce.number().int().min(1).max(10).default(4),
  productNumberPrefix: z.string().default('ART-'),
  productNumberNext: z.coerce.number().int().min(1).default(1),
  productNumberPadding: z.coerce.number().int().min(1).max(10).default(4),
  creditNumberPrefix: z.string().default('GS-'),
  creditNumberNext: z.coerce.number().int().min(1).default(1),
  creditNumberPadding: z.coerce.number().int().min(1).max(10).default(4),

  currency: z.string().default('EUR'),
  locale: z.string().default('de-DE'),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(19),
  taxRegime: z.enum(TAX_REGIMES).default('standard'),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(14),
  defaultTerms: z.string().default(''),
  defaultFooter: z.string().default(''),
  defaultNotes: z.string().default(''),
  defaultQuoteTerms: z.string().default(''),
  defaultQuoteNotes: z.string().default(''),

  eInvoiceFormat: z.enum(E_INVOICE_FORMATS).default('off'),
  buyerReference: z.string().default(''),
  showEpcQr: z.coerce.boolean().default(true),

  // --- Mailversand ---
  smtpHost: z.string().default(''),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpSecure: z.coerce.boolean().default(false),
  smtpUser: z.string().default(''),
  // Leerer String bedeutet "unveraendert lassen" - so muss das Passwort
  // beim Speichern der uebrigen Einstellungen nicht erneut eingetippt werden.
  smtpPassword: z.string().optional(),
  mailFromName: z.string().default(''),
  mailFromEmail: z.string().default(''),
  mailReplyTo: z.string().default(''),
  mailBcc: z.string().default(''),
  mailEnabled: z.coerce.boolean().default(false),
  mailSendTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Uhrzeit im Format HH:MM angeben')
    .default('09:00'),
  mailSubject: z.string().default('Rechnung {nummer}'),
  mailBody: z.string().default(''),
  mailBodyHtml: z.string().default(''),
  mailAttachment: z.enum(['pdf', 'zugferd', 'xrechnung']).default('pdf'),

  // Angebotsmail
  quoteMailSubject: z.string().default('Angebot {nummer}'),
  quoteMailBody: z.string().default(''),
  quoteMailBodyHtml: z.string().default(''),

  // Kopie im Ordner "Gesendet"
  imapCopyEnabled: z.coerce.boolean().default(false),
  imapHost: z.string().default(''),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapSecure: z.coerce.boolean().default(true),
  imapUser: z.string().default(''),
  imapPassword: z.string().optional(),
  imapSentFolder: z.string().default(''),
});

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(ohnePasswort(await getSettings()));
  }),
);

/**
 * Das verschluesselte Passwort verlaesst den Server nie. Stattdessen sagt
 * ein Merker, ob eines hinterlegt ist - mehr braucht die Oberflaeche nicht.
 */
function ohnePasswort<
  T extends { smtpPasswordEnc: string; imapPasswordEnc: string },
>(settings: T) {
  const { smtpPasswordEnc, imapPasswordEnc, ...rest } = settings;
  return {
    ...rest,
    smtpPasswordSet: !!smtpPasswordEnc,
    imapPasswordSet: !!imapPasswordEnc,
  };
}

/** Entfernt die hinterlegten Zugangsdaten. */
settingsRouter.delete(
  '/imap-password',
  asyncHandler(async (_req, res) => {
    await getSettings();
    const updated = await prisma.companySettings.update({
      where: { id: 1 },
      data: { imapPasswordEnc: '' },
    });
    res.json(ohnePasswort(updated));
  }),
);

settingsRouter.delete(
  '/smtp-password',
  asyncHandler(async (_req, res) => {
    await getSettings();
    const updated = await prisma.companySettings.update({
      where: { id: 1 },
      data: { smtpPasswordEnc: '' },
    });
    res.json(ohnePasswort(updated));
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const { smtpPassword, imapPassword, ...data } = parseBody(
      settingsSchema,
      req.body,
    );
    await getSettings();

    // Passwort nur anfassen, wenn eines mitgeschickt wurde. Ein leeres Feld
    // heisst "unveraendert", nicht "loeschen" - sonst wuerde jedes Speichern
    // der uebrigen Einstellungen die Anmeldedaten verwerfen. Zum Loeschen
    // dient der eigene Endpunkt weiter unten.
    const updated = await prisma.companySettings.update({
      where: { id: 1 },
      data: {
        ...data,
        ...(smtpPassword
          ? { smtpPasswordEnc: verschluesseln(smtpPassword) }
          : {}),
        ...(imapPassword
          ? { imapPasswordEnc: verschluesseln(imapPassword) }
          : {}),
      },
    });

    // Der Zeitplan des Mailversands steht in der Datenbank; nach einer
    // Aenderung muss er neu gesetzt werden.
    await planeMailversand().catch((err) =>
      console.error('[mail] Zeitplan konnte nicht gesetzt werden:', err),
    );

    res.json(ohnePasswort(updated));
  }),
);

/** Liefert das hinterlegte Logo fuer die Vorschau im Frontend aus. */
settingsRouter.get(
  '/logo-file',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    if (!settings.logoPath) {
      return res.status(404).json({ error: 'Kein Logo hinterlegt' });
    }
    res.sendFile(path.join(config.uploadDir, settings.logoPath));
  }),
);

settingsRouter.post(
  '/logo',
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei übermittelt' });
    }
    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const filename = `logo-${Date.now()}${ext}`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, filename), req.file.buffer);

    const previous = (await getSettings()).logoPath;
    const updated = await prisma.companySettings.update({
      where: { id: 1 },
      data: { logoPath: filename },
    });
    // Alte Datei aufraeumen, Fehler dabei sind unkritisch.
    if (previous && previous !== filename) {
      fs.unlink(path.join(config.uploadDir, previous)).catch(() => undefined);
    }
    res.json(updated);
  }),
);

settingsRouter.delete(
  '/logo',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    if (settings.logoPath) {
      fs.unlink(path.join(config.uploadDir, settings.logoPath)).catch(
        () => undefined,
      );
    }
    res.json(
      await prisma.companySettings.update({
        where: { id: 1 },
        data: { logoPath: '' },
      }),
    );
  }),
);
