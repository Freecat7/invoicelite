import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { round2 } from '../services/totals';
import { HttpError, asyncHandler, parseBody } from './helpers';

export const dashboardRouter = Router();

const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const querySchema = z.object({
  period: z.enum(['month', 'year', 'custom']).default('month'),
  year: z.coerce.number().int().min(1970).max(9999).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  // Nur bei period=custom ausgewertet.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Zeitraum als UTC-Grenzen. Datumsfelder werden als UTC-Mitternacht
 * gespeichert (ISO-Datum ohne Zeit); wird hier lokal gerechnet, faellt je
 * nach Zeitzone der Monatserste in den Vormonat.
 */
type Art = 'month' | 'year' | 'custom';

/** Tage zwischen zwei Grenzen (bis ist ausschliesslich). */
function tage(von: Date, bis: Date): number {
  return Math.max(1, Math.round((bis.getTime() - von.getTime()) / 86400000));
}

function zeitraum(kind: 'month' | 'year', year: number, month: number) {
  const von =
    kind === 'year'
      ? new Date(Date.UTC(year, 0, 1))
      : new Date(Date.UTC(year, month - 1, 1));
  const bis =
    kind === 'year'
      ? new Date(Date.UTC(year + 1, 0, 1))
      : new Date(Date.UTC(year, month, 1));
  return { von, bis };
}

/** Der davorliegende Zeitraum - fuer den Vergleich. */
function davor(kind: 'month' | 'year', year: number, month: number) {
  if (kind === 'year') return { year: year - 1, month: 1 };
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

interface Summen {
  invoiced: number;
  payments: number;
  expenses: number;
}

/**
 * Summen eines Zeitraums.
 *
 * "invoiced" zaehlt gestellte Rechnungen und zieht Gutschriften wieder ab,
 * damit eine stornierte Rechnung samt Gutschrift auf null herauskommt.
 * Abgebrochene Belege bleiben aussen vor - sie waren nie gueltig.
 * "payments" sind tatsaechliche Zahlungseingaenge nach Zahlungsdatum,
 * "expenses" die Bruttobetraege der Ausgaben.
 */
async function summen(von: Date, bis: Date): Promise<Summen> {
  const [belege, zahlungen, ausgaben] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issueDate: { gte: von, lt: bis },
        status: { not: 'cancelled' },
      },
      select: { total: true, docType: true },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { date: { gte: von, lt: bis } },
    }),
    prisma.expense.aggregate({
      _sum: { total: true },
      where: { date: { gte: von, lt: bis } },
    }),
  ]);

  const invoiced = belege.reduce(
    (sum, b) => sum + (b.docType === 'credit' ? -b.total : b.total),
    0,
  );

  return {
    invoiced: round2(invoiced),
    payments: round2(zahlungen._sum.amount ?? 0),
    expenses: round2(ausgaben._sum.total ?? 0),
  };
}

/** Veraenderung in Prozent; null, wenn es keinen Vorwert zum Vergleichen gibt. */
function veraenderung(jetzt: number, vorher: number): number | null {
  if (vorher === 0) return null;
  return round2(((jetzt - vorher) / Math.abs(vorher)) * 100);
}

/**
 * Verlauf fuer das Diagramm: im Monat je ein Punkt pro Tag, im Jahr je ein
 * Punkt pro Monat. Die Belege werden einmal geladen und in JS einsortiert -
 * bei den hier ueblichen Datenmengen ist das guenstiger als zwoelf Abfragen.
 */
async function verlauf(
  kind: Art,
  year: number,
  month: number,
  von: Date,
  bis: Date,
) {
  const [belege, zahlungen, ausgaben] = await Promise.all([
    prisma.invoice.findMany({
      where: { issueDate: { gte: von, lt: bis }, status: { not: 'cancelled' } },
      select: { issueDate: true, total: true, docType: true },
    }),
    prisma.payment.findMany({
      where: { date: { gte: von, lt: bis } },
      select: { date: true, amount: true },
    }),
    prisma.expense.findMany({
      where: { date: { gte: von, lt: bis } },
      select: { date: true, total: true },
    }),
  ]);

  // Beim freien Zeitraum bestimmt die Laenge die Einteilung: bis zu zwei
  // Monaten je ein Punkt pro Tag, darueber je Monat - sonst stuenden bei
  // einem Jahr 365 Saeulen nebeneinander.
  const laenge = tage(von, bis);
  const proTag = kind === 'month' || (kind === 'custom' && laenge <= 62);

  let anzahl: number;
  let beschriftung: (i: number) => string;
  if (kind === 'year') {
    anzahl = 12;
    beschriftung = (i) => MONATE[i].slice(0, 3);
  } else if (kind === 'month') {
    anzahl = new Date(Date.UTC(year, month, 0)).getUTCDate();
    beschriftung = (i) => String(i + 1);
  } else if (proTag) {
    anzahl = laenge;
    beschriftung = (i) => {
      const d = new Date(von.getTime() + i * 86400000);
      return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
    };
  } else {
    const monate =
      (bis.getUTCFullYear() - von.getUTCFullYear()) * 12 +
      (bis.getUTCMonth() - von.getUTCMonth()) +
      (bis.getUTCDate() > 1 ? 1 : 0);
    anzahl = Math.max(1, monate);
    beschriftung = (i) => {
      const m = von.getUTCMonth() + i;
      const j = von.getUTCFullYear() + Math.floor(m / 12);
      return `${MONATE[((m % 12) + 12) % 12].slice(0, 3)} ${String(j).slice(2)}`;
    };
  }

  const punkte = Array.from({ length: anzahl }, (_, i) => ({
    label: beschriftung(i),
    invoiced: 0,
    payments: 0,
    expenses: 0,
  }));

  const index = (d: Date) => {
    if (kind === 'year') return d.getUTCMonth();
    if (kind === 'month') return d.getUTCDate() - 1;
    if (proTag) return Math.floor((d.getTime() - von.getTime()) / 86400000);
    return (
      (d.getUTCFullYear() - von.getUTCFullYear()) * 12 +
      (d.getUTCMonth() - von.getUTCMonth())
    );
  };

  for (const b of belege) {
    const i = index(b.issueDate);
    if (punkte[i]) {
      punkte[i].invoiced += b.docType === 'credit' ? -b.total : b.total;
    }
  }
  for (const z of zahlungen) {
    const i = index(z.date);
    if (punkte[i]) punkte[i].payments += z.amount;
  }
  for (const a of ausgaben) {
    const i = index(a.date);
    if (punkte[i]) punkte[i].expenses += a.total;
  }

  return punkte.map((p) => ({
    label: p.label,
    invoiced: round2(p.invoiced),
    payments: round2(p.payments),
    expenses: round2(p.expenses),
  }));
}

/**
 * Kennzahlen der Startseite fuer einen Monat oder ein Jahr, jeweils mit dem
 * davorliegenden Zeitraum verglichen. Offene Forderungen und faellige
 * Vorgaenge sind bewusst zeitraumunabhaengig - sie beschreiben den Stand
 * jetzt, nicht den des gewaehlten Monats.
 */
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = parseBody(querySchema, req.query);
    const heute = new Date();
    const year = q.year ?? heute.getUTCFullYear();
    const month = q.month ?? heute.getUTCMonth() + 1;
    const kind = q.period;

    // Beim freien Zeitraum ist der Vergleichszeitraum der gleich lange
    // Abschnitt davor - ein Monat gegen einen Monat zu stellen waere bei
    // einer Zwoelf-Tage-Auswahl irrefuehrend.
    let von: Date;
    let bis: Date;
    let vorVon: Date;
    let vorBis: Date;
    let bezeichnung: string;
    let vorBezeichnung: string;

    if (kind === 'custom') {
      if (!q.from || !q.to) {
        throw new HttpError(400, 'Für einen freien Zeitraum bitte von und bis angeben');
      }
      von = new Date(`${q.from}T00:00:00Z`);
      // Der Endtag zaehlt mit, deshalb bis zum Beginn des Folgetags.
      bis = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000);
      if (bis <= von) {
        throw new HttpError(400, 'Das Ende darf nicht vor dem Anfang liegen');
      }
      const spanne = bis.getTime() - von.getTime();
      vorVon = new Date(von.getTime() - spanne);
      vorBis = new Date(von.getTime());
      const fmt = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}.${String(
          d.getUTCMonth() + 1,
        ).padStart(2, '0')}.${d.getUTCFullYear()}`;
      bezeichnung = `${fmt(von)} – ${fmt(new Date(bis.getTime() - 86400000))}`;
      vorBezeichnung = `${fmt(vorVon)} – ${fmt(new Date(vorBis.getTime() - 86400000))}`;
    } else {
      ({ von, bis } = zeitraum(kind, year, month));
      const vor = davor(kind, year, month);
      ({ von: vorVon, bis: vorBis } = zeitraum(kind, vor.year, vor.month));
      bezeichnung =
        kind === 'year' ? String(year) : `${MONATE[month - 1]} ${year}`;
      vorBezeichnung =
        kind === 'year'
          ? String(vor.year)
          : `${MONATE[vor.month - 1]} ${vor.year}`;
    }

    const settings = await getSettings();
    const stichtag = new Date();
    stichtag.setHours(0, 0, 0, 0);

    const [
      jetzt,
      vorher,
      punkte,
      offeneBelege,
      ueberfaellig,
      offeneAngebote,
      faelligeRechnungen,
      faelligeAusgaben,
      letzteBelege,
    ] = await Promise.all([
      summen(von, bis),
      summen(vorVon, vorBis),
      verlauf(kind, year, month, von, bis),
      prisma.invoice.findMany({
        where: { status: { in: ['sent', 'partial', 'overdue'] } },
        select: { total: true, amountPaid: true },
      }),
      prisma.invoice.count({ where: { status: 'overdue' } }),
      prisma.quote.count({ where: { status: { in: ['draft', 'sent'] } } }),
      prisma.recurringInvoice.count({
        where: { status: 'active', nextRunDate: { lte: stichtag } },
      }),
      prisma.recurringExpense.count({
        where: { status: 'active', nextRunDate: { lte: stichtag } },
      }),
      prisma.invoice.findMany({
        take: 8,
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
        include: { client: { select: { id: true, name: true } } },
      }),
    ]);

    const outstanding = round2(
      offeneBelege.reduce((s, b) => s + (b.total - b.amountPaid), 0),
    );

    const kennzahl = (wert: number, vorwert: number) => ({
      value: wert,
      previous: vorwert,
      changePct: veraenderung(wert, vorwert),
    });

    const ergebnis = round2(jetzt.payments - jetzt.expenses);
    const ergebnisVorher = round2(vorher.payments - vorher.expenses);

    res.json({
      currency: settings.currency,
      locale: settings.locale,
      period: {
        kind,
        year,
        month,
        label: bezeichnung,
        previousLabel: vorBezeichnung,
        from: von.toISOString().slice(0, 10),
        to: new Date(bis.getTime() - 86400000).toISOString().slice(0, 10),
      },
      kpis: {
        invoiced: kennzahl(jetzt.invoiced, vorher.invoiced),
        payments: kennzahl(jetzt.payments, vorher.payments),
        expenses: kennzahl(jetzt.expenses, vorher.expenses),
        result: kennzahl(ergebnis, ergebnisVorher),
      },
      series: punkte,
      outstanding,
      openInvoiceCount: offeneBelege.length,
      overdueInvoiceCount: ueberfaellig,
      openQuoteCount: offeneAngebote,
      dueRecurringInvoices: faelligeRechnungen,
      dueRecurringExpenses: faelligeAusgaben,
      recentInvoices: letzteBelege,
    });
  }),
);
