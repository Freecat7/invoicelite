import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { FREQUENCIES, RECURRING_STATUSES } from '../constants';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  parseBody,
  parseId,
} from './helpers';

export const recurringExpenseRouter = Router();

const recurringExpenseSchema = z.object({
  vendor: z.string().default(''),
  category: z.string().default(''),
  amount: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  currency: z.string().default('EUR'),
  description: z.string().default(''),
  frequency: z.enum(FREQUENCIES).default('monthly'),
  nextRunDate: dateSchema,
  endDate: dateSchema,
  remainingCycles: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  status: z.enum(RECURRING_STATUSES).default('active'),
});

recurringExpenseRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    res.json(
      await prisma.recurringExpense.findMany({
        where: status ? { status } : {},
        include: { _count: { select: { generatedExpenses: true } } },
        orderBy: [{ status: 'asc' }, { nextRunDate: 'asc' }],
      }),
    );
  }),
);

recurringExpenseRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = await prisma.recurringExpense.findUnique({
      where: { id: parseId(req.params.id) },
      include: {
        generatedExpenses: {
          // ID als Zweitschluessel: mehrere Belege koennen dasselbe
          // Datum tragen, dann waere die Reihenfolge sonst zufaellig.
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: 20,
          select: {
            id: true,
            date: true,
            total: true,
            currency: true,
            status: true,
          },
        },
      },
    });
    if (!template) throw new HttpError(404, 'Vorlage nicht gefunden');
    res.json(template);
  }),
);

recurringExpenseRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(recurringExpenseSchema, req.body);
    const settings = await getSettings();
    res.status(201).json(
      await prisma.recurringExpense.create({
        data: {
          ...data,
          currency: data.currency || settings.currency,
          nextRunDate: data.nextRunDate ?? new Date(),
        },
      }),
    );
  }),
);

recurringExpenseRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(recurringExpenseSchema, req.body);
    const existing = await prisma.recurringExpense.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Vorlage nicht gefunden');

    res.json(
      await prisma.recurringExpense.update({
        where: { id },
        data: { ...data, nextRunDate: data.nextRunDate ?? existing.nextRunDate },
      }),
    );
  }),
);

recurringExpenseRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.recurringExpense.delete({
      where: { id: parseId(req.params.id) },
    });
    res.json({ deleted: true });
  }),
);
