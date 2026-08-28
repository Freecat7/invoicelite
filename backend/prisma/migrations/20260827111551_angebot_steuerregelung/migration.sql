-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "sentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxRegime" TEXT NOT NULL DEFAULT 'standard',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "convertedInvoiceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("clientId", "convertedInvoiceId", "createdAt", "currency", "discountType", "discountValue", "footer", "id", "issueDate", "notes", "number", "sentAt", "status", "subtotal", "taxTotal", "terms", "total", "updatedAt", "validUntil") SELECT "clientId", "convertedInvoiceId", "createdAt", "currency", "discountType", "discountValue", "footer", "id", "issueDate", "notes", "number", "sentAt", "status", "subtotal", "taxTotal", "terms", "total", "updatedAt", "validUntil" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Bestehende Angebote wurden bisher mit der Regelung aus den Einstellungen
-- gerendert. Damit sich ihr Aussehen durch diese Migration nicht aendert,
-- wird genau dieser Wert festgeschrieben.
UPDATE "Quote"
   SET "taxRegime" = COALESCE(
         (SELECT "taxRegime" FROM "CompanySettings" WHERE "id" = 1),
         'standard');
