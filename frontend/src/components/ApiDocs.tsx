import { ReactNode, useState } from 'react';

/**
 * Referenz der HTTP-Schnittstelle, direkt in den Einstellungen.
 *
 * Steht bewusst hier und nicht nur in der README: wer ein Token erzeugt,
 * braucht die Angaben im selben Moment. Die Werte stammen aus den
 * Konstanten des Servers - aendern sie sich dort, gehoert diese Seite
 * nachgezogen.
 */

function Abschnitt({
  titel,
  offenAb,
  children,
}: {
  titel: string;
  offenAb?: boolean;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(!!offenAb);
  return (
    <div className="doc-section">
      <button
        className="doc-toggle"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
      >
        <span className={`doc-caret${offen ? ' open' : ''}`}>›</span>
        {titel}
      </button>
      {offen && <div className="doc-body">{children}</div>}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="doc-code">{children}</pre>;
}

/** Endpunkttabelle. */
function Endpunkte({
  zeilen,
}: {
  zeilen: [string, string, string][];
}) {
  return (
    <div className="doc-table-wrap">
      <table className="data doc-table">
        <thead>
          <tr>
            <th>Methode</th>
            <th>Pfad</th>
            <th>Zweck</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map(([m, pfad, zweck]) => (
            <tr key={m + pfad}>
              <td>
                <span className={`doc-verb doc-verb-${m.toLowerCase()}`}>{m}</span>
              </td>
              <td className="mono nowrap">{pfad}</td>
              <td>{zweck}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiDocs({ origin }: { origin: string }) {
  return (
    <div className="doc-root">
      <div className="section-title">Dokumentation</div>

      <Abschnitt titel="Anmeldung und Grundlagen" offenAb>
        <p>
          Jede Anfrage außer <span className="mono">/api/health</span> und{' '}
          <span className="mono">/api/auth/login</span> braucht eine Anmeldung.
          Für Skripte ist das ein API-Token im Kopfzeilenfeld:
        </p>
        <Code>{`Authorization: Bearer ilt_…`}</Code>
        <p>
          Die Oberfläche selbst nutzt stattdessen ein Sitzungs-Cookie. Ein Token
          darf alles außer der Token-Verwaltung – <span className="mono">/api/tokens</span>{' '}
          beantwortet es mit <span className="mono">403</span>, damit ein
          entwendetes Token sich nicht selbst vermehren kann.
        </p>
        <table className="data doc-table">
          <tbody>
            <tr><td className="mono">200 / 201</td><td>in Ordnung</td></tr>
            <tr><td className="mono">400</td><td>Eingabe ungültig – Feld und Grund stehen in <span className="mono">error</span></td></tr>
            <tr><td className="mono">401</td><td>nicht angemeldet, Token unbekannt oder widerrufen</td></tr>
            <tr><td className="mono">403</td><td>mit Token nicht erlaubt (Token-Verwaltung)</td></tr>
            <tr><td className="mono">404</td><td>Datensatz gibt es nicht</td></tr>
            <tr><td className="mono">429</td><td>zu viele Fehlanmeldungen – 15 Minuten Sperre</td></tr>
          </tbody>
        </table>
        <p className="doc-note">
          Fehler kommen immer als <span className="mono">{'{ "error": "…" }'}</span>{' '}
          zurück. Beträge sind Zahlen mit zwei Nachkommastellen, Daten
          ISO-Format <span className="mono">JJJJ-MM-TT</span>. Anfragekörper sind
          JSON, Dateiuploads <span className="mono">multipart/form-data</span>.
        </p>
      </Abschnitt>

      <Abschnitt titel="Rechnungen und Gutschriften">
        <Endpunkte
          zeilen={[
            ['GET', '/api/invoices', 'Liste; Filter siehe unten'],
            ['POST', '/api/invoices', 'anlegen – Nummer wird vergeben'],
            ['GET', '/api/invoices/{id}', 'einzeln, mit Positionen und Zahlungen'],
            ['PUT', '/api/invoices/{id}', 'ändern'],
            ['DELETE', '/api/invoices/{id}', 'löschen'],
            ['POST', '/api/invoices/{id}/status', 'Status setzen'],
            ['POST', '/api/invoices/{id}/duplicate', 'als neuen Entwurf kopieren'],
            ['POST', '/api/invoices/{id}/credit', 'Gutschrift dazu erzeugen'],
            ['GET', '/api/invoices/{id}/pdf', 'PDF; mit ?einvoice=1 als ZUGFeRD'],
            ['GET', '/api/invoices/{id}/xrechnung', 'XRechnung-XML'],
            ['GET', '/api/invoices/export.csv', 'CSV-Ausgabe'],
          ]}
        />
        <p className="doc-sub">Filter für die Liste</p>
        <Code>{`?status=approved      draft | approved | sent | partial |
                      paid | overdue | cancelled | reversed
?docType=invoice      invoice | credit
?clientId=3           nur ein Kunde
?from=2026-01-01      ab Rechnungsdatum
?to=2026-12-31        bis Rechnungsdatum
?search=RE-0004       Nummer oder Kundenname`}</Code>
        <p className="doc-sub">Anlegen</p>
        <Code>{`curl -X POST ${origin}/api/invoices \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "clientId": 1,
    "issueDate": "2026-08-01",
    "serviceDateFrom": "2026-07-01",
    "serviceDateTo": "2026-07-31",
    "taxRegime": "small_business",
    "status": "approved",
    "lines": [
      { "description": "IT-Betreuung", "quantity": 8,
        "unit": "Std.", "unitPrice": 85, "taxRate": 0 }
    ]
  }'`}</Code>
        <p className="doc-note">
          Weggelassene Felder greifen auf die Einstellungen zurück:{' '}
          <span className="mono">issueDate</span> auf heute,{' '}
          <span className="mono">dueDate</span> auf das Zahlungsziel,{' '}
          <span className="mono">taxRegime</span> auf die dort gewählte Regelung.
          Summen und Steuer rechnet der Server – mitgeschickte Beträge werden
          nicht übernommen. Gutschriften entstehen ausschließlich über{' '}
          <span className="mono">/credit</span> und tragen einen eigenen
          Nummernkreis.
        </p>
      </Abschnitt>

      <Abschnitt titel="Rechnungsversand automatisieren" offenAb>
        <p>
          invoicelite verschickt Rechnungen selbst per SMTP – siehe
          Einstellungen. Wer den Versand stattdessen in einen eigenen Ablauf
          einhängen will, findet in der Freigabe den Anschluss: sie trennt
          „fertig geschrieben“ von „darf raus“.
        </p>
        <Code>{`# 1. Freigegebene Rechnungen holen (client.email ist enthalten)
curl -H "Authorization: Bearer $TOKEN" \\
  "${origin}/api/invoices?status=approved"

# 2. PDF je Beleg ziehen
curl -H "Authorization: Bearer $TOKEN" \\
  -o rechnung.pdf ${origin}/api/invoices/42/pdf

# 3. Nach dem Versand zurückmelden
curl -X POST -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"sent"}' \\
  ${origin}/api/invoices/42/status`}</Code>
        <p className="doc-warn">
          Schritt 3 ist nicht optional: ohne ihn liefert Schritt 1 denselben
          Beleg beim nächsten Lauf erneut, und der Kunde bekommt die Rechnung
          zweimal.
        </p>
        <p className="doc-note">
          Der Statuswechsel auf <span className="mono">sent</span> setzt zugleich
          das Versanddatum, ab dem das Zahlungsziel läuft. Erfasste Zahlungen
          schalten danach selbsttätig auf{' '}
          <span className="mono">partial</span> bzw. <span className="mono">paid</span>;
          nach Fristablauf auf <span className="mono">overdue</span>. Diese drei
          von Hand zu setzen ist möglich, wird aber beim nächsten
          Zahlungsvorgang überschrieben.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wiederkehrende Rechnungen">
        <Endpunkte
          zeilen={[
            ['GET', '/api/recurring-invoices', 'Vorlagen; ?status=active'],
            ['POST', '/api/recurring-invoices', 'Vorlage anlegen'],
            ['GET', '/api/recurring-invoices/{id}', 'einzeln, mit erzeugten Belegen'],
            ['PUT', '/api/recurring-invoices/{id}', 'ändern'],
            ['DELETE', '/api/recurring-invoices/{id}', 'löschen; erzeugte Belege bleiben'],
            ['POST', '/api/recurring-invoices/run', 'fälligen Lauf sofort auslösen'],
          ]}
        />
        <Code>{`{
  "clientId": 1,
  "title": "Wartungspauschale monatlich",
  "frequency": "monthly",        // weekly | monthly | quarterly | yearly
  "nextRunDate": "2026-09-01",
  "generateAs": "approved",      // draft | approved
  "remainingCycles": null,       // null = unbegrenzt
  "endDate": null,
  "lines": [ … ]
}`}</Code>
        <p className="doc-note">
          Der Server läuft täglich um 02:30 (einstellbar über{' '}
          <span className="mono">RECURRING_CRON</span>) und erzeugt alles, was
          fällig ist. Stand der Dienst zu dieser Zeit still, holt der nächste
          Lauf es nach – die Fälligkeit richtet sich nach dem Datum, nicht nach
          der Uhrzeit. <span className="mono">generateAs</span> entscheidet, ob
          die Rechnung als Entwurf wartet oder direkt freigegeben wird und damit
          vom Versand-Workflow abgeholt werden kann.{' '}
          <span className="mono">/run</span> stößt denselben Lauf von Hand an –
          er erzeugt nur Fälliges und lässt sich gefahrlos wiederholen.
        </p>
      </Abschnitt>

      <Abschnitt titel="Angebote">
        <Endpunkte
          zeilen={[
            ['GET', '/api/quotes', 'Liste; ?status= ?clientId='],
            ['POST', '/api/quotes', 'anlegen'],
            ['GET', '/api/quotes/{id}', 'einzeln'],
            ['PUT', '/api/quotes/{id}', 'ändern'],
            ['DELETE', '/api/quotes/{id}', 'löschen'],
            ['POST', '/api/quotes/{id}/status', 'Status setzen'],
            ['POST', '/api/quotes/{id}/convert', 'in eine Rechnung umwandeln'],
            ['GET', '/api/quotes/{id}/pdf', 'PDF'],
          ]}
        />
        <p className="doc-note">
          Status: <span className="mono">draft, sent, approved, declined,
          converted, expired</span>. Nach Ablauf von{' '}
          <span className="mono">validUntil</span> setzt der Server{' '}
          <span className="mono">expired</span> selbst. Umwandeln geht genau
          einmal; der zweite Versuch endet mit <span className="mono">400</span>.
        </p>
      </Abschnitt>

      <Abschnitt titel="Zahlungen">
        <Endpunkte
          zeilen={[
            ['GET', '/api/payments', 'Liste; ?invoiceId='],
            ['POST', '/api/payments', 'Zahlung erfassen'],
            ['DELETE', '/api/payments/{id}', 'zurücknehmen'],
          ]}
        />
        <Code>{`{ "invoiceId": 42, "amount": 920.00,
  "date": "2026-08-19",
  "method": "bank_transfer",   // cash | card | paypal |
                               // direct_debit | other
  "reference": "Überweisung Sparkasse" }`}</Code>
        <p className="doc-note">
          Die Antwort enthält die Rechnung mit neu berechnetem Status. Eine
          Zahlung zu löschen setzt ihn zurück – bei einer bereits versendeten
          Rechnung auf <span className="mono">sent</span>, das Versanddatum
          bleibt erhalten.
        </p>
      </Abschnitt>

      <Abschnitt titel="Kunden, Produkte, Ausgaben">
        <Endpunkte
          zeilen={[
            ['GET', '/api/clients', 'Liste; ?search= ?archived=true'],
            ['POST', '/api/clients', 'anlegen – nur name ist Pflicht'],
            ['PUT', '/api/clients/{id}', 'ändern'],
            ['DELETE', '/api/clients/{id}', 'löschen, sonst archivieren'],
            ['GET', '/api/products', 'Liste; ?search= ?archived=true'],
            ['POST', '/api/products', 'anlegen'],
            ['GET', '/api/expenses', 'Liste; ?status= ?category= ?search='],
            ['POST', '/api/expenses', 'anlegen'],
            ['POST', '/api/expenses/{id}/attachment', 'Beleg anhängen (max. 10 MB)'],
            ['GET', '/api/expenses/categories', 'vergebene Kategorien'],
            ['GET', '/api/recurring-expenses', 'wiederkehrende Ausgaben'],
          ]}
        />
        <p className="doc-note">
          Hängen an einem Kunden noch Belege, wird er beim Löschen archiviert
          statt entfernt – die Antwort sagt mit{' '}
          <span className="mono">{'{ "archived": true }'}</span> bzw.{' '}
          <span className="mono">{'{ "deleted": true }'}</span>, was geschehen
          ist. Bei Ausgaben ist <span className="mono">amount</span> der
          Nettobetrag; Steuer und Bruttosumme rechnet der Server aus{' '}
          <span className="mono">taxRate</span>.
        </p>
      </Abschnitt>

      <Abschnitt titel="Übersicht und Einstellungen">
        <Endpunkte
          zeilen={[
            ['GET', '/api/dashboard', 'Kennzahlen; ?period= ?year= ?month='],
            ['GET', '/api/settings', 'Firmendaten und Vorgaben'],
            ['PUT', '/api/settings', 'ändern – vollständiges Objekt senden'],
            ['GET', '/api/health', 'Erreichbarkeit, ohne Anmeldung'],
          ]}
        />
        <Code>{`# Jahreswerte
curl -H "Authorization: Bearer $TOKEN" \\
  "${origin}/api/dashboard?period=year&year=2026"

# Ein einzelner Monat
curl -H "Authorization: Bearer $TOKEN" \\
  "${origin}/api/dashboard?period=month&year=2026&month=8"`}</Code>
        <p className="doc-note">
          Geliefert werden vier Kennzahlen mit dem Vorzeitraum verglichen
          (<span className="mono">kpis</span>), der Verlauf für das Diagramm
          (<span className="mono">series</span> – im Monat je Tag, im Jahr je
          Monat) sowie offene Forderungen und Angebote. Letztere sind
          zeitraumunabhängig: sie beschreiben den Stand jetzt.
        </p>
        <p className="doc-warn">
          <span className="mono">PUT /api/settings</span> ersetzt den ganzen
          Datensatz. Erst <span className="mono">GET</span>, dann die
          gewünschten Felder ändern und alles zurückschicken – sonst fallen
          weggelassene Felder auf ihren Standard zurück.
        </p>
      </Abschnitt>
    </div>
  );
}
