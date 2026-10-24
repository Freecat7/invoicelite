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
  /** Vorlagen, die uebersprungen werden mussten. */
  failed: number;
  details: string[];
}

/**
 * Bestimmt Zählerstand und Status einer Vorlage nach einem Lauf.
 *
 * Der Zähler geht nie unter null. Ist er aufgebraucht, wird er geleert und
 * die Vorlage beendet: eine 0 im Feld hätte beim Reaktivieren sofort wieder
 * zum Ende geführt, so genügt künftig das Umstellen des Status. Endet die
 * Vorlage dagegen am Enddatum, bleibt ein noch vorhandener Zähler stehen.
 */
function standNachLauf(
  template: {
    remainingCycles: number | null;
    endDate: Date | null;
    status: string;
  },
  nextRunDate: Date,
): { remainingCycles: number | null; status: string } {
  const verbleibend =
    template.remainingCycles === null
      ? null
      : Math.max(0, template.remainingCycles - 1);
  const aufgebraucht = verbleibend !== null && verbleibend <= 0;
  const ueberEnde =
    template.endDate !== null && nextRunDate > template.endDate;

  return {
    remainingCycles: aufgebraucht ? null : verbleibend,
    status: aufgebraucht || ueberEnde ? 'finished' : template.status,
  };
}

/**
 * Eine Vorlage, deren Zähler bereits bei null steht, darf nichts mehr
 * erzeugen. Solche Werte stammen aus der Zeit, in der ein geleertes Feld
 * still als 0 gespeichert wurde; die Migration raeumt sie auf, diese
 * Pruefung fängt den Rest ab.
 */
function zaehlerAufgebraucht(template: { remainingCycles: number | null }): boolean {
  return template.remainingCycles !== null && template.remainingCycles <= 0;
}

async function runRecurringInvoices(result: RunResult): Promise<void> {
  const due = await prisma.recurringInvoice.findMany({
    where: { status: 'active', nextRunDate: { lte: endOfToday() } },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  for (const template of due) {
    if (template.lines.length === 0) {
      result.details.push(
        `Vorlage #${template.id} ("${template.title}") hat keine Positionen und wurde uebersprungen`,
      );
      continue;
    }

    if (zaehlerAufgebraucht(template)) {
      await prisma.recurringInvoice.update({
        where: { id: template.id },
        data: { remainingCycles: null, status: 'finished' },
      });
      result.details.push(
        `Vorlage #${template.id} ("${template.title}") hatte keine Durchläufe mehr und wurde beendet`,
      );
      continue;
    }

    // Jede Vorlage fuer sich: scheitert eine, laufen die uebrigen weiter.
    // Vorher riss ein einzelner Fehler den ganzen Lauf mit - im Ergebnis
    // entstand keine einzige Rechnung, und die Meldung nannte nicht
    // einmal, welche Vorlage betroffen war.
    try {

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
      const stand = standNachLauf(template, nextRunDate);

      await prisma.recurringInvoice.update({
        where: { id: template.id },
        data: {
          nextRunDate,
          remainingCycles: stand.remainingCycles,
          lastRunAt: new Date(),
          status: stand.status,
        },
      });

      result.invoicesCreated += 1;
      result.details.push(
        `Rechnung ${number} aus Vorlage #${template.id} erzeugt ` +
          `(${template.generateAs === 'approved' ? 'freigegeben' : 'Entwurf'})`,
      );
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      result.details.push(
        `Vorlage #${template.id} ("${template.title}") fehlgeschlagen: ${text}`,
      );
      console.error(`[recurring] Vorlage #${template.id} fehlgeschlagen:`, text);
    }
  }
}

async function runRecurringExpenses(result: RunResult): Promise<void> {
  const due = await prisma.recurringExpense.findMany({
    where: { status: 'active', nextRunDate: { lte: endOfToday() } },
  });

  for (const template of due) {
    if (zaehlerAufgebraucht(template)) {
      await prisma.recurringExpense.update({
        where: { id: template.id },
        data: { remainingCycles: null, status: 'finished' },
      });
      result.details.push(
        `Ausgabenvorlage #${template.id} hatte keine Durchläufe mehr und wurde beendet`,
      );
      continue;
    }

    const taxAmount = round2((template.amount * template.taxRate) / 100);

    // Jede Vorlage fuer sich: scheitert eine, laufen die uebrigen weiter.
    // Vorher riss ein einzelner Fehler den ganzen Lauf mit - im Ergebnis
    // entstand keine einzige Ausgabe, und die Meldung nannte nicht
    // einmal, welche Vorlage betroffen war.
    try {
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
      const stand = standNachLauf(template, nextRunDate);

      await prisma.recurringExpense.update({
        where: { id: template.id },
        data: {
          nextRunDate,
          remainingCycles: stand.remainingCycles,
          lastRunAt: new Date(),
          status: stand.status,
        },
      });

      result.expensesCreated += 1;
      result.details.push(`Ausgabe aus Vorlage #${template.id} erzeugt`);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      result.failed += 1;
      result.details.push(
        `Vorlage #${template.id} ("${template.description}") fehlgeschlagen: ${text}`,
      );
      console.error(`[recurring] Vorlage #${template.id} fehlgeschlagen:`, text);
    }
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
    failed: 0,
    details: [],
  };
  await runRecurringInvoices(result);
  await runRecurringExpenses(result);
  await markOverdueInvoices();
  await markExpiredQuotes();
  return result;
}
