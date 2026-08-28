import { Router } from 'express';
import { z } from 'zod';
import { getSettings, prisma } from '../db';
import { round2 } from '../services/totals';
import { HttpError, asyncHandler, parseBody } from './helpers';

export const reportRouter = Router();

const querySchema = z
  .object({
    year: z.coerce.number().int().min(1970).max(9999).optional(),
    // Freier Zeitraum als Alternative zum Jahr.
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((q) => q.year !== undefined || (q.from && q.to), {
    message: 'Bitte ein Jahr oder einen Zeitraum (von und bis) angeben',
  });

/**
 * Einnahmen-Ueberschuss-Rechnung nach § 4 Abs. 3 EStG.
 *
 * Massgeblich ist das Zufluss-/Abflussprinzip: es zaehlt, wann Geld geflossen
 * ist, nicht wann die Rechnung geschrieben wurde. Einnahmen kommen deshalb
 * aus den erfassten Zahlungen nach Zahlungsdatum, nicht aus den
 * Rechnungssummen.
 *
 * Bei Kleinunternehmerregelung (§ 19 UStG) faellt keine Umsatzsteuer an;
 * andernfalls sind die Bruttobetraege ausgewiesen und die enthaltene Steuer
 * getrennt genannt.
 */
reportRouter.get(
  '/euer',
  asyncHandler(async (req, res) => {
    const q = parseBody(querySchema, req.query);
    let von: Date;
    let bis: Date;
    let bezeichnung: string;

    if (q.from && q.to) {
      von = new Date(`${q.from}T00:00:00Z`);
      // Der Endtag zaehlt mit, deshalb bis zum Beginn des Folgetags.
      bis = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000);
      if (bis <= von) {
        throw new HttpError(400, 'Das Ende darf nicht vor dem Anfang liegen');
      }
      const fmt = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}.${String(
          d.getUTCMonth() + 1,
        ).padStart(2, '0')}.${d.getUTCFullYear()}`;
      bezeichnung = `${fmt(von)} – ${fmt(new Date(bis.getTime() - 86400000))}`;
    } else {
      von = new Date(Date.UTC(q.year!, 0, 1));
      bis = new Date(Date.UTC(q.year! + 1, 0, 1));
      bezeichnung = String(q.year);
    }
    const settings = await getSettings();

    const [zahlungen, ausgaben] = await Promise.all([
      prisma.payment.findMany({
        where: { date: { gte: von, lt: bis } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        include: {
          invoice: {
            select: {
              id: true,
              number: true,
              docType: true,
              taxRegime: true,
              client: { select: { name: true } },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { date: { gte: von, lt: bis } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const einnahmen = zahlungen.map((z) => ({
      id: z.id,
      date: z.date.toISOString().slice(0, 10),
      belegNummer: z.invoice.number,
      invoiceId: z.invoice.id,
      kunde: z.invoice.client?.name ?? '',
      // Eine Zahlung auf eine Gutschrift ist eine Rueckzahlung und mindert
      // die Einnahmen.
      amount: round2(z.invoice.docType === 'credit' ? -z.amount : z.amount),
      method: z.method,
      reference: z.reference,
    }));

    const ausgabenListe = ausgaben.map((a) => ({
      id: a.id,
      date: a.date.toISOString().slice(0, 10),
      vendor: a.vendor,
      category: a.category || 'Ohne Kategorie',
      description: a.description,
      net: round2(a.amount),
      tax: round2(a.taxAmount),
      gross: round2(a.total),
    }));

    // Summen je Kategorie - das ist die Ansicht, die der Steuerberater will.
    const jeKategorie = new Map<string, { net: number; tax: number; gross: number; count: number }>();
    for (const a of ausgabenListe) {
      const eintrag = jeKategorie.get(a.category) ?? {
        net: 0,
        tax: 0,
        gross: 0,
        count: 0,
      };
      eintrag.net += a.net;
      eintrag.tax += a.tax;
      eintrag.gross += a.gross;
      eintrag.count += 1;
      jeKategorie.set(a.category, eintrag);
    }

    const einnahmenSumme = round2(
      einnahmen.reduce((s, e) => s + e.amount, 0),
    );
    const ausgabenBrutto = round2(
      ausgabenListe.reduce((s, a) => s + a.gross, 0),
    );
    const ausgabenNetto = round2(ausgabenListe.reduce((s, a) => s + a.net, 0));
    const vorsteuer = round2(ausgabenListe.reduce((s, a) => s + a.tax, 0));

    const kleinunternehmer = settings.taxRegime === 'small_business';

    res.json({
      year: q.year ?? null,
      zeitraum: bezeichnung,
      von: von.toISOString().slice(0, 10),
      bis: new Date(bis.getTime() - 86400000).toISOString().slice(0, 10),
      currency: settings.currency,
      taxRegime: settings.taxRegime,
      kleinunternehmer,
      einnahmen,
      ausgaben: ausgabenListe,
      ausgabenJeKategorie: Array.from(jeKategorie.entries())
        .map(([category, w]) => ({ category, ...w, net: round2(w.net), tax: round2(w.tax), gross: round2(w.gross) }))
        .sort((a, b) => b.gross - a.gross),
      summen: {
        einnahmen: einnahmenSumme,
        ausgabenBrutto,
        ausgabenNetto,
        vorsteuer,
        // Bei § 19 gibt es keinen Vorsteuerabzug: dann zaehlt der Bruttobetrag
        // als Betriebsausgabe.
        ueberschuss: round2(
          einnahmenSumme - (kleinunternehmer ? ausgabenBrutto : ausgabenNetto),
        ),
      },
    });
  }),
);

/** Dieselben Zahlen als CSV, zum Weitergeben an die Steuerkanzlei. */
reportRouter.get(
  '/euer.csv',
  asyncHandler(async (req, res) => {
    const q = parseBody(querySchema, req.query);
    let von: Date;
    let bis: Date;
    let bezeichnung: string;

    if (q.from && q.to) {
      von = new Date(`${q.from}T00:00:00Z`);
      // Der Endtag zaehlt mit, deshalb bis zum Beginn des Folgetags.
      bis = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86400000);
      if (bis <= von) {
        throw new HttpError(400, 'Das Ende darf nicht vor dem Anfang liegen');
      }
      const fmt = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}.${String(
          d.getUTCMonth() + 1,
        ).padStart(2, '0')}.${d.getUTCFullYear()}`;
      bezeichnung = `${fmt(von)} – ${fmt(new Date(bis.getTime() - 86400000))}`;
    } else {
      von = new Date(Date.UTC(q.year!, 0, 1));
      bis = new Date(Date.UTC(q.year! + 1, 0, 1));
      bezeichnung = String(q.year);
    }
    const settings = await getSettings();
    const kleinunternehmer = settings.taxRegime === 'small_business';

    const [zahlungen, ausgaben] = await Promise.all([
      prisma.payment.findMany({
        where: { date: { gte: von, lt: bis } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        include: {
          invoice: {
            select: {
              number: true,
              docType: true,
              client: { select: { name: true } },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { date: { gte: von, lt: bis } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const zahl = (n: number) => n.toFixed(2).replace('.', ',');
    const feld = (v: string) =>
      /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const zeilen: string[] = [];
    zeilen.push(`Einnahmen-Überschuss-Rechnung ${bezeichnung}`);
    zeilen.push(
      `Steuerregelung;${kleinunternehmer ? 'Kleinunternehmer (§ 19 UStG)' : settings.taxRegime}`,
    );
    zeilen.push('');
    zeilen.push('EINNAHMEN (Zuflussprinzip)');
    zeilen.push('Datum;Beleg;Kunde;Zahlungsart;Betrag');

    let einnahmenSumme = 0;
    for (const z of zahlungen) {
      const betrag = z.invoice.docType === 'credit' ? -z.amount : z.amount;
      einnahmenSumme += betrag;
      zeilen.push(
        [
          z.date.toISOString().slice(0, 10),
          feld(z.invoice.number),
          feld(z.invoice.client?.name ?? ''),
          z.method,
          zahl(betrag),
        ].join(';'),
      );
    }
    zeilen.push(`;;;Summe Einnahmen;${zahl(round2(einnahmenSumme))}`);
    zeilen.push('');
    zeilen.push('AUSGABEN (Abflussprinzip)');
    zeilen.push('Datum;Händler;Kategorie;Beschreibung;Netto;USt;Brutto');

    let netto = 0;
    let steuer = 0;
    let brutto = 0;
    for (const a of ausgaben) {
      netto += a.amount;
      steuer += a.taxAmount;
      brutto += a.total;
      zeilen.push(
        [
          a.date.toISOString().slice(0, 10),
          feld(a.vendor),
          feld(a.category || 'Ohne Kategorie'),
          feld(a.description),
          zahl(a.amount),
          zahl(a.taxAmount),
          zahl(a.total),
        ].join(';'),
      );
    }
    zeilen.push(
      `;;;Summe Ausgaben;${zahl(round2(netto))};${zahl(round2(steuer))};${zahl(round2(brutto))}`,
    );
    zeilen.push('');
    const betriebsausgaben = kleinunternehmer ? brutto : netto;
    zeilen.push(
      `Überschuss;${zahl(round2(einnahmenSumme - betriebsausgaben))};` +
        `(Einnahmen minus Ausgaben ${kleinunternehmer ? 'brutto' : 'netto'})`,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="euer-${q.year ?? `${q.from}_${q.to}`}.csv"`,
    );
    // BOM, damit Excel die Umlaute richtig liest.
    res.send('﻿' + zeilen.join('\r\n') + '\r\n');
  }),
);

/**
 * Jahre, fuer die eine Auswertung sinnvoll ist: alles, wozu es Belege,
 * Ausgaben oder Zahlungen gibt, dazu das laufende Jahr.
 *
 * Fest zurueckzuzaehlen waere falsch - dann stuenden Jahre ohne Daten in
 * der Liste. Wird eine Rechnung mit Datum 2025 gebucht, erscheint 2025;
 * beim Jahreswechsel kommt das neue Jahr von selbst dazu, auch wenn es
 * noch leer ist.
 */
reportRouter.get(
  '/years',
  asyncHandler(async (_req, res) => {
    const [belege, ausgaben, zahlungen] = await Promise.all([
      prisma.invoice.findMany({ select: { issueDate: true } }),
      prisma.expense.findMany({ select: { date: true } }),
      prisma.payment.findMany({ select: { date: true } }),
    ]);

    const jahre = new Set<number>();
    for (const b of belege) jahre.add(b.issueDate.getUTCFullYear());
    for (const a of ausgaben) jahre.add(a.date.getUTCFullYear());
    for (const z of zahlungen) jahre.add(z.date.getUTCFullYear());

    // Nur das laufende Jahr dazu, nicht das kommende: sonst stuende ein
    // leerer Reiter fuer ein Jahr da, das noch gar nicht begonnen hat.
    // Am 1. Januar erscheint das neue Jahr von selbst.
    jahre.add(new Date().getUTCFullYear());

    res.json([...jahre].sort((a, b) => b - a));
  }),
);
