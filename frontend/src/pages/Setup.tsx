import { useState } from 'react';
import { api } from '../api/client';
import { Settings } from '../types';
import { TAX_REGIME_LABELS } from '../format';
import { Alert, Select, TextInput } from '../components/ui';

/**
 * Einrichtung beim ersten Start.
 *
 * Bewusst in Schritten statt als eine lange Seite: die Fragen gehoeren zu
 * verschiedenen Themen, und wer sie am Stueck sieht, ueberspringt sie eher.
 * Gefragt wird nur, was sich nicht sinnvoll vorbelegen laesst - alles
 * Uebrige steht in den Einstellungen.
 */

interface Form {
  companyName: string;
  ownerName: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  taxRegime: string;
  vatId: string;
  taxNumber: string;
  defaultTaxRate: number;
  accountHolder: string;
  bankName: string;
  iban: string;
  bic: string;
  invoiceNumberPrefix: string;
  invoiceNumberNext: number;
  paymentTermDays: number;
  loginEmail: string;
  newPassword: string;
}

const SCHRITTE = [
  { titel: 'Ihre Firma', text: 'Diese Angaben stehen auf jedem Beleg.' },
  {
    titel: 'Steuer',
    text: 'Bestimmt, ob auf Ihren Rechnungen Umsatzsteuer ausgewiesen wird.',
  },
  {
    titel: 'Bankverbindung',
    text: 'Erscheint auf der Rechnung und im QR-Code zum Überweisen.',
  },
  { titel: 'Belege', text: 'Nummernkreis und Zahlungsziel.' },
  { titel: 'Zugang', text: 'Ihre Anmeldedaten für die Anwendung.' },
];

export function SetupPage({
  settings,
  user,
  onFertig,
}: {
  settings: Settings;
  user: { email: string };
  onFertig: () => void;
}) {
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>({
    companyName: settings.companyName || '',
    ownerName: settings.ownerName || '',
    addressLine: settings.addressLine || '',
    postalCode: settings.postalCode || '',
    city: settings.city || '',
    country: settings.country || 'DE',
    email: settings.email || user.email,
    phone: settings.phone || '',
    website: settings.website || '',
    taxRegime: settings.taxRegime || 'small_business',
    vatId: settings.vatId || '',
    taxNumber: settings.taxNumber || '',
    defaultTaxRate: settings.defaultTaxRate ?? 19,
    accountHolder: settings.accountHolder || '',
    bankName: settings.bankName || '',
    iban: settings.iban || '',
    bic: settings.bic || '',
    invoiceNumberPrefix: settings.invoiceNumberPrefix || 'RE-',
    invoiceNumberNext: settings.invoiceNumberNext ?? 1,
    paymentTermDays: settings.paymentTermDays ?? 14,
    loginEmail: user.email,
    newPassword: '',
  });

  const patch = (c: Partial<Form>) => setForm((f) => ({ ...f, ...c }));

  /** Prueft nur den aktuellen Schritt - sonst meckert er über Felder,
      die man noch gar nicht gesehen hat. */
  const schrittPruefen = (): string => {
    if (schritt === 0) {
      if (!form.companyName.trim()) return 'Bitte den Firmennamen angeben.';
      if (!form.addressLine.trim()) return 'Bitte Straße und Hausnummer angeben.';
      if (!form.postalCode.trim() || !form.city.trim())
        return 'Bitte PLZ und Ort angeben.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email))
        return 'Bitte eine gültige E-Mail-Adresse angeben.';
      if (form.phone.replace(/\D/g, '').length < 3)
        return 'Bitte eine Telefonnummer angeben – für E-Rechnungen ist sie Pflicht.';
    }
    if (schritt === 1 && !form.vatId.trim() && !form.taxNumber.trim())
      return 'Bitte USt-IdNr. oder Steuernummer angeben.';
    if (schritt === 4) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.loginEmail))
        return 'Bitte eine gültige E-Mail-Adresse für die Anmeldung angeben.';
      if (form.newPassword && form.newPassword.length < 10)
        return 'Das Passwort braucht mindestens 10 Zeichen.';
    }
    return '';
  };

  const weiter = () => {
    const problem = schrittPruefen();
    if (problem) {
      setFehler(problem);
      return;
    }
    setFehler('');
    setSchritt((s) => s + 1);
  };

  const speichern = async () => {
    const problem = schrittPruefen();
    if (problem) {
      setFehler(problem);
      return;
    }
    setBusy(true);
    setFehler('');
    try {
      await api.post('/setup', {
        ...form,
        newPassword: form.newPassword || undefined,
      });
      onFertig();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
      setBusy(false);
    }
  };

  const ueberspringen = async () => {
    setBusy(true);
    try {
      await api.post('/setup/skip', {});
      onFertig();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehlgeschlagen');
      setBusy(false);
    }
  };

  const letzter = schritt === SCHRITTE.length - 1;

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div className="setup-head">
          <div className="setup-brand">{settings.appName || 'invoicelite'}</div>
          <div className="setup-fortschritt">
            {SCHRITTE.map((s, i) => (
              <span
                key={s.titel}
                className={
                  i === schritt ? 'aktiv' : i < schritt ? 'erledigt' : ''
                }
                title={s.titel}
              />
            ))}
          </div>
        </div>

        <h1>{SCHRITTE[schritt].titel}</h1>
        <p className="setup-text">{SCHRITTE[schritt].text}</p>

        {fehler && <Alert kind="error">{fehler}</Alert>}

        {schritt === 0 && (
          <>
            <TextInput
              label="Firmenname"
              value={form.companyName}
              onChange={(v) => patch({ companyName: v })}
            />
            <TextInput
              label="Inhaber/in"
              value={form.ownerName}
              hint="Erscheint in der Fußzeile des Belegs"
              onChange={(v) => patch({ ownerName: v })}
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
                label="E-Mail"
                type="email"
                value={form.email}
                onChange={(v) => patch({ email: v })}
              />
              <TextInput
                label="Telefon"
                value={form.phone}
                hint="Für E-Rechnungen Pflicht"
                onChange={(v) => patch({ phone: v })}
              />
              <TextInput
                label="Website"
                value={form.website}
                onChange={(v) => patch({ website: v })}
              />
            </div>
          </>
        )}

        {schritt === 1 && (
          <>
            <Select
              label="Wie versteuern Sie?"
              value={form.taxRegime}
              onChange={(v) => patch({ taxRegime: v })}
              options={Object.entries(TAX_REGIME_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            {form.taxRegime === 'small_business' && (
              <Alert kind="info">
                Als Kleinunternehmer nach § 19 UStG weisen Sie keine
                Umsatzsteuer aus. Der entsprechende Hinweis erscheint
                automatisch auf jedem Beleg.
              </Alert>
            )}
            <div className="grid-2">
              <TextInput
                label="USt-IdNr."
                value={form.vatId}
                hint="z.B. DE123456789"
                onChange={(v) => patch({ vatId: v })}
              />
              <TextInput
                label="Steuernummer"
                value={form.taxNumber}
                hint="Eines von beiden genügt"
                onChange={(v) => patch({ taxNumber: v })}
              />
            </div>
            {form.taxRegime === 'standard' && (
              <TextInput
                label="Üblicher Steuersatz (%)"
                type="number"
                value={form.defaultTaxRate}
                hint="Vorbelegung neuer Positionen"
                onChange={(v) => patch({ defaultTaxRate: Number(v) })}
              />
            )}
          </>
        )}

        {schritt === 2 && (
          <>
            <TextInput
              label="Kontoinhaber"
              value={form.accountHolder}
              hint="Leer = Firmenname"
              onChange={(v) => patch({ accountHolder: v })}
            />
            <TextInput
              label="Bank"
              value={form.bankName}
              onChange={(v) => patch({ bankName: v })}
            />
            <div className="grid-2">
              <TextInput
                label="IBAN"
                value={form.iban}
                onChange={(v) => patch({ iban: v })}
              />
              <TextInput
                label="BIC"
                value={form.bic}
                onChange={(v) => patch({ bic: v })}
              />
            </div>
            <Alert kind="info">
              Ohne IBAN entfallen die Zahlungsinformationen und der QR-Code auf
              der Rechnung. Sie können das später nachtragen.
            </Alert>
          </>
        )}

        {schritt === 3 && (
          <>
            <div className="grid-2">
              <TextInput
                label="Präfix der Rechnungsnummer"
                value={form.invoiceNumberPrefix}
                hint="z.B. RE-"
                onChange={(v) => patch({ invoiceNumberPrefix: v })}
              />
              <TextInput
                label="Erste Rechnungsnummer"
                type="number"
                min="1"
                value={form.invoiceNumberNext}
                hint="Führen Sie eine bestehende Nummerierung fort? Dann hier anknüpfen."
                onChange={(v) => patch({ invoiceNumberNext: Number(v) })}
              />
            </div>
            <TextInput
              label="Zahlungsziel (Tage)"
              type="number"
              min="0"
              value={form.paymentTermDays}
              onChange={(v) => patch({ paymentTermDays: Number(v) })}
            />
            <Alert kind="info">
              Die erste Rechnung heißt dann{' '}
              <strong>
                {form.invoiceNumberPrefix}
                {String(form.invoiceNumberNext).padStart(4, '0')}
              </strong>
              . Der Nummernkreis läuft lückenlos weiter, auch über den
              Jahreswechsel.
            </Alert>
          </>
        )}

        {schritt === 4 && (
          <>
            <TextInput
              label="E-Mail für die Anmeldung"
              type="email"
              value={form.loginEmail}
              onChange={(v) => patch({ loginEmail: v })}
            />
            <div className="field">
              <label>Neues Passwort</label>
              <input
                type="password"
                value={form.newPassword}
                placeholder="leer lassen, um es nicht zu ändern"
                onChange={(e) => patch({ newPassword: e.target.value })}
              />
              <div className="hint">
                Mindestens 10 Zeichen. Das Startpasswort stammt aus der
                Umgebungsvariable und steht damit in der Shell-Historie – ein
                eigenes ist besser.
              </div>
            </div>
          </>
        )}

        <div className="setup-fuss">
          <button onClick={ueberspringen} disabled={busy} className="link">
            Später einrichten
          </button>
          <div className="setup-tasten">
            {schritt > 0 && (
              <button onClick={() => setSchritt((s) => s - 1)} disabled={busy}>
                Zurück
              </button>
            )}
            {letzter ? (
              <button className="primary" onClick={speichern} disabled={busy}>
                {busy ? 'Speichert…' : 'Fertig'}
              </button>
            ) : (
              <button className="primary" onClick={weiter} disabled={busy}>
                Weiter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
