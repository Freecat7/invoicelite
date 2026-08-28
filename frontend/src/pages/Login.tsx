import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { User } from '../types';
import { Alert } from '../components/ui';

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  // Der Name kommt vom oeffentlichen Endpunkt - hier gibt es noch keine
  // Sitzung, mit der sich die Einstellungen lesen liessen.
  const [appName, setAppName] = useState('invoicelite');
  useEffect(() => {
    fetch('/api/branding')
      .then((r) => r.json())
      .then((b) => b.appName && setAppName(b.appName))
      .catch(() => undefined);
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await api.post<User>('/auth/login', { email, password });
      await onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>{appName}</h1>
        <div className="subtitle">Bitte melden Sie sich an.</div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="field">
          <label>E-Mail</label>
          <input
            type="email"
            value={email}
            autoFocus
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Passwort</label>
          <input
            type="password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="primary"
          disabled={busy}
          style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
        >
          {busy ? 'Anmeldung läuft…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
