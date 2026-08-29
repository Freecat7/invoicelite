#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads" 2>/dev/null || true

# SQLite legt Journal- und WAL-Dateien NEBEN der Datenbank an, braucht also
# Schreibrecht auf das Verzeichnis selbst - nicht nur auf die Datei.
#
# Wurde ein Datenstand als root ins Volume entpackt, gehoert das
# Verzeichnis root, waehrend die Anwendung als "node" laeuft. Lesen
# funktioniert dann, Schreiben nicht: die Anmeldung geht, das Anlegen eines
# Belegs scheitert. Diesen Fall lieber hier laut melden als den Anwender
# spaeter raten lassen.
if ! touch "$DATA_DIR/.schreibprobe" 2>/dev/null; then
  echo "" >&2
  echo "FEHLER: In $DATA_DIR kann nicht geschrieben werden." >&2
  echo "" >&2
  echo "  Die Anwendung laeuft als $(id -un) (uid $(id -u))," >&2
  echo "  das Verzeichnis gehoert:" >&2
  ls -ld "$DATA_DIR" | sed 's/^/    /' >&2
  echo "" >&2
  echo "  Das passiert typischerweise, wenn eine Sicherung als root ins" >&2
  echo "  Volume entpackt wurde. Zu beheben mit:" >&2
  echo "" >&2
  echo "    docker run --rm -v <volume>:/data alpine chown -R $(id -u):$(id -g) /data" >&2
  echo "" >&2
  exit 1
fi
rm -f "$DATA_DIR/.schreibprobe"

# SQLite-Datei liegt im Volume, damit sie Container-Neustarts ueberlebt.
#
# connection_limit=1: SQLite serialisiert Schreibvorgaenge ohnehin auf
# Dateiebene. Mit mehreren Verbindungen kaempfen sie um dieselbe Sperre und
# laufen in einen Zeitfehler - bei zehn gleichzeitigen Anlagen scheiterten
# so sechs. Eine Verbindung reiht sie stattdessen auf.
export DATABASE_URL="${DATABASE_URL:-file:${DATA_DIR}/invoicelite.db?connection_limit=1&socket_timeout=20}"

# Prisma meldet sich sonst bei jedem Start an checkpoint.prisma.io, um nach
# Aktualisierungen zu sehen. Eine Rechnungssoftware auf dem eigenen Server
# soll nicht nach draussen funken.
export CHECKPOINT_DISABLE=1

echo "invoicelite: wende Datenbank-Migrationen an…"
# Direkt die mitgelieferte Datei aufrufen statt ueber npx - npx fragt sonst
# die npm-Registry, obwohl das Paket schon im Abbild liegt.
node node_modules/prisma/build/index.js migrate deploy

exec "$@"
