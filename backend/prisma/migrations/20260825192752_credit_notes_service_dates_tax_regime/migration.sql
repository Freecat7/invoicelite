-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "sentAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CompanySettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "vatId" TEXT NOT NULL DEFAULT '',
    "taxNumber" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "bic" TEXT NOT NULL DEFAULT '',
    "accountHolder" TEXT NOT NULL DEFAULT '',
    "invoiceNumberPrefix" TEXT NOT NULL DEFAULT 'RE-',
    "invoiceNumberNext" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumberPadding" INTEGER NOT NULL DEFAULT 4,
    "quoteNumberPrefix" TEXT NOT NULL DEFAULT 'AN-',
    "quoteNumberNext" INTEGER NOT NULL DEFAULT 1,
    "quoteNumberPadding" INTEGER NOT NULL DEFAULT 4,
    "creditNumberPrefix" TEXT NOT NULL DEFAULT 'GS-',
    "creditNumberNext" INTEGER NOT NULL DEFAULT 1,
    "creditNumberPadding" INTEGER NOT NULL DEFAULT 4,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "locale" TEXT NOT NULL DEFAULT 'de-DE',
    "defaultTaxRate" REAL NOT NULL DEFAULT 19,
    "taxRegime" TEXT NOT NULL DEFAULT 'standard',
    "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "defaultTerms" TEXT NOT NULL DEFAULT '',
    "defaultFooter" TEXT NOT NULL DEFAULT '',
    "defaultNotes" TEXT NOT NULL DEFAULT '',
    "eInvoiceFormat" TEXT NOT NULL DEFAULT 'off',
    "buyerReference" TEXT NOT NULL DEFAULT '',
    "showEpcQr" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CompanySettings" ("accountHolder", "addressLine", "bankName", "bic", "buyerReference", "city", "companyName", "country", "currency", "defaultFooter", "defaultNotes", "defaultTaxRate", "defaultTerms", "eInvoiceFormat", "email", "iban", "id", "invoiceNumberNext", "invoiceNumberPadding", "invoiceNumberPrefix", "locale", "logoPath", "paymentTermDays", "phone", "postalCode", "quoteNumberNext", "quoteNumberPadding", "quoteNumberPrefix", "showEpcQr", "taxNumber", "updatedAt", "vatId", "website") SELECT "accountHolder", "addressLine", "bankName", "bic", "buyerReference", "city", "companyName", "country", "currency", "defaultFooter", "defaultNotes", "defaultTaxRate", "defaultTerms", "eInvoiceFormat", "email", "iban", "id", "invoiceNumberNext", "invoiceNumberPadding", "invoiceNumberPrefix", "locale", "logoPath", "paymentTermDays", "phone", "postalCode", "quoteNumberNext", "quoteNumberPadding", "quoteNumberPrefix", "showEpcQr", "taxNumber", "updatedAt", "vatId", "website" FROM "CompanySettings";
DROP TABLE "CompanySettings";
ALTER TABLE "new_CompanySettings" RENAME TO "CompanySettings";
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'invoice',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME NOT NULL,
    "serviceDateFrom" DATETIME,
    "serviceDateTo" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" DATETIME,
    "taxRegime" TEXT NOT NULL DEFAULT 'standard',
    "creditForInvoiceId" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'percent',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxTotal" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "recurringInvoiceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_recurringInvoiceId_fkey" FOREIGN KEY ("recurringInvoiceId") REFERENCES "RecurringInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountPaid", "clientId", "createdAt", "currency", "discountType", "discountValue", "dueDate", "footer", "id", "issueDate", "notes", "number", "recurringInvoiceId", "status", "subtotal", "taxTotal", "terms", "total", "updatedAt") SELECT "amountPaid", "clientId", "createdAt", "currency", "discountType", "discountValue", "dueDate", "footer", "id", "issueDate", "notes", "number", "recurringInvoiceId", "status", "subtotal", "taxTotal", "terms", "total", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
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
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecurringInvoice" ("clientId", "createdAt", "currency", "discountType", "discountValue", "endDate", "footer", "frequency", "id", "lastRunAt", "nextRunDate", "notes", "paymentTermDays", "remainingCycles", "status", "terms", "title", "updatedAt") SELECT "clientId", "createdAt", "currency", "discountType", "discountValue", "endDate", "footer", "frequency", "id", "lastRunAt", "nextRunDate", "notes", "paymentTermDays", "remainingCycles", "status", "terms", "title", "updatedAt" FROM "RecurringInvoice";
DROP TABLE "RecurringInvoice";
ALTER TABLE "new_RecurringInvoice" RENAME TO "RecurringInvoice";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
