import { Router } from 'express';
import { addTageUtc } from '../services/dates';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import {
  DOC_TYPES,
  INVOICE_STATUSES,
  LOCKED_INVOICE_STATUSES,
  TAX_REGIMES,
} from '../constants';
import { nextNumberIn } from '../services/numbering';
import { computeTotals } from '../services/totals';
import { syncInvoice } from '../services/invoiceSync';
import { sendeRechnung } from '../services/mailer';
import { generateInvoicePdf } from '../services/pdf';
import {
  EInvoiceError,
  generateXRechnung,
  generateZugferdPdf,
} from '../services/eInvoice';
import {
  HttpError,
  asyncHandler,
  dateSchema,
  lineSchema,
  parseBody,
  parseId,
  toCsv,
} from './helpers';

export const invoiceRouter = Router();

const invoiceSchema = z.object({
  clientId: z.coerce.number().int().positive('Bitte einen Kunden auswählen'),
  docType: z.enum(DOC_TYPES).default('invoice'),
  issueDate: dateSchema,
  dueDate: dateSchema,
  serviceDateFrom: dateSchema,
  serviceDateTo: dateSchema,
  status: z.enum(INVOICE_STATUSES).optional(),
  // Kein Default: fehlt der Wert, gilt die Regelung aus den Einstellungen.
  taxRegime: z.enum(TAX_REGIMES).optional(),
  currency: z.string().default('EUR'),
  discountValue: z.coerce.number().min(0).default(0),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  notes: z.string().default(''),
  terms: z.string().default(''),
  footer: z.string().default(''),
  lines: z.array(lineSchema).default([]),
});

const includeFull = {
  client: true,
  lines: { orderBy: { position: 'asc' as const } },
  payments: { orderBy: { date: 'desc' as const } },
};

/** Positionen fuer prisma `create` aus den berechneten Zeilen aufbauen. */
function lineCreateData(lines: ReturnType<typeof computeTotals>['lines']) {
  return lines.map((line, idx) => ({
    position: idx,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    lineTotal: line.lineTotal,
  }));
}

invoiceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim();
    const docType = String(req.query.docType || '').trim();
    const clientId = Number(req.query.clientId) || undefined;
    const search = String(req.query.search || '').trim();

    res.json(
      await prisma.invoice.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(docType ? { docType } : {}),
          ...(clientId ? { clientId } : {}),
          ...(search
            ? {
                OR: [
                  { number: { contains: search } },
                  { client: { name: { contains: search } } },
                ],
              }
            : {}),
        },
        // E-Mail mitliefern, damit ein Versand-Workflow ohne zweiten
        // Aufruf auskommt.
        include: {
          client: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      }),
    );
  }),
);

/**
 * CSV-Export der Belegliste, z.B. zur Weitergabe an die Buchhaltung.
 * Muss vor "/:id" stehen, damit der Pfad nicht als ID gelesen wird.
 */
invoiceRouter.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const invoices = await prisma.invoice.findMany({
      where:
        from || to
          ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {},
      include: { client: { select: { name: true, vatId: true } } },
      orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
    });

    const csv = toCsv(
      [
        'Belegart',
        'Nummer',
        'Datum',
        'Faellig',
        'Leistung von',
        'Leistung bis',
        'Kunde',
        'USt-IdNr',
        'Status',
        'Steuerregelung',
        'Waehrung',
        'Netto',
        'USt',
        'Brutto',
        'Bezahlt',
        'Offen',
      ],
      invoices.map((invoice) => [
        invoice.docType === 'credit' ? 'Gutschrift' : 'Rechnung',
        invoice.number,
        invoice.issueDate.toISOString().slice(0, 10),
        invoice.dueDate.toISOString().slice(0, 10),
        invoice.serviceDateFrom?.toISOString().slice(0, 10) ?? '',
        invoice.serviceDateTo?.toISOString().slice(0, 10) ?? '',
        invoice.client.name,
        invoice.client.vatId,
        invoice.status,
        invoice.taxRegime,
        invoice.currency,
        invoice.subtotal,
        invoice.taxTotal,
        invoice.total,
        invoice.amountPaid,
        Math.round((invoice.total - invoice.amountPaid) * 100) / 100,
      ]),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="rechnungen.csv"',
    );
    // BOM, damit Excel die Umlaute korrekt liest.
    res.send('﻿' + csv);
  }),
);

invoiceRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: parseId(req.params.id) },
      include: includeFull,
    });
    if (!invoice) throw new HttpError(404, 'Beleg nicht gefunden');
    res.json(invoice);
  }),
);

invoiceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parseBody(invoiceSchema, req.body);
    const settings = await getSettings();

    const issueDate = data.issueDate ?? new Date();
    const dueDate = data.dueDate ?? addTageUtc(issueDate, settings.paymentTermDays);

    const taxRegime = data.taxRegime ?? settings.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    // Nummer und Beleg in einer Transaktion: schlaegt das Anlegen fehl,
    // wird auch die Nummer nicht verbraucht und der Kreis bleibt lueckenlos.
    const invoice = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
      data: {
        number: await nextNumberIn(
          tx,
          data.docType === 'credit' ? 'credit' : 'invoice',
        ),
        docType: data.docType,
        clientId: data.clientId,
        issueDate,
        dueDate,
        serviceDateFrom: data.serviceDateFrom,
        serviceDateTo: data.serviceDateTo,
        status: data.status ?? 'draft',
        // Ohne diesen Zeitstempel wuerde der Mailversand den Beleg nie
        // aufgreifen - er nimmt nur, was vor heute freigegeben wurde.
        ...(data.status === 'approved' ? { approvedAt: new Date() } : {}),
        ...(data.status === 'sent' ? { sentAt: new Date() } : {}),
        taxRegime,
        currency: data.currency || settings.currency,
        discountValue: data.discountValue,
        discountType: data.discountType,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        notes: data.notes || settings.defaultNotes,
        terms: data.terms || settings.defaultTerms,
        footer: data.footer || settings.defaultFooter,
        lines: { create: lineCreateData(totals.lines) },
      },
      include: includeFull,
      }),
    );

    res.status(201).json(invoice);
  }),
);

invoiceRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parseBody(invoiceSchema, req.body);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Beleg nicht gefunden');

    // Festgeschriebene Belege: nur die unkritischen Textfelder nachfuehren.
    if (istFestgeschrieben(existing.status)) {
      await prisma.invoice.update({
        where: { id },
        data: {
          notes: data.notes,
          terms: data.terms,
          footer: data.footer,
        },
      });
      return res.json(await syncInvoice(id));
    }

    const taxRegime = data.taxRegime ?? existing.taxRegime;
    const totals = computeTotals(
      data.lines,
      data.discountValue,
      data.discountType,
      taxRegime,
    );

    // Positionen werden komplett ersetzt - einfacher und konsistenter, als
    // einzelne Zeilen zu diffen.
    await prisma.$transaction([
      prisma.invoiceLine.deleteMany({ where: { invoiceId: id } }),
      prisma.invoice.update({
        where: { id },
        data: {
          clientId: data.clientId,
          issueDate: data.issueDate ?? existing.issueDate,
          dueDate: data.dueDate ?? existing.dueDate,
          serviceDateFrom: data.serviceDateFrom,
          serviceDateTo: data.serviceDateTo,
          ...(data.status ? { status: data.status } : {}),
          taxRegime,
          currency: data.currency,
          discountValue: data.discountValue,
          discountType: data.discountType,
          notes: data.notes,
          terms: data.terms,
          footer: data.footer,
          lines: { create: lineCreateData(totals.lines) },
        },
      }),
    ]);

    res.json(await syncInvoice(id));
  }),
);

/**
 * Ein festgeschriebener Beleg ist in Verkehr gebracht und darf inhaltlich
 * nicht mehr veraendert werden (GoBD). Nur Notizen, Bedingungen und Fusszeile
 * bleiben offen - sie stehen nicht fuer den Geschaeftsvorfall.
 */
function istFestgeschrieben(status: string): boolean {
  return (LOCKED_INVOICE_STATUSES as readonly string[]).includes(status);
}

const statusSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

invoiceRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = parseBody(statusSchema, req.body);
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Beleg nicht gefunden');

    await prisma.invoice.update({
      where: { id },
      data: {
        status,
        // Versanddatum beim ersten Versand festhalten.
        ...(status === 'sent' && !existing.sentAt ? { sentAt: new Date() } : {}),
        // Zeitpunkt der Freigabe: der Mailversand geht erst am Tag danach
        // los, deshalb muss er festgehalten werden.
        ...(status === 'approved' && !existing.approvedAt
          ? { approvedAt: new Date() }
          : {}),
      },
    });
    res.json(await syncInvoice(id));
  }),
);

/** Legt eine Kopie als neuen Entwurf an (entspricht "Clone Invoice"). */
invoiceRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const source = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!source) throw new HttpError(404, 'Beleg nicht gefunden');

    const settings = await getSettings();
    const issueDate = new Date();
    const dueDate = addTageUtc(issueDate, settings.paymentTermDays);

    const copy = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
      data: {
        number: await nextNumberIn(
          tx,
          source.docType === 'credit' ? 'credit' : 'invoice',
        ),
        docType: source.docType,
        clientId: source.clientId,
        issueDate,
        dueDate,
        status: 'draft',
        taxRegime: source.taxRegime,
        currency: source.currency,
        discountValue: source.discountValue,
        discountType: source.discountType,
        subtotal: source.subtotal,
        taxTotal: source.taxTotal,
        total: source.total,
        notes: source.notes,
        terms: source.terms,
        footer: source.footer,
        lines: {
          create: source.lines.map((line, idx) => ({
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

    res.status(201).json(copy);
  }),
);

/**
 * Erzeugt eine Gutschrift zur Rechnung ("Clone to Credit"). Die Betraege
 * bleiben positiv - eine Gutschrift ist ein eigener Belegtyp (Code 381),
 * negative Rechnungen sind in ZUGFeRD/XRechnung nicht zulaessig.
 */
invoiceRouter.post(
  '/:id/credit',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const source = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!source) throw new HttpError(404, 'Beleg nicht gefunden');
    if (source.docType === 'credit') {
      throw new HttpError(
        400,
        'Zu einer Gutschrift kann keine weitere Gutschrift erzeugt werden',
      );
    }

    const issueDate = new Date();
    const credit = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
      data: {
        number: await nextNumberIn(tx, 'credit'),
        docType: 'credit',
        clientId: source.clientId,
        issueDate,
        dueDate: issueDate,
        serviceDateFrom: source.serviceDateFrom,
        serviceDateTo: source.serviceDateTo,
        status: 'draft',
        taxRegime: source.taxRegime,
        creditForInvoiceId: source.id,
        currency: source.currency,
        discountValue: source.discountValue,
        discountType: source.discountType,
        subtotal: source.subtotal,
        taxTotal: source.taxTotal,
        total: source.total,
        notes: `Gutschrift zu Rechnung ${source.number}`,
        terms: '',
        footer: source.footer,
        lines: {
          create: source.lines.map((line, idx) => ({
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

    res.status(201).json(credit);
  }),
);

/**
 * Loeschen ist nur im Entwurf moeglich. Ein freigegebener oder versendeter
 * Beleg wird storniert, nicht entfernt - sonst entstuende eine Luecke im
 * Nummernkreis, die bei einer Pruefung erklaert werden muesste.
 *
 * War die Nummer des Entwurfs die zuletzt vergebene, wird der Zaehler
 * zurueckgenommen. Nur so bleibt die Folge auch dann lueckenlos, wenn ein
 * versehentlich angelegter Entwurf wieder verschwindet.
 */
invoiceRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Beleg nicht gefunden');

    if (existing.status !== 'draft') {
      throw new HttpError(
        409,
        'Nur Entwürfe können gelöscht werden. Einen bereits freigegebenen ' +
          'Beleg bitte stornieren oder eine Gutschrift dazu erzeugen.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.delete({ where: { id } });

      const settings = await tx.companySettings.findUnique({ where: { id: 1 } });
      if (!settings) return;

      const istGutschrift = existing.docType === 'credit';
      const prefix = istGutschrift
        ? settings.creditNumberPrefix
        : settings.invoiceNumberPrefix;
      const naechste = istGutschrift
        ? settings.creditNumberNext
        : settings.invoiceNumberNext;
      const padding = istGutschrift
        ? settings.creditNumberPadding
        : settings.invoiceNumberPadding;

      const zuletztVergeben = `${prefix}${String(naechste - 1).padStart(padding, '0')}`;
      if (existing.number === zuletztVergeben) {
        await tx.companySettings.update({
          where: { id: 1 },
          data: istGutschrift
            ? { creditNumberNext: naechste - 1 }
            : { invoiceNumberNext: naechste - 1 },
        });
      }
    });

    res.json({ deleted: true });
  }),
);

/**
 * PDF-Download. Mit ?einvoice=1 wird ein ZUGFeRD/Factur-X-Hybrid-PDF
 * erzeugt (Sicht-PDF mit eingebetteter EN16931-XML).
 */
invoiceRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { number: true, docType: true },
    });
    if (!invoice) throw new HttpError(404, 'Beleg nicht gefunden');

    const settings = await getSettings();
    const wantEInvoice =
      req.query.einvoice === '1' ||
      (req.query.einvoice !== '0' && settings.eInvoiceFormat === 'zugferd');

    let pdf: Buffer;
    try {
      pdf = wantEInvoice
        ? await generateZugferdPdf(id)
        : await generateInvoicePdf(id);
    } catch (err) {
      if (err instanceof EInvoiceError) {
        throw new HttpError(400, `E-Rechnung nicht möglich: ${err.message}`);
      }
      throw err;
    }

    const label = invoice.docType === 'credit' ? 'Gutschrift' : 'Rechnung';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download === '0' ? 'inline' : 'attachment'}; filename="${label}-${invoice.number}.pdf"`,
    );
    res.send(pdf);
  }),
);

/** Reine XRechnung-XML (UBL) fuer B2G-Empfaenger. */
invoiceRouter.get(
  '/:id/xrechnung',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { number: true, docType: true },
    });
    if (!invoice) throw new HttpError(404, 'Beleg nicht gefunden');

    try {
      const xml = await generateXRechnung(id);
      const label = invoice.docType === 'credit' ? 'Gutschrift' : 'Rechnung';
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${label}-${invoice.number}.xml"`,
      );
      res.send(xml);
    } catch (err) {
      if (err instanceof EInvoiceError) {
        throw new HttpError(400, `E-Rechnung nicht möglich: ${err.message}`);
      }
      throw err;
    }
  }),
);

/**
 * Verschickt einen Beleg sofort per Mail, ohne auf den taeglichen Lauf zu
 * warten. Nuetzlich zum Nachreichen und um die Einrichtung zu erproben.
 */
invoiceRouter.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Beleg nicht gefunden');

    // Ein Entwurf darf nicht per Mail hinausgehen: sonst liesse sich die
    // Freigabe umgehen, und der Beleg stuende danach auf "versendet",
    // ohne je geprueft worden zu sein.
    if (existing.status === 'draft') {
      throw new HttpError(
        409,
        'Der Beleg ist noch ein Entwurf. Bitte zuerst freigeben.',
      );
    }
    if (existing.docType === 'credit') {
      throw new HttpError(
        409,
        'Gutschriften werden nicht über den Rechnungsversand verschickt.',
      );
    }

    await sendeRechnung(id);
    res.json(await syncInvoice(id));
  }),
);
