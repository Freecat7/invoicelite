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
    "ownerName" TEXT NOT NULL DEFAULT '',
    "accentColor" TEXT NOT NULL DEFAULT '#2E2B2A',
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
INSERT INTO "new_CompanySettings" ("accountHolder", "addressLine", "bankName", "bic", "buyerReference", "city", "companyName", "country", "creditNumberNext", "creditNumberPadding", "creditNumberPrefix", "currency", "defaultFooter", "defaultNotes", "defaultTaxRate", "defaultTerms", "eInvoiceFormat", "email", "iban", "id", "invoiceNumberNext", "invoiceNumberPadding", "invoiceNumberPrefix", "locale", "logoPath", "paymentTermDays", "phone", "postalCode", "quoteNumberNext", "quoteNumberPadding", "quoteNumberPrefix", "showEpcQr", "taxNumber", "taxRegime", "updatedAt", "vatId", "website") SELECT "accountHolder", "addressLine", "bankName", "bic", "buyerReference", "city", "companyName", "country", "creditNumberNext", "creditNumberPadding", "creditNumberPrefix", "currency", "defaultFooter", "defaultNotes", "defaultTaxRate", "defaultTerms", "eInvoiceFormat", "email", "iban", "id", "invoiceNumberNext", "invoiceNumberPadding", "invoiceNumberPrefix", "locale", "logoPath", "paymentTermDays", "phone", "postalCode", "quoteNumberNext", "quoteNumberPadding", "quoteNumberPrefix", "showEpcQr", "taxNumber", "taxRegime", "updatedAt", "vatId", "website" FROM "CompanySettings";
DROP TABLE "CompanySettings";
ALTER TABLE "new_CompanySettings" RENAME TO "CompanySettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
