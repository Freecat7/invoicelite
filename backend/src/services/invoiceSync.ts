import { prisma } from '../db';
import { computeTotals, round2 } from './totals';

/**
 * Rechnet Summen und Zahlungsstand einer Rechnung neu und leitet daraus den
 * Status ab. Wird nach jeder Aenderung an Positionen oder Zahlungen
 * aufgerufen, damit Betraege und Status nie auseinanderlaufen.
 *
 * Manuell gesetzte Zustaende (draft, cancelled) bleiben erhalten, solange
 * keine Zahlung erfasst ist.
 */
export async function syncInvoice(invoiceId: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true, payments: true },
  });
  if (!invoice) return null;

  const totals = computeTotals(
    invoice.lines,
    invoice.discountValue,
    invoice.discountType,
    invoice.taxRegime,
  );
  const amountPaid = round2(
    invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
  );

  // Storniert und storniert-nach-Zahlung sind Endzustaende und werden nicht
  // mehr automatisch veraendert.
  const FINAL_STATUSES = ['cancelled', 'reversed'];

  let status = invoice.status;
  if (!FINAL_STATUSES.includes(status)) {
    if (amountPaid >= totals.total && totals.total > 0) {
      status = 'paid';
    } else if (amountPaid > 0) {
      status = 'partial';
    } else if (status === 'paid' || status === 'partial') {
      // Alle Zahlungen wieder entfernt - zurueck auf den Versandzustand.
      status = invoice.sentAt ? 'sent' : 'approved';
    }

    // Gutschriften haben kein Zahlungsziel und werden nie ueberfaellig.
    if (
      invoice.docType !== 'credit' &&
      ['sent', 'partial'].includes(status) &&
      invoice.dueDate < new Date(new Date().setHours(0, 0, 0, 0))
    ) {
      status = 'overdue';
    }
  }

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      amountPaid,
      status,
    },
    include: {
      client: true,
      lines: { orderBy: { position: 'asc' } },
      payments: { orderBy: { date: 'desc' } },
    },
  });
}
