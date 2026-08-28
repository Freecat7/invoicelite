#!/usr/bin/env bash
#
# Legt Demodaten an: eine Firma, ein Angebot, eine Rechnung und eine
# wiederkehrende Rechnung. Gedacht zum Ausprobieren und zum Testen des
# Versands.
#
#   ./scripts/demo-data.sh                      # gegen http://localhost:8080
#   BASE=http://host:8080 ./scripts/demo-data.sh
#
# Anmeldung entweder per API-Token oder per E-Mail/Passwort:
#   TOKEN=ilt_...            ./scripts/demo-data.sh
#   EMAIL=... PASSWORD=...   ./scripts/demo-data.sh
#
# Aufräumen: ./scripts/demo-data.sh --remove
#
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"
API="$BASE/api"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

DEMO_CLIENT="Demofirma GmbH"

# Ruft die API auf - mit Token als Header, sonst mit Sitzungs-Cookie.
call() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "$API$path")
  if [ -n "${TOKEN:-}" ]; then
    args+=(-H "Authorization: Bearer $TOKEN")
  else
    args+=(-b "$JAR")
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  curl "${args[@]}"
}

login() {
  [ -n "${TOKEN:-}" ] && return 0
  local email="${EMAIL:-}" password="${PASSWORD:-}"
  if [ -z "$email" ] || [ -z "$password" ]; then
    echo "Bitte TOKEN oder EMAIL und PASSWORD setzen." >&2
    exit 1
  fi
  curl -sS -c "$JAR" -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" >/dev/null
}

# Liest ein Feld aus einer JSON-Antwort.
field() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }

today() { date +%F; }
plus_days() { date -d "+$1 days" +%F; }
first_of_next_month() { date -d "$(date +%Y-%m-01) +1 month" +%F; }

remove_demo() {
  login
  local ids
  ids=$(call GET "/clients?search=$(printf %s "$DEMO_CLIENT" | sed 's/ /%20/g')" \
        | python3 -c "import json,sys; print(' '.join(str(c['id']) for c in json.load(sys.stdin)))")
  if [ -z "$ids" ]; then
    echo "Keine Demodaten gefunden."
    return 0
  fi
  for cid in $ids; do
    # Belege des Kunden zuerst entfernen, dann den Kunden selbst.
    for inv in $(call GET "/invoices?clientId=$cid" \
                 | python3 -c "import json,sys; print(' '.join(str(i['id']) for i in json.load(sys.stdin)))"); do
      call DELETE "/invoices/$inv" >/dev/null
    done
    for q in $(call GET "/quotes?clientId=$cid" \
               | python3 -c "import json,sys; print(' '.join(str(i['id']) for i in json.load(sys.stdin)))"); do
      call DELETE "/quotes/$q" >/dev/null
    done
    for r in $(call GET "/recurring-invoices" \
               | python3 -c "import json,sys,os; print(' '.join(str(t['id']) for t in json.load(sys.stdin) if t['clientId']==$cid))"); do
      call DELETE "/recurring-invoices/$r" >/dev/null
    done
    call DELETE "/clients/$cid" >/dev/null
    echo "Kunde #$cid samt Belegen entfernt."
  done
}

if [ "${1:-}" = "--remove" ]; then
  remove_demo
  exit 0
fi

login

echo "Lege Demodaten an…"

CLIENT_ID=$(call POST /clients "$(cat <<JSON
{
  "name": "$DEMO_CLIENT",
  "contactName": "Frau Demo",
  "email": "buchhaltung@demofirma.example",
  "phone": "0211 1234567",
  "addressLine": "Demoallee 7",
  "postalCode": "40213",
  "city": "Düsseldorf",
  "country": "DE",
  "notes": "Beispielkunde zum Ausprobieren."
}
JSON
)" | field id)
echo "  Kunde:   #$CLIENT_ID  $DEMO_CLIENT"

QUOTE_ID=$(call POST /quotes "$(cat <<JSON
{
  "clientId": $CLIENT_ID,
  "issueDate": "$(today)",
  "validUntil": "$(plus_days 30)",
  "status": "sent",
  "lines": [
    {"description":"Analyse der bestehenden IT-Umgebung","quantity":6,"unit":"Std.","unitPrice":85,"taxRate":0},
    {"description":"Konzept und Angebotserstellung","quantity":1,"unit":"Pauschal","unitPrice":250,"taxRate":0}
  ]
}
JSON
)" | field number)
echo "  Angebot: $QUOTE_ID (versendet)"

# Die Rechnung wird direkt freigegeben, damit ein Versand-Workflow sie findet.
INVOICE_ID=$(call POST /invoices "$(cat <<JSON
{
  "clientId": $CLIENT_ID,
  "issueDate": "$(today)",
  "serviceDateFrom": "$(date -d "$(date +%Y-%m-01)" +%F)",
  "serviceDateTo": "$(today)",
  "status": "approved",
  "lines": [
    {"description":"IT-Betreuung laufender Monat","quantity":8,"unit":"Std.","unitPrice":85,"taxRate":0},
    {"description":"Einrichtung Backup-System","quantity":1,"unit":"Pauschal","unitPrice":240,"taxRate":0}
  ]
}
JSON
)" | field number)
echo "  Rechnung: $INVOICE_ID (freigegeben)"

call POST /recurring-invoices "$(cat <<JSON
{
  "clientId": $CLIENT_ID,
  "title": "Wartungspauschale monatlich",
  "frequency": "monthly",
  "nextRunDate": "$(first_of_next_month)",
  "paymentTermDays": 14,
  "generateAs": "approved",
  "lines": [
    {"description":"Wartungspauschale","quantity":1,"unit":"Pauschal","unitPrice":180,"taxRate":0}
  ]
}
JSON
)" >/dev/null
echo "  Vorlage:  Wartungspauschale monatlich (erzeugt freigegebene Rechnungen)"

echo
echo "Fertig. Freigegebene Rechnungen abrufen:"
echo "  curl -H \"Authorization: Bearer \$TOKEN\" '$API/invoices?status=approved'"
echo "Entfernen mit: $0 --remove"
