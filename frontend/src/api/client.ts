/**
 * Schmaler Fetch-Wrapper fuer die JSON-API. Cookies werden immer
 * mitgeschickt, damit die Sitzung greift.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error || `Fehler ${response.status}`,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Datei-Upload via multipart/form-data. */
  upload: async <T>(path: string, field: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append(field, file);
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || 'Upload fehlgeschlagen');
    }
    return data as T;
  },

  /**
   * Oeffnet einen Download (PDF/XML). Fehler werden aus der JSON-Antwort
   * gelesen, damit z.B. fehlende E-Rechnungs-Angaben sichtbar werden.
   */
  download: async (path: string, filename: string): Promise<void> => {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const text = await response.text();
      let message = `Fehler ${response.status}`;
      try {
        message = JSON.parse(text).error || message;
      } catch {
        // Antwort war kein JSON.
      }
      throw new ApiError(response.status, message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
