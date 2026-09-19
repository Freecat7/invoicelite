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

    const { prefix, padding } = series;

    // Freie Nummer suchen statt blind die naechste zu nehmen.
    //
    // Geraet der Zaehler hinter den Bestand - etwa weil ein Beleg direkt in
    // der Datenbank geloescht oder der Zaehler von Hand verstellt wurde -,
    // lief das Anlegen sonst in die Eindeutigkeitspruefung und meldete nur
    // "Eintrag existiert bereits". Beim naechtlichen Lauf hiess das: gar
    // keine Rechnung, ohne erkennbaren Grund.
    let kandidat = series.current;
    let nummer = '';
    for (let versuch = 0; versuch < 10_000; versuch += 1) {
      nummer = `${prefix}${String(kandidat).padStart(padding, '0')}`;
      // Rechnungen und Gutschriften teilen sich die Belegtabelle, Angebote
      // haben eine eigene. Artikelnummern sind nicht eindeutig indiziert -
      // dort genuegt der Zaehler, eine Doppelung waere kein Fehler.
      let belegt: { id: number } | null = null;
      if (kind === 'quote') {
        belegt = await tx.quote.findUnique({
          where: { number: nummer },
          select: { id: true },
        });
      } else if (kind !== 'product') {
        belegt = await tx.invoice.findUnique({
          where: { number: nummer },
          select: { id: true },
        });
      }
      if (!belegt) break;
      kandidat += 1;
    }
    if (!nummer) {
      throw new Error('Keine freie Belegnummer gefunden');
    }

    await tx.companySettings.update({
      where: { id: 1 },
      data: { [Object.keys(series.bump)[0]]: kandidat + 1 },
    });

    return nummer;
  }
}

export const nextInvoiceNumber = () => nextNumber('invoice');
export const nextQuoteNumber = () => nextNumber('quote');
export const nextCreditNumber = () => nextNumber('credit');
export const nextProductNumber = () => nextNumber('product');
