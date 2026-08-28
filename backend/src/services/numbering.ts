import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

/** Der Ausschnitt von PrismaClient, der innerhalb einer Transaktion gilt. */
type Tx = Prisma.TransactionClient;

/**
 * Vergibt die naechste Beleg-Nummer und erhoeht den Zaehler in den
 * Einstellungen. Laeuft in einer Transaktion, damit parallele Anfragen
 * keine doppelten Nummern erzeugen.
 */
/**
 * Vergibt die naechste Nummer innerhalb einer bereits laufenden Transaktion.
 *
 * Wichtig fuer die Lueckenlosigkeit: Nummer und Beleg muessen in derselben
 * Transaktion entstehen. Wurde die Nummer vorher in einer eigenen
 * Transaktion gezogen und das Anlegen scheiterte danach, war sie verbraucht
 * und im Nummernkreis klaffte eine Luecke.
 */
export type Art = 'invoice' | 'quote' | 'credit' | 'product';

export async function nextNumberIn(tx: Tx, kind: Art): Promise<string> {
  return vergib(tx, kind);
}

async function nextNumber(kind: Art): Promise<string> {
  return prisma.$transaction(async (tx) => vergib(tx, kind));
}

async function vergib(tx: Tx, kind: Art): Promise<string> {
  {
    const settings =
      (await tx.companySettings.findUnique({ where: { id: 1 } })) ??
      (await tx.companySettings.create({ data: { id: 1 } }));

    const series = {
      invoice: {
        prefix: settings.invoiceNumberPrefix,
        current: settings.invoiceNumberNext,
        padding: settings.invoiceNumberPadding,
        bump: { invoiceNumberNext: settings.invoiceNumberNext + 1 },
      },
      quote: {
        prefix: settings.quoteNumberPrefix,
        current: settings.quoteNumberNext,
        padding: settings.quoteNumberPadding,
        bump: { quoteNumberNext: settings.quoteNumberNext + 1 },
      },
      credit: {
        prefix: settings.creditNumberPrefix,
        current: settings.creditNumberNext,
        padding: settings.creditNumberPadding,
        bump: { creditNumberNext: settings.creditNumberNext + 1 },
      },
      product: {
        prefix: settings.productNumberPrefix,
        current: settings.productNumberNext,
        padding: settings.productNumberPadding,
        bump: { productNumberNext: settings.productNumberNext + 1 },
      },
    }[kind];

    const { prefix, current, padding } = series;

    await tx.companySettings.update({
      where: { id: 1 },
      data: series.bump,
    });

    return `${prefix}${String(current).padStart(padding, '0')}`;
  }
}

export const nextInvoiceNumber = () => nextNumber('invoice');
export const nextQuoteNumber = () => nextNumber('quote');
export const nextCreditNumber = () => nextNumber('credit');
export const nextProductNumber = () => nextNumber('product');
