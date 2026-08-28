import { Router } from 'express';
import { nextNumberIn } from '../services/numbering';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler, parseBody, parseId } from './helpers';

export const productRouter = Router();

const productSchema = z.object({
  sku: z.string().default(''),
  name: z.string().min(1, 'Name ist erforderlich'),
  description: z.string().default(''),
  unitPrice: z.coerce.number().default(0),
  unit: z.string().default('Stk.'),
  taxRate: z.coerce.number().min(0).max(100).default(19),
  archived: z.coerce.boolean().default(false),
});

productRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const includeArchived = req.query.archived === 'true';
    res.json(
      await prisma.product.findMany({
        where: {
          ...(includeArchived ? {} : { archived: false }),
          ...(search
            ? {
                OR: [
                  { name: { contains: search } },
                  { sku: { contains: search } },
                  { description: { contains: search } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
      }),
    );
  }),
);

productRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: parseId(req.params.id) },
    });
    if (!product) throw new HttpError(404, 'Produkt nicht gefunden');
    res.json(product);
  }),
);

productRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(productSchema, req.body);

    // Ohne eigene Artikelnummer eine fortlaufende vergeben - wie bei den
    // Belegen. Nummer und Datensatz entstehen in einer Transaktion, damit
    // ein Fehlschlag keine Nummer verbraucht.
    const product = await prisma.$transaction(async (tx) =>
      tx.product.create({
        data: {
          ...data,
          sku: data.sku?.trim() || (await nextNumberIn(tx, 'product')),
        },
      }),
    );
    res.status(201).json(product);
  }),
);

productRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(productSchema, req.body);
    res.json(await prisma.product.update({ where: { id }, data }));
  }),
);

productRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.product.delete({ where: { id: parseId(req.params.id) } });
    res.json({ deleted: true });
  }),
);
