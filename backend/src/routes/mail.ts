import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../middleware/auth';
import {
  pruefeVerbindung,
  sendeFreigegebene,
  sendeTestmail,
} from '../services/mailer';
import { pruefeImapVerbindung } from '../services/sentFolder';
import { asyncHandler, parseBody } from './helpers';

export const mailRouter = Router();

/**
 * Prueft Erreichbarkeit und Anmeldung am Postfach. Nur mit
 * Browser-Anmeldung: die Antwort verraet, ob Zugangsdaten stimmen.
 */
mailRouter.post(
  '/test-connection',
  requireSession,
  asyncHandler(async (_req, res) => {
    await pruefeVerbindung();
    res.json({ ok: true });
  }),
);

const testSchema = z.object({
  to: z.string().email('Bitte eine gültige E-Mail-Adresse angeben'),
});

mailRouter.post(
  '/test',
  requireSession,
  asyncHandler(async (req, res) => {
    const { to } = parseBody(testSchema, req.body);
    await sendeTestmail(to);
    res.json({ ok: true });
  }),
);

/** Stoesst den taeglichen Versandlauf von Hand an. */
mailRouter.post(
  '/run',
  asyncHandler(async (_req, res) => {
    res.json(await sendeFreigegebene());
  }),
);

/** Prueft die IMAP-Anmeldung und meldet den gefundenen Ordner zurueck. */
mailRouter.post(
  '/test-sent-folder',
  requireSession,
  asyncHandler(async (_req, res) => {
    const ordner = await pruefeImapVerbindung();
    res.json({ ok: true, ordner });
  }),
);
