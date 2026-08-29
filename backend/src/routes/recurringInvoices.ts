import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import {
  FREQUENCIES,
  GENERATE_AS_STATUSES,
  RECURRING_STATUSES,
  TAX_REGIMES,
} from '../constants';
import { computeTotals } from '../services/totals';
import { runRecurring } from '../services/recurringRunner';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  lineSchema,
  parseBody,
  parseId,
} from './helpers';

export const recurringInvoiceRouter = Router();

const recurringSchema = z.object({
  clientId: z.coerce.number().int().positive('Bitte einen Kunden auswählen'),
  title: z.string().default(''),
  frequency: z.enum(FREQUENCIES).default('monthly'),
  nextRunDate: dateSchema,
  endDate: dateSchema,
  remainingCycles: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  status: z.enum(RECURRING_STATUSES).default('active'),
  currency: z.string().default('EUR'),
  discountValue: z.coerce.number().min(0).default(0),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  paymentTermDays: z.coerce.number().int().min(0).max(365).default(14),
  // Kein Default: fehlt der Wert, gilt die Regelung aus den Einstellungen.
  taxRegime: z.enum(TAX_REGIMES).optional(),
  // Zielstatus der erzeugten Rechnungen
  generateAs: z.enum(GENERATE_AS_STATUSES).default('draft'),
  servicePeriod: z
    .enum(['none', 'issueMonth', 'previousMonth', 'untilNextRun'])
    .default('none'),
  notes: z.string().default(''),
  terms: z.string().default(''),
  footer: z.string().default(''),
  lines: z.array(lineSchema).default([]),
});

const includeFull = {
  client: true,
  lines: { orderBy: { position: 'asc' as const } },
};

recurringInvoiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    res.json(
      await prisma.recurringInvoice.findMany({
        where: status ? { status } : {},
        include: {
          client: { select: { id: true, name: true } },
          _count: { select: { generatedInvoices: true } },
        },
        orderBy: [{ status: 'asc' }, { nextRunDate: 'asc' }],
      }),
    );
  }),
);

recurringInvoiceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = await prisma.recurringInvoice.findUnique({
      where: { id: parseId(req.params.id) },
      include: {
        ...includeFull,
        generatedInvoices: {
          // ID als Zweitschluessel: mehrere Belege koennen dasselbe
          // Datum tragen, dann waere die Reihenfolge sonst zufaellig.
          orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
          take: 20,
          select: {
            id: true,
            number: true,
            issueDate: true,
            status: true,
            total: true,
            currency: true,
          },
        },
      },
    });
    if (!template) throw new HttpError(404, 'Vorlage nicht gefunden');
    res.json(template);
  }),
);

recurringInvoiceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(recurringSchema, req.body);
    const settings = await getSettings();
    const taxRegime = data.taxRegime ?? settings.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    res.status(201).json(
      await prisma.recurringInvoice.create({
        data: {
          clientId: data.clientId,
          title: data.title,
          frequency: data.frequency,
          nextRunDate: data.nextRunDate ?? new Date(),
          endDate: data.endDate,
          remainingCycles: data.remainingCycles,
          status: data.status,
          currency: data.currency || settings.currency,
          discountValue: data.discountValue,
          discountType: data.discountType,
          paymentTermDays: data.paymentTermDays,
          taxRegime,
          generateAs: data.generateAs,
          servicePeriod: data.servicePeriod,
          notes: data.notes || settings.defaultNotes,
          terms: data.terms || settings.defaultTerms,
          footer: data.footer || settings.defaultFooter,
          lines: {
            create: totals.lines.map((line, idx) => ({
              position: idx,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: includeFull,
      }),
    );
  }),
);

recurringInvoiceRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(recurringSchema, req.body);
    const existing = await prisma.recurringInvoice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Vorlage nicht gefunden');

    const taxRegime = data.taxRegime ?? existing.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    await prisma.$transaction([
      prisma.recurringInvoiceLine.deleteMany({
        where: { recurringInvoiceId: id },
      }),
      prisma.recurringInvoice.update({
        where: { id },
        data: {
          clientId: data.clientId,
          title: data.title,
          frequency: data.frequency,
          nextRunDate: data.nextRunDate ?? existing.nextRunDate,
          endDate: data.endDate,
          remainingCycles: data.remainingCycles,
          status: data.status,
          currency: data.currency,
          discountValue: data.discountValue,
          discountType: data.discountType,
          paymentTermDays: data.paymentTermDays,
          taxRegime,
          generateAs: data.generateAs,
          servicePeriod: data.servicePeriod,
          notes: data.notes,
          terms: data.terms,
          footer: data.footer,
          lines: {
            create: totals.lines.map((line, idx) => ({
              position: idx,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              lineTotal: line.lineTotal,
            })),
          },
        },
      }),
    ]);

    res.json(
      await prisma.recurringInvoice.findUnique({
        where: { id },
        include: includeFull,
      }),
    );
  }),
);

recurringInvoiceRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.recurringInvoice.delete({
      where: { id: parseId(req.params.id) },
    });
    res.json({ deleted: true });
  }),
);

/** Stoesst den Lauf fuer alle faelligen Vorlagen manuell an. */
recurringInvoiceRouter.post(
  '/run',
  asyncHandler(async (_req, res) => {
    res.json(await runRecurring());
  }),
);
