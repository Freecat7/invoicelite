import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useDebounced } from '../hooks';
import { Client } from '../types';
import { PageHead } from '../components/Layout';
import {
  Alert,
  Checkbox,
  EmptyState,
  FormModal,
  TextArea,
  TextInput,
  useConfirm,
} from '../components/ui';

const EMPTY: Client = {
  id: 0,
  name: '',
  contactName: '',
  email: '',
  phone: '',
  addressLine: '',
  postalCode: '',
  city: '',
  country: 'DE',
  vatId: '',
  notes: '',
  archived: false,
};

export function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  // Erst nach kurzer Tipppause laden, statt bei jedem Zeichen.
  const debouncedSearch = useDebounced(search);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (showArchived) params.set('archived', 'true');
    api
      .get<Client[]>(`/clients?${params}`)
      .then(setClients)
      .catch((err) => setError(err.message));
  };

  useEffect(load, [debouncedSearch, showArchived]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const { id, ...payload } = editing;
      if (id) {
        await api.put(`/clients/${id}`, payload);
      } else {
        await api.post('/clients', payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (client: Client) => {
    const ok = await confirm(
      `Kunde „${client.name}" wirklich löschen? Kunden mit vorhandenen Belegen werden stattdessen archiviert.`,
    );
    if (!ok) return;
    try {
      await api.delete(`/clients/${client.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  };

  const patch = (changes: Partial<Client>) =>
    setEditing((current) => (current ? { ...current, ...changes } : current));

  // Ueber das Plus in der Seitenleiste: ?neu=1 oeffnet die Neuanlage
  // und wird danach wieder aus der Adresse entfernt.
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    setEditing({ ...EMPTY });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div>
      <PageHead
        title="Kunden"
        subtitle="Stammdaten Ihrer Auftraggeber"
        actions={
          <button className="primary" onClick={() => setEditing({ ...EMPTY })}>
            Neuer Kunde
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Suche nach Name, E-Mail oder Ort…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span className="muted">Archivierte anzeigen</span>
        </label>
      </div>

      <div className="card">
        <div className="card-body tight">
          {clients.length === 0 ? (
            <EmptyState>Keine Kunden gefunden.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Ansprechpartner</th>
                  <th>Ort</th>
                  <th>E-Mail</th>
                  <th>USt-IdNr.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <button className="link" onClick={() => setEditing(client)}>
                        {client.name}
                      </button>
                      {client.archived && (
                        <span className="badge gray" style={{ marginLeft: 6 }}>
                          Archiviert
                        </span>
                      )}
                    </td>
                    <td>{client.contactName || '—'}</td>
                    <td>
                      {client.postalCode} {client.city}
                    </td>
                    <td>{client.email || '—'}</td>
                    <td className="mono">{client.vatId || '—'}</td>
                    <td className="actions">
                      <button className="link" onClick={() => setEditing(client)}>
                        Bearbeiten
                      </button>
                      <button className="link" onClick={() => remove(client)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <FormModal
          title={editing.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}
          onClose={() => setEditing(null)}
          onSubmit={save}
          busy={busy}
        >
          <TextInput
            label="Firma / Name"
            value={editing.name}
            required
            onChange={(v) => patch({ name: v })}
          />
          <div className="grid-2">
            <TextInput
              label="Ansprechpartner"
              value={editing.contactName}
              onChange={(v) => patch({ contactName: v })}
            />
            <TextInput
              label="USt-IdNr."
              value={editing.vatId}
              onChange={(v) => patch({ vatId: v })}
            />
          </div>
          <div className="grid-2">
            <TextInput
              label="E-Mail"
              type="email"
              value={editing.email}
              onChange={(v) => patch({ email: v })}
            />
            <TextInput
              label="Telefon"
              value={editing.phone}
              onChange={(v) => patch({ phone: v })}
            />
          </div>
          <TextInput
            label="Straße und Hausnummer"
            value={editing.addressLine}
            onChange={(v) => patch({ addressLine: v })}
          />
          <div className="grid-3">
            <TextInput
              label="PLZ"
              value={editing.postalCode}
              onChange={(v) => patch({ postalCode: v })}
            />
            <TextInput
              label="Ort"
              value={editing.city}
              onChange={(v) => patch({ city: v })}
            />
            <TextInput
              label="Land"
              value={editing.country}
              hint="Ländercode, z.B. DE"
              onChange={(v) => patch({ country: v })}
            />
          </div>
          <TextArea
            label="Notizen"
            value={editing.notes}
            onChange={(v) => patch({ notes: v })}
          />
          {editing.id > 0 && (
            <Checkbox
              label="Archiviert"
              checked={editing.archived}
              onChange={(v) => patch({ archived: v })}
              hint="Archivierte Kunden erscheinen nicht mehr in der Auswahl."
            />
          )}
        </FormModal>
      )}

      {dialog}
    </div>
  );
}
