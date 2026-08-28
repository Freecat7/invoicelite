import { useCallback, useEffect, useRef, useState } from 'react';

const THEME_KEY = 'invoicelite-theme';

/**
 * Haelt das Farbschema fest. Dunkel ist der Standard; die Wahl bleibt im
 * Browser gespeichert. Das Setzen beim ersten Laden erledigt bereits ein
 * kleines Skript in index.html, damit nichts aufblitzt.
 */
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.dataset.theme = 'light';
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Privater Modus o.ae. - dann gilt die Wahl nur fuer diese Sitzung.
    }
    // Der Akzentton unterscheidet sich je Schema und muss deshalb nach
    // jedem Wechsel neu abgeleitet werden.
    window.dispatchEvent(new CustomEvent('invoicelite:schema'));
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    [],
  );

  return [theme, toggle];
}

/**
 * Verzoegert einen Wert, damit Filterfelder nicht bei jedem Tastendruck eine
 * Anfrage ausloesen.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

interface ListState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/**
 * Laedt Daten von der API und haelt Lade- und Fehlerzustand fest.
 *
 * Antworten ueberholter Anfragen werden verworfen: Wenn waehrend einer
 * laufenden Anfrage eine neue startet (z.B. weil der Suchbegriff sich
 * geaendert hat), darf die spaeter eintreffende alte Antwort das Ergebnis
 * nicht mehr ueberschreiben.
 */
export function useApiData<T>(
  loader: () => Promise<T>,
  deps: unknown[],
): ListState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const current = ++requestId.current;
    setLoading(true);

    loader()
      .then((result) => {
        if (current !== requestId.current) return;
        setData(result);
        setError('');
      })
      .catch((err: unknown) => {
        if (current !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      })
      .finally(() => {
        if (current === requestId.current) setLoading(false);
      });
    // loader wird bewusst nicht beobachtet - die Aufrufer geben die
    // relevanten Abhaengigkeiten explizit an.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  return { data, loading, error, reload };
}
