import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useDebounced } from '../hooks';
import { Product, Settings } from '../types';
import { decimal, money } from '../format';
import { PageHead } from '../components/Layout';
import { Alert, Checkbox, EmptyState, FormModal, TextArea, TextInput, UnitSelect, useConfirm } from '../components/ui';

export function ProductsPage({ settings }: { settings: Settings }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  // Erst nach kurzer Tipppause laden, statt bei jedem Zeichen.
  const debouncedSearch = useDebounced(search);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const emptyProduct = (): Product => ({
    id: 0,
    sku: '',
    name: '',
    description: '',
    unitPrice: 0,
    unit: 'Stk.',
    taxRate: settings.defaultTaxRate,
    archived: false,
  });

  const load = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (showArchived) params.set('archived', 'true');
    api
      .get<Product[]>(`/products?${params}`)
      .then(setProducts)
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
        await api.put(`/products/${id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product: Product) => {
    const ok = await confirm(`Produkt „${product.name}" wirklich löschen?`);
    if (!ok) return;
    try {
      await api.delete(`/products/${product.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  };

  const patch = (changes: Partial<Product>) =>
    setEditing((current) => (current ? { ...current, ...changes } : current));

  // Ueber das Plus in der Seitenleiste: ?neu=1 oeffnet die Neuanlage
  // und wird danach wieder aus der Adresse entfernt.
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return;
    setEditing(emptyProduct());
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <div>
      <PageHead
        title="Produkte"
        subtitle="Vorlagen für wiederkehrende Positionen in Belegen"
        actions={
          <button className="primary" onClick={() => setEditing(emptyProduct())}>
            Neues Produkt
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      <div className="toolbar">
        <input
          type="text"
          placeholder="Suche nach Name, Artikelnummer…"
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
          {products.length === 0 ? (
            <EmptyState>Keine Produkte gefunden.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Artikelnr.</th>
                  <th>Name</th>
                  <th>Einheit</th>
                  <th className="num">Preis</th>
                  <th className="num">USt.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td className="mono">{product.sku || '—'}</td>
                    <td>
                      <button className="link" onClick={() => setEditing(product)}>
                        {product.name}
                      </button>
                      {product.archived && (
                        <span className="badge gray" style={{ marginLeft: 6 }}>
                          Archiviert
                        </span>
                      )}
                      {product.description && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {product.description.slice(0, 90)}
                        </div>
                      )}
                    </td>
                    <td>{product.unit}</td>
                    <td className="num">{money(product.unitPrice)}</td>
                    <td className="num">{decimal(product.taxRate, 0)} %</td>
                    <td className="actions">
                      <button className="link" onClick={() => setEditing(product)}>
                        Bearbeiten
                      </button>
                      <button className="link" onClick={() => remove(product)}>
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
          title={editing.id ? 'Produkt bearbeiten' : 'Neues Produkt'}
          onClose={() => setEditing(null)}
          onSubmit={save}
          busy={busy}
        >
          <div className="grid-2">
            <TextInput
              label="Name"
              value={editing.name}
              required
              onChange={(v) => patch({ name: v })}
            />
            <TextInput
              label="Artikelnummer"
              value={editing.sku}
              onChange={(v) => patch({ sku: v })}
            />
          </div>
          <TextArea
            label="Beschreibung"
            value={editing.description}
            onChange={(v) => patch({ description: v })}
          />
          <div className="grid-3">
            <TextInput
              label="Einzelpreis (netto)"
              type="number"
              step="0.01"
              value={editing.unitPrice}
              onChange={(v) => patch({ unitPrice: Number(v) })}
            />
            <UnitSelect
              label="Einheit"
              value={editing.unit}
              onChange={(v) => patch({ unit: v })}
            />
            <TextInput
              label="USt.-Satz (%)"
              type="number"
              step="0.1"
              value={editing.taxRate}
              onChange={(v) => patch({ taxRate: Number(v) })}
            />
          </div>
          {editing.id > 0 && (
            <Checkbox
              label="Archiviert"
              checked={editing.archived}
              onChange={(v) => patch({ archived: v })}
            />
          )}
        </FormModal>
      )}

      {dialog}
    </div>
  );
}
