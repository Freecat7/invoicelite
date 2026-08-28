import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import { setFormatDefaults } from './format';
import { Settings, User } from './types';
import { setzeAkzent } from './akzent';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';

// Die Modulseiten werden erst beim Aufruf geladen. Das haelt das
// Startbundle klein - fuer die Anmeldung wird nur die Login-Seite gebraucht.
const DashboardPage = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const ClientsPage = lazy(() =>
  import('./pages/Clients').then((m) => ({ default: m.ClientsPage })),
);
const ProductsPage = lazy(() =>
  import('./pages/Products').then((m) => ({ default: m.ProductsPage })),
);
const InvoicesPage = lazy(() =>
  import('./pages/Invoices').then((m) => ({ default: m.InvoicesPage })),
);
const InvoiceEditorPage = lazy(() =>
  import('./pages/InvoiceEditor').then((m) => ({ default: m.InvoiceEditorPage })),
);
const QuotesPage = lazy(() =>
  import('./pages/Quotes').then((m) => ({ default: m.QuotesPage })),
);
const QuoteEditorPage = lazy(() =>
  import('./pages/QuoteEditor').then((m) => ({ default: m.QuoteEditorPage })),
);
const RecurringInvoicesPage = lazy(() =>
  import('./pages/RecurringInvoices').then((m) => ({
    default: m.RecurringInvoicesPage,
  })),
);
const RecurringInvoiceEditorPage = lazy(() =>
  import('./pages/RecurringInvoiceEditor').then((m) => ({
    default: m.RecurringInvoiceEditorPage,
  })),
);
const PaymentsPage = lazy(() =>
  import('./pages/Payments').then((m) => ({ default: m.PaymentsPage })),
);
const ExpensesPage = lazy(() =>
  import('./pages/Expenses').then((m) => ({ default: m.ExpensesPage })),
);
const RecurringExpensesPage = lazy(() =>
  import('./pages/RecurringExpenses').then((m) => ({
    default: m.RecurringExpensesPage,
  })),
);
const ReportsPage = lazy(() =>
  import('./pages/Reports').then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.SettingsPage })),
);
const SetupPage = lazy(() =>
  import('./pages/Setup').then((m) => ({ default: m.SetupPage })),
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const akzentRef = useRef('');

  // Nach einem Schemawechsel den Akzentton neu ableiten.
  useEffect(() => {
    const neu = () => {
      if (akzentRef.current) setzeAkzent(akzentRef.current);
    };
    window.addEventListener('invoicelite:schema', neu);
    return () => window.removeEventListener('invoicelite:schema', neu);
  }, []);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    const loaded = await api.get<Settings>('/settings');
    setFormatDefaults(loaded.locale, loaded.currency);
    setSettings(loaded);
    // Akzentfarbe der Oberflaeche aus den Einstellungen uebernehmen.
    if (loaded.uiAccentColor) setzeAkzent(loaded.uiAccentColor);
    akzentRef.current = loaded.uiAccentColor;
    return loaded;
  }, []);

  // Beim Start pruefen, ob eine gueltige Sitzung besteht.
  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then(async (me) => {
        setUser(me);
        await loadSettings();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [loadSettings]);

  const handleLogin = async (loggedIn: User) => {
    setUser(loggedIn);
    await loadSettings();
  };

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
    setSettings(null);
  };

  if (loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Lädt…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (!settings) {
    return (
      <div className="login-wrap">
        <div className="muted">Einstellungen werden geladen…</div>
      </div>
    );
  }

  // Beim ersten Start durch die Einrichtung fuehren, statt den Anwender
  // die Einstellungen selbst durchsuchen zu lassen.
  if (!settings.setupCompleted) {
    return (
      <Suspense
        fallback={
          <div className="login-wrap">
            <div className="muted">Lädt…</div>
          </div>
        }
      >
        <SetupPage
          settings={settings}
          user={user}
          onFertig={async () => {
            const neu = await loadSettings();
            // Die Anmeldedaten koennen sich im letzten Schritt geaendert
            // haben - Benutzer deshalb frisch holen.
            await api
              .get<User>('/auth/me')
              .then(setUser)
              .catch(() => undefined);
            return neu;
          }}
        />
      </Suspense>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout} appName={settings.appName}>
      <Suspense fallback={<div className="muted">Lädt…</div>}>
        <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/kunden" element={<ClientsPage />} />
        <Route path="/produkte" element={<ProductsPage settings={settings} />} />

        <Route path="/rechnungen" element={<InvoicesPage />} />
        <Route
          path="/rechnungen/neu"
          element={<InvoiceEditorPage settings={settings} />}
        />
        <Route
          path="/rechnungen/:id"
          element={<InvoiceEditorPage settings={settings} />}
        />

        <Route path="/angebote" element={<QuotesPage />} />
        <Route
          path="/angebote/neu"
          element={<QuoteEditorPage settings={settings} />}
        />
        <Route
          path="/angebote/:id"
          element={<QuoteEditorPage settings={settings} />}
        />

        <Route
          path="/wiederkehrende-rechnungen"
          element={<RecurringInvoicesPage />}
        />
        <Route
          path="/wiederkehrende-rechnungen/neu"
          element={<RecurringInvoiceEditorPage settings={settings} />}
        />
        <Route
          path="/wiederkehrende-rechnungen/:id"
          element={<RecurringInvoiceEditorPage settings={settings} />}
        />

        <Route path="/zahlungen" element={<PaymentsPage />} />
        <Route path="/ausgaben" element={<ExpensesPage settings={settings} />} />
        <Route
          path="/wiederkehrende-ausgaben"
          element={<RecurringExpensesPage settings={settings} />}
        />
        <Route path="/berichte" element={<ReportsPage />} />
        <Route
          path="/einstellungen"
          element={
            <SettingsPage settings={settings} onSaved={loadSettings} user={user} />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
