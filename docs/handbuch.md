# Handbuch

Ausführliche Beschreibung aller Bereiche. Für den Einstieg genügt die
[README](../README.md); hier stehen die Einzelheiten.

## Funktionsumfang

| Bereich | Inhalt |
| --- | --- |
| **Übersicht** | Offene Forderungen, Zahlungseingänge und Ausgaben des Jahres, fällige Vorlagen |
| **Kunden** | Anschrift, Ansprechpartner, USt-IdNr.; Kunden mit Belegen werden archiviert statt gelöscht |
| **Produkte** | Preis, Einheit, Steuersatz – als Vorlage für Belegpositionen |
| **Angebote** | Positionen, Gültigkeitsdatum, PDF, Umwandlung in eine Rechnung per Klick |
| **Rechnungen** | Positionen, Rabatt, Steuergruppen, Leistungsdatum, Status, PDF mit **EPC-QR-Code**, Duplizieren, CSV-Export |
| **Gutschriften** | Eigener Nummernkreis, per Klick aus einer Rechnung erzeugt (UBL-Belegart 381) |
| **Wiederkehrende Rechnungen** | Rhythmus, nächster Lauf, Enddatum/Durchläufe – erzeugt Rechnungen automatisch |
| **Zahlungen** | Zahlungseingänge gegen Rechnungen; Status (Teilzahlung/bezahlt) wird automatisch gesetzt |
| **Ausgaben** | Netto/USt./Brutto, Kategorie, Beleg-Upload |
| **Wiederkehrende Ausgaben** | Vorlagen für regelmäßige Kosten (Miete, Abos) |
| **Einstellungen** | Firmendaten, Logo, Bankverbindung, Nummernkreise, Standardtexte, E-Rechnung, API-Tokens |

## EPC-QR-Code (Girocode)

Jede Rechnung erhält im PDF einen QR-Code nach **EPC069-12**, den gängige Banking-Apps
scannen, um die Überweisung vorauszufüllen. Er wird gedruckt, sobald in den Einstellungen
eine IBAN hinterlegt ist und ein offener Betrag besteht. Der QR-Code enthält immer den
**noch offenen** Betrag. Der Standard unterstützt ausschließlich EUR.

## Belegstatus

Der Weg bis zum Versand ist dreistufig und bewusst schlank gehalten:

| Status | Bedeutung |
| --- | --- |
| **Entwurf** | In Arbeit, wird von keinem Workflow angefasst |
| **Freigegeben** | Geprüft und zum Versand freigegeben – hier holt ein Workflow ab |
| **Versendet** | Beim Kunden; ab jetzt läuft das Zahlungsziel |

Danach setzt die Anwendung selbst: **Teilzahlung** und **Bezahlt** anhand der erfassten
Zahlungen, **Überfällig** nach Ablauf des Zahlungsziels. **Storniert** und
**Storniert (nach Zahlung)** sind Endzustände und werden nicht mehr automatisch
überschrieben. Das Versanddatum wird beim ersten Wechsel auf *Versendet* festgehalten.
Gutschriften werden nie überfällig.

## Versand über einen eigenen Workflow

**Für den Regelfall braucht es das nicht** – invoicelite verschickt Rechnungen selbst per
SMTP, am Tag nach der Freigabe oder sofort per Knopf. Siehe [Mailversand](#mailversand).

Wer den Versand stattdessen in einen eigenen Ablauf einhängen will – ein Skript, ein
Dokumentenarchiv, eine Automatisierung –, findet in der Freigabe den passenden
Anschluss: sie trennt „fertig geschrieben" von „darf raus".

1. **Abholen** – `GET /api/invoices?status=approved`
   Die Antwort enthält je Beleg auch `client.email`, ein zweiter Aufruf entfällt.
2. **PDF ziehen** – `GET /api/invoices/{id}/pdf`, mit `?einvoice=1` das ZUGFeRD-Hybrid-PDF.
3. **Versenden** – über den eigenen Weg.
4. **Zurückmelden** – `POST /api/invoices/{id}/status` mit `{"status":"sent"}`.

Ohne Schritt 4 liefert Schritt 1 denselben Beleg beim nächsten Lauf erneut.

```bash
TOKEN=ilt_…
BASE=http://localhost:8080

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/invoices?status=approved" \
| python3 -c 'import json,sys; [print(i["id"], i["number"], i["client"]["email"]) for i in json.load(sys.stdin)]' \
| while read id number email; do
    curl -s -H "Authorization: Bearer $TOKEN" -o "$number.pdf" "$BASE/api/invoices/$id/pdf"
    # … hier den eigenen Versand einhängen …
    curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -X POST "$BASE/api/invoices/$id/status" -d '{"status":"sent"}' >/dev/null
  done
```

> Wenn der eingebaute Versand eingeschaltet ist, greift er auf dieselben Belege zu. Beides
> parallel zu betreiben verschickt Rechnungen doppelt – entweder das eine oder das andere.

Wiederkehrende Rechnungen passen dazu: je Vorlage ist wählbar, ob erzeugte Rechnungen als
**Entwurf** landen (erst prüfen) oder **direkt freigegeben** werden.

## Übersicht

Die Startseite zeigt Kennzahlen für einen **Monat** oder ein **Jahr**, jeweils mit dem
davorliegenden Zeitraum verglichen:

| Kennzahl | Woraus |
| --- | --- |
| **Berechnet** | Summe der gestellten Rechnungen nach Rechnungsdatum, abzüglich Gutschriften |
| **Zahlungseingänge** | tatsächlich erfasste Zahlungen nach Zahlungsdatum |
| **Ausgaben** | Bruttobeträge der Ausgaben nach Ausgabendatum |
| **Überschuss** | Zahlungseingänge minus Ausgaben |

Neben *Monat* und *Jahr* gibt es **Zeitraum** für eine freie Auswahl. Verglichen wird dann
mit dem gleich langen Abschnitt davor – bei einer Auswahl von zwölf Tagen also mit den zwölf
Tagen davor, nicht mit einem Monat.

Darunter der Verlauf als Säulendiagramm – im Monat je ein Punkt pro Tag, im Jahr je ein
Punkt pro Monat. Ein freier Zeitraum wird bis zu zwei Monaten nach Tagen eingeteilt, darüber
nach Monaten; sonst stünden bei einem Jahr 365 Säulen nebeneinander. Über *Tabelle* lassen
sich dieselben Werte als Zahlen lesen.

Dieselbe freie Auswahl gibt es in den **Berichten**: neben den Jahren steht dort ebenfalls
*Zeitraum*, samt passendem CSV-Export.

Offene Forderungen und offene Angebote sind bewusst **zeitraumunabhängig**: sie beschreiben
den Stand jetzt, nicht den des gewählten Monats.

Abrufbar auch über die API:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8080/api/dashboard?period=year&year=2026'
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8080/api/dashboard?period=month&year=2026&month=8'
```

## Jahreswechsel

Es ist nichts umzustellen. Die Auswertungen richten sich nach dem Datum der Belege, nicht
nach einem hinterlegten Jahr:

- Die **Jahresliste** in den Berichten kommt vom Server und enthält genau die Jahre, zu
  denen es Belege, Ausgaben oder Zahlungen gibt, dazu das laufende Jahr. Wird eine Rechnung
  mit Datum 2025 gebucht, erscheint 2025; am 1. Januar kommt das neue Jahr von selbst dazu,
  auch wenn es noch leer ist. Ein Jahr, das noch nicht begonnen hat, steht nicht in der Liste.
- **Übersicht und EÜR** nehmen jedes Jahr zwischen 1970 und 9999 entgegen.
- **Wiederkehrende Belege** laufen über den Jahreswechsel weiter (31.12. → 31.01.).

Der **Nummernkreis läuft durch**: auf RE-0148 im Dezember folgt RE-0149 im Januar. Das ist
zulässig – die GoBD verlangt Eindeutigkeit und Lückenlosigkeit, keinen Jahresbezug. Wer
`RE-2027-0001` möchte, stellt Präfix und Zähler zum Jahreswechsel von Hand um; ein
automatischer Jahresbezug ist nicht eingebaut.

Bei einer **monatlichen Vorlage auf dem 29., 30. oder 31.** wandert der Termin auf den
letzten Tag des kürzesten Monats und bleibt dort: 31.01. → 28.02. → 28.03. Wer den Monatsletzten
braucht, setzt das Datum nach dem Februar einmal neu.

## Einrichtung beim ersten Start

Nach der ersten Anmeldung führt ein Assistent in fünf Schritten durch die Angaben, die ohne
Antwort später Ärger machen:

1. **Ihre Firma** – Anschrift, E-Mail, Telefon
2. **Steuer** – Kleinunternehmer nach § 19, Regelbesteuerung oder § 13b; USt-IdNr. oder Steuernummer
3. **Bankverbindung** – IBAN und BIC für Zahlungsangaben und QR-Code
4. **Belege** – Präfix und erste Rechnungsnummer, Zahlungsziel
5. **Zugang** – E-Mail und eigenes Passwort

Gefragt wird nur, was sich nicht sinnvoll vorbelegen lässt. Die **Telefonnummer** ist dabei,
weil sie für E-Rechnungen Pflicht ist (BR-DE-6) – ohne sie weist der Empfänger den Beleg ab.
Bei *Belege* zeigt eine Vorschau, wie die erste Rechnungsnummer aussehen wird; wer eine
bestehende Nummerierung fortführt, knüpft hier an.

*Später einrichten* überspringt alles; alle Angaben stehen ebenso in den Einstellungen. Bei
einer bestehenden Installation erscheint der Assistent **nicht** – die Migration erkennt sie
am gepflegten Firmennamen.

## Artikelnummern

Produkte ohne eigene Artikelnummer bekommen eine fortlaufende – wie die Belege. Präfix,
nächste Nummer und Stellenzahl stehen unter *Einstellungen → Belege & Nummern*
(Vorgabe `ART-0001`). Eine selbst eingetragene Nummer bleibt unverändert; ein Feld, das nur
Leerzeichen enthält, gilt als leer.

## Wechsel der Besteuerung

Die Regelung wird **je Beleg festgehalten**, nicht bei jedem Aufruf aus den Einstellungen
gelesen. Wer von der Kleinunternehmerregelung zur Regelbesteuerung wechselt, ändert damit
nur, was danach entsteht:

| | |
| --- | --- |
| Bestehende Rechnungen und Angebote | bleiben unverändert, § 19-Hinweis bleibt stehen |
| Neu angelegte Belege | mit Umsatzsteuer, ohne § 19-Hinweis |
| Angebot in Rechnung umwandeln | die Rechnung nimmt die **aktuelle** Regelung |

Der letzte Punkt ist Absicht: die Rechnung muss anwenden, was zum Leistungszeitpunkt gilt.
Ein altes Angebot über 1.000 € brutto wird nach dem Wechsel zu 1.000 € netto plus
Umsatzsteuer – der Bruttobetrag steigt.

Im Angebot lässt sich die Regelung wie in der Rechnung einzeln setzen.

## Akzentfarbe der Oberfläche

*Einstellungen → Firmendaten → Akzentfarbe der Oberfläche* färbt Schaltflächen, Verweise und
Hervorhebungen. Sie ist getrennt von der Farbe der PDF-Fußzeile, weil deren Balkenton als
Schaltflächenfarbe unbrauchbar wäre.

Aus der einen Farbe werden Helligkeit, Hover-Ton und Schriftfarbe **je Farbschema**
abgeleitet: auf dunklem Grund heller, auf hellem dunkler, damit der Kontrast trägt. Die
Farben der Diagramme bleiben unberührt – sie sind auf Farbfehlsichtigkeit geprüft.

## Angebot vs. Rechnung

Ein Angebot verlangt noch keine Zahlung. Deshalb sind die Vorgabetexte getrennt:
*Einstellungen → Belege & Nummern* führt **Standardtexte für Rechnungen** und
**Standardtexte für Angebote** einzeln.

Auf dem Angebot erscheinen daher nicht: Zahlungsziel, Aufforderung zur Überweisung,
Kontoverbindung im Belegkörper und EPC-QR-Code.

Der Hinweis zur Umsatzsteuer steht **wortgleich** auf Rechnung, Gutschrift und Angebot
(„Gemäß § 19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer."). Auf einem Angebot gibt es
streng genommen noch keinen Rechnungsbetrag; die einheitliche Formulierung ist bewusst so
gewählt, damit der Kunde denselben Satz später auf der Rechnung wiederfindet.

Beim **Umwandeln in eine Rechnung** greifen wieder die Rechnungstexte, samt Zahlungsziel und
Kontoverbindung.

## E-Rechnung: geprüft

XRechnung und ZUGFeRD sind gegen den **offiziellen KoSIT-Validator** (1.5.0) mit der
Prüfregel-Konfiguration XRechnung 3.0.2 getestet – nicht nur auf Wohlgeformtheit:

```
|/w/facturx.xml    | Y | Y | ACCEPTABLE |   (ZUGFeRD, CII)
|/w/fest.xml       | Y | Y | ACCEPTABLE |   (fester Rabatt)
|/w/gutschrift.xml | Y | Y | ACCEPTABLE |   (CreditNote 381)
|/w/klein.xml      | Y | Y | ACCEPTABLE |   (§ 19)
|/w/regel.xml      | Y | Y | ACCEPTABLE |   (gemischte Sätze, Rabatt)
|/w/reverse.xml    | Y | Y | ACCEPTABLE |   (§ 13b)
Acceptable: 6  Rejected: 0
```

Die **Telefonnummer** in den Firmendaten ist für E-Rechnungen Pflicht (BR-DE-6, mindestens
drei Ziffern nach BR-DE-27). Fehlt sie, meldet invoicelite das beim Erzeugen, statt eine
Datei auszuliefern, die der Empfänger abweist.

## Seitengröße der PDFs

Die Belege sind **209,5 × 296 mm** statt exakt A4 – das ist Absicht.

Chromium rechnet die Seite in ganzen CSS-Pixeln und zeichnet nur so weit, schreibt die
Seitengröße aber mit dem krummen Rest. Bei A4 stehen 794,56 px Seite gegen 794 px
Zeichenfläche: rechts blieben 0,169 mm und unten 0,127 mm unbemalt – eine feine weiße
Linie neben dem Fußzeilenbalken, die in jedem Betrachter als Pixelkante sichtbar wird.

209,5 × 296 mm ergeben glatte 792 × 1120 Pixel, damit deckt der Balken die Seite
vollständig. Die Schrittweite beträgt 32 Pixel, die nächsten glatten Größen liegen 8 mm
daneben – näher an A4 kommt man nicht. Der Unterschied von 0,45 mm Breite und 0,67 mm Höhe
(0,2 %) fällt beim Drucken nicht auf; Drucker skalieren oder zentrieren ohnehin.

Wer exaktes A4 braucht, setzt in `backend/src/services/pdf.ts` wieder `210mm × 297mm` –
dann kehrt die Haarlinie zurück.

## Mailversand

*Einstellungen → Mailversand*. Freigegebene Rechnungen gehen **am Tag nach der Freigabe**
zur eingestellten Uhrzeit über das hinterlegte Postfach hinaus. Die Nacht dazwischen ist
Absicht: sie lässt Zeit, einen Irrtum zu bemerken, bevor er beim Kunden liegt.

| Einstellung | Bedeutung |
| --- | --- |
| Server / Port / Verschlüsselung | 587 mit STARTTLS oder 465 durchgehend verschlüsselt |
| Benutzername / Passwort | optional – manche Postfächer im eigenen Netz nehmen ohne Anmeldung an |
| Absender, Antwort an, Blindkopie | Blindkopie z.B. ins eigene Postfach |
| Uhrzeit | HH:MM; der Zeitplan wird nach dem Speichern sofort neu gesetzt |
| Anhang | PDF, ZUGFeRD-PDF oder XRechnung-XML |
| Betreff, HTML und Text | Platzhalter `{nummer} {kunde} {firma} {betrag} {datum} {faellig}` |

Ist unter *HTML* etwas hinterlegt, geht die Mail zweiteilig hinaus: HTML für die üblichen
Programme, Text als Rückfallebene. Fehlt die Textfassung, wird sie aus dem HTML abgeleitet –
eine Mail nur mit HTML landet eher im Spam.

**Bilder in der Signatur** dürfen als `data:`-URI eingefügt werden (so liefern es die
gängigen Signatur-Editoren). Beim Versand werden sie automatisch in einen eingebetteten
Anhang mit `cid:`-Verweis umgewandelt. Das ist nötig, weil Gmail `data:`-Bilder entfernt und
Outlook sie nicht darstellt – als `cid:` erscheinen sie überall.

Das SMTP-Passwort wird **verschlüsselt** abgelegt (AES-256-GCM, Schlüssel aus dem
Sitzungsgeheimnis, das außerhalb der Datenbank liegt). Es verlässt den Server nie – die
Oberfläche erfährt nur, *ob* eines hinterlegt ist. Ein leeres Passwortfeld heißt
„unverändert lassen“, nicht „löschen“.

Vor dem ersten Einsatz: speichern, dann *Verbindung prüfen* und eine *Testmail* an sich
selbst schicken.

Schlägt ein Versand fehl, bleibt der Beleg **freigegeben**, der Fehler steht am Beleg und
der nächste Lauf versucht es erneut. Über *Jetzt per Mail senden* geht ein freigegebener
Beleg auch sofort raus.

**Angebote** lassen sich ebenfalls verschicken – im Angebot über *Per Mail senden*. Betreff
und Text sind getrennt von der Rechnung einstellbar; Platzhalter dort: `{nummer} {kunde}
{firma} {betrag} {datum} {gueltigbis}`. Der Status des Angebots bleibt unberührt, weil ein
Angebot oft mehrfach hinausgeht.

## Kopie im Ordner „Gesendet"

SMTP stellt nur zu – eine Kopie im eigenen Postfach entsteht dabei **nicht**. Wer die Rechnung
später im Mailprogramm unter „Gesendet" sucht, findet sonst nichts. Unter *Einstellungen →
Mailversand → Kopie im Ordner „Gesendet"* lässt sich das einschalten: invoicelite legt jede
verschickte Nachricht zusätzlich per IMAP ab.

Der Ordner wird automatisch bestimmt – zuerst über den Sonderordner `\Sent` (RFC 6154), sonst
über gängige Namen (`Sent`, `Gesendet`, `Sent Items`, …). Findet sich keiner, nennt die
Fehlermeldung die vorhandenen Ordner, und der Name lässt sich von Hand eintragen.
Benutzername und Passwort dürfen leer bleiben – dann gelten die des Postausgangs, was bei
einem Postfach der Normalfall ist.

Wichtig: Ein Fehlschlag beim Ablegen macht den Versand **nicht** rückgängig. Die Mail ist beim
Kunden, nur die Kopie fehlt; das steht dann im Protokoll.

Bibliotheken: [nodemailer](https://github.com/nodemailer/nodemailer) (MIT-0, ohne eigene
Abhängigkeiten) für den Versand und [imapflow](https://github.com/postalsys/imapflow) (MIT,
gleiche Herausgeber) für die Ablage.

## Festschreibung (GoBD)

Ab dem Status **Freigegeben** gilt ein Beleg als in Verkehr gebracht:

- Positionen, Beträge, Kunde und Daten lassen sich nicht mehr ändern – nur noch Notizen,
  Zahlungsbedingungen und Fußzeile.
- Löschen ist nicht mehr möglich (HTTP 409). Zurückziehen geht über den Status
  *Storniert*, eine inhaltliche Korrektur über eine **Gutschrift**.
- Entwürfe bleiben frei änder- und löschbar. Wird der zuletzt vergebene Entwurf gelöscht,
  nimmt der Zähler die Nummer zurück – so bleibt der Nummernkreis lückenlos.

## Sicherung

*Einstellungen → Konto → Sicherung herunterladen* liefert ein ZIP mit der Datenbank und den
hochgeladenen Dateien. Der Datenbankabzug entsteht per `VACUUM INTO` und ist auch dann in
sich stimmig, wenn parallel gearbeitet wird. Das Sitzungsgeheimnis ist **nicht** enthalten –
eine abhanden gekommene Sicherung soll keine gültigen Anmeldungen erzeugen können.

Zurückspielen: Container stoppen, `invoicelite.db` und `uploads/` ins Volume `/data` legen,
Container starten. Alle Browser melden sich danach einmalig neu an.

Der Download braucht eine Browser-Anmeldung; ein API-Token wird mit 403 abgewiesen.

## Einen Datenstand einspielen

Wer eine Sicherung in ein leeres Volume entpackt, muss danach die Rechte richten – sonst
gehört das Verzeichnis `root`, während die Anwendung als `node` läuft:

```bash
docker volume create invoicelite-data
docker run --rm -v invoicelite-data:/data -v "$PWD":/z alpine \
  tar xzf /z/sicherung.tar.gz -C /data
docker run --rm -v invoicelite-data:/data alpine chown -R 1000:1000 /data
docker compose up -d
```

Ohne den `chown` kann SQLite seine Journaldateien nicht anlegen: Anmelden und Lesen
funktionieren, das Anlegen eines Belegs scheitert. Der Container erkennt das beim Start und
bricht mit einem Hinweis ab, statt es später auffallen zu lassen.

## Einnahmen-Überschuss-Rechnung

*Berichte* zeigt für ein Jahr alle Einnahmen und Ausgaben einzeln aufgelistet, dazu Summen
je Ausgabenkategorie und den Überschuss. Maßgeblich ist das **Zufluss- und Abflussprinzip**
nach § 4 Abs. 3 EStG: gezählt wird, wann das Geld geflossen ist – offene Rechnungen tauchen
nicht auf. Bei Kleinunternehmerregelung zählen Ausgaben brutto, sonst netto mit getrennt
ausgewiesener Vorsteuer.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8080/api/reports/euer?year=2026'
curl -H "Authorization: Bearer $TOKEN" \
  -o euer-2026.csv 'http://localhost:8080/api/reports/euer.csv?year=2026'
```

## Wiederkehrender Lauf

Der Server erzeugt fällige wiederkehrende Belege täglich um 02:30. Der Zeitplan lässt sich
über `RECURRING_CRON` als Cron-Ausdruck setzen; ein ungültiger Ausdruck lässt den Start
scheitern, statt still ohne Scheduler zu laufen. Jeder Lauf wird protokolliert – auch der
Leerlauf, damit sich „nichts fällig“ von „lief nicht“ unterscheiden lässt.

Stand der Dienst zur geplanten Zeit still, holt der nächste Lauf das Fällige nach: maßgeblich
ist das Datum, nicht die Uhrzeit.

## API-Test

`scripts/api-test.py` fährt alle Endpunkte durch – Rechenwege, Statuswege, Fehlerfälle,
Berechtigungen. **Nur gegen eine Wegwerf-Instanz laufen lassen**, das Skript legt Daten an,
ändert Passwort und E-Mail und löscht wieder:

```bash
docker run -d --name il-test -p 8099:3000 -v il-test:/data \
  -e ADMIN_EMAIL=test@example.com -e ADMIN_PASSWORD=test-passwort-123 invoicelite
python3 scripts/api-test.py http://localhost:8099
docker rm -f il-test && docker volume rm il-test
```

## Demodaten

Zum Ausprobieren – legt eine Demofirma mit Angebot, freigegebener Rechnung und einer
wiederkehrenden Vorlage an:

```bash
EMAIL=… PASSWORD=… ./scripts/demo-data.sh
./scripts/demo-data.sh --remove      # wieder entfernen
```

## Steuerregelungen

Pro Beleg wählbar (Vorbelegung in den Einstellungen):

| Regelung | Wirkung |
| --- | --- |
| Regelbesteuerung | Steuersätze je Position, EN16931-Kategorie `S` bzw. `Z` |
| Kleinunternehmer (§ 19 UStG) | Kein USt-Ausweis, Kategorie `E` mit Befreiungsgrund, Pflichthinweis auf dem Beleg |
| Reverse Charge (§ 13b UStG) | Kein USt-Ausweis, Kategorie `AE` mit Befreiungsgrund, Pflichthinweis auf dem Beleg |

Bei den beiden letzten Regelungen werden die Steuersätze der Positionen bewusst ignoriert —
maßgeblich ist die Regelung des Belegs.

## Leistungsdatum

Das Leistungsdatum bzw. der Leistungszeitraum ist nach § 14 Abs. 4 UStG Pflichtangabe. Es
steht in den Belegkopfdaten des PDFs und wandert als `cac:InvoicePeriod` (BG-14) in die
E-Rechnung. Fehlt es, weist der Editor darauf hin.

## E-Rechnung (EN16931)

Auf Basis von [`@e-invoice-eu/core`](https://github.com/gflohr/e-invoice-eu) stehen zwei
Formate bereit, jeweils direkt auf der Rechnung als Download:

- **ZUGFeRD / Factur-X** – das gewohnte Sicht-PDF mit eingebetteter EN16931-XML (eine Datei,
  für Menschen und Maschinen lesbar). Profil `EN16931` (Comfort).
- **XRechnung** – reine UBL-XML für öffentliche Auftraggeber (B2G). Die Leitweg-ID wird in
  den Einstellungen unter *E-Rechnung* gepflegt.

Vor der Erzeugung wird geprüft, ob Firmenanschrift, USt-IdNr./Steuernummer und
Kundenanschrift vollständig sind; fehlt etwas, nennt die Fehlermeldung konkret die Lücke.
Negative Gesamtbeträge sind nicht zulässig – Gutschriften gehören als eigener Beleg erfasst.

## Betrieb ohne Compose

Wer kein Compose nutzen will, startet den Container von Hand:

```bash
docker build -t invoicelite .
docker run -d --name invoicelite --restart unless-stopped \
  -p 8080:3000 -v invoicelite-data:/data \
  -e ADMIN_EMAIL=ich@example.com -e TZ=Europe/Berlin \
  invoicelite
```

Ohne `ADMIN_PASSWORD` erzeugt die Anwendung beim ersten Start ein Zufallspasswort und
schreibt es einmalig ins Log (`docker logs invoicelite`). Das Administratorkonto entsteht
**nur beim allerersten Start**; danach ändert man Zugangsdaten unter *Einstellungen → Konto*.

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `3000` | Port im Container |
| `DATA_DIR` | `/data` | SQLite-Datei, Uploads und JWT-Secret |
| `ADMIN_EMAIL` | `admin@example.com` | Konto beim ersten Start |
| `ADMIN_PASSWORD` | *(zufällig)* | Passwort beim ersten Start |
| `JWT_SECRET` | *(erzeugt)* | Signiert Sitzungs-Cookies; ohne Angabe unter `$DATA_DIR/.jwt-secret` abgelegt |
| `TZ` | `Europe/Berlin` | Zeitzone für den nächtlichen Lauf |
| `DISABLE_SCHEDULER` | `false` | `true` schaltet den automatischen Lauf ab |

Das Volume auf `/data` ist wichtig – ohne es sind nach einem `docker rm` alle Daten weg.

## Betrieb hinter einem Reverse Proxy

Die App vertraut `X-Forwarded-*`-Headern. Bei HTTPS-Terminierung im Proxy wird das
Sitzungs-Cookie automatisch als `secure` gesetzt.

## Wiederkehrende Belege

### Leistungszeitraum

Wer monatlich eine Wartungspauschale stellt, will den abgedeckten Zeitraum auf der Rechnung
stehen haben. Feste Daten an der Vorlage wären dafür unbrauchbar – sie stünden jeden Monat
gleich da. Deshalb wird der Zeitraum je Lauf aus dem Rechnungsdatum abgeleitet:

| Einstellung | Bei einem Lauf am 01.03.2026 |
| --- | --- |
| Keiner | kein Leistungszeitraum auf dem Beleg |
| Monat des Rechnungsdatums | 01.03.2026 – 31.03.2026 |
| Vormonat | 01.02.2026 – 28.02.2026 |
| Bis zum nächsten Lauf | 01.03.2026 – 31.03.2026 |

*Bis zum nächsten Lauf* richtet sich nach dem Rhythmus und endet einen Tag vor dem nächsten
Termin – vierteljährlich also 01.01. – 31.03., jährlich 01.01. – 31.12. So überlappen sich
aufeinanderfolgende Rechnungen nicht.



Ein Cron-Lauf um **02:30 Uhr** (Zeitzone aus `TZ`) erzeugt alle fälligen Rechnungen und
Ausgaben, setzt `nextRunDate` weiter, zählt `remainingCycles` herunter und markiert
erschöpfte Vorlagen als beendet. Zusätzlich werden überfällige Rechnungen auf *Überfällig*
gesetzt.

Erzeugte Rechnungen landen als **Entwurf**, damit sie vor dem Versand geprüft werden können.

Der Lauf lässt sich jederzeit manuell auslösen – über die Schaltfläche *Fällige jetzt
erzeugen* oder per API:

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8080/api/recurring-invoices/run
```

## API

Alle Endpunkte unter `/api` akzeptieren neben dem Browser-Cookie auch ein **API-Token**
im Header – gedacht für eigene Skripte, etwa zum Mailversand. Tokens werden unter
*Einstellungen → API-Zugriff* erstellt; der Klartext wird nur einmal angezeigt.

```bash
TOKEN=ilt_…

# Rechnungen auflisten (Filter: ?status=sent&clientId=3&search=Muster)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/invoices

# Einzelne Rechnung inklusive Positionen, Kunde und Zahlungen
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/invoices/1

# PDF holen
curl -H "Authorization: Bearer $TOKEN" \
  -o rechnung.pdf http://localhost:8080/api/invoices/1/pdf

# ZUGFeRD-Hybrid-PDF bzw. XRechnung-XML
curl -H "Authorization: Bearer $TOKEN" \
  -o rechnung.pdf "http://localhost:8080/api/invoices/1/pdf?einvoice=1"
curl -H "Authorization: Bearer $TOKEN" \
  -o rechnung.xml http://localhost:8080/api/invoices/1/xrechnung

# Kunden
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/clients
```

```bash
# Kopie als neuer Entwurf / Gutschrift zur Rechnung
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/invoices/1/duplicate
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/invoices/1/credit

# Belegliste als CSV (optional ?from=2026-01-01&to=2026-12-31)
curl -H "Authorization: Bearer $TOKEN" \
  -o rechnungen.csv http://localhost:8080/api/invoices/export.csv
```

Weitere Sammlungen analog: `/api/products`, `/api/quotes`, `/api/payments`,
`/api/expenses`, `/api/recurring-invoices`, `/api/recurring-expenses`, `/api/dashboard`.
Angebote liefern ihr PDF unter `/api/quotes/:id/pdf`.

Die Token-Verwaltung selbst (`/api/tokens`) ist bewusst nur aus einer Browser-Sitzung
erreichbar – ein abhandengekommenes Token kann sich so keine weiteren ausstellen.

## Entwicklung

Voraussetzung: Node.js 22 und OpenSSL (für Prisma).

```bash
# Backend
cd backend
npm install
export DATABASE_URL="file:$PWD/prisma/dev.db"
export DATA_DIR="$PWD/.data"
npx prisma migrate dev
npm run dev            # http://localhost:3000

# Frontend (zweites Terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173, /api wird auf 3000 geproxyt
```

Für die PDF-Erzeugung lokal muss Chromium vorhanden sein:
`export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

## Aufbau

```
backend/
  prisma/schema.prisma        Datenmodell (SQLite)
  src/routes/                 REST-Endpunkte je Modul
  src/services/
    totals.ts                 Summen, Rabattverteilung, Steuergruppen
    numbering.ts              Nummernkreise (transaktional)
    epcQr.ts                  EPC069-12-Payload und QR-Grafik
    pdf.ts                    Puppeteer-Rendering, View-Modelle
    eInvoice.ts               UBL-Aufbau, ZUGFeRD/XRechnung
    invoiceSync.ts            Summen + Status nach Änderungen
    recurringRunner.ts        Fällige Vorlagen abarbeiten
  src/templates/document.html.ts   HTML-Vorlage für Rechnung/Angebot
frontend/
  src/components/LineItemEditor.tsx  Positionseditor (Rechnung/Angebot/Vorlage)
  src/pages/                  Eine Datei je Modul
```

Die Summenlogik liegt bewusst doppelt vor: `backend/src/services/totals.ts` ist
verbindlich, `frontend/src/totals.ts` spiegelt sie nur für die Live-Vorschau im Editor.
