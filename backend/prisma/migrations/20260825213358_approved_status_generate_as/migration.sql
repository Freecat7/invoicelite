-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecurringInvoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "nextRunDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "remainingCycles" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "taxRegime" TEXT NOT NULL DEFAULT 'standard',
    "generateAs" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecurringInvoice" ("clientId", "createdAt", "currency", "discountType", "discountValue", "endDate", "footer", "frequency", "id", "lastRunAt", "nextRunDate", "notes", "paymentTermDays", "remainingCycles", "status", "taxRegime", "terms", "title", "updatedAt") SELECT "clientId", "createdAt", "currency", "discountType", "discountValue", "endDate", "footer", "frequency", "id", "lastRunAt", "nextRunDate", "notes", "paymentTermDays", "remainingCycles", "status", "taxRegime", "terms", "title", "updatedAt" FROM "RecurringInvoice";
DROP TABLE "RecurringInvoice";
ALTER TABLE "new_RecurringInvoice" RENAME TO "RecurringInvoice";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Der Status "viewed" entfaellt. Bestehende Belege gelten als versendet,
-- da sie den Kunden bereits erreicht hatten.
UPDATE "Invoice" SET "status" = 'sent' WHERE "status" = 'viewed';
