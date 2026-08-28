import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { PAYMENT_METHODS } from '../constants';
import { syncInvoice } from '../services/invoiceSync';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  parseBody,
  parseId,
} from './helpers';

export const paymentRouter = Router();

const paymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive('Bitte eine Rechnung auswählen'),
  date: dateSchema,
  amount: z.coerce.number().positive('Der Betrag muss größer als 0 sein'),
  method: z.enum(PAYMENT_METHODS).default('bank_transfer'),
  reference: z.string().default(''),
  notes: z.string().default(''),
});

paymentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.query.invoiceId) || undefined;
    res.json(
      await prisma.payment.findMany({
        where: invoiceId ? { invoiceId } : {},
        include: {
          invoice: {
            select: {
              id: true,
              number: true,
              total: true,
              currency: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
    );
  }),
);

paymentRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(paymentSchema, req.body);
    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
    });
    if (!invoice) throw new HttpError(404, 'Rechnung nicht gefunden');

    const payment = await prisma.payment.create({
      data: {
        invoiceId: data.invoiceId,
        date: data.date ?? new Date(),
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
      },
    });

    // Zahlungsstand und Status der Rechnung nachziehen.
    const updated = await syncInvoice(data.invoiceId);
    res.status(201).json({ payment, invoice: updated });
  }),
);

paymentRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(paymentSchema, req.body);
    const payment = await prisma.payment.update({
      where: { id },
      data: {
        invoiceId: data.invoiceId,
        date: data.date ?? new Date(),
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
      },
    });
    res.json({ payment, invoice: await syncInvoice(data.invoiceId) });
  }),
);

paymentRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new HttpError(404, 'Zahlung nicht gefunden');

    await prisma.payment.delete({ where: { id } });
    res.json({ deleted: true, invoice: await syncInvoice(payment.invoiceId) });
  }),
);
