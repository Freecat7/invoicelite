# invoicelite - alles in einem Container:
# Express liefert API und gebautes React-Frontend ueber denselben Port aus,
# SQLite liegt als Datei im Volume, Chromium erzeugt die PDFs.

# ---------- 1. Frontend bauen ----------
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2. Backend bauen ----------
FROM node:22-bookworm-slim AS backend-build
# Prisma benoetigt OpenSSL fuer seine Query-Engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY backend/ ./
RUN npm run build

# Produktionsabhaengigkeiten separat installieren, damit die Runtime-Stage
# keine Dev-Pakete mitschleppt.
RUN npm prune --omit=dev && npx prisma generate

# ---------- 3. Laufzeit ----------
FROM node:22-bookworm-slim AS runtime

# Chromium fuer die PDF-Erzeugung plus Schriften fuer korrekte Umlaute.
# PUPPETEER_SKIP_DOWNLOAD verhindert, dass puppeteer ein zweites Chromium laedt.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    TZ=Europe/Berlin

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      openssl \
      ca-certificates \
      fonts-dejavu-core \
      fonts-liberation \
      tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Die Besitzrechte werden direkt beim Kopieren gesetzt. Ein nachtraegliches
# "chown -R" wuerde jede Datei erneut in einen Layer schreiben und das Image
# um die volle Groesse von node_modules aufblaehen.
COPY --from=backend-build --chown=node:node /build/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /build/dist ./dist
COPY --from=backend-build --chown=node:node /build/prisma ./prisma
COPY --from=backend-build --chown=node:node /build/package.json ./package.json

# Gebautes Frontend dorthin, wo Express es erwartet (config.publicDir).
COPY --from=frontend-build --chown=node:node /build/dist ./public

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data && chown node:node /data

# Chromium laeuft ohne Sandbox stabiler im Container; dafuer laeuft der
# Prozess selbst unprivilegiert.
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
