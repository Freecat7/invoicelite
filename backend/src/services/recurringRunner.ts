import { prisma } from '../db';
import { computeTotals, round2 } from './totals';
import { nextNumberIn } from './numbering';
import { addInterval, addTageUtc, leistungszeitraum } from './dates';

/**
 * Erzeugt faellige Belege aus den wiederkehrenden Vorlagen.
 * Wird taeglich per Cron aufgerufen und kann zusaetzlich manuell
 * angestossen werden (Button im UI / POST /api/recurring/run).
 */



/** Ende des heutigen Tages - alles davor gilt als faellig. */
function endOfToday(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

export interface RunResult {
  invoicesCreated: number;
  expensesCreated: number;
  details: string[];
}

async function runRecurringInvoices(result: RunResult): Promise<void> {
  const due = await prisma.recurringInvoice.findMany({
    where: { status: 'active', nextRunDate: { lte: endOfToday() } },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  for (const template of due) {
    if (template.lines.length === 0) continue;

    const totals = computeTotals(
      template.lines,
      template.discountValue,
      template.discountType,
      template.taxRegime,
    );
    const issueDate = new Date(template.nextRunDate);
    const dueDate = addTageUtc(issueDate, template.paymentTermDays);
    // Der Zeitraum richtet sich nach dem Rechnungsdatum, nicht nach festen
    // Werten an der Vorlage - sonst stuende jeden Monat derselbe da.
    const zeitraum = leistungszeitraum(
      template.servicePeriod,
      issueDate,
      addInterval(template.nextRunDate, template.frequency),
    );

    // Nummer und Beleg in einer Transaktion, damit ein Fehlschlag keine
    // Luecke im Nummernkreis hinterlaesst.
    const number = await prisma.$transaction(async (tx) => {
      const nummer = await nextNumberIn(tx, 'invoice');
      await tx.invoice.create({
      data: {
        number: nummer,
        clientId: template.clientId,
        issueDate,
        dueDate,
        // Vorlage bestimmt, ob der Beleg direkt freigegeben wird.
        status: template.generateAs === 'approved' ? 'approved' : 'draft',
        // Ohne diesen Zeitstempel wuerde der Mailversand die Rechnung nie
        // aufgreifen - er nimmt nur, was vor heute freigegeben wurde.
        approvedAt:
          template.generateAs === 'approved' ? new Date() : null,
        taxRegime: template.taxRegime,
        ...(zeitraum
          ? { serviceDateFrom: zeitraum.von, serviceDateTo: zeitraum.bis }
          : {}),
        currency: template.currency,
        discountValue: template.discountValue,
        discountType: template.discountType,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        notes: template.notes,
        terms: template.terms,
        footer: template.footer,
        recurringInvoiceId: template.id,
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
      });
      return nummer;
    });

    const nextRunDate = addInterval(template.nextRunDate, template.frequency);
    const remaining =
      template.remainingCycles === null ? null : template.remainingCycles - 1;
    const finished =
      (remaining !== null && remaining <= 0) ||
      (template.endDate !== null && nextRunDate > template.endDate);

    await prisma.recurringInvoice.update({
      where: { id: template.id },
      data: {
        nextRunDate,
        remainingCycles: remaining,
        lastRunAt: new Date(),
        status: finished ? 'finished' : template.status,
      },
    });

    result.invoicesCreated += 1;
    result.details.push(
      `Rechnung ${number} aus Vorlage #${template.id} erzeugt ` +
        `(${template.generateAs === 'approved' ? 'freigegeben' : 'Entwurf'})`,
    );
  }
}

async function runRecurringExpenses(result: RunResult): Promise<void> {
  const due = await prisma.recurringExpense.findMany({
    where: { status: 'active', nextRunDate: { lte: endOfToday() } },
  });

  for (const template of due) {
    const taxAmount = round2((template.amount * template.taxRate) / 100);
    await prisma.expense.create({
      data: {
        date: new Date(template.nextRunDate),
        vendor: template.vendor,
        category: template.category,
        amount: template.amount,
        taxRate: template.taxRate,
        taxAmount,
        total: round2(template.amount + taxAmount),
        currency: template.currency,
        description: template.description,
        status: 'pending',
        recurringExpenseId: template.id,
      },
    });

    const nextRunDate = addInterval(template.nextRunDate, template.frequency);
    const remaining =
      template.remainingCycles === null ? null : template.remainingCycles - 1;
    const finished =
      (remaining !== null && remaining <= 0) ||
      (template.endDate !== null && nextRunDate > template.endDate);

    await prisma.recurringExpense.update({
      where: { id: template.id },
      data: {
        nextRunDate,
        remainingCycles: remaining,
        lastRunAt: new Date(),
        status: finished ? 'finished' : template.status,
      },
    });

    result.expensesCreated += 1;
    result.details.push(`Ausgabe aus Vorlage #${template.id} erzeugt`);
  }
}

/** Markiert versendete Rechnungen nach Ablauf der Frist als ueberfaellig. */
async function markOverdueInvoices(): Promise<void> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  await prisma.invoice.updateMany({
    where: {
      docType: 'invoice',
      status: { in: ['sent', 'partial'] },
      dueDate: { lt: now },
    },
    data: { status: 'overdue' },
  });
}

/** Angebote nach Ablauf der Gueltigkeit als abgelaufen kennzeichnen. */
async function markExpiredQuotes(): Promise<void> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  await prisma.quote.updateMany({
    where: {
      status: { in: ['draft', 'sent'] },
      validUntil: { not: null, lt: now },
    },
    data: { status: 'expired' },
  });
}

export async function runRecurring(): Promise<RunResult> {
  const result: RunResult = {
    invoicesCreated: 0,
    expensesCreated: 0,
    details: [],
  };
  await runRecurringInvoices(result);
  await runRecurringExpenses(result);
  await markOverdueInvoices();
  await markExpiredQuotes();
  return result;
}
