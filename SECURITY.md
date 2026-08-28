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

## Was invoicelite nicht tut

- **Kein TLS.** Die Anwendung spricht HTTP. Für den Betrieb über das Internet
  gehört ein Reverse Proxy mit Zertifikat davor (Caddy, nginx, Traefik).
- **Keine Mandantenfähigkeit.** Ein Konto, eine Firma. Es gibt keine
  Rechteverwaltung.
- **Keine Zwei-Faktor-Anmeldung.**

Wer die Anwendung öffentlich erreichbar macht, sollte das wissen.
