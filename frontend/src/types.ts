export interface User {
  id: number;
  email: string;
  name: string;
  via?: 'session' | 'token';
}

export interface Settings {
  id: number;
  companyName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  taxNumber: string;
  ownerName: string;
  accentColor: string;
  uiAccentColor: string;
  setupCompleted: boolean;
  appName: string;
  email: string;
  phone: string;
  website: string;
  logoPath: string;

  bankName: string;
  iban: string;
  bic: string;
  accountHolder: string;

  invoiceNumberPrefix: string;
  invoiceNumberNext: number;
  invoiceNumberPadding: number;
  quoteNumberPrefix: string;
  quoteNumberNext: number;
  quoteNumberPadding: number;
  creditNumberPrefix: string;
  creditNumberNext: number;
  creditNumberPadding: number;

  currency: string;
  locale: string;
  defaultTaxRate: number;
  taxRegime: string;
  paymentTermDays: number;
  defaultTerms: string;
  defaultFooter: string;
  defaultNotes: string;
  defaultQuoteTerms: string;
  defaultQuoteNotes: string;

  eInvoiceFormat: 'off' | 'zugferd' | 'xrechnung';
  buyerReference: string;
  showEpcQr: boolean;
  // --- Mailversand ---
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Nur ein Merker - das Passwort selbst verlaesst den Server nie. */
  smtpPasswordSet?: boolean;
  /** Nur zum Schreiben; leer bedeutet "unveraendert lassen". */
  smtpPassword?: string;
  mailFromName: string;
  mailFromEmail: string;
  mailReplyTo: string;
  mailBcc: string;
  mailEnabled: boolean;
  mailSendTime: string;
  mailSubject: string;
  mailBody: string;
  mailBodyHtml: string;
  mailAttachment: string;
  quoteMailSubject: string;
  quoteMailBody: string;
  quoteMailBodyHtml: string;
  imapCopyEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapSentFolder: string;
  /** Nur ein Merker - das Passwort verlaesst den Server nie. */
  imapPasswordSet?: boolean;
  /** Nur zum Schreiben; leer bedeutet "unveraendert lassen". */
  imapPassword?: string;
}

export interface Client {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  notes: string;
  archived: boolean;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  unitPrice: number;
  unit: string;
  taxRate: number;
  archived: boolean;
}

export interface DocumentLine {
  id?: number;
  position?: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineTotal?: number;
}

export interface Invoice {
  id: number;
  number: string;
  clientId: number;
  client?: Client | { id: number; name: string };
  docType: 'invoice' | 'credit';
  issueDate: string;
  dueDate: string;
  serviceDateFrom: string | null;
  serviceDateTo: string | null;
  status: string;
  sentAt: string | null;
  taxRegime: string;
  creditForInvoiceId: number | null;
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  notes: string;
  terms: string;
  footer: string;
  lines: DocumentLine[];
  payments?: Payment[];
  approvedAt?: string | null;
  mailedAt?: string | null;
  mailAttempts?: number;
  mailError?: string;
}

export interface Quote {
  id: number;
  number: string;
  clientId: number;
  client?: Client | { id: number; name: string };
  issueDate: string;
  validUntil: string | null;
  status: string;
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  subtotal: number;
  taxTotal: number;
  total: number;
  notes: string;
  terms: string;
  footer: string;
  convertedInvoiceId: number | null;
  lines: DocumentLine[];
  taxRegime: string;
}

export interface RecurringInvoice {
  id: number;
  clientId: number;
  client?: Client | { id: number; name: string };
  title: string;
  frequency: string;
  nextRunDate: string;
  endDate: string | null;
  remainingCycles: number | null;
  status: string;
  currency: string;
  discountValue: number;
  discountType: 'percent' | 'fixed';
  paymentTermDays: number;
  taxRegime: string;
  generateAs: string;
  notes: string;
  terms: string;
  footer: string;
  lastRunAt: string | null;
  lines: DocumentLine[];
  _count?: { generatedInvoices: number };
  servicePeriod: string;
}

export interface Payment {
  id: number;
  invoiceId: number;
  invoice?: {
    id: number;
    number: string;
    total: number;
    currency: string;
    client?: { id: number; name: string };
  };
  date: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
}

export interface Expense {
  id: number;
  date: string;
  vendor: string;
  category: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  description: string;
  reference: string;
  attachmentPath: string;
  status: string;
}

export interface RecurringExpense {
  id: number;
  vendor: string;
  category: string;
  amount: number;
  taxRate: number;
  currency: string;
  description: string;
  frequency: string;
  nextRunDate: string;
  endDate: string | null;
  remainingCycles: number | null;
  status: string;
  lastRunAt: string | null;
  _count?: { generatedExpenses: number };
}

export interface ApiToken {
  id: number;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  token?: string;
}

export interface Kennzahl {
  value: number;
  previous: number;
  /** null, wenn der Vorzeitraum 0 war - dann gibt es nichts zu vergleichen. */
  changePct: number | null;
}

export interface VerlaufsPunkt {
  label: string;
  invoiced: number;
  payments: number;
  expenses: number;
}

export interface DashboardData {
  currency: string;
  locale: string;
  period: {
    kind: 'month' | 'year';
    year: number;
    month: number;
    label: string;
    previousLabel: string;
    from: string;
    to: string;
  };
  kpis: {
    invoiced: Kennzahl;
    payments: Kennzahl;
    expenses: Kennzahl;
    result: Kennzahl;
  };
  series: VerlaufsPunkt[];
  outstanding: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  openQuoteCount: number;
  dueRecurringInvoices: number;
  dueRecurringExpenses: number;
  recentInvoices: Invoice[];
}
