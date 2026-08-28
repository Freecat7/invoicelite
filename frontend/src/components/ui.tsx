import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from 'react';
import { EXPENSE_STATUS_LABELS, INVOICE_STATUS_LABELS, QUOTE_STATUS_LABELS, RECURRING_STATUS_LABELS, UNITS } from '../format';

/** Beschriftetes Formularfeld. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  placeholder,
  required,
  step,
  min,
}: TextInputProps) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        step={step}
        min={min}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          style={{ width: 'auto' }}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Schliessen per Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={wide ? 'modal wide' : 'modal'}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="link" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Modal mit Formular-Semantik, damit Enter zum Speichern führt. */
export function FormModal({
  title,
  onClose,
  onSubmit,
  children,
  submitLabel = 'Speichern',
  busy,
  wide,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  submitLabel?: string;
  busy?: boolean;
  wide?: boolean;
}) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className={wide ? 'modal wide' : 'modal'} onSubmit={handleSubmit}>
        <div className="modal-head">
          <span>{title}</span>
          <button
            type="button"
            className="link"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Speichert…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Alert({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success' | 'warn';
  children: ReactNode;
}) {
  if (!children) return null;
  return <div className={`alert ${kind}`}>{children}</div>;
}

const INVOICE_TONES: Record<string, string> = {
  draft: 'gray',
  approved: 'amber',
  sent: 'blue',
  partial: 'amber',
  paid: 'green',
  overdue: 'red',
  cancelled: 'gray',
  reversed: 'gray',
};

const QUOTE_TONES: Record<string, string> = {
  draft: 'gray',
  sent: 'blue',
  approved: 'green',
  declined: 'red',
  converted: 'green',
  expired: 'gray',
};

const EXPENSE_TONES: Record<string, string> = {
  pending: 'amber',
  paid: 'green',
  reimbursed: 'blue',
};

const RECURRING_TONES: Record<string, string> = {
  active: 'green',
  paused: 'amber',
  finished: 'gray',
};

export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: 'invoice' | 'quote' | 'expense' | 'recurring';
}) {
  const [labels, tones] =
    kind === 'invoice'
      ? [INVOICE_STATUS_LABELS, INVOICE_TONES]
      : kind === 'quote'
        ? [QUOTE_STATUS_LABELS, QUOTE_TONES]
        : kind === 'expense'
          ? [EXPENSE_STATUS_LABELS, EXPENSE_TONES]
          : [RECURRING_STATUS_LABELS, RECURRING_TONES];

  return (
    <span className={`badge ${tones[status] || 'gray'}`}>
      {labels[status] || status}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Bestätigungsdialog für destruktive Aktionen. */
export function useConfirm() {
  const [state, setState] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = (message: string) =>
    new Promise<boolean>((resolve) => setState({ message, resolve }));

  const dialog = state ? (
    <Modal
      title="Bitte bestätigen"
      onClose={() => {
        state.resolve(false);
        setState(null);
      }}
      footer={
        <>
          <button
            onClick={() => {
              state.resolve(false);
              setState(null);
            }}
          >
            Abbrechen
          </button>
          <button
            className="primary"
            onClick={() => {
              state.resolve(true);
              setState(null);
            }}
          >
            Ja, fortfahren
          </button>
        </>
      }
    >
      {state.message}
    </Modal>
  ) : null;

  return { confirm, dialog };
}


/**
 * Auswahl der Einheit. Ein Wert, der nicht in der Liste steht - etwa aus
 * einem aelteren Beleg - wird vorangestellt, damit das Speichern ihn nicht
 * stillschweigend aendert.
 */
export function UnitSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const bekannt = UNITS.includes(value);
  const feld = (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!bekannt && value !== '' && <option value={value}>{value}</option>}
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
  if (!label) return feld;
  return (
    <div className="field">
      <label>{label}</label>
      {feld}
    </div>
  );
}
