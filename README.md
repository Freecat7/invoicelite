# invoicelite

Rechnungen, Angebote und Ausgaben für deutsche Unternehmen, in einem einzigen
Docker-Container.

Kein separater Datenbank-, Webserver- oder Queue-Dienst. Express liefert API und Oberfläche
über denselben Port aus, die Daten liegen in einer SQLite-Datei im Volume. Zum Start genügt
ein `docker compose up -d`.

[![Build und Tests](https://github.com/Freecat7/invoicelite/actions/workflows/ci.yml/badge.svg)](https://github.com/Freecat7/invoicelite/actions/workflows/ci.yml)
[![Lizenz: Sustainable Use](https://img.shields.io/badge/Lizenz-Sustainable%20Use-blue.svg)](LICENSE)

![Übersicht](docs/screenshots/uebersicht.png)

## Warum

Rechnungsprogramme sind meist entweder ein Abo in fremder Hand oder eine Installation aus
fünf Containern. invoicelite läuft auf dem eigenen Server, hält sich an deutsches
Rechnungsrecht und passt in eine Compose-Datei.

Was "hält sich an deutsches Recht" konkret heißt:

- XRechnung und ZUGFeRD, geprüft gegen den offiziellen
  [KoSIT-Validator](https://github.com/itplr-kosit/validator) in der Konfiguration
  XRechnung 3.0.2. Über alle Steuerregelungen, mit Rabatt, Gutschrift und Hybrid-PDF:
  `Acceptable: 6  Rejected: 0`
- § 19 UStG (Kleinunternehmer), § 13b (Reverse Charge) und Regelbesteuerung, je Beleg
  festgehalten statt global. Ein Wechsel ändert alte Belege nicht.
- GoBD: freigegebene Belege sind gesperrt, der Nummernkreis bleibt lückenlos, auch wenn ein
  Anlegen fehlschlägt.
- EPC-QR-Code auf der Rechnung, EÜR nach § 4 Abs. 3 EStG als PDF und CSV für die
  Steuerkanzlei.

## Schnellstart

Eine Datei genügt. Das Abbild kommt fertig aus der Registry, es wird nichts gebaut:

```bash
curl -O https://raw.githubusercontent.com/Freecat7/invoicelite/main/docker-compose.yml
docker compose up -d
docker compose logs | grep Passwort     # Startpasswort ablesen
```

Dann [http://localhost:8080](http://localhost:8080) öffnen. Ein Assistent führt in fünf
Schritten durch Firma, Steuer, Bank, Belege und Zugang. Niemand muss die Einstellungen
vorher selbst durchsuchen.

Aktualisieren geht mit `docker compose pull && docker compose up -d`. Weil der Container
beim Start ausstehende Datenbankmigrationen anwendet, lohnt vorher ein Blick in den
[CHANGELOG](CHANGELOG.md) und eine Sicherung über die Einstellungen. Wer auf einer
bestimmten Version bleiben will, legt eine `.env` daneben:

```
INVOICELITE_VERSION=1.0.0
```

Aus dem Quelltext bauen, etwa zum Entwickeln:

```bash
git clone https://github.com/Freecat7/invoicelite.git
cd invoicelite
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

> Für den Betrieb über das Internet gehört ein Reverse Proxy mit TLS davor. Die Anwendung
> selbst spricht HTTP. Siehe [SECURITY.md](SECURITY.md).

## Was es kann

| | |
| --- | --- |
| Belege | Angebote, Rechnungen, Gutschriften, wiederkehrende Rechnungen |
| Versand | SMTP, automatisch am Tag nach der Freigabe, auf Wunsch mit Blindkopie an das eigene Postfach |
| Auswertung | Übersicht nach Monat, Jahr oder freiem Zeitraum; EÜR fürs Finanzamt |
| Schnittstelle | Vollständige REST-API mit Token, dokumentiert in den Einstellungen |
| Sonstiges | Ausgaben mit Belegupload, EPC-QR, Sicherung als ZIP, helles und dunkles Schema |

<table>
<tr>
<td><img src="docs/screenshots/rechnung.png" alt="Rechnung bearbeiten"></td>
<td><img src="docs/screenshots/berichte.png" alt="Einnahmen-Überschuss-Rechnung"></td>
</tr>
<tr>
<td align="center"><sub>Rechnung bearbeiten</sub></td>
<td align="center"><sub>Einnahmen-Überschuss-Rechnung</sub></td>
</tr>
</table>

## Für wen es nicht gemacht ist

- Ein Konto, eine Firma. Keine Mandanten, keine Rechteverwaltung, keine Teams.
- Oberfläche und Belege sind deutsch, die Steuerlogik bildet deutsches Recht ab. Andere
  Länder sind nicht vorgesehen.
- Keine Zwei-Faktor-Anmeldung, kein Kundenportal, keine Zeiterfassung.
- SQLite, ausgelegt auf den Betrieb mit einem Nutzer statt auf eine Agentur mit zwanzig.

Wer davon etwas braucht, ist mit [Invoice Ninja](https://invoiceninja.com) besser bedient.

## In English

A self-hosted invoicing app for German businesses, in a single Docker container. It produces
XRechnung and ZUGFeRD documents validated against the official KoSIT validator, handles the
§ 19 and § 13b tax regimes, locks approved documents and keeps numbering gapless for GoBD,
and exports a German income-surplus statement (EÜR) for the tax advisor.

The interface and all documents are German, and there are no plans to change that. The
software encodes German invoicing law, so an English interface would not make it useful
elsewhere.

## Lizenz

Copyright (C) 2026 Lennart Müller

invoicelite steht unter der [Sustainable Use License](LICENSE), derselben Lizenz, die auch
[n8n](https://github.com/n8n-io/n8n) verwendet. Was das heißt:

- Im eigenen Betrieb nutzen und anpassen: ja, auch geschäftlich.
- Weitergeben: ja, solange kostenlos und nicht-kommerziell.
- Als bezahlten Dienst für Dritte betreiben: nein.

Das ist bewusst kein Open Source im Sinne der OSI. Der Quelltext liegt offen, aber niemand
soll die Arbeit hosten und dafür Geld verlangen. Verbindlich ist der [Lizenztext](LICENSE),
die Aufzählung oben fasst ihn nur zusammen.

Ohne jede Gewährleistung, auch nicht für Marktreife oder Eignung für einen bestimmten Zweck.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.md). Kurz: erst ein Issue, dann der Pull Request, und
die Testreihe (`scripts/api-test.py`, derzeit 286 Prüfungen) muss durchlaufen.

## Handbuch

Alle Bereiche im Einzelnen, von Steuerregelungen über E-Rechnung, Mailversand, GoBD,
Sicherung und API bis zu Umgebungsvariablen und Entwicklung:
[docs/handbuch.md](docs/handbuch.md)
