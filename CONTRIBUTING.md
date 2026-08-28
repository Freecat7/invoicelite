# Mitwirken

Danke für Ihr Interesse. Ein paar Hinweise, damit ein Beitrag zügig durchgeht.

## Bevor Sie loslegen

Bei größeren Änderungen bitte erst ein Issue aufmachen. Es wäre schade, wenn
Arbeit an etwas fließt, das nicht ins Projekt passt.

## Grundsätze

**Die Belegkorrektheit ist nicht verhandelbar.** XRechnung und ZUGFeRD sind
gegen den offiziellen KoSIT-Validator geprüft. Wer am Beleg oder an der
Steuerlogik etwas ändert, führt diese Prüfung erneut durch – siehe unten.

**Ein Container.** Die Anwendung kommt ohne separaten Datenbank-, Cache- oder
Queue-Dienst aus. Ein Vorschlag, der das aufweicht, braucht ein starkes
Argument.

**Deutsch.** Oberfläche, Belege und Kommentare sind deutsch. Das ist Absicht:
Die Software bildet deutsches Rechnungsrecht ab, und Kommentare erklären das
*Warum* dann in derselben Sprache wie die Fachbegriffe.

## Entwickeln

```bash
# Backend
cd backend && npm install && npx prisma generate
npm run dev            # http://localhost:3000

# Frontend
cd frontend && npm install
npm run dev            # http://localhost:5173, leitet /api weiter
```

## Vor dem Pull Request

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc -b
docker build -t invoicelite:test .

# Testreihe gegen eine Wegwerf-Instanz
docker run -d --name il-test -p 8099:3000 -v il-test:/data \
  -e ADMIN_EMAIL=test@example.com -e ADMIN_PASSWORD=test-passwort-123 invoicelite:test
python3 scripts/api-test.py http://localhost:8099
docker rm -f il-test && docker volume rm il-test
```

Die Testreihe muss vollständig durchlaufen. Neue Funktionen bringen eigene
Prüfungen mit – am besten solche, die den Fehler zeigen, den Sie beheben.

### E-Rechnung geändert?

Dann bitte gegen den [KoSIT-Validator](https://github.com/itplr-kosit/validator)
prüfen, mit der Konfiguration
[XRechnung 3.0.2](https://github.com/itplr-kosit/validator-configuration-xrechnung).
Alle erzeugten Belege müssen `ACCEPTABLE` sein – über alle drei
Steuerregelungen, mit und ohne Rabatt, samt Gutschrift und ZUGFeRD-PDF.

## Commit-Nachrichten

Deutsch, im Präsens, und sie erklären das *Warum*. Was geändert wurde, steht
im Diff; warum, weiß nur der Autor.

## Lizenz

Mit dem Einreichen eines Beitrags stellen Sie ihn unter die
[Sustainable Use License](LICENSE) und räumen mir das Recht ein, ihn unter dieser Lizenz
zu verbreiten.
