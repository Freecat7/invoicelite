import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { config } from '../config';
import { EXPENSE_STATUSES } from '../constants';
import { round2 } from '../services/totals';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  parseBody,
  parseId,
} from './helpers';

export const expenseRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const expenseSchema = z.object({
  date: dateSchema,
  vendor: z.string().default(''),
  category: z.string().default(''),
  amount: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  currency: z.string().default('EUR'),
  description: z.string().default(''),
  reference: z.string().default(''),
  status: z.enum(EXPENSE_STATUSES).default('paid'),
});

/** Steuer und Bruttobetrag werden immer aus Netto + Satz abgeleitet. */
function deriveAmounts(amount: number, taxRate: number) {
  const taxAmount = round2((amount * taxRate) / 100);
  return { taxAmount, total: round2(amount + taxAmount) };
}

expenseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    const category = String(req.query.category || '').trim();
    const search = String(req.query.search || '').trim();

    res.json(
      await prisma.expense.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          ...(search
            ? {
                OR: [
                  { vendor: { contains: search } },
                  { description: { contains: search } },
                  { reference: { contains: search } },
                ],
              }
            : {}),
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
    );
  }),
);

expenseRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.expense.findMany({
      where: { NOT: { category: '' } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    res.json(rows.map((row) => row.category));
  }),
);

expenseRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const expense = await prisma.expense.findUnique({
      where: { id: parseId(req.params.id) },
    });
    if (!expense) throw new HttpError(404, 'Ausgabe nicht gefunden');
    res.json(expense);
  }),
);

expenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(expenseSchema, req.body);
    const settings = await getSettings();
    const { taxAmount, total } = deriveAmounts(data.amount, data.taxRate);

    res.status(201).json(
      await prisma.expense.create({
        data: {
          date: data.date ?? new Date(),
          vendor: data.vendor,
          category: data.category,
          amount: data.amount,
          taxRate: data.taxRate,
          taxAmount,
          total,
          currency: data.currency || settings.currency,
          description: data.description,
          reference: data.reference,
          status: data.status,
        },
      }),
    );
  }),
);

expenseRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(expenseSchema, req.body);
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Ausgabe nicht gefunden');

    const { taxAmount, total } = deriveAmounts(data.amount, data.taxRate);
    res.json(
      await prisma.expense.update({
        where: { id },
        data: {
          date: data.date ?? existing.date,
          vendor: data.vendor,
          category: data.category,
          amount: data.amount,
          taxRate: data.taxRate,
          taxAmount,
          total,
          currency: data.currency,
          description: data.description,
          reference: data.reference,
          status: data.status,
        },
      }),
    );
  }),
);

expenseRouter.post(
  '/:id/attachment',
  upload.single('attachment'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei übermittelt' });
    }
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Ausgabe nicht gefunden');

    const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
    const filename = `beleg-${id}-${Date.now()}${ext}`;
    await fs.mkdir(config.uploadDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadDir, filename), req.file.buffer);

    if (existing.attachmentPath) {
      fs.unlink(path.join(config.uploadDir, existing.attachmentPath)).catch(
        () => undefined,
      );
    }

    res.json(
      await prisma.expense.update({
        where: { id },
        data: { attachmentPath: filename },
      }),
    );
  }),
);

expenseRouter.get(
  '/:id/attachment',
  asyncHandler(async (req, res) => {
    const expense = await prisma.expense.findUnique({
      where: { id: parseId(req.params.id) },
    });
    if (!expense?.attachmentPath) {
      throw new HttpError(404, 'Kein Beleg hinterlegt');
    }
    res.sendFile(path.join(config.uploadDir, expense.attachmentPath));
  }),
);

expenseRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (existing?.attachmentPath) {
      fs.unlink(path.join(config.uploadDir, existing.attachmentPath)).catch(
        () => undefined,
      );
    }
    await prisma.expense.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);
