import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { User } from '../types';
import { useTheme } from '../hooks';

/** Urheber und Fundstelle des Quelltexts. */
const QUELLE = 'https://github.com/Freecat7/invoicelite';
const URHEBER = '© 2026 Lennart Müller';
import {
  IconClients,
  IconDashboard,
  IconExpenses,
  IconInvoices,
  IconLogout,
  IconMoon,
  IconPayments,
  IconPlus,
  IconProducts,
  IconQuotes,
  IconRecurringExpenses,
  IconRecurringInvoices,
  IconReports,
  IconSettings,
  IconSun,
} from './icons';

/**
 * Navigation. "neu" ist der Pfad der Schnellanlage; Seiten, die dafuer ein
 * Fenster oeffnen statt eine eigene Seite zu haben, bekommen ?neu=1 an die
 * Liste gehaengt und werten das dort aus.
 */
const NAV_SECTIONS: {
  title: string;
  items: {
    to: string;
    label: string;
    icon: () => JSX.Element;
    neu?: string;
  }[];
}[] = [
  {
    title: 'Übersicht',
    items: [{ to: '/', label: 'Dashboard', icon: IconDashboard }],
  },
  {
    title: 'Stammdaten',
    items: [
      { to: '/kunden', label: 'Kunden', icon: IconClients, neu: '/kunden?neu=1' },
      {
        to: '/produkte',
        label: 'Produkte',
        icon: IconProducts,
        neu: '/produkte?neu=1',
      },
    ],
  },
  {
    title: 'Einnahmen',
    items: [
      {
        to: '/angebote',
        label: 'Angebote',
        icon: IconQuotes,
        neu: '/angebote/neu',
      },
      {
        to: '/rechnungen',
        label: 'Rechnungen',
        icon: IconInvoices,
        neu: '/rechnungen/neu',
      },
      {
        to: '/wiederkehrende-rechnungen',
        label: 'Wiederkehrende Rechnungen',
        icon: IconRecurringInvoices,
        neu: '/wiederkehrende-rechnungen/neu',
      },
      {
        to: '/zahlungen',
        label: 'Zahlungen',
        icon: IconPayments,
        neu: '/zahlungen?neu=1',
      },
    ],
  },
  {
    title: 'Ausgaben',
    items: [
      {
        to: '/ausgaben',
        label: 'Ausgaben',
        icon: IconExpenses,
        neu: '/ausgaben?neu=1',
      },
      {
        to: '/wiederkehrende-ausgaben',
        label: 'Wiederkehrende Ausgaben',
        icon: IconRecurringExpenses,
        neu: '/wiederkehrende-ausgaben?neu=1',
      },
    ],
  },
];

export function Layout({
  user,
  onLogout,
  appName,
  children,
}: {
  user: User;
  onLogout: () => void;
  appName: string;
  children: ReactNode;
}) {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">{appName}</div>
        <nav>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="nav-group">{section.title}</div>
              {section.items.map((item) => (
                <div className="nav-row" key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                  {item.neu && (
                    <NavLink
                      to={item.neu}
                      className="nav-plus"
                      title={`${item.label}: neu anlegen`}
                      aria-label={`${item.label}: neu anlegen`}
                    >
                      <IconPlus />
                    </NavLink>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="nav-group">System</div>
          <div className="nav-row">
            <NavLink
              to="/berichte"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <IconReports />
              <span>Berichte</span>
            </NavLink>
          </div>
          <div className="nav-row">
            <NavLink
              to="/einstellungen"
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <IconSettings />
              <span>Einstellungen</span>
            </NavLink>
          </div>
        </nav>
        <div className="spacer" />
        <div className="sidebar-footer">
          <span className="sidebar-user" title={user.email}>
            {user.email}
          </span>
          {/* Nur Symbole - der Zweck steht in title und aria-label, damit
              Vorlesewerkzeuge und Kurzhinweis ihn trotzdem nennen. */}
          <div className="sidebar-footer-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Dunkles Schema' : 'Helles Schema'}
              aria-label={theme === 'light' ? 'Dunkles Schema' : 'Helles Schema'}
            >
              {theme === 'light' ? <IconMoon /> : <IconSun />}
            </button>
            <button
              className="icon-button"
              onClick={onLogout}
              title="Abmelden"
              aria-label="Abmelden"
            >
              <IconLogout />
            </button>
          </div>
        </div>

        {/* Urheber und Quelltext sichtbar halten - die Lizenz verlangt, dass
            diese Hinweise nicht entfernt werden. */}
        <div className="sidebar-quelle">
          <span>{URHEBER}</span>
          <a href={QUELLE} target="_blank" rel="noreferrer">
            Quelltext
          </a>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

/** Kopfbereich einer Seite mit Titel und Aktionen. */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
