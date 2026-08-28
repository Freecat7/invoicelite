import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler, parseBody, parseId } from './helpers';

export const clientRouter = Router();

const clientSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  contactName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  addressLine: z.string().default(''),
  postalCode: z.string().default(''),
  city: z.string().default(''),
  country: z.string().default('DE'),
  vatId: z.string().default(''),
  notes: z.string().default(''),
  archived: z.coerce.boolean().default(false),
});

clientRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const includeArchived = req.query.archived === 'true';
    const clients = await prisma.client.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { city: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    res.json(clients);
  }),
);

clientRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
          take: 20,
          select: {
            id: true,
            number: true,
            issueDate: true,
            dueDate: true,
            status: true,
            total: true,
            amountPaid: true,
            currency: true,
          },
        },
        quotes: {
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
    if (!client) throw new HttpError(404, 'Kunde nicht gefunden');
    res.json(client);
  }),
);

clientRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(clientSchema, req.body);
    res.status(201).json(await prisma.client.create({ data }));
  }),
);

clientRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(clientSchema, req.body);
    res.json(await prisma.client.update({ where: { id }, data }));
  }),
);

clientRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    // Kunden mit Belegen werden archiviert statt geloescht, damit die
    // Belegdaten vollstaendig bleiben.
    const [invoices, quotes, recurring] = await Promise.all([
      prisma.invoice.count({ where: { clientId: id } }),
      prisma.quote.count({ where: { clientId: id } }),
      prisma.recurringInvoice.count({ where: { clientId: id } }),
    ]);

    if (invoices + quotes + recurring > 0) {
      const archived = await prisma.client.update({
        where: { id },
        data: { archived: true },
      });
      return res.json({ archived: true, client: archived });
    }

    await prisma.client.delete({ where: { id } });
    res.json({ deleted: true });
  }),
);
