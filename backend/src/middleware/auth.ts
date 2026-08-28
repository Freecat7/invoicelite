import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db';
import { config } from '../config';

export interface AuthUser {
  id: number;
  email: string;
  /** "session" = Browser-Cookie, "token" = API-Token */
  via: 'session' | 'token';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const SESSION_COOKIE = 'invoicelite_session';

export function signSession(user: { id: number; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: '30d',
  });
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Erzeugt ein neues API-Token. Der Klartext wird nur einmal zurueckgegeben,
 * gespeichert wird ausschliesslich der SHA-256-Hash.
 */
export function generateApiToken(): { token: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const token = `ilt_${raw}`;
  return { token, prefix: token.slice(0, 12) };
}

/**
 * Akzeptiert entweder das Session-Cookie (Browser) oder einen
 * "Authorization: Bearer <token>"-Header (Skripte, Automatisierung).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      const record = await prisma.apiToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!record) {
        return res.status(401).json({ error: 'Ungültiges API-Token' });
      }
      // Zeitstempel nachfuehren, ohne die Anfrage zu blockieren.
      prisma.apiToken
        .update({
          where: { id: record.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);
      req.user = { id: record.user.id, email: record.user.email, via: 'token' };
      return next();
    }

    const cookie = req.cookies?.[SESSION_COOKIE];
    if (!cookie) {
      return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    const payload = jwt.verify(cookie, config.jwtSecret) as unknown as {
      sub: number;
      email: string;
    };
    req.user = { id: payload.sub, email: payload.email, via: 'session' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }
}

/**
 * Sperrt Routen, die nur aus einer echten Browser-Sitzung heraus erlaubt
 * sind (z.B. Verwaltung der API-Tokens selbst).
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.via !== 'session') {
    return res
      .status(403)
      .json({ error: 'Nur mit Browser-Anmeldung möglich' });
  }
  return next();
}
