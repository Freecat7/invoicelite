import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import {
  SESSION_COOKIE,
  requireAuth,
  signSession,
} from '../middleware/auth';
import { HttpError, asyncHandler, parseBody } from './helpers';

export const authRouter = Router();

/**
 * Einfache Bremse gegen Passwort-Raten: nach mehreren Fehlversuchen je
 * Herkunft wird die Anmeldung kurz gesperrt. Bewusst im Arbeitsspeicher -
 * bei einer Einzelinstanz reicht das, und ein Neustart als Zuruecksetzen
 * ist hier unkritisch.
 */
const MAX_VERSUCHE = 8;
const SPERRE_MS = 15 * 60 * 1000;
const versuche = new Map<string, { anzahl: number; bis: number }>();

function herkunft(req: { ip?: string }): string {
  return req.ip || 'unbekannt';
}

function gesperrt(key: string): number {
  const eintrag = versuche.get(key);
  if (!eintrag) return 0;
  if (Date.now() > eintrag.bis) {
    versuche.delete(key);
    return 0;
  }
  return eintrag.anzahl >= MAX_VERSUCHE
    ? Math.ceil((eintrag.bis - Date.now()) / 1000)
    : 0;
}

function fehlversuch(key: string): void {
  const eintrag = versuche.get(key);
  if (eintrag && Date.now() <= eintrag.bis) {
    eintrag.anzahl += 1;
    eintrag.bis = Date.now() + SPERRE_MS;
  } else {
    versuche.set(key, { anzahl: 1, bis: Date.now() + SPERRE_MS });
  }
  // Alte Eintraege gelegentlich aufraeumen, damit die Map nicht waechst.
  if (versuche.size > 1000) {
    const jetzt = Date.now();
    for (const [k, v] of versuche) if (jetzt > v.bis) versuche.delete(k);
  }
}

const loginSchema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse angeben'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const key = herkunft(req);
    const wartezeit = gesperrt(key);
    if (wartezeit > 0) {
      throw new HttpError(
        429,
        `Zu viele Fehlversuche. Bitte in ${Math.ceil(wartezeit / 60)} Minute(n) erneut versuchen.`,
      );
    }

    const { email, password } = parseBody(loginSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      fehlversuch(key);
      throw new HttpError(401, 'E-Mail oder Passwort ist falsch');
    }
    versuche.delete(key);

    res.cookie(SESSION_COOKIE, signSession(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.protocol === 'https',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user.id, email: user.email, name: user.name });
  }),
);

authRouter.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new HttpError(401, 'Nicht angemeldet');
    res.json({ ...user, via: req.user!.via });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort erforderlich'),
  newPassword: z
    .string()
    .min(8, 'Das neue Passwort muss mindestens 8 Zeichen haben'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseBody(
      changePasswordSchema,
      req.body,
    );
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Aktuelles Passwort ist falsch');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    res.json({ ok: true });
  }),
);

const profileSchema = z.object({
  email: z.string().email('Bitte eine gültige E-Mail-Adresse angeben'),
  name: z.string().default(''),
});

authRouter.put(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parseBody(profileSchema, req.body);
    const email = data.email.toLowerCase();
    const clash = await prisma.user.findFirst({
      where: { email, NOT: { id: req.user!.id } },
    });
    if (clash) throw new HttpError(400, 'Diese E-Mail-Adresse ist bereits vergeben');

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { email, name: data.name },
      select: { id: true, email: true, name: true },
    });
    // Cookie neu ausstellen, da die E-Mail im Token steckt.
    res.cookie(SESSION_COOKIE, signSession(user), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.protocol === 'https',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json(user);
  }),
);

/**
 * Legt beim ersten Start den Administrator an. Ohne gesetztes
 * ADMIN_PASSWORD wird ein Zufallspasswort erzeugt und einmalig geloggt.
 */
export async function ensureAdminUser(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const email = config.adminEmail.toLowerCase();
  const password =
    config.adminPassword || Math.random().toString(36).slice(2, 14);

  await prisma.user.create({
    data: {
      email,
      name: 'Administrator',
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  console.log('─'.repeat(64));
  console.log('Administrator-Konto angelegt:');
  console.log(`  E-Mail:   ${email}`);
  if (config.adminPassword) {
    console.log('  Passwort: (aus ADMIN_PASSWORD)');
  } else {
    console.log(`  Passwort: ${password}`);
    console.log('  Bitte nach der ersten Anmeldung ändern!');
  }
  console.log('─'.repeat(64));
}
