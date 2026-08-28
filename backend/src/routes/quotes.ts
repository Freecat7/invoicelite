import { Router } from 'express';
import { sendeAngebot } from '../services/mailer';
import { addTageUtc } from '../services/dates';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { QUOTE_STATUSES, TAX_REGIMES } from '../constants';
import { nextNumberIn } from '../services/numbering';
import { computeTotals } from '../services/totals';
import { generateQuotePdf } from '../services/pdf';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  lineSchema,
  parseBody,
  parseId,
} from './helpers';

export const quoteRouter = Router();

const quoteSchema = z.object({
  clientId: z.coerce.number().int().positive('Bitte einen Kunden auswählen'),
  issueDate: dateSchema,
  validUntil: dateSchema,
  status: z.enum(QUOTE_STATUSES).optional(),
  currency: z.string().default('EUR'),
  discountValue: z.coerce.number().min(0).default(0),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  taxRegime: z.enum(TAX_REGIMES).optional(),
  notes: z.string().default(''),
  terms: z.string().default(''),
  footer: z.string().default(''),
  lines: z.array(lineSchema).default([]),
});

const includeFull = {
  client: true,
  lines: { orderBy: { position: 'asc' as const } },
};

quoteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    const clientId = Number(req.query.clientId) || undefined;
    res.json(
      await prisma.quote.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(clientId ? { clientId } : {}),
        },
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      }),
    );
  }),
);

quoteRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({
      where: { id: parseId(req.params.id) },
      include: includeFull,
    });
    if (!quote) throw new HttpError(404, 'Angebot nicht gefunden');
    res.json(quote);
  }),
);

quoteRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(quoteSchema, req.body);
    const settings = await getSettings();
    const taxRegime = data.taxRegime ?? settings.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    const quote = await prisma.$transaction(async (tx) =>
      tx.quote.create({
      data: {
        number: await nextNumberIn(tx, 'quote'),
        taxRegime,
        clientId: data.clientId,
        issueDate: data.issueDate ?? new Date(),
        validUntil: data.validUntil,
        status: data.status ?? 'draft',
        currency: data.currency || settings.currency,
        discountValue: data.discountValue,
        discountType: data.discountType,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        // Bewusst die Angebotstexte, nicht die der Rechnung: dort steht
        // Zahlungsziel und Kontoverbindung, was auf einem Angebot nichts
        // zu suchen hat.
        notes: data.notes || settings.defaultQuoteNotes,
        terms: data.terms || settings.defaultQuoteTerms,
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
    res.status(201).json(quote);
  }),
);

quoteRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(quoteSchema, req.body);
    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Angebot nicht gefunden');

    // Die beim Anlegen festgehaltene Regelung gilt weiter; nur wenn sie
    // ausdruecklich mitgeschickt wird, aendert sie sich.
    const taxRegime = data.taxRegime ?? existing.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    await prisma.$transaction([
      prisma.quoteLine.deleteMany({ where: { quoteId: id } }),
      prisma.quote.update({
        where: { id },
        data: {
          clientId: data.clientId,
          issueDate: data.issueDate ?? existing.issueDate,
          validUntil: data.validUntil,
          ...(data.status ? { status: data.status } : {}),
          currency: data.currency,
          taxRegime,
          discountValue: data.discountValue,
          discountType: data.discountType,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
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
      await prisma.quote.findUnique({ where: { id }, include: includeFull }),
    );
  }),
);

const statusSchema = z.object({ status: z.enum(QUOTE_STATUSES) });

quoteRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = parseBody(statusSchema, req.body);
    res.json(
      await prisma.quote.update({
        where: { id },
        data: { status },
        include: includeFull,
      }),
    );
  }),
);

/** Erzeugt aus dem Angebot eine Rechnung und verknuepft beide Belege. */
quoteRouter.post(
  '/:id/convert',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!quote) throw new HttpError(404, 'Angebot nicht gefunden');
    if (quote.convertedInvoiceId) {
      throw new HttpError(400, 'Dieses Angebot wurde bereits umgewandelt');
    }

    const settings = await getSettings();
    const totals = computeTotals(
      quote.lines,
      quote.discountValue,
      quote.discountType,
      // Bewusst die aktuelle Regelung, nicht die des Angebots: die Rechnung
      // muss anwenden, was zum Leistungszeitpunkt gilt. Wer nach dem Ende
      // der Kleinunternehmerregelung ein altes Angebot umwandelt, bekommt
      // deshalb eine Rechnung mit Umsatzsteuer - der Bruttobetrag steigt.
      settings.taxRegime,
    );
    const issueDate = new Date();
    const dueDate = addTageUtc(issueDate, settings.paymentTermDays);

    const invoice = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
      data: {
        number: await nextNumberIn(tx, 'invoice'),
        clientId: quote.clientId,
        issueDate,
        dueDate,
        status: 'draft',
        taxRegime: settings.taxRegime,
        currency: quote.currency,
        discountValue: quote.discountValue,
        discountType: quote.discountType,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        // Beim Umwandeln greifen wieder die Rechnungstexte - das Angebot
        // trug die Angebotsbedingungen, die Rechnung braucht Zahlungsziel
        // und Hinweis auf die Kontoverbindung.
        notes: settings.defaultNotes,
        terms: settings.defaultTerms,
        footer: quote.footer,
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
      include: { client: true, lines: { orderBy: { position: 'asc' } } },
      }),
    );

    await prisma.quote.update({
      where: { id },
      data: { status: 'converted', convertedInvoiceId: invoice.id },
    });

    res.status(201).json(invoice);
  }),
);

quoteRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.quote.delete({ where: { id: parseId(req.params.id) } });
    res.json({ deleted: true });
  }),
);

quoteRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const quote = await prisma.quote.findUnique({
      where: { id },
      select: { number: true },
    });
    if (!quote) throw new HttpError(404, 'Angebot nicht gefunden');

    const pdf = await generateQuotePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download === '0' ? 'inline' : 'attachment'}; filename="Angebot-${quote.number}.pdf"`,
    );
    res.send(pdf);
  }),
);

/** Verschickt das Angebot als PDF an den Kunden. */
quoteRouter.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Angebot nicht gefunden');

    await sendeAngebot(id);
    res.json(
      await prisma.quote.findUnique({ where: { id }, include: includeFull }),
    );
  }),
);
