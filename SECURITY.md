# Sicherheit

## Eine Lücke melden

Bitte **kein** öffentliches Issue anlegen. Nutzen Sie stattdessen
[Security Advisories](../../security/advisories/new) oder schreiben Sie an die
im Profil hinterlegte Adresse. Ich melde mich innerhalb weniger Tage.

## Was invoicelite tut

- Sitzungen laufen über ein signiertes, `httpOnly`-Cookie. Das Geheimnis wird
  beim ersten Start erzeugt und liegt unter `/data/.jwt-secret` – also außerhalb
  der Datenbank.
- Das SMTP- und IMAP-Passwort liegt **verschlüsselt** in der Datenbank
  (AES-256-GCM, Schlüssel abgeleitet aus dem Sitzungsgeheimnis). Wer nur die
  Datenbank hat, kann es nicht lesen. Es verlässt den Server nie.
- Die Anmeldung bremst nach mehreren Fehlversuchen je Herkunft für 15 Minuten.
- API-Token werden nur als Hash gespeichert und dürfen keine weiteren Token
  verwalten.
- Die Sicherung enthält das Sitzungsgeheimnis bewusst **nicht** – eine abhanden
  gekommene Sicherung soll keine gültigen Anmeldungen erzeugen können.

## Verbindungen nach außen

Die Anwendung spricht im Betrieb mit **niemandem** außer dem Postausgangsserver, den Sie
selbst eintragen. Nachgemessen mit einem mitschreibenden DNS-Server: null Namensauflösungen
beim Start und beim Erzeugen von PDFs.

Dafür waren zwei Dinge nötig:

- **Prisma** meldete sich bei jedem Start an `checkpoint.prisma.io`, um nach Aktualisierungen
  zu sehen; `npx` fragte zusätzlich die npm-Registry. Beides ist abgeschaltet
  (`CHECKPOINT_DISABLE`, direkter Aufruf der mitgelieferten Datei).
- **Chromium** rief bei jeder PDF-Erzeugung `clients2.google.com`, `www.google.com`,
  `accounts.google.com` und `mtalk.google.com` auf. Die üblichen Schalter
  (`--disable-background-networking` und weitere) haben das nicht gestoppt, deshalb bekommt
  Chromium über `--host-resolver-rules=MAP * ~NOTFOUND` gar keine Namensauflösung mehr. Das
  Dokument bindet Schriften, Logo und QR-Code vollständig ein und braucht kein Netz.

Wer das nachprüfen will: Container an einen DNS-Server mit Protokollierung hängen
(`--dns`), eine Rechnung erzeugen, Protokoll ansehen.

## Was invoicelite nicht tut

- **Kein TLS.** Die Anwendung spricht HTTP. Für den Betrieb über das Internet
  gehört ein Reverse Proxy mit Zertifikat davor (Caddy, nginx, Traefik).
- **Keine Mandantenfähigkeit.** Ein Konto, eine Firma. Es gibt keine
  Rechteverwaltung.
- **Keine Zwei-Faktor-Anmeldung.**

Wer die Anwendung öffentlich erreichbar macht, sollte das wissen.
