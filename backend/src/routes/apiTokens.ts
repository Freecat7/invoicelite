import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  generateApiToken,
  hashToken,
  requireSession,
} from '../middleware/auth';
import { asyncHandler, parseBody, parseId } from './helpers';

export const apiTokenRouter = Router();

// Tokens duerfen nur aus einer echten Browser-Sitzung verwaltet werden,
// damit ein geleaktes Token sich nicht selbst weitere Tokens ausstellen kann.
apiTokenRouter.use(requireSession);

apiTokenRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    res.json(tokens);
  }),
);

const createSchema = z.object({
  label: z.string().min(1, 'Bitte eine Bezeichnung angeben').max(80),
});

apiTokenRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { label } = parseBody(createSchema, req.body);
    const { token, prefix } = generateApiToken();

    const created = await prisma.apiToken.create({
      data: {
        userId: req.user!.id,
        label,
        prefix,
        tokenHash: hashToken(token),
      },
      select: { id: true, label: true, prefix: true, createdAt: true },
    });

    // Klartext wird nur hier einmalig ausgeliefert.
    res.status(201).json({ ...created, token });
  }),
);

apiTokenRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await prisma.apiToken.deleteMany({
      where: { id, userId: req.user!.id },
    });
    res.json({ ok: true });
  }),
);
