/**
 * Symbole der Seitenleiste als Inline-SVG.
 *
 * Bewusst ohne Icon-Paket: es sind eine Handvoll Zeichen, sie erben ueber
 * currentColor die Textfarbe und funktionieren damit in beiden Farbschemata
 * ohne Zutun.
 */
import { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconDashboard = () => (
  <Icon>
    <path d="M3.2 10.3 12 3.3l8.8 7v9.4a1.3 1.3 0 0 1-1.3 1.3h-4.2v-6.2H8.7V21H4.5a1.3 1.3 0 0 1-1.3-1.3z" />
  </Icon>
);

export const IconClients = () => (
  <Icon>
    <circle cx="9.2" cy="8.4" r="3.4" />
    <path d="M3.2 20.2c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16.4 5.4a3.4 3.4 0 0 1 0 6.1" />
    <path d="M17.8 15.2c1.9.7 3 2.4 3 5" />
  </Icon>
);

export const IconProducts = () => (
  <Icon>
    <path d="M12 3.2 20.4 7.7v8.6L12 20.8 3.6 16.3V7.7z" />
    <path d="m3.6 7.7 8.4 4.5 8.4-4.5" />
    <path d="M12 12.2v8.6" />
  </Icon>
);

export const IconQuotes = () => (
  <Icon>
    <rect x="8.6" y="3.2" width="11.6" height="14.2" rx="2" />
    <path d="M15.8 20.8H5.8a2 2 0 0 1-2-2V7.4" />
  </Icon>
);

export const IconInvoices = () => (
  <Icon>
    <path d="M5.8 3.4h8.1l4.3 4.3v12.9H5.8z" />
    <path d="M13.9 3.4v4.3h4.3" />
    <path d="M9 13h6" />
    <path d="M9 16.4h6" />
  </Icon>
);

export const IconRecurringInvoices = () => (
  <Icon>
    <path d="M20.4 11.2A8.4 8.4 0 0 0 6 5.7L3.6 8" />
    <path d="M3.6 3.8v4.3h4.3" />
    <path d="M3.6 12.8a8.4 8.4 0 0 0 14.4 5.5l2.4-2.3" />
    <path d="M20.4 20.2v-4.3h-4.3" />
  </Icon>
);

export const IconPayments = () => (
  <Icon>
    <rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2.2" />
    <path d="M2.8 10.1h18.4" />
    <path d="M6.4 14.6h3.4" />
  </Icon>
);

export const IconExpenses = () => (
  <Icon>
    <path d="M6.2 3.2h11.6v17.6l-1.9-1.4-1.9 1.4-1.9-1.4-2 1.4-1.9-1.4-2 1.4z" />
    <path d="M9.3 8.2h5.4" />
    <path d="M9.3 12h5.4" />
  </Icon>
);

export const IconRecurringExpenses = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M15.9 10.3a4.4 4.4 0 0 0-7.2.6" />
    <path d="M8.1 13.7a4.4 4.4 0 0 0 7.2-.6" />
    <path d="M8.4 7.6v2.9h2.9" />
    <path d="M15.6 16.4v-2.9h-2.9" />
  </Icon>
);

export const IconSettings = () => (
  <Icon>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.1 14.8a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Icon>
);

export const IconPlus = () => (
  <svg
    className="nav-plus-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const IconReports = () => (
  <Icon>
    <path d="M3.4 20.6h17.2" />
    <path d="M3.4 15.6l4.8-5.4 3.9 3.3 4.4-5.6 4.1 4" />
    <path d="M3.4 3.4v17.2" />
  </Icon>
);

export const IconLogout = () => (
  <Icon>
    <path d="M14.6 16.6v2.2a1.9 1.9 0 0 1-1.9 1.9H5.6a1.9 1.9 0 0 1-1.9-1.9V5.2a1.9 1.9 0 0 1 1.9-1.9h7.1a1.9 1.9 0 0 1 1.9 1.9v2.2" />
    <path d="M9.4 12h10.9" />
    <path d="m17.2 8.9 3.1 3.1-3.1 3.1" />
  </Icon>
);

/** Mond: Zeichen fuer "auf dunkel umschalten". */
export const IconMoon = () => (
  <Icon>
    <path d="M20.4 13.6A8.6 8.6 0 0 1 10.4 3.6a8.6 8.6 0 1 0 10 10z" />
  </Icon>
);

/** Sonne: Zeichen fuer "auf hell umschalten". */
export const IconSun = () => (
  <Icon>
    <circle cx="12" cy="12" r="4.1" />
    <path d="M12 2.4v2.3M12 19.3v2.3M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.3M19.3 12h2.3M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </Icon>
);
