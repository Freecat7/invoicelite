import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getSettings, prisma } from '../db';
import { TAX_REGIMES } from '../constants';
import { requireSession } from '../middleware/auth';
import { HttpError, asyncHandler, parseBody } from './helpers';

export const setupRouter = Router();

/**
 * Einrichtung beim ersten Start.
 *
 * Gefragt wird nur, was sich nicht sinnvoll vorbelegen laesst und was ohne
 * Antwort spaeter Aerger macht - etwa die Telefonnummer, ohne die eine
 * E-Rechnung abgewiesen wird. Alles Uebrige behaelt seine Vorgabe und
 * laesst sich in den Einstellungen nachziehen.
 */
const setupSchema = z.object({
  // Schritt 1: Firma
  companyName: z.string().trim().min(1, 'Firmenname wird benötigt'),
  ownerName: z.string().trim().default(''),
  addressLine: z.string().trim().min(1, 'Straße und Hausnummer werden benötigt'),
  postalCode: z.string().trim().min(1, 'PLZ wird benötigt'),
  city: z.string().trim().min(1, 'Ort wird benötigt'),
  country: z.string().trim().default('DE'),
  email: z.string().email('Bitte eine gültige E-Mail-Adresse angeben'),
  // Pflicht fuer E-Rechnungen (BR-DE-6), deshalb hier schon abgefragt.
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length >= 3, {
      message: 'Telefonnummer mit mindestens drei Ziffern angeben',
    }),
  website: z.string().trim().default(''),

  // Schritt 2: Steuer
  taxRegime: z.enum(TAX_REGIMES),
  vatId: z.string().trim().default(''),
  taxNumber: z.string().trim().default(''),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(19),

  // Schritt 3: Bank
  accountHolder: z.string().trim().default(''),
  bankName: z.string().trim().default(''),
  iban: z.string().trim().default(''),
  bic: z.string().trim().default(''),

  // Schritt 4: Belege
  invoiceNumberPrefix: z.string().trim().default('RE-'),
  invoiceNumberNext: z.coerce.number().int().min(1).default(1),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(14),

  // Schritt 5: Konto
  loginEmail: z.string().email('Bitte eine gültige E-Mail-Adresse angeben').optional(),
  newPassword: z
    .string()
    .min(10, 'Mindestens 10 Zeichen')
    .optional()
    .or(z.literal('')),
});

setupRouter.get(
  '/status',
  requireSession,
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({ completed: s.setupCompleted });
  }),
);

setupRouter.post(
  '/',
  requireSession,
  asyncHandler(async (req, res) => {
    const { loginEmail, newPassword, ...daten } = parseBody(
      setupSchema,
      req.body,
    );

    // Ohne Steuernummer und ohne USt-IdNr. laesst sich keine gueltige
    // Rechnung stellen - die eine oder die andere muss da sein.
    if (!daten.vatId && !daten.taxNumber) {
      throw new HttpError(
        400,
        'Bitte USt-IdNr. oder Steuernummer angeben – ohne beides ist keine ' +
          'gültige Rechnung möglich.',
      );
    }

    await getSettings();
    const updated = await prisma.companySettings.update({
      where: { id: 1 },
      data: { ...daten, setupCompleted: true },
    });

    // Zugangsdaten nur anfassen, wenn etwas angegeben wurde.
    if (loginEmail || newPassword) {
      const user = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(loginEmail ? { email: loginEmail.toLowerCase() } : {}),
            ...(newPassword
              ? { passwordHash: await bcrypt.hash(newPassword, 10) }
              : {}),
          },
        });
      }
    }

    const { smtpPasswordEnc, imapPasswordEnc, ...rest } = updated;
    res.json({
      ...rest,
      smtpPasswordSet: !!smtpPasswordEnc,
      imapPasswordSet: !!imapPasswordEnc,
    });
  }),
);

/** Ueberspringen: nur den Merker setzen, nichts aendern. */
setupRouter.post(
  '/skip',
  requireSession,
  asyncHandler(async (_req, res) => {
    await getSettings();
    await prisma.companySettings.update({
      where: { id: 1 },
      data: { setupCompleted: true },
    });
    res.json({ completed: true });
  }),
);
