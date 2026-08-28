import { useEffect, useState } from 'react';
import { setzeAkzent } from '../akzent';
import { api } from '../api/client';
import { ApiToken, Settings, User } from '../types';
import { TAX_REGIME_LABELS, formatDate } from '../format';
import { PageHead } from '../components/Layout';
import {
  Alert,
  Checkbox,
  FormModal,
  Select,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';
import { ApiDocs } from '../components/ApiDocs';

type Tab =
  | 'company'
  | 'bank'
  | 'documents'
  | 'einvoice'
  | 'mail'
  | 'api'
  | 'account';

const TABS: { key: Tab; label: string }[] = [
  { key: 'company', label: 'Firmendaten' },
  { key: 'bank', label: 'Bankverbindung' },
  { key: 'documents', label: 'Belege & Nummern' },
  { key: 'einvoice', label: 'E-Rechnung' },
  { key: 'mail', label: 'Mailversand' },
  { key: 'api', label: 'API-Zugriff' },
  { key: 'account', label: 'Konto' },
];

export function SettingsPage({
  settings,
  onSaved,
  user,
}: {
  settings: Settings;
  onSaved: () => Promise<Settings>;
  user: User;
}) {
  const [tab, setTab] = useState<Tab>('company');
  const [form, setForm] = useState<Settings>(settings);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const patch = (changes: Partial<Settings>) =>
    setForm((current) => ({ ...current, ...changes }));

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { id, logoPath, ...payload } = form;
      await api.put('/settings', payload);
      await onSaved();
      setNotice('Einstellungen gespeichert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setError('');
    try {
      await api.upload('/settings/logo', 'logo', file);
      await onSaved();
      setNotice('Logo aktualisiert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    }
  };

  const removeLogo = async () => {
    await api.delete('/settings/logo');
    await onSaved();
  };

  return (
    <div>
      <PageHead
        title="Einstellungen"
        subtitle="Firmendaten, Belegvorgaben und Zugänge"
        actions={
          tab !== 'api' && tab !== 'account' ? (
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
          ) : undefined
        }
      />

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="toolbar">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            className={tab === entry.key ? 'primary small' : 'small'}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-body">
          {tab === 'company' && (
            <>
              <TextInput
                label="Firmenname"
                value={form.companyName}
                onChange={(v) => patch({ companyName: v })}
              />
              <TextInput
                label="Name der Anwendung"
                value={form.appName}
                hint="Steht in der Seitenleiste und auf der Anmeldeseite. Ändert nichts an den Belegen."
                onChange={(v) => patch({ appName: v })}
              />
              <TextInput
                label="Straße und Hausnummer"
                value={form.addressLine}
                onChange={(v) => patch({ addressLine: v })}
              />
              <div className="grid-3">
                <TextInput
                  label="PLZ"
                  value={form.postalCode}
                  onChange={(v) => patch({ postalCode: v })}
                />
                <TextInput
                  label="Ort"
                  value={form.city}
                  onChange={(v) => patch({ city: v })}
                />
                <TextInput
                  label="Land"
                  value={form.country}
                  hint="Ländercode, z.B. DE"
                  onChange={(v) => patch({ country: v })}
                />
              </div>
              <div className="grid-3">
                <TextInput
                  label="USt-IdNr."
                  value={form.vatId}
                  hint="Für E-Rechnungen erforderlich"
                  onChange={(v) => patch({ vatId: v })}
                />
                <TextInput
                  label="Steuernummer"
                  value={form.taxNumber}
                  onChange={(v) => patch({ taxNumber: v })}
                />
                <TextInput
                  label="Inhaber/in"
                  value={form.ownerName}
                  hint="Erscheint in der Fußzeile des Belegs"
                  onChange={(v) => patch({ ownerName: v })}
                />
              </div>

              <div className="field">
                <label>Farbe der Fußzeile</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.accentColor}
                    style={{ width: 52, height: 34, padding: 2 }}
                    onChange={(e) => patch({ accentColor: e.target.value })}
                  />
                  <input
                    type="text"
                    value={form.accentColor}
                    style={{ width: 130 }}
                    onChange={(e) => patch({ accentColor: e.target.value })}
                  />
                </div>
                <div className="hint">
                  Hex-Wert, z.B. #2E2B2A. Färbt den Balken am Fuß des PDFs.
                </div>
              </div>

              <div className="field">
                <label>Akzentfarbe der Oberfläche</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.uiAccentColor}
                    style={{ width: 52, height: 34, padding: 2 }}
                    onChange={(e) => {
                      patch({ uiAccentColor: e.target.value });
                      // Sofort anwenden, damit die Wirkung sichtbar ist;
                      // dauerhaft wird sie erst beim Speichern.
                      setzeAkzent(e.target.value);
                    }}
                  />
                  <input
                    type="text"
                    value={form.uiAccentColor}
                    style={{ width: 130 }}
                    onChange={(e) => {
                      patch({ uiAccentColor: e.target.value });
                      setzeAkzent(e.target.value);
                    }}
                  />
                  <span className="btn primary small" style={{ pointerEvents: 'none' }}>
                    Beispiel
                  </span>
                </div>
                <div className="hint">
                  Färbt Schaltflächen, Verweise und Hervorhebungen. Getrennt von der
                  Fußzeile, weil deren Balkenton als Schaltflächenfarbe unbrauchbar wäre.
                  Helligkeit und Schriftfarbe werden je Farbschema abgeleitet.
                </div>
              </div>
              <div className="grid-3">
                <TextInput
                  label="E-Mail"
                  value={form.email}
                  onChange={(v) => patch({ email: v })}
                />
                <TextInput
                  label="Telefon"
                  value={form.phone}
                  onChange={(v) => patch({ phone: v })}
                />
                <TextInput
                  label="Website"
                  value={form.website}
                  onChange={(v) => patch({ website: v })}
                />
              </div>

              <div className="field">
                <label>Logo</label>
                {form.logoPath ? (
                  <div style={{ marginBottom: 8 }}>
                    <img
                      src={`/api/settings/logo-file?v=${encodeURIComponent(form.logoPath)}`}
                      alt="Logo"
                      style={{ maxHeight: 70, maxWidth: 220 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div>
                      <button className="link" onClick={removeLogo}>
                        Logo entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="hint" style={{ marginBottom: 6 }}>
                    Noch kein Logo hinterlegt.
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                  }}
                />
              </div>
            </>
          )}

          {tab === 'bank' && (
            <>
              <Alert kind="info">
                IBAN und Kontoinhaber werden für den EPC-QR-Code („Girocode") auf
                der Rechnung benötigt. Der QR-Code funktioniert nur mit
                EUR-Beträgen.
              </Alert>
              <div className="grid-2">
                <TextInput
                  label="Kontoinhaber"
                  value={form.accountHolder}
                  hint="Leer lassen, um den Firmennamen zu verwenden"
                  onChange={(v) => patch({ accountHolder: v })}
                />
                <TextInput
                  label="Bank"
                  value={form.bankName}
                  onChange={(v) => patch({ bankName: v })}
                />
              </div>
              <div className="grid-2">
                <TextInput
                  label="IBAN"
                  value={form.iban}
                  onChange={(v) => patch({ iban: v })}
                />
                <TextInput
                  label="BIC"
                  value={form.bic}
                  hint="Innerhalb des EWR optional"
                  onChange={(v) => patch({ bic: v })}
                />
              </div>
              <Checkbox
                label="EPC-QR-Code auf Rechnungen drucken"
                checked={form.showEpcQr}
                onChange={(v) => patch({ showEpcQr: v })}
                hint="Wird nur gedruckt, wenn IBAN gepflegt ist und ein offener Betrag besteht."
              />
            </>
          )}

          {tab === 'documents' && (
            <>
              <div className="section-title">Nummernkreise</div>
              <div className="grid-3">
                <TextInput
                  label="Rechnungs-Präfix"
                  value={form.invoiceNumberPrefix}
                  onChange={(v) => patch({ invoiceNumberPrefix: v })}
                />
                <TextInput
                  label="Nächste Rechnungsnummer"
                  type="number"
                  min="1"
                  value={form.invoiceNumberNext}
                  onChange={(v) => patch({ invoiceNumberNext: Number(v) })}
                />
                <TextInput
                  label="Stellen"
                  type="number"
                  min="1"
                  value={form.invoiceNumberPadding}
                  hint={`Beispiel: ${form.invoiceNumberPrefix}${String(
                    form.invoiceNumberNext,
                  ).padStart(form.invoiceNumberPadding, '0')}`}
                  onChange={(v) => patch({ invoiceNumberPadding: Number(v) })}
                />
              </div>
              <div className="grid-3">
                <TextInput
                  label="Angebots-Präfix"
                  value={form.quoteNumberPrefix}
                  onChange={(v) => patch({ quoteNumberPrefix: v })}
                />
                <TextInput
                  label="Nächste Angebotsnummer"
                  type="number"
                  min="1"
                  value={form.quoteNumberNext}
                  onChange={(v) => patch({ quoteNumberNext: Number(v) })}
                />
                <TextInput
                  label="Stellen"
                  type="number"
                  min="1"
                  value={form.quoteNumberPadding}
                  hint={`Beispiel: ${form.quoteNumberPrefix}${String(
                    form.quoteNumberNext,
                  ).padStart(form.quoteNumberPadding, '0')}`}
                  onChange={(v) => patch({ quoteNumberPadding: Number(v) })}
                />
              </div>

              <div className="grid-3">
                <TextInput
                  label="Gutschrift-Präfix"
                  value={form.creditNumberPrefix}
                  onChange={(v) => patch({ creditNumberPrefix: v })}
                />
                <TextInput
                  label="Nächste Gutschriftnummer"
                  type="number"
                  min="1"
                  value={form.creditNumberNext}
                  onChange={(v) => patch({ creditNumberNext: Number(v) })}
                />
                <TextInput
                  label="Stellen"
                  type="number"
                  min="1"
                  value={form.creditNumberPadding}
                  hint={`Beispiel: ${form.creditNumberPrefix}${String(
                    form.creditNumberNext,
                  ).padStart(form.creditNumberPadding, '0')}`}
                  onChange={(v) => patch({ creditNumberPadding: Number(v) })}
                />
              </div>

              <div className="section-title">Vorgaben für neue Belege</div>

              <Select
                label="Steuerregelung"
                value={form.taxRegime}
                onChange={(v) => patch({ taxRegime: v })}
                options={Object.entries(TAX_REGIME_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
                hint="Vorbelegung für neue Belege; pro Rechnung überschreibbar."
              />

              <div className="grid-4">
                <TextInput
                  label="Währung"
                  value={form.currency}
                  onChange={(v) => patch({ currency: v })}
                />
                <TextInput
                  label="Sprache/Format"
                  value={form.locale}
                  hint="z.B. de-DE"
                  onChange={(v) => patch({ locale: v })}
                />
                <TextInput
                  label="Standard-USt. (%)"
                  type="number"
                  step="0.1"
                  value={form.defaultTaxRate}
                  onChange={(v) => patch({ defaultTaxRate: Number(v) })}
                />
                <TextInput
                  label="Zahlungsziel (Tage)"
                  type="number"
                  min="0"
                  value={form.paymentTermDays}
                  onChange={(v) => patch({ paymentTermDays: Number(v) })}
                />
              </div>

              <div className="section-title">Standardtexte für Rechnungen</div>
              <TextArea
                label="Standard-Notiz"
                value={form.defaultNotes}
                onChange={(v) => patch({ defaultNotes: v })}
              />
              <TextArea
                label="Zahlungsbedingungen"
                value={form.defaultTerms}
                onChange={(v) => patch({ defaultTerms: v })}
              />

              <div className="section-title">Standardtexte für Angebote</div>
              <TextArea
                label="Standard-Notiz"
                value={form.defaultQuoteNotes}
                onChange={(v) => patch({ defaultQuoteNotes: v })}
              />
              <TextArea
                label="Angebotsbedingungen"
                value={form.defaultQuoteTerms}
                hint="Getrennt von der Rechnung: Zahlungsziel, Rechnungsbetrag und Kontoverbindung gehören nicht auf ein Angebot."
                onChange={(v) => patch({ defaultQuoteTerms: v })}
              />

              <div className="section-title">Gemeinsam</div>
              <TextArea
                label="Fußzeile"
                value={form.defaultFooter}
                onChange={(v) => patch({ defaultFooter: v })}
              />
            </>
          )}

          {tab === 'einvoice' && (
            <>
              <Alert kind="info">
                E-Rechnungen folgen dem europäischen Standard EN16931. Als
                Hybrid-PDF (ZUGFeRD/Factur-X) enthält das PDF zusätzlich die
                maschinenlesbare XML. XRechnung erzeugt eine reine XML-Datei für
                öffentliche Auftraggeber. Beide Varianten stehen auf jeder
                Rechnung als eigener Download bereit.
              </Alert>
              <Select
                label="Standardformat beim PDF-Download"
                value={form.eInvoiceFormat}
                onChange={(v) =>
                  patch({ eInvoiceFormat: v as Settings['eInvoiceFormat'] })
                }
                options={[
                  { value: 'off', label: 'Aus – normales PDF' },
                  {
                    value: 'zugferd',
                    label: 'ZUGFeRD/Factur-X – PDF mit eingebetteter XML',
                  },
                  { value: 'xrechnung', label: 'XRechnung – reine XML' },
                ]}
                hint="Betrifft den Standard-Download; die anderen Formate bleiben pro Rechnung wählbar."
              />
              <TextInput
                label="Leitweg-ID / Käuferreferenz"
                value={form.buyerReference}
                hint="Pflichtangabe bei XRechnung an öffentliche Auftraggeber (BT-10)."
                onChange={(v) => patch({ buyerReference: v })}
              />
              {!form.vatId && !form.taxNumber && (
                <Alert kind="warn">
                  Für gültige E-Rechnungen muss eine USt-IdNr. oder Steuernummer
                  in den Firmendaten hinterlegt sein.
                </Alert>
              )}
            </>
          )}

          {tab === 'mail' && (
            <MailSection form={form} patch={patch} />
          )}

          {tab === 'api' && <ApiTokensSection />}

          {tab === 'account' && <AccountSection user={user} />}
        </div>
      </div>
    </div>
  );
}

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [freshToken, setFreshToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = () => {
    api
      .get<ApiToken[]>('/tokens')
      .then(setTokens)
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await api.post<ApiToken>('/tokens', { label });
      setFreshToken(created.token ?? '');
      setCreating(false);
      setLabel('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: ApiToken) => {
    const ok = await confirm(`Token „${token.label}" wirklich widerrufen?`);
    if (!ok) return;
    await api.delete(`/tokens/${token.id}`);
    load();
  };

  const origin = window.location.origin;

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}

      <Alert kind="info">
        Mit einem API-Token können Sie Rechnungen und Kundendaten von außen
        abrufen – etwa für ein eigenes Skript zum Mailversand. Der Token wird im
        Header <code>Authorization: Bearer …</code> mitgeschickt.
      </Alert>

      {freshToken && (
        <div>
          <Alert kind="success">
            Token erstellt. Er wird nur dieses eine Mal angezeigt – bitte jetzt
            kopieren.
          </Alert>
          <div className="token-value">{freshToken}</div>
          <button className="small" onClick={() => setFreshToken('')}>
            Verstanden, ausblenden
          </button>
        </div>
      )}

      <div style={{ margin: '18px 0' }}>
        <button className="primary" onClick={() => setCreating(true)}>
          Neues Token erstellen
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="muted">Noch keine Tokens vorhanden.</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Präfix</th>
              <th>Erstellt</th>
              <th>Zuletzt benutzt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td>{token.label}</td>
                <td className="mono">{token.prefix}…</td>
                <td className="nowrap">{formatDate(token.createdAt)}</td>
                <td className="nowrap">
                  {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'nie'}
                </td>
                <td className="actions">
                  <button className="link" onClick={() => revoke(token)}>
                    Widerrufen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <FormModal
          title="Neues API-Token"
          onClose={() => setCreating(false)}
          onSubmit={create}
          busy={busy}
          submitLabel="Token erstellen"
        >
          <TextInput
            label="Bezeichnung"
            value={label}
            required
            hint="z.B. „Mailversand-Skript“"
            onChange={setLabel}
          />
        </FormModal>
      )}

      <ApiDocs origin={origin} />

      {dialog}
    </div>
  );
}

function AccountSection({ user }: { user: User }) {
  const [email, setEmail] = useState(user.email);
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const saveProfile = async () => {
    setError('');
    setNotice('');
    try {
      await api.put('/auth/profile', { email, name });
      setNotice('Profil gespeichert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    }
  };

  const changePassword = async () => {
    setError('');
    setNotice('');
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNotice('Passwort geändert.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Änderung fehlgeschlagen');
    }
  };

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <div className="section-title">Profil</div>
      <div className="grid-2">
        <TextInput label="E-Mail" type="email" value={email} onChange={setEmail} />
        <TextInput label="Name" value={name} onChange={setName} />
      </div>
      <button className="primary" onClick={saveProfile}>
        Profil speichern
      </button>

      <div className="section-title">Passwort ändern</div>
      <div className="grid-2">
        <TextInput
          label="Aktuelles Passwort"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <TextInput
          label="Neues Passwort"
          type="password"
          value={newPassword}
          hint="Mindestens 8 Zeichen"
          onChange={setNewPassword}
        />
      </div>
      <button
        className="primary"
        onClick={changePassword}
        disabled={!currentPassword || newPassword.length < 8}
      >
        Passwort ändern
      </button>

      <div className="section-title">Sicherung</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Lädt Datenbank und hochgeladene Dateien als ZIP herunter. Der Abzug der
        Datenbank ist in sich stimmig, auch wenn gerade gearbeitet wird. Das
        Sitzungsgeheimnis ist bewusst nicht enthalten – nach dem Zurückspielen
        ist einmalig eine neue Anmeldung nötig.
      </p>
      <a className="btn" href="/api/backup" download>
        Sicherung herunterladen
      </a>
    </div>
  );
}


/**
 * Postfach und Regeln fuer den taeglichen Versand.
 *
 * Das Passwort wird nie zurueckgeliefert; ein leeres Feld heisst
 * "unveraendert lassen". Ob eines hinterlegt ist, sagt smtpPasswordSet.
 */
function MailSection({
  form,
  patch,
}: {
  form: Settings;
  patch: (changes: Partial<Settings>) => void;
}) {
  const [passwort, setPasswort] = useState('');
  const [imapPasswort, setImapPasswort] = useState('');
  const [testAdresse, setTestAdresse] = useState('');
  const [meldung, setMeldung] = useState('');
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);

  const hinterlegt = form.smtpPasswordSet;

  const pruefen = async () => {
    setBusy(true);
    setFehler('');
    setMeldung('');
    try {
      await api.post('/mail/test-connection', {});
      setMeldung('Verbindung und Anmeldung in Ordnung.');
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const testmail = async () => {
    setBusy(true);
    setFehler('');
    setMeldung('');
    try {
      await api.post('/mail/test', { to: testAdresse });
      setMeldung(`Testmail an ${testAdresse} verschickt.`);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const pruefeOrdner = async () => {
    setBusy(true);
    setFehler('');
    setMeldung('');
    try {
      const r = await api.post<{ ordner: string }>('/mail/test-sent-folder', {});
      setMeldung(`Ordner gefunden: „${r.ordner}“.`);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Prüfung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const passwortLoeschen = async () => {
    await api.delete('/settings/smtp-password');
    patch({ smtpPasswordSet: false });
    setMeldung('Passwort entfernt.');
  };

  return (
    <div>
      {fehler && <Alert kind="error">{fehler}</Alert>}
      {meldung && <Alert kind="success">{meldung}</Alert>}

      <div className="section-title">Postfach</div>
      <div className="grid-3">
        <TextInput
          label="Server"
          value={form.smtpHost}
          hint="z.B. smtp.ionos.de"
          onChange={(v) => patch({ smtpHost: v })}
        />
        <TextInput
          label="Port"
          type="number"
          value={form.smtpPort}
          hint="587 für STARTTLS, 465 für durchgehend verschlüsselt"
          onChange={(v) => patch({ smtpPort: Number(v) })}
        />
        <Select
          label="Verschlüsselung"
          value={form.smtpSecure ? 'ssl' : 'starttls'}
          onChange={(v) => patch({ smtpSecure: v === 'ssl' })}
          options={[
            { value: 'starttls', label: 'STARTTLS (Port 587)' },
            { value: 'ssl', label: 'Durchgehend (Port 465)' },
          ]}
        />
      </div>

      <div className="grid-2">
        <TextInput
          label="Benutzername"
          value={form.smtpUser}
          hint="Meist die vollständige Adresse"
          onChange={(v) => patch({ smtpUser: v })}
        />
        <div className="field">
          <label>Passwort</label>
          <input
            type="password"
            value={passwort}
            placeholder={hinterlegt ? '•••••••• (hinterlegt)' : ''}
            onChange={(e) => {
              setPasswort(e.target.value);
              patch({ smtpPassword: e.target.value });
            }}
          />
          <div className="hint">
            {hinterlegt
              ? 'Leer lassen, um es unverändert zu lassen. '
              : 'Wird verschlüsselt gespeichert. '}
            {hinterlegt && (
              <button className="link" onClick={passwortLoeschen}>
                Entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="section-title">Absender</div>
      <div className="grid-2">
        <TextInput
          label="Absendername"
          value={form.mailFromName}
          hint="Leer = Firmenname"
          onChange={(v) => patch({ mailFromName: v })}
        />
        <TextInput
          label="Absenderadresse"
          type="email"
          value={form.mailFromEmail}
          hint="Leer = E-Mail aus den Firmendaten"
          onChange={(v) => patch({ mailFromEmail: v })}
        />
      </div>
      <div className="grid-2">
        <TextInput
          label="Antwort an (optional)"
          type="email"
          value={form.mailReplyTo}
          onChange={(v) => patch({ mailReplyTo: v })}
        />
        <TextInput
          label="Blindkopie an (optional)"
          type="email"
          value={form.mailBcc}
          hint="Für eine Kopie ins eigene Postfach"
          onChange={(v) => patch({ mailBcc: v })}
        />
      </div>

      <div className="section-title">Automatischer Versand</div>
      <div className="grid-3">
        <Select
          label="Versand"
          value={form.mailEnabled ? 'an' : 'aus'}
          onChange={(v) => patch({ mailEnabled: v === 'an' })}
          options={[
            { value: 'aus', label: 'Ausgeschaltet' },
            { value: 'an', label: 'Eingeschaltet' },
          ]}
        />
        <TextInput
          label="Uhrzeit"
          value={form.mailSendTime}
          hint="HH:MM, z.B. 09:00"
          onChange={(v) => patch({ mailSendTime: v })}
        />
        <Select
          label="Anhang"
          value={form.mailAttachment}
          onChange={(v) => patch({ mailAttachment: v })}
          options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'zugferd', label: 'ZUGFeRD-PDF (mit XML)' },
            { value: 'xrechnung', label: 'XRechnung (nur XML)' },
          ]}
        />
      </div>

      <Alert kind="info">
        Freigegebene Rechnungen gehen <strong>am Tag nach der Freigabe</strong> zur
        eingestellten Uhrzeit hinaus. So bleibt mindestens eine Nacht Zeit, einen
        Irrtum zu bemerken. Nach dem Versand steht der Beleg auf{' '}
        <em>Versendet</em>; schlägt der Versand fehl, bleibt er freigegeben und
        der nächste Lauf versucht es erneut.
      </Alert>

      <div className="section-title">Nachricht</div>
      <TextInput
        label="Betreff"
        value={form.mailSubject}
        onChange={(v) => patch({ mailSubject: v })}
      />
      <TextArea
        label="HTML (mit Signatur)"
        value={form.mailBodyHtml}
        rows={14}
        hint="Ist hier etwas hinterlegt, geht die Mail als HTML hinaus. Platzhalter: {nummer} {kunde} {firma} {betrag} {datum} {faellig}"
        onChange={(v) => patch({ mailBodyHtml: v })}
      />
      <TextArea
        label="Nur-Text-Fassung"
        value={form.mailBody}
        rows={7}
        hint="Rückfallebene für Programme ohne HTML-Darstellung. Leer lassen – dann wird sie automatisch aus dem HTML abgeleitet."
        onChange={(v) => patch({ mailBody: v })}
      />

      <div className="section-title">Angebotsmail</div>
      <TextInput
        label="Betreff"
        value={form.quoteMailSubject}
        onChange={(v) => patch({ quoteMailSubject: v })}
      />
      <TextArea
        label="HTML (mit Signatur)"
        value={form.quoteMailBodyHtml}
        rows={10}
        hint="Platzhalter: {nummer} {kunde} {firma} {betrag} {datum} {gueltigbis}"
        onChange={(v) => patch({ quoteMailBodyHtml: v })}
      />
      <TextArea
        label="Nur-Text-Fassung"
        value={form.quoteMailBody}
        rows={5}
        hint="Leer lassen – dann wird sie aus dem HTML abgeleitet."
        onChange={(v) => patch({ quoteMailBody: v })}
      />

      <div className="section-title">Kopie im Ordner „Gesendet“</div>
      <Alert kind="info">
        SMTP stellt nur zu – eine Kopie im eigenen Postfach entsteht dabei nicht.
        Wird das hier eingeschaltet, legt invoicelite jede verschickte Nachricht
        zusätzlich per IMAP im Ordner „Gesendet“ ab.
      </Alert>
      <div className="grid-3">
        <Select
          label="Kopie ablegen"
          value={form.imapCopyEnabled ? 'an' : 'aus'}
          onChange={(v) => patch({ imapCopyEnabled: v === 'an' })}
          options={[
            { value: 'aus', label: 'Ausgeschaltet' },
            { value: 'an', label: 'Eingeschaltet' },
          ]}
        />
        <TextInput
          label="IMAP-Server"
          value={form.imapHost}
          hint="z.B. imap.ionos.de"
          onChange={(v) => patch({ imapHost: v })}
        />
        <TextInput
          label="Port"
          type="number"
          value={form.imapPort}
          hint="993 verschlüsselt, 143 mit STARTTLS"
          onChange={(v) => patch({ imapPort: Number(v) })}
        />
      </div>
      <div className="grid-3">
        <Select
          label="Verschlüsselung"
          value={form.imapSecure ? 'ssl' : 'starttls'}
          onChange={(v) => patch({ imapSecure: v === 'ssl' })}
          options={[
            { value: 'ssl', label: 'Durchgehend (Port 993)' },
            { value: 'starttls', label: 'STARTTLS (Port 143)' },
          ]}
        />
        <TextInput
          label="Benutzername"
          value={form.imapUser}
          hint="Leer = wie beim Postausgang"
          onChange={(v) => patch({ imapUser: v })}
        />
        <TextInput
          label="Ordner"
          value={form.imapSentFolder}
          hint="Leer = automatisch bestimmen"
          onChange={(v) => patch({ imapSentFolder: v })}
        />
      </div>
      <div className="field">
        <label>IMAP-Passwort</label>
        <input
          type="password"
          value={imapPasswort}
          placeholder={
            form.imapPasswordSet ? '•••••••• (hinterlegt)' : 'leer = wie beim Postausgang'
          }
          onChange={(e) => {
            setImapPasswort(e.target.value);
            patch({ imapPassword: e.target.value });
          }}
        />
        <div className="hint">
          Bei einem Postfach ist es dasselbe wie beim Postausgang – dann leer lassen.
        </div>
      </div>

      <div className="section-title">Erproben</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Erst speichern, dann prüfen – geprüft werden die gespeicherten Angaben.
      </p>
      <div className="toolbar">
        <button onClick={pruefen} disabled={busy}>
          Verbindung prüfen
        </button>
        <input
          type="email"
          placeholder="Adresse für die Testmail"
          value={testAdresse}
          onChange={(e) => setTestAdresse(e.target.value)}
        />
        <button onClick={testmail} disabled={busy || !testAdresse}>
          Testmail senden
        </button>
        {form.imapCopyEnabled && (
          <button onClick={pruefeOrdner} disabled={busy}>
            Gesendet-Ordner prüfen
          </button>
        )}
      </div>
    </div>
  );
}
