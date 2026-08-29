#!/usr/bin/env python3
"""
Durchlaeuft die komplette API von invoicelite und prueft die Ergebnisse.
Gegen eine eigene Testinstanz laufen lassen - es werden Daten angelegt,
veraendert und geloescht.
"""
import io
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from http.cookiejar import CookieJar

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099"
API = BASE + "/api"
EMAIL = "test@example.com"
PASSWORD = "test-passwort-123"

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

passed, failed = 0, 0
failures = []
section = ""


def head(name):
    global section
    section = name
    print(f"\n\033[1m{name}\033[0m")


def check(label, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  \033[32mok\033[0m   {label}")
    else:
        failed += 1
        failures.append(f"[{section}] {label} — {detail}")
        print(f"  \033[31mFEHL\033[0m {label}  {detail}")


def call(method, path, body=None, token=None, raw=False, files=None):
    """Liefert (status, geparster Body oder Bytes)."""
    url = API + path
    headers = {}
    data = None
    if files:
        boundary = "----invoiceliteTest"
        buf = io.BytesIO()
        for field, (fname, content, ctype) in files.items():
            buf.write(f"--{boundary}\r\n".encode())
            buf.write(
                f'Content-Disposition: form-data; name="{field}"; filename="{fname}"\r\n'.encode()
            )
            buf.write(f"Content-Type: {ctype}\r\n\r\n".encode())
            buf.write(content)
            buf.write(b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        data = buf.getvalue()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req) as r:
            payload = r.read()
            if raw:
                return r.status, payload
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        if raw:
            return e.code, payload
        try:
            return e.code, json.loads(payload) if payload else None
        except json.JSONDecodeError:
            return e.code, payload


def iso(d):
    return d.isoformat()


TODAY = date.today()

# ───────────────────────── Anmeldung ─────────────────────────
head("Anmeldung und Sitzung")
s, b = call("GET", "/invoices")
check("ohne Anmeldung 401", s == 401, f"war {s}")

s, b = call("POST", "/auth/login", {"email": EMAIL, "password": "falsch"})
check("falsches Passwort 401", s == 401, f"war {s}")

s, b = call("POST", "/auth/login", {"email": "kein@example.com", "password": "x"})
check("unbekannte E-Mail 401", s == 401, f"war {s}")

s, b = call("POST", "/auth/login", {"email": "keineemail", "password": "x"})
check("ungueltige E-Mail 400", s == 400, f"war {s}")

s, b = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
check("Anmeldung erfolgreich", s == 200 and b["email"] == EMAIL, f"{s} {b}")

s, b = call("GET", "/auth/me")
check("/auth/me liefert Benutzer", s == 200 and b["via"] == "session", f"{s} {b}")

# ───────────────────────── Einrichtung ─────────────────────────
head("Einrichtung")
s, st = call("GET", "/setup/status")
check("Einrichtungsstand abrufbar", s == 200 and "completed" in st, f"{s}")
check("frische Installation ist nicht eingerichtet", st["completed"] is False, str(st))

s, b = call("POST", "/setup", {"companyName": "", "addressLine": "A", "postalCode": "1",
    "city": "B", "email": "a@b.de", "phone": "0211 1", "taxRegime": "standard",
    "taxNumber": "1"})
check("Einrichtung ohne Firmennamen 400", s == 400, f"war {s}")
s, b = call("POST", "/setup", {"companyName": "X", "addressLine": "A", "postalCode": "1",
    "city": "B", "email": "a@b.de", "phone": "12", "taxRegime": "standard",
    "taxNumber": "1"})
check("Telefonnummer mit unter drei Ziffern 400", s == 400, f"war {s}")
s, b = call("POST", "/setup", {"companyName": "X", "addressLine": "A", "postalCode": "1",
    "city": "B", "email": "a@b.de", "phone": "0211 1", "taxRegime": "standard"})
check("weder USt-IdNr. noch Steuernummer 400", s == 400, f"war {s}")

s, fertig = call("POST", "/setup", {
    "companyName": "Einrichtungstest GmbH", "ownerName": "Frau Test",
    "addressLine": "Teststraße 1", "postalCode": "40213", "city": "Düsseldorf",
    "country": "DE", "email": "info@test.example", "phone": "0211 1234567",
    "taxRegime": "small_business", "taxNumber": "12/345/67890",
    "iban": "DE02370501980001802057", "bic": "COLSDE33XXX",
    "invoiceNumberPrefix": "RE-", "invoiceNumberNext": 7, "paymentTermDays": 21})
check("Einrichtung speichern", s == 200, f"{s} {b}")
check("Angaben sind übernommen",
      fertig["companyName"] == "Einrichtungstest GmbH" and fertig["paymentTermDays"] == 21,
      str(fertig.get("companyName")))
check("Merker steht auf erledigt", fertig["setupCompleted"] is True,
      str(fertig.get("setupCompleted")))
check("Einrichtung liefert kein Passwort zurück", "smtpPasswordEnc" not in fertig, "dabei!")
s, st2 = call("GET", "/setup/status")
check("Stand ist jetzt erledigt", st2["completed"] is True, str(st2))

# Eigener Kunde: die Stammdaten entstehen erst weiter unten.
s, einrKunde = call("POST", "/clients", {"name": "Einrichtungskunde"})
s, ersteRe = call("POST", "/invoices", {"clientId": einrKunde["id"],
    "lines": [{"description": "Erste", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("Nummernkreis beginnt beim gewählten Wert", ersteRe["number"] == "RE-0007",
      ersteRe["number"])
check("Zahlungsziel aus der Einrichtung greift",
      (datetime.fromisoformat(ersteRe["dueDate"].replace("Z", "+00:00")).date()
       - datetime.fromisoformat(ersteRe["issueDate"].replace("Z", "+00:00")).date()).days == 21,
      f'{ersteRe["issueDate"][:10]} -> {ersteRe["dueDate"][:10]}')
call("DELETE", f"/invoices/{ersteRe['id']}")
call("DELETE", f"/clients/{einrKunde['id']}")

# ───────────────────────── Einstellungen ─────────────────────────
head("Einstellungen")
s, settings = call("GET", "/settings")
check("Einstellungen lesbar", s == 200 and "companyName" in settings, f"{s}")

cfg = {k: v for k, v in settings.items() if k not in ("id", "logoPath")}
cfg.update(
    {
        "companyName": "Testfirma GmbH",
        "addressLine": "Teststrasse 1",
        "postalCode": "40213",
        "city": "Duesseldorf",
        "country": "DE",
        "vatId": "DE123456789",
        "taxNumber": "12/345/67890",
        "ownerName": "Test Inhaber",
        "email": "info@testfirma.example",
        "phone": "0211 1",
        "iban": "DE02370501980001802057",
        "bic": "COLSDE33XXX",
        "bankName": "Testbank",
        "accountHolder": "Testfirma GmbH",
        "currency": "EUR",
        "locale": "de-DE",
        "defaultTaxRate": 19,
        "taxRegime": "standard",
        "paymentTermDays": 14,
        "invoiceNumberPrefix": "RE-",
        "invoiceNumberNext": 1,
        "invoiceNumberPadding": 4,
        "quoteNumberPrefix": "AN-",
        "quoteNumberNext": 1,
        "quoteNumberPadding": 4,
        "creditNumberPrefix": "GS-",
        "creditNumberNext": 1,
        "creditNumberPadding": 4,
        "accentColor": "#2E2B2A",
        "showEpcQr": True,
        "eInvoiceFormat": "off",
        "buyerReference": "991-12345-67",
        "defaultTerms": "Zahlbar in 14 Tagen.",
        "defaultFooter": "",
        "defaultNotes": "",
    }
)
s, b = call("PUT", "/settings", cfg)
check("Einstellungen speichern", s == 200 and b["companyName"] == "Testfirma GmbH", f"{s}")

s, b = call("PUT", "/settings", {**cfg, "accentColor": "rot"})
check("ungueltige Farbe 400", s == 400, f"war {s}")

s, b = call("PUT", "/settings", {**cfg, "eInvoiceFormat": "quatsch"})
check("ungueltiges E-Rechnungsformat 400", s == 400, f"war {s}")

s, b = call("PUT", "/settings", {**cfg, "invoiceNumberPadding": 99})
check("Stellenzahl ausserhalb der Grenzen 400", s == 400, f"war {s}")

s, b = call("GET", "/settings")
check("Stellenzahl unveraendert nach Fehlversuch", b["invoiceNumberPadding"] == 4, str(b["invoiceNumberPadding"]))

# Logo
png = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d4944415478da63f8cfc0500f0004000100ff1f9d0a"
    "6a0000000049454e44ae426082"
)
s, b = call("POST", "/settings/logo", files={"logo": ("test.png", png, "image/png")})
check("Logo hochladen", s == 200 and b["logoPath"], f"{s}")
s, raw = call("GET", "/settings/logo-file", raw=True)
check("Logo abrufbar", s == 200 and raw[:8] == png[:8], f"{s}")
s, b = call("DELETE", "/settings/logo")
check("Logo entfernen", s == 200 and b["logoPath"] == "", f"{s}")
s, b = call("GET", "/settings/logo-file")
check("Logo danach 404", s == 404, f"war {s}")
call("POST", "/settings/logo", files={"logo": ("test.png", png, "image/png")})

# ───────────────────────── Kunden ─────────────────────────
head("Kunden")
s, b = call("POST", "/clients", {"contactName": "ohne Namen"})
check("Kunde ohne Namen 400", s == 400, f"war {s}")

s, kunde = call(
    "POST",
    "/clients",
    {
        "name": "Kunde Alpha GmbH",
        "contactName": "Frau A",
        "email": "a@kunde.example",
        "addressLine": "Alphaweg 1",
        "postalCode": "40213",
        "city": "Duesseldorf",
        "country": "DE",
        "vatId": "DE987654321",
    },
)
check("Kunde anlegen", s == 201 and kunde["name"] == "Kunde Alpha GmbH", f"{s}")
KUNDE = kunde["id"]

s, kunde2 = call("POST", "/clients", {"name": "Kunde Beta", "city": "Koeln"})
KUNDE2 = kunde2["id"]
check("zweiter Kunde", s == 201, f"{s}")

s, b = call("GET", "/clients?search=Alpha")
check("Suche findet Kunden", s == 200 and len(b) == 1 and b[0]["id"] == KUNDE, f"{len(b)}")

s, b = call("GET", "/clients?search=Koeln")
check("Suche nach Ort", s == 200 and len(b) == 1 and b[0]["id"] == KUNDE2, f"{len(b)}")

s, b = call("GET", f"/clients/{KUNDE}")
check("Kunde einzeln", s == 200 and "invoices" in b and "quotes" in b, f"{s}")

s, b = call("GET", "/clients/999999")
check("unbekannter Kunde 404", s == 404, f"war {s}")

s, b = call("GET", "/clients/abc")
check("ungueltige ID 400", s == 400, f"war {s}")

s, b = call("PUT", f"/clients/{KUNDE2}", {"name": "Kunde Beta AG", "city": "Koeln"})
check("Kunde aendern", s == 200 and b["name"] == "Kunde Beta AG", f"{s}")

# ───────────────────────── Produkte ─────────────────────────
head("Produkte")
s, prod = call(
    "POST",
    "/products",
    {"name": "Beratung", "sku": "BER-1", "unitPrice": 95, "unit": "Std.", "taxRate": 19},
)
check("Produkt anlegen", s == 201 and prod["unitPrice"] == 95, f"{s}")
PROD = prod["id"]

s, b = call("POST", "/products", {"sku": "X"})
check("Produkt ohne Namen 400", s == 400, f"war {s}")

s, b = call("PUT", f"/products/{PROD}", {"name": "Beratung", "unitPrice": 99, "taxRate": 19, "archived": True})
check("Produkt archivieren", s == 200 and b["archived"] is True, f"{s}")

s, b = call("GET", "/products")
check("archiviertes Produkt ausgeblendet", all(p["id"] != PROD for p in b), "war sichtbar")

s, b = call("GET", "/products?archived=true")
check("archiviertes Produkt mit Flag sichtbar", any(p["id"] == PROD for p in b), "fehlte")

# Artikelnummern werden fortlaufend vergeben
s, p1 = call("POST", "/products", {"name": "Ohne Nummer", "unitPrice": 10, "taxRate": 19})
check("Artikel ohne Nummer bekommt eine", p1["sku"].startswith("ART-"), p1["sku"])
s, p2 = call("POST", "/products", {"name": "Auch ohne", "unitPrice": 10, "taxRate": 19})
check("Nummer wird fortgeführt", p2["sku"] != p1["sku"], f'{p1["sku"]} / {p2["sku"]}')
s, p3 = call("POST", "/products", {"name": "Eigene", "sku": "EIGEN-1", "unitPrice": 10, "taxRate": 19})
check("eigene Nummer bleibt erhalten", p3["sku"] == "EIGEN-1", p3["sku"])
s, p4 = call("POST", "/products", {"name": "Leerzeichen", "sku": "   ", "unitPrice": 10, "taxRate": 19})
check("Feld aus Leerzeichen gilt als leer", p4["sku"].startswith("ART-"), p4["sku"])
for pid in (p1["id"], p2["id"], p3["id"], p4["id"]):
    call("DELETE", f"/products/{pid}")

# ───────────────────────── Rechnungen: Rechenwege ─────────────────────────
head("Rechnungen - Summen und Steuern")
s, inv = call(
    "POST",
    "/invoices",
    {
        "clientId": KUNDE,
        "serviceDateFrom": iso(TODAY.replace(day=1)),
        "serviceDateTo": iso(TODAY),
        "discountValue": 5,
        "discountType": "percent",
        "lines": [
            {"description": "Pos 19%", "quantity": 10, "unit": "Std.", "unitPrice": 95, "taxRate": 19},
            {"description": "Pos 7%", "quantity": 2, "unit": "Stk.", "unitPrice": 39.9, "taxRate": 7},
        ],
    },
)
check("Rechnung anlegen", s == 201, f"{s}")
INV = inv["id"]
check("Nummer RE-0001", inv["number"] == "RE-0001", inv["number"])
check("Zwischensumme 1029.80", inv["subtotal"] == 1029.8, str(inv["subtotal"]))
# 5% von 1029.80 = 51.49; 19%-Gruppe 950-47.50=902.50 -> 171.48; 7%-Gruppe 79.80-3.99=75.81 -> 5.31
check("USt 176.79 (gemischte Saetze, anteiliger Rabatt)", inv["taxTotal"] == 176.79, str(inv["taxTotal"]))
check("Gesamt 1155.10", inv["total"] == 1155.1, str(inv["total"]))
check("Leistungszeitraum gespeichert", inv["serviceDateFrom"] and inv["serviceDateTo"], "fehlt")
check("Status Entwurf", inv["status"] == "draft", inv["status"])
check("Steuerregelung aus Einstellungen", inv["taxRegime"] == "standard", inv["taxRegime"])

s, inv_fixed = call(
    "POST",
    "/invoices",
    {"clientId": KUNDE, "discountValue": 100, "discountType": "fixed",
     "lines": [{"description": "A", "quantity": 1, "unitPrice": 1000, "taxRate": 19}]},
)
check("fester Rabatt: netto 900", inv_fixed["subtotal"] == 1000 and inv_fixed["total"] == 1071.0,
      f"sub {inv_fixed['subtotal']} total {inv_fixed['total']}")

s, inv_over = call(
    "POST",
    "/invoices",
    {"clientId": KUNDE, "discountValue": 5000, "discountType": "fixed",
     "lines": [{"description": "A", "quantity": 1, "unitPrice": 100, "taxRate": 0}]},
)
check("Rabatt groesser als Summe wird gedeckelt", inv_over["total"] == 0, str(inv_over["total"]))

# Steuerregelungen
s, inv19 = call("POST", "/invoices", {"clientId": KUNDE, "taxRegime": "small_business",
    "lines": [{"description": "A", "quantity": 5, "unitPrice": 80, "taxRate": 19}]})
check("§19: keine USt trotz 19% an der Position", inv19["taxTotal"] == 0 and inv19["total"] == 400, f"{inv19['taxTotal']}/{inv19['total']}")

s, inv13 = call("POST", "/invoices", {"clientId": KUNDE, "taxRegime": "reverse_charge",
    "lines": [{"description": "A", "quantity": 2, "unitPrice": 900, "taxRate": 19}]})
check("§13b: keine USt", inv13["taxTotal"] == 0 and inv13["total"] == 1800, f"{inv13['taxTotal']}")

s, b = call("POST", "/invoices", {"clientId": KUNDE, "taxRegime": "quatsch", "lines": []})
check("ungueltige Steuerregelung 400", s == 400, f"war {s}")

s, b = call("POST", "/invoices", {"clientId": 999999, "lines": []})
check("unbekannter Kunde 400/404", s in (400, 404), f"war {s}")

s, b = call("POST", "/invoices", {"lines": []})
check("Rechnung ohne Kunde 400", s == 400, f"war {s}")

# ───────────────────────── Statuswege ─────────────────────────
head("Statuswege")
s, b = call("POST", f"/invoices/{INV}/status", {"status": "viewed"})
check("'viewed' abgelehnt", s == 400, f"war {s}")

s, b = call("POST", f"/invoices/{INV}/status", {"status": "approved"})
check("Freigabe", s == 200 and b["status"] == "approved", f"{s} {b.get('status')}")
check("sentAt bei Freigabe noch leer", b["sentAt"] is None, str(b["sentAt"]))

s, b = call("GET", "/invoices?status=approved")
check("Filter approved findet den Beleg", any(i["id"] == INV for i in b), "fehlte")
check("Kunden-E-Mail in der Liste", b[0]["client"].get("email") is not None, "fehlt")

s, b = call("POST", f"/invoices/{INV}/status", {"status": "sent"})
check("Versand setzt sentAt", s == 200 and b["status"] == "sent" and b["sentAt"], f"{b.get('sentAt')}")
SENT_AT = b["sentAt"]

s, b = call("GET", "/invoices?status=approved")
check("nach Versand nicht mehr freigegeben", all(i["id"] != INV for i in b), "noch enthalten")

# ───────────────────────── Zahlungen ─────────────────────────
head("Zahlungen")
s, b = call("POST", "/payments", {"invoiceId": INV, "amount": 0})
check("Betrag 0 abgelehnt", s == 400, f"war {s}")

s, b = call("POST", "/payments", {"invoiceId": 999999, "amount": 10})
check("Zahlung auf unbekannte Rechnung 404", s == 404, f"war {s}")

s, b = call("POST", "/payments", {"invoiceId": INV, "amount": 500, "method": "bank_transfer"})
check("Teilzahlung -> partial", s == 201 and b["invoice"]["status"] == "partial", b["invoice"]["status"])
PAY1 = b["payment"]["id"]
check("gezahlter Betrag 500", b["invoice"]["amountPaid"] == 500, str(b["invoice"]["amountPaid"]))

s, b = call("POST", "/payments", {"invoiceId": INV, "amount": 655.10})
check("Restzahlung -> paid", b["invoice"]["status"] == "paid", b["invoice"]["status"])
PAY2 = b["payment"]["id"]

s, b = call("DELETE", f"/payments/{PAY2}")
check("Zahlung loeschen -> zurueck auf partial", b["invoice"]["status"] == "partial", b["invoice"]["status"])

s, b = call("DELETE", f"/payments/{PAY1}")
check("letzte Zahlung weg -> zurueck auf sent (war versendet)", b["invoice"]["status"] == "sent", b["invoice"]["status"])
check("sentAt bleibt erhalten", b["invoice"]["sentAt"] == SENT_AT, "veraendert")

s, b = call("POST", "/payments", {"invoiceId": INV, "amount": 2000})
check("Ueberzahlung -> paid", b["invoice"]["status"] == "paid", b["invoice"]["status"])
call("DELETE", f"/payments/{b['payment']['id']}")

s, b = call("POST", "/payments", {"invoiceId": INV, "amount": 100, "method": "quatsch"})
check("ungueltige Zahlungsart 400", s == 400, f"war {s}")

# ───────────────────────── Ueberfaellig ─────────────────────────
head("Ueberfaelligkeit")
s, alt = call("POST", "/invoices", {
    "clientId": KUNDE,
    "issueDate": iso(TODAY - timedelta(days=60)),
    "dueDate": iso(TODAY - timedelta(days=30)),
    "lines": [{"description": "A", "quantity": 1, "unitPrice": 100, "taxRate": 0}],
})
ALT = alt["id"]
call("POST", f"/invoices/{ALT}/status", {"status": "sent"})
s, b = call("POST", "/recurring-invoices/run")
s, b = call("GET", f"/invoices/{ALT}")
check("versendete Rechnung nach Frist -> overdue", b["status"] == "overdue", b["status"])

# ───────────────────────── Gutschrift und Duplikat ─────────────────────────
head("Gutschrift und Duplizieren")
s, credit = call("POST", f"/invoices/{INV}/credit")
check("Gutschrift erzeugen", s == 201 and credit["docType"] == "credit", f"{s}")
check("eigener Nummernkreis GS-0001", credit["number"] == "GS-0001", credit["number"])
check("Betrag positiv", credit["total"] > 0, str(credit["total"]))
check("Bezug auf Ursprungsrechnung", credit["creditForInvoiceId"] == INV, str(credit["creditForInvoiceId"]))
CREDIT = credit["id"]

s, b = call("POST", f"/invoices/{CREDIT}/credit")
check("Gutschrift auf Gutschrift 400", s == 400, f"war {s}")

s, dup = call("POST", f"/invoices/{INV}/duplicate")
check("Duplizieren", s == 201 and dup["status"] == "draft", f"{s}")
check("Duplikat neue Nummer", dup["number"] != inv["number"], dup["number"])
check("Duplikat gleiche Summe", dup["total"] == inv["total"], str(dup["total"]))
check("Duplikat ohne Zahlungen", dup["amountPaid"] == 0, str(dup["amountPaid"]))

s, b = call("GET", "/invoices?docType=credit")
check("Filter docType=credit", all(i["docType"] == "credit" for i in b) and len(b) >= 1, f"{len(b)}")

# ───────────────────────── PDF und E-Rechnung ─────────────────────────
head("PDF und E-Rechnung")
s, raw = call("GET", f"/invoices/{INV}/pdf", raw=True)
check("Rechnungs-PDF", s == 200 and raw[:4] == b"%PDF", f"{s} {raw[:8]}")

s, raw = call("GET", f"/invoices/{INV}/pdf?einvoice=1", raw=True)
check("ZUGFeRD-PDF", s == 200 and raw[:4] == b"%PDF" and b"factur-x.xml" in raw, f"{s}")

s, raw = call("GET", f"/invoices/{INV}/xrechnung", raw=True)
xml = raw.decode("utf-8", "replace")
check("XRechnung-XML", s == 200 and "<Invoice" in xml, f"{s}")
check("XRechnung CustomizationID", "xrechnung_3.0" in xml, "fehlt")
check("XRechnung Leistungszeitraum", "InvoicePeriod" in xml, "fehlt")
check("XRechnung IBAN", "DE02370501980001802057" in xml, "fehlt")

s, raw = call("GET", f"/invoices/{CREDIT}/xrechnung", raw=True)
cxml = raw.decode("utf-8", "replace")
check("Gutschrift als CreditNote 381", "<CreditNote" in cxml and "381" in cxml, f"{s}")

s, raw = call("GET", f"/invoices/{inv19['id']}/xrechnung", raw=True)
x19 = raw.decode("utf-8", "replace")
check("§19 -> Steuerkategorie E mit Grund", ">E<" in x19 and "TaxExemptionReason" in x19, "fehlt")

s, raw = call("GET", f"/invoices/{inv13['id']}/xrechnung", raw=True)
x13 = raw.decode("utf-8", "replace")
check("§13b -> Steuerkategorie AE", ">AE<" in x13, "fehlt")

s, raw = call("GET", "/invoices/999999/pdf", raw=True)
check("PDF unbekannter Beleg 404", s == 404, f"war {s}")

s, raw = call("GET", "/invoices/export.csv", raw=True)
csv = raw.decode("utf-8-sig")
check("CSV-Export", s == 200 and csv.startswith("Belegart;"), f"{s}")
check("CSV enthaelt Gutschrift", "Gutschrift;GS-0001" in csv, "fehlt")
check("CSV Zeilenzahl passt", len(csv.strip().splitlines()) >= 7, str(len(csv.strip().splitlines())))

# ───────────────────────── Angebote ─────────────────────────
head("Angebote")
s, q = call("POST", "/quotes", {
    "clientId": KUNDE,
    "validUntil": iso(TODAY + timedelta(days=30)),
    "lines": [{"description": "Konzept", "quantity": 4, "unitPrice": 120, "taxRate": 19}],
})
check("Angebot anlegen", s == 201 and q["number"] == "AN-0001", f"{s} {q.get('number')}")
QUOTE = q["id"]
check("Angebotssumme 571.20", q["total"] == 571.2, str(q["total"]))

s, raw = call("GET", f"/quotes/{QUOTE}/pdf", raw=True)
check("Angebots-PDF", s == 200 and raw[:4] == b"%PDF", f"{s}")

s, b = call("POST", f"/quotes/{QUOTE}/status", {"status": "approved"})
check("Angebot annehmen", s == 200 and b["status"] == "approved", f"{s}")

s, conv = call("POST", f"/quotes/{QUOTE}/convert")
check("in Rechnung umwandeln", s == 201 and conv["total"] == q["total"], f"{s}")

s, b = call("POST", f"/quotes/{QUOTE}/convert")
check("zweite Umwandlung 400", s == 400, f"war {s}")

s, b = call("GET", f"/quotes/{QUOTE}")
check("Angebot als umgewandelt markiert", b["status"] == "converted" and b["convertedInvoiceId"], f"{b['status']}")

# Abgelaufenes Angebot
s, q2 = call("POST", "/quotes", {"clientId": KUNDE, "validUntil": iso(TODAY - timedelta(days=5)),
    "status": "sent", "lines": [{"description": "X", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
call("POST", "/recurring-invoices/run")
s, b = call("GET", f"/quotes/{q2['id']}")
check("abgelaufenes Angebot -> expired", b["status"] == "expired", b["status"])

# Angebot darf keine Rechnungssprache tragen
s, cfgq = call("GET", "/settings")
cfgq = {k: v for k, v in cfgq.items() if k not in ("id", "logoPath", "smtpPasswordSet")}
call("PUT", "/settings", {**cfgq,
     "defaultTerms": "Zahlung innerhalb von 14 Tagen ab Rechnungseingang.",
     "defaultQuoteTerms": "Dieses Angebot ist freibleibend."})
s, qq = call("POST", "/quotes", {"clientId": KUNDE,
    "lines": [{"description": "Beratung", "quantity": 1, "unitPrice": 100, "taxRate": 0}]})
check("Angebot erbt die Angebotsbedingungen",
      qq["terms"] == "Dieses Angebot ist freibleibend.", repr(qq["terms"][:50]))
check("Angebot erbt NICHT die Zahlungsbedingungen",
      "Rechnungseingang" not in qq["terms"], repr(qq["terms"][:50]))
s, raw = call("GET", f"/quotes/{qq['id']}/pdf", raw=True)
check("Angebots-PDF erzeugt", s == 200 and raw[:4] == b"%PDF", f"{s}")
call("POST", f"/quotes/{qq['id']}/status", {"status": "approved"})
s, umgewandelt = call("POST", f"/quotes/{qq['id']}/convert")
check("umgewandelte Rechnung bekommt die Zahlungsbedingungen",
      "Rechnungseingang" in umgewandelt["terms"], repr(umgewandelt["terms"][:50]))

# ───────────────────────── Wiederkehrende Rechnungen ─────────────────────────
head("Wiederkehrende Rechnungen")
s, tpl = call("POST", "/recurring-invoices", {
    "clientId": KUNDE,
    "title": "Wartung",
    "frequency": "monthly",
    "nextRunDate": iso(TODAY - timedelta(days=1)),
    "generateAs": "approved",
    "remainingCycles": 2,
    "lines": [{"description": "Pauschale", "quantity": 1, "unitPrice": 180, "taxRate": 19}],
})
check("Vorlage anlegen", s == 201 and tpl["generateAs"] == "approved", f"{s} {tpl.get('generateAs')}")
TPL = tpl["id"]

s, b = call("POST", "/recurring-invoices/run")
check("Lauf erzeugt Rechnung", b["invoicesCreated"] >= 1, str(b["invoicesCreated"]))
check("Protokoll nennt Freigabe", any("freigegeben" in d for d in b["details"]), str(b["details"]))

s, b = call("GET", f"/recurring-invoices/{TPL}")
check("nextRunDate rueckt vor", b["nextRunDate"][:10] > iso(TODAY - timedelta(days=1)), b["nextRunDate"][:10])
check("Durchlaeufe heruntergezaehlt", b["remainingCycles"] == 1, str(b["remainingCycles"]))
gen = b["generatedInvoices"][0]
check("erzeugte Rechnung ist freigegeben", gen["status"] == "approved", gen["status"])

s, b = call("PUT", f"/recurring-invoices/{TPL}", {
    "clientId": KUNDE, "title": "Wartung", "frequency": "monthly",
    "nextRunDate": iso(TODAY - timedelta(days=1)), "generateAs": "draft",
    "remainingCycles": 1,
    "lines": [{"description": "Pauschale", "quantity": 1, "unitPrice": 180, "taxRate": 19}],
})
check("Vorlage aendern auf Entwurf", s == 200 and b["generateAs"] == "draft", f"{s}")

s, b = call("POST", "/recurring-invoices/run")
s, b = call("GET", f"/recurring-invoices/{TPL}")
check("nach letztem Durchlauf beendet", b["status"] == "finished", b["status"])
# Beide Belege koennen dasselbe Rechnungsdatum tragen; die zuletzt erzeugte
# hat die hoechste ID.
neueste = max(b["generatedInvoices"], key=lambda i: i["id"])
check("zuletzt erzeugte Rechnung ist Entwurf", neueste["status"] == "draft", neueste["status"])
check("Liste liefert die neueste zuerst", b["generatedInvoices"][0]["id"] == neueste["id"],
      f"erste war #{b['generatedInvoices'][0]['id']}, neueste #{neueste['id']}")

s, b = call("POST", "/recurring-invoices", {"clientId": KUNDE, "generateAs": "sent", "lines": []})
check("ungueltiges generateAs 400", s == 400, f"war {s}")

# Jahreswechsel und Monatsende
s, jw = call("POST", "/recurring-invoices", {
    "clientId": KUNDE, "title": "Jahreswechsel", "frequency": "monthly",
    "nextRunDate": "2025-12-31", "generateAs": "draft",
    "lines": [{"description": "Pauschale", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("Vorlage über den Jahreswechsel anlegen", s == 201, f"{s}")
termine = []
for _ in range(3):
    call("POST", "/recurring-invoices/run")
    s, t = call("GET", f"/recurring-invoices/{jw['id']}")
    termine.append(t["nextRunDate"][:10])
check("31.12. -> 31.01. (Jahreswechsel)", termine[0] == "2026-01-31", termine[0])
check("31.01. -> 28.02. (Februar wird nicht übersprungen)",
      termine[1] == "2026-02-28", termine[1])
check("28.02. -> 28.03. (kein Zeitzonen-Versatz)", termine[2] == "2026-03-28", termine[2])
s, erzeugt = call("GET", f"/recurring-invoices/{jw['id']}")
erste = min(erzeugt["generatedInvoices"], key=lambda i: i["id"])
check("Beleg trägt das Datum aus dem alten Jahr",
      erste["issueDate"][:10] == "2025-12-31", erste["issueDate"][:10])
call("PUT", f"/recurring-invoices/{jw['id']}", {
    "clientId": KUNDE, "title": "Jahreswechsel", "frequency": "monthly",
    "nextRunDate": "2099-01-01", "status": "paused",
    "lines": [{"description": "Pauschale", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})

s, jahre = call("GET", "/reports/years")
heute_jahr = TODAY.year
check("Jahresliste enthält das laufende Jahr", heute_jahr in jahre, str(jahre))
check("Jahresliste ohne das kommende Jahr", heute_jahr + 1 not in jahre, str(jahre))
check("Jahresliste absteigend sortiert", jahre == sorted(jahre, reverse=True), str(jahre))
s, kommend = call("GET", f"/reports/euer?year={heute_jahr + 1}")
check("EÜR für das kommende Jahr abrufbar", s == 200 and "summen" in kommend, f"{s}")

# Ein Beleg aus einem alten Jahr bringt dieses Jahr in die Liste
s, alt_beleg = call("POST", "/invoices", {"clientId": KUNDE, "issueDate": "2019-05-05",
    "lines": [{"description": "Alt", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
s, jahre2 = call("GET", "/reports/years")
check("Beleg aus 2019 bringt 2019 in die Liste", 2019 in jahre2, str(jahre2))
call("DELETE", f"/invoices/{alt_beleg['id']}")

# Freier Zeitraum
s, frei = call("GET", "/dashboard?period=custom&from=2026-08-01&to=2026-08-31")
check("Übersicht: freier Zeitraum", s == 200 and len(frei["series"]) == 31,
      f'{s} {len(frei.get("series", []))}')
check("Übersicht: Vergleich ist der gleich lange Abschnitt davor",
      frei["period"]["previousLabel"].startswith("01.07."),
      frei["period"]["previousLabel"])
s, lang = call("GET", "/dashboard?period=custom&from=2026-01-01&to=2026-12-31")
check("langer Zeitraum wird monatlich eingeteilt", len(lang["series"]) == 12,
      str(len(lang["series"])))
s, b = call("GET", "/dashboard?period=custom&from=2026-08-01")
check("freier Zeitraum ohne Ende 400", s == 400, f"war {s}")
s, b = call("GET", "/dashboard?period=custom&from=2026-08-31&to=2026-08-01")
check("Ende vor Anfang 400", s == 400, f"war {s}")

s, euerfrei = call("GET", "/reports/euer?from=2026-08-01&to=2026-08-31")
check("EÜR: freier Zeitraum", s == 200 and "summen" in euerfrei, f"{s}")
check("EÜR nennt den Zeitraum", euerfrei.get("zeitraum", "").startswith("01.08."),
      str(euerfrei.get("zeitraum")))
s, b = call("GET", "/reports/euer")
check("EÜR ohne Angabe 400", s == 400, f"war {s}")
s, dk = call("GET", f"/dashboard?period=year&year={heute_jahr + 1}")
check("Übersicht für das kommende Jahr abrufbar",
      s == 200 and dk["period"]["label"] == str(heute_jahr + 1), f"{s}")

# Leistungszeitraum wird je Lauf aus dem Rechnungsdatum abgeleitet
zeile_lz = [{"description": "Wartung", "quantity": 1, "unitPrice": 100, "taxRate": 19}]
faelle = [
    ("issueMonth",    "2026-03-01", "2026-03-01", "2026-03-31"),
    ("previousMonth", "2026-03-01", "2026-02-01", "2026-02-28"),
    ("untilNextRun",  "2026-03-01", "2026-03-01", "2026-03-31"),
]
for art, lauf, von_soll, bis_soll in faelle:
    s, t = call("POST", "/recurring-invoices", {
        "clientId": KUNDE, "title": f"LZ-{art}", "frequency": "monthly",
        "nextRunDate": lauf, "servicePeriod": art, "generateAs": "draft",
        "lines": zeile_lz})
    check(f"Leistungszeitraum {art} wird gespeichert",
          t.get("servicePeriod") == art, str(t.get("servicePeriod")))
    call("POST", "/recurring-invoices/run")
    s, d = call("GET", f"/recurring-invoices/{t['id']}")
    letzte = sorted(d["generatedInvoices"], key=lambda i: i["id"])[-1]
    s, v = call("GET", f"/invoices/{letzte['id']}")
    check(f"{art}: Zeitraum {von_soll} bis {bis_soll}",
          (v.get("serviceDateFrom") or "")[:10] == von_soll
          and (v.get("serviceDateTo") or "")[:10] == bis_soll,
          f'{(v.get("serviceDateFrom") or "-")[:10]} bis {(v.get("serviceDateTo") or "-")[:10]}')
    call("PUT", f"/recurring-invoices/{t['id']}", {
        "clientId": KUNDE, "title": "x", "frequency": "monthly",
        "nextRunDate": "2099-01-01", "status": "paused", "lines": zeile_lz})

s, t = call("POST", "/recurring-invoices", {
    "clientId": KUNDE, "title": "LZ-ohne", "frequency": "monthly",
    "nextRunDate": "2026-03-01", "generateAs": "draft", "lines": zeile_lz})
call("POST", "/recurring-invoices/run")
s, d = call("GET", f"/recurring-invoices/{t['id']}")
s, v = call("GET", f"/invoices/{sorted(d['generatedInvoices'], key=lambda i: i['id'])[-1]['id']}")
check("ohne Angabe bleibt der Zeitraum leer",
      not v.get("serviceDateFrom") and not v.get("serviceDateTo"),
      str(v.get("serviceDateFrom")))
call("PUT", f"/recurring-invoices/{t['id']}", {
    "clientId": KUNDE, "title": "x", "frequency": "monthly",
    "nextRunDate": "2099-01-01", "status": "paused", "lines": zeile_lz})

s, b = call("POST", "/recurring-invoices", {
    "clientId": KUNDE, "title": "x", "frequency": "monthly",
    "nextRunDate": "2026-03-01", "servicePeriod": "quatsch", "lines": zeile_lz})
check("unbekannter Leistungszeitraum 400", s == 400, f"war {s}")

# ───────────────────────── Ausgaben ─────────────────────────
head("Ausgaben")
s, exp = call("POST", "/expenses", {
    "vendor": "Bueromarkt", "category": "Buero", "amount": 100, "taxRate": 19,
    "description": "Papier", "status": "paid",
})
check("Ausgabe anlegen", s == 201, f"{s}")
check("USt 19 / brutto 119", exp["taxAmount"] == 19 and exp["total"] == 119, f"{exp['taxAmount']}/{exp['total']}")
EXP = exp["id"]

s, b = call("GET", "/expenses/categories")
check("Kategorien", s == 200 and "Buero" in b, str(b))

s, b = call("POST", f"/expenses/{EXP}/attachment", files={"attachment": ("beleg.png", png, "image/png")})
check("Beleg anhaengen", s == 200 and b["attachmentPath"], f"{s}")
s, raw = call("GET", f"/expenses/{EXP}/attachment", raw=True)
check("Beleg abrufbar", s == 200 and raw[:8] == png[:8], f"{s}")

s, b = call("PUT", f"/expenses/{EXP}", {"vendor": "Bueromarkt", "amount": 200, "taxRate": 7, "status": "paid"})
check("Ausgabe aendern rechnet neu", b["taxAmount"] == 14 and b["total"] == 214, f"{b['taxAmount']}/{b['total']}")

s, b = call("GET", "/expenses?status=paid")
check("Filter nach Status", all(e["status"] == "paid" for e in b), "Fremdstatus enthalten")

s, rexp = call("POST", "/recurring-expenses", {
    "vendor": "Hoster", "category": "Hosting", "amount": 49.9, "taxRate": 19,
    "frequency": "monthly", "nextRunDate": iso(TODAY - timedelta(days=1)),
})
check("wiederkehrende Ausgabe anlegen", s == 201, f"{s}")
s, b = call("POST", "/recurring-invoices/run")
check("Lauf erzeugt Ausgabe", b["expensesCreated"] >= 1, str(b["expensesCreated"]))

# ───────────────────────── Dashboard ─────────────────────────
head("Uebersicht")
s, dash = call("GET", "/dashboard")
check("Dashboard erreichbar", s == 200, f"{s}")
for key in ("outstanding", "kpis", "series", "period", "openQuoteCount", "recentInvoices"):
    check(f"Feld {key} vorhanden", key in dash, "fehlt")
check("Standardzeitraum ist der Monat", dash["period"]["kind"] == "month", dash["period"]["kind"])

# Zeitraeume und Randfaelle
s, jahr = call("GET", "/dashboard?period=year&year=2026")
check("Jahresansicht: 12 Punkte", s == 200 and len(jahr["series"]) == 12, str(len(jahr["series"])))
check("Jahresansicht vergleicht mit dem Vorjahr", jahr["period"]["previousLabel"] == "2025",
      jahr["period"]["previousLabel"])
check("Verlaufssumme deckt sich mit der Kennzahl",
      round(sum(p["invoiced"] for p in jahr["series"]), 2) == jahr["kpis"]["invoiced"]["value"],
      f'{sum(p["invoiced"] for p in jahr["series"])} vs {jahr["kpis"]["invoiced"]["value"]}')
check("Ueberschuss = Zahlungen minus Ausgaben",
      round(jahr["kpis"]["payments"]["value"] - jahr["kpis"]["expenses"]["value"], 2)
      == jahr["kpis"]["result"]["value"], str(jahr["kpis"]["result"]["value"]))

s, jan = call("GET", "/dashboard?period=month&year=2026&month=1")
check("Januar vergleicht mit Dezember des Vorjahres",
      jan["period"]["previousLabel"] == "Dezember 2025", jan["period"]["previousLabel"])
check("Januar hat 31 Tagespunkte", len(jan["series"]) == 31, str(len(jan["series"])))

s, feb = call("GET", "/dashboard?period=month&year=2028&month=2")
check("Schaltjahr: Februar hat 29 Tage", len(feb["series"]) == 29, str(len(feb["series"])))
check("Zeitraumende passt", feb["period"]["to"] == "2028-02-29", feb["period"]["to"])

s, leer = call("GET", "/dashboard?period=year&year=1999")
check("Zeitraum ohne Daten liefert Nullen",
      leer["kpis"]["invoiced"]["value"] == 0 and leer["kpis"]["invoiced"]["changePct"] is None,
      str(leer["kpis"]["invoiced"]))

s, b = call("GET", "/dashboard?period=quartal")
check("ungueltiger Zeitraum 400", s == 400, f"war {s}")
s, b = call("GET", "/dashboard?period=month&month=13")
check("Monat 13 abgelehnt", s == 400, f"war {s}")

# ───────────────────────── API-Token ─────────────────────────
head("API-Token")
s, tok = call("POST", "/tokens", {"label": "Testtoken"})
check("Token anlegen", s == 201 and tok["token"].startswith("ilt_"), f"{s}")
TOKEN = tok["token"]
TOKID = tok["id"]

s, b = call("POST", "/tokens", {"label": ""})
check("Token ohne Bezeichnung 400", s == 400, f"war {s}")

# Ab hier ohne Cookie arbeiten
jar.clear()
s, b = call("GET", "/invoices", token=TOKEN)
check("Token: Rechnungen lesen", s == 200, f"{s}")
s, b = call("GET", "/clients", token=TOKEN)
check("Token: Kunden lesen", s == 200, f"{s}")
s, raw = call("GET", f"/invoices/{INV}/pdf", token=TOKEN, raw=True)
check("Token: PDF ziehen", s == 200 and raw[:4] == b"%PDF", f"{s}")
s, b = call("POST", f"/invoices/{dup['id']}/status", {"status": "approved"}, token=TOKEN)
check("Token: Status setzen", s == 200 and b["status"] == "approved", f"{s}")
s, b = call("GET", "/tokens", token=TOKEN)
check("Token darf Tokens nicht verwalten (403)", s == 403, f"war {s}")
s, b = call("GET", "/invoices", token="ilt_falsch")
check("falsches Token 401", s == 401, f"war {s}")
s, b = call("GET", "/invoices")
check("ohne Token und Cookie 401", s == 401, f"war {s}")

# Wieder anmelden und Token widerrufen
call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
s, b = call("GET", "/tokens")
check("lastUsedAt wurde gesetzt", b[0]["lastUsedAt"] is not None, "leer")
s, b = call("DELETE", f"/tokens/{TOKID}")
check("Token widerrufen", s == 200, f"{s}")
s, b = call("GET", "/invoices", token=TOKEN)
check("widerrufenes Token 401", s == 401, f"war {s}")

# ───────────────────────── Loeschen und Archivieren ─────────────────────────
head("Loeschen und Archivieren")
s, b = call("DELETE", f"/clients/{KUNDE}")
check("Kunde mit Belegen wird archiviert", s == 200 and b.get("archived") is True, str(b))
s, b = call("DELETE", f"/clients/{KUNDE2}")
check("Kunde ohne Belege wird geloescht", s == 200 and b.get("deleted") is True, str(b))
s, b = call("GET", f"/clients/{KUNDE2}")
check("geloeschter Kunde 404", s == 404, f"war {s}")

# dup wurde im Token-Abschnitt freigegeben und ist damit festgeschrieben.
s, b = call("DELETE", f"/invoices/{dup['id']}")
check("freigegebene Rechnung bleibt geschuetzt", s == 409, f"war {s}")

s, weg = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "wegwerf", "quantity": 1, "unitPrice": 5, "taxRate": 0}]})
s, b = call("DELETE", f"/invoices/{weg['id']}")
check("Entwurf loeschen", s == 200, f"{s}")
s, b = call("GET", f"/invoices/{weg['id']}")
check("geloeschter Entwurf 404", s == 404, f"war {s}")

s, b = call("DELETE", f"/expenses/{EXP}")
check("Ausgabe loeschen", s == 200, f"{s}")

# ───────────────────────── Festschreibung (GoBD) ─────────────────────────
head("Festschreibung und Nummernkreis")
s, gsp = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "Sperrtest", "quantity": 1, "unitPrice": 500, "taxRate": 0}]})
GESPERRT = gsp["id"]
nummer_vorher = gsp["number"]

s, b = call("PUT", f"/invoices/{GESPERRT}", {"clientId": KUNDE, "notes": "im Entwurf",
    "lines": [{"description": "geändert", "quantity": 2, "unitPrice": 500, "taxRate": 0}]})
check("Entwurf ist änderbar", s == 200 and b["total"] == 1000, str(b.get("total")))

call("POST", f"/invoices/{GESPERRT}/status", {"status": "approved"})
s, b = call("PUT", f"/invoices/{GESPERRT}", {"clientId": KUNDE, "notes": "Nachtrag",
    "lines": [{"description": "darf nicht durchgehen", "quantity": 9, "unitPrice": 999, "taxRate": 0}]})
check("freigegeben: Positionen bleiben unverändert", b["total"] == 1000, str(b["total"]))
check("freigegeben: Notiz wird übernommen", b["notes"] == "Nachtrag", b["notes"])

s, b = call("DELETE", f"/invoices/{GESPERRT}")
check("freigegebener Beleg lässt sich nicht löschen", s == 409, f"war {s}")

call("POST", f"/invoices/{GESPERRT}/status", {"status": "sent"})
s, b = call("DELETE", f"/invoices/{GESPERRT}")
check("versendeter Beleg lässt sich nicht löschen", s == 409, f"war {s}")

s, b = call("GET", f"/invoices/{GESPERRT}")
check("Beleg ist noch da", s == 200 and b["number"] == nummer_vorher, f"{s}")

# Entwurf löschen darf keine Lücke hinterlassen
s, e1 = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "Entwurf", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
nummer_entwurf = e1["number"]
s, b = call("DELETE", f"/invoices/{e1['id']}")
check("Entwurf lässt sich löschen", s == 200, f"war {s}")
s, e2 = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "danach", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("Nummer wird nach dem Löschen erneut vergeben – keine Lücke",
      e2["number"] == nummer_entwurf, f"{nummer_entwurf} gelöscht, danach {e2['number']}")
call("DELETE", f"/invoices/{e2['id']}")

# ───────────────────────── EÜR ─────────────────────────
head("Einnahmen-Überschuss-Rechnung")
s, euer = call("GET", f"/reports/euer?year={TODAY.year}")
check("EÜR erreichbar", s == 200, f"{s}")
for key in ("einnahmen", "ausgaben", "ausgabenJeKategorie", "summen"):
    check(f"Feld {key} vorhanden", key in euer, "fehlt")
check("Einnahmen sind einzeln aufgeführt",
      isinstance(euer["einnahmen"], list), "keine Liste")
check("Summe der Einnahmen passt zur Liste",
      round(sum(e["amount"] for e in euer["einnahmen"]), 2) == euer["summen"]["einnahmen"],
      f'{sum(e["amount"] for e in euer["einnahmen"])} vs {euer["summen"]["einnahmen"]}')
check("Summe der Ausgaben passt zur Liste",
      round(sum(a["gross"] for a in euer["ausgaben"]), 2) == euer["summen"]["ausgabenBrutto"],
      str(euer["summen"]["ausgabenBrutto"]))
brutto_oder_netto = (euer["summen"]["ausgabenBrutto"] if euer["kleinunternehmer"]
                     else euer["summen"]["ausgabenNetto"])
check("Überschuss = Einnahmen minus Betriebsausgaben",
      round(euer["summen"]["einnahmen"] - brutto_oder_netto, 2) == euer["summen"]["ueberschuss"],
      str(euer["summen"]["ueberschuss"]))
s, raw = call("GET", f"/reports/euer.csv?year={TODAY.year}", raw=True)
csvtext = raw.decode("utf-8-sig")
check("EÜR als CSV", s == 200 and "EINNAHMEN" in csvtext and "AUSGABEN" in csvtext, f"{s}")
s, b = call("GET", "/reports/euer")
check("EÜR ohne Jahr 400", s == 400, f"war {s}")

# ───────────────────────── Sicherung ─────────────────────────
head("Sicherung")
s, raw = call("GET", "/backup", raw=True)
check("ZIP wird geliefert", s == 200 and raw[:2] == b"PK", f"{s} {raw[:4]!r}")
check("Sicherung ist nicht leer", len(raw) > 2000, f"{len(raw)} B")
import io as _io, zipfile as _zip
zf = _zip.ZipFile(_io.BytesIO(raw))
namen = zf.namelist()
check("Datenbank enthalten", "invoicelite.db" in namen, str(namen[:5]))
check("Hinweisdatei enthalten", "LIESMICH.txt" in namen, str(namen[:5]))
check("Sitzungsgeheimnis NICHT enthalten",
      not any(".jwt-secret" in n for n in namen), str(namen))
check("Datenbank im ZIP ist eine SQLite-Datei",
      zf.read("invoicelite.db")[:15] == b"SQLite format 3", "kein SQLite-Kopf")

# ───────────────────────── Mailversand ─────────────────────────
head("Mailversand")
s, b = call("GET", "/settings")
check("SMTP-Felder vorhanden", "smtpHost" in b and "mailSendTime" in b, "fehlen")
check("Passwort wird nie zurückgeliefert", "smtpPasswordEnc" not in b, "im Klartext dabei!")
check("Nur der Merker kommt zurück", "smtpPasswordSet" in b, "fehlt")

cfg_mail = {k: v for k, v in b.items() if k not in ("id", "logoPath", "smtpPasswordSet")}
s, b = call("PUT", "/settings", {**cfg_mail, "mailSendTime": "25:00"})
check("unmögliche Uhrzeit 400", s == 400, f"war {s}")
s, b = call("PUT", "/settings", {**cfg_mail, "mailAttachment": "docx"})
check("unbekannte Anhangsart 400", s == 400, f"war {s}")
s, b = call("PUT", "/settings", {**cfg_mail, "smtpPort": 0})
check("Port 0 abgelehnt", s == 400, f"war {s}")

s, b = call("PUT", "/settings", {**cfg_mail, "smtpPassword": "geheim123",
                                 "smtpHost": "localhost", "mailSendTime": "07:30"})
check("SMTP-Angaben speichern", s == 200 and b["mailSendTime"] == "07:30", f"{s}")
check("Merker steht nach dem Speichern", b.get("smtpPasswordSet") is True, str(b.get("smtpPasswordSet")))
check("Passwort auch in der Antwort verborgen", "smtpPasswordEnc" not in b, "dabei!")

s, b = call("PUT", "/settings", {**cfg_mail, "smtpHost": "localhost"})
check("leeres Passwortfeld lässt das hinterlegte stehen",
      b.get("smtpPasswordSet") is True, "wurde verworfen")

s, b = call("DELETE", "/settings/smtp-password")
check("Passwort entfernen", s == 200 and b.get("smtpPasswordSet") is False, str(b.get("smtpPasswordSet")))

s, b = call("POST", "/mail/test", {"to": "keine-adresse"})
check("ungültige Testadresse 400", s == 400, f"war {s}")

check("Angebotsmail-Felder vorhanden",
      "quoteMailSubject" in cfg_mail and "quoteMailBodyHtml" in cfg_mail, "fehlen")
check("IMAP-Felder vorhanden",
      "imapHost" in cfg_mail and "imapSentFolder" in cfg_mail, "fehlen")
check("IMAP-Passwort wird nie zurückgeliefert",
      "imapPasswordEnc" not in cfg_mail, "im Klartext dabei!")
check("Nur der IMAP-Merker kommt zurück", "imapPasswordSet" in cfg_mail, "fehlt")

s, b = call("PUT", "/settings", {**cfg_mail, "imapPort": 0})
check("IMAP-Port 0 abgelehnt", s == 400, f"war {s}")
s, b = call("PUT", "/settings", {**cfg_mail, "imapPassword": "geheim123",
                                 "imapHost": "localhost"})
check("IMAP-Angaben speichern", s == 200 and b.get("imapPasswordSet") is True,
      str(b.get("imapPasswordSet")))
s, b = call("PUT", "/settings", {**cfg_mail, "imapHost": "localhost"})
check("leeres IMAP-Passwortfeld lässt das hinterlegte stehen",
      b.get("imapPasswordSet") is True, "wurde verworfen")
s, b = call("DELETE", "/settings/imap-password")
check("IMAP-Passwort entfernen", s == 200 and b.get("imapPasswordSet") is False,
      str(b.get("imapPasswordSet")))

# Angebotsversand
s, qmail = call("POST", "/quotes", {"clientId": KUNDE,
    "lines": [{"description": "Beratung", "quantity": 1, "unitPrice": 100, "taxRate": 0}]})
s, b = call("POST", f"/quotes/{qmail['id']}/send")
check("Angebotsversand meldet fehlende Einstellungen verständlich",
      s == 400 and "Einstellung" in str(b.get("error", "")), f"{s} {b}")
s, b = call("POST", "/quotes/999999/send")
check("Versand unbekanntes Angebot 404", s == 404, f"war {s}")

s, b = call("POST", "/mail/run")
check("Versandlauf erreichbar", s == 200 and "gesendet" in b, f"{s}")

# Versand braucht einen Zeitstempel der Freigabe
s, mv = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "Mailtest", "quantity": 1, "unitPrice": 42, "taxRate": 0}]})
s, b = call("POST", f"/invoices/{mv['id']}/status", {"status": "approved"})
check("Freigabe hält den Zeitpunkt fest", b.get("approvedAt") is not None, str(b.get("approvedAt")))
s, b = call("POST", f"/invoices/{mv['id']}/status", {"status": "sent"})
check("Versand hält sentAt fest", b.get("sentAt") is not None, str(b.get("sentAt")))

# ───────────────────────── Wechsel der Besteuerung ─────────────────────────
head("Wechsel der Besteuerung")

def einstellen(**aend):
    s, akt = call("GET", "/settings")
    akt = {k: v for k, v in akt.items()
           if k not in ("id", "logoPath", "smtpPasswordSet", "imapPasswordSet")}
    akt.update(aend)
    return call("PUT", "/settings", akt)

einstellen(taxRegime="small_business")
zeile = [{"description": "Leistung", "quantity": 10, "unitPrice": 100, "taxRate": 19}]
s, q19 = call("POST", "/quotes", {"clientId": KUNDE, "lines": zeile})
s, r19 = call("POST", "/invoices", {"clientId": KUNDE, "lines": zeile})
check("Angebot hält die Besteuerung fest", q19.get("taxRegime") == "small_business",
      str(q19.get("taxRegime")))
check("§ 19: Angebot ohne USt", q19["taxTotal"] == 0 and q19["total"] == 1000,
      f'{q19["taxTotal"]}/{q19["total"]}')
check("§ 19: Rechnung ohne USt", r19["taxTotal"] == 0 and r19["total"] == 1000,
      f'{r19["taxTotal"]}/{r19["total"]}')

einstellen(taxRegime="standard")
s, q19b = call("GET", f"/quotes/{q19['id']}")
s, r19b = call("GET", f"/invoices/{r19['id']}")
check("altes Angebot bleibt nach dem Wechsel unverändert",
      q19b["total"] == 1000 and q19b["taxRegime"] == "small_business",
      f'{q19b["total"]}/{q19b["taxRegime"]}')
check("alte Rechnung bleibt nach dem Wechsel unverändert",
      r19b["total"] == 1000 and r19b["taxRegime"] == "small_business",
      f'{r19b["total"]}/{r19b["taxRegime"]}')

s, qneu = call("POST", "/quotes", {"clientId": KUNDE, "lines": zeile})
s, rneu = call("POST", "/invoices", {"clientId": KUNDE, "lines": zeile})
check("neues Angebot mit USt", qneu["taxTotal"] == 190 and qneu["total"] == 1190,
      f'{qneu["taxTotal"]}/{qneu["total"]}')
check("neue Rechnung mit USt", rneu["taxTotal"] == 190 and rneu["total"] == 1190,
      f'{rneu["taxTotal"]}/{rneu["total"]}')
s, b = call("POST", "/quotes", {"clientId": KUNDE, "taxRegime": "quatsch", "lines": []})
check("ungültige Besteuerung im Angebot 400", s == 400, f"war {s}")
einstellen(taxRegime="small_business")

# Oeffentlicher Endpunkt fuer die Anmeldeseite
jar.clear()
s, marke = call("GET", "/branding")
check("Name ohne Anmeldung abrufbar", s == 200 and "appName" in marke, f"{s}")
check("Der Endpunkt verrät sonst nichts", set(marke.keys()) == {"appName"}, str(marke.keys()))
call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})

s, b = call("GET", "/settings")
check("Anwendungsname vorhanden", "appName" in b, "fehlt")
check("Akzentfarbe der Oberfläche vorhanden", "uiAccentColor" in b, "fehlt")
s, b = einstellen(uiAccentColor="rot")
check("ungültige Akzentfarbe 400", s == 400, f"war {s}")
s, b = einstellen(uiAccentColor="#3366cc")
check("gültige Akzentfarbe speichern", s == 200 and b["uiAccentColor"] == "#3366cc",
      str(b.get("uiAccentColor")))

# ───────────────────────── Nebenläufigkeit und Nummernkreis ─────────────────────────
head("Nummernkreis")
s, vorher = call("GET", "/settings")
stand = vorher["invoiceNumberNext"]
s, b = call("POST", "/invoices", {"clientId": 999999,
    "lines": [{"description": "X", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("Anlegen mit unbekanntem Kunden scheitert", s in (400, 404), f"war {s}")
s, nachher = call("GET", "/settings")
check("Fehlschlag verbraucht keine Nummer",
      nachher["invoiceNumberNext"] == stand,
      f'{stand} -> {nachher["invoiceNumberNext"]}')

s, direkt = call("POST", "/invoices", {"clientId": KUNDE, "status": "approved",
    "lines": [{"description": "Direkt freigegeben", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("direkt freigegeben setzt den Zeitpunkt",
      direkt.get("approvedAt") is not None, str(direkt.get("approvedAt")))
s, direkt2 = call("POST", "/invoices", {"clientId": KUNDE, "status": "sent",
    "lines": [{"description": "Direkt versendet", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
check("direkt versendet setzt sentAt",
      direkt2.get("sentAt") is not None, str(direkt2.get("sentAt")))

s, entwurf = call("POST", "/invoices", {"clientId": KUNDE,
    "lines": [{"description": "Entwurf", "quantity": 1, "unitPrice": 10, "taxRate": 0}]})
s, b = call("POST", f"/invoices/{entwurf['id']}/send")
check("Entwurf lässt sich nicht per Mail versenden", s == 409, f"war {s}")

# ───────────────────────── Konto ─────────────────────────
head("Konto")
s, b = call("POST", "/auth/change-password", {"currentPassword": "falsch", "newPassword": "neuespasswort1"})
check("falsches aktuelles Passwort 400", s == 400, f"war {s}")
s, b = call("POST", "/auth/change-password", {"currentPassword": PASSWORD, "newPassword": "kurz"})
check("zu kurzes Passwort 400", s == 400, f"war {s}")
s, b = call("POST", "/auth/change-password", {"currentPassword": PASSWORD, "newPassword": "neuespasswort1"})
check("Passwort aendern", s == 200, f"{s}")
jar.clear()
s, b = call("POST", "/auth/login", {"email": EMAIL, "password": "neuespasswort1"})
check("Anmeldung mit neuem Passwort", s == 200, f"{s}")
s, b = call("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
check("altes Passwort gilt nicht mehr", s == 401, f"war {s}")

call("POST", "/auth/login", {"email": EMAIL, "password": "neuespasswort1"})
s, b = call("PUT", "/auth/profile", {"email": "neu@example.com", "name": "Neuer Name"})
check("Profil aendern", s == 200 and b["email"] == "neu@example.com", f"{s}")

s, b = call("POST", "/auth/logout")
check("Abmelden", s == 200, f"{s}")
s, b = call("GET", "/auth/me")
check("nach Abmelden 401", s == 401, f"war {s}")

# ───────────────────────── Ergebnis ─────────────────────────
print("\n" + "=" * 62)
print(f"  {passed} bestanden, {failed} fehlgeschlagen")
if failures:
    print("\n  Fehlgeschlagen:")
    for f in failures:
        print(f"   - {f}")
print("=" * 62)
sys.exit(1 if failed else 0)
