# Changelog

Alle nennenswerten Änderungen an invoicelite. Die Versionen folgen
[Semantic Versioning](https://semver.org/lang/de/): die erste Zahl bricht die
Kompatibilität, die zweite bringt Funktionen, die dritte behebt Fehler.

Beim Start wendet der Container ausstehende Datenbankmigrationen selbst an. Vor einem
Upgrade lohnt sich eine Sicherung über die Einstellungen, denn eine angewendete Migration
lässt sich nur durch Einspielen dieser Sicherung zurücknehmen. Jeder Eintrag unten nennt,
ob das Schema oder die Steuerlogik betroffen ist.

## 2.0.0 (2026-10-24)

Schema geändert: diese Version entfernt Spalten. Vorher sichern.

- Wiederkehrende Belege liefen auf "beendet", sobald ein Beleg erzeugt wurde, und der
  Zähler stand auf -1. Ursache war eine 0 im Feld "verbleibende Durchläufe", die aus der
  Zeit stammt, in der ein geleertes Feld still als 0 gespeichert wurde. Drei Änderungen:
  0 wird als Eingabe abgelehnt, der Zähler geht nie unter null, und ist er aufgebraucht,
  wird er geleert statt auf 0 zu stehen. Damit genügt künftig das Umstellen des Status
  zum Reaktivieren. Wiederkehrende Ausgaben hatten denselben Fehler und sind mit
  behoben. Eine Migration repariert bestehende Vorlagen beider Arten; deren Status
  bleibt unberührt und muss einmal von Hand auf "aktiv" gestellt werden.
- Die IMAP-Ablage im Ordner "Gesendet" ist entfallen. Eine Blindkopie an das eigene
  Postfach löst dasselbe ohne zweite Verbindung und zweites Passwort. Das spart 20
  Pakete, darunter den gesamten pino-Stapel. Die sieben imap-Spalten und das hinterlegte
  IMAP-Passwort werden dabei gelöscht.
- Der Name der Anwendung ist nicht mehr einstellbar und heißt immer invoicelite. Das Feld
  in den Einstellungen und der öffentliche Endpunkt /api/branding sind entfallen.
- Die Compose-Datei zieht jetzt das fertige Abbild statt es zu bauen. Für den Betrieb aus
  dem Quelltext liegt `docker-compose.build.yml` daneben. Wer bisher mit `build: .` lief,
  bekommt beim nächsten `docker compose up -d` das Abbild aus der Registry; das Volume und
  damit alle Daten bleiben unberührt.

## 1.0.0 (2026-10-22)

Erste Version mit veröffentlichtem Container-Abbild. Schema unverändert.

- Das Abbild liegt jetzt unter `ghcr.io/freecat7/invoicelite` bereit. Wer es verwendet,
  muss nicht mehr selbst bauen.
- README überarbeitet: dekorative Auszeichnungen entfernt, die genannte Zahl der
  Prüfungen auf 286 berichtigt. „Kleinunternehmen" ist aus der Beschreibung verschwunden,
  weil es als Steuerstatus nach § 19 gelesen wurde; die Software deckt beides ab.

## 0.9.2 (2026-09-19)

Vier Meldungen aus dem laufenden Betrieb, drei davon echte Fehler. Schema unverändert.

- Der Lauf für fällige wiederkehrende Rechnungen brach vollständig ab und meldete nur
  „Eintrag existiert bereits". Ursache: lag der Nummernzähler hinter dem Bestand, etwa
  nach einer Löschung direkt in der Datenbank, lief die Nummernvergabe in die
  Eindeutigkeitsprüfung. Die Vergabe sucht nun die nächste freie Nummer, womit sich ein
  verstellter Zähler selbst heilt. Zusätzlich fängt die Schleife Fehler je Vorlage ab:
  vorher riss eine einzige defekte Vorlage den ganzen Lauf mit, ohne sie zu benennen.
- Ein geleertes Feld „Durchläufe" wurde still als 0 gespeichert statt als unbegrenzt,
  weshalb sich eine beendete Vorlage nicht reaktivieren ließ. Wiederkehrende Ausgaben
  hatten denselben Fehler.
- Ausgaben und wiederkehrende Ausgaben nehmen jetzt auch Bruttobeträge an und rechnen auf
  netto zurück. Gespeichert wird weiterhin netto, damit der Betrag bei einer Änderung des
  Steuersatzes eindeutig bleibt.
- Mit Leistungszeitraum wurde die Jahreszahl im PDF rechts abgeschnitten. Die Aufteilung
  der Kopfzeile ist korrigiert, der Text endet bündig am Inhaltsrand.
- Der Status „beendet" ist kein Fehler, stand aber nirgends erklärt. Das Handbuch führt
  jetzt alle vier Fälle auf.

## 0.9.1 (2026-08-29)

Keine ausgehenden Verbindungen mehr. Schema unverändert.

- Eine Messung mit mitschreibendem DNS-Server zeigte Anfragen an
  `checkpoint.prisma.io`, `registry.npmjs.org` und mehrere Google-Domains, letztere bei
  jeder PDF-Erzeugung durch Chromium. Alle drei Quellen sind abgestellt. Die Anwendung
  spricht nur noch mit dem hinterlegten Postfach.
- Die Vorschau im Rechnungseditor folgt jetzt der gewählten Steuerregelung. Vorher zeigte
  sie bei § 19 und § 13b bis zum Speichern weiter 19 Prozent, weil ihr die Regelung gar
  nicht übergeben wurde.
- Wiederkehrende Rechnungen können einen Leistungszeitraum setzen. Das Feld wurde zwar
  angenommen, aber nicht gespeichert.

## 0.9.0 (2026-08-28)

Erste öffentliche Fassung.

- Angebote, Rechnungen, Gutschriften und wiederkehrende Rechnungen mit Positionen,
  Rabatt, gemischten Steuersätzen und Leistungszeitraum. PDF mit EPC-QR-Code.
- XRechnung und ZUGFeRD, geprüft gegen den offiziellen KoSIT-Validator in der
  Konfiguration XRechnung 3.0.2.
- Kleinunternehmer nach § 19 UStG, Regelbesteuerung und § 13b, je Beleg festgehalten.
  Freigegebene Belege sind gesperrt, der Nummernkreis bleibt lückenlos.
- Übersicht nach Monat, Jahr oder freiem Zeitraum, Einnahmen-Überschuss-Rechnung nach
  § 4 Abs. 3 EStG als PDF und CSV.
- Ausgaben mit Belegupload, Sicherung als ZIP, REST-API mit Token, Einrichtungsassistent
  beim ersten Start, helles und dunkles Schema.
