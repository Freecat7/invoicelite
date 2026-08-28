import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

/** Faengt Fehler aus async-Handlern ab und reicht sie an Express weiter. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Ungültige ID');
  }
  return id;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validiert den Request-Body und wirft bei Fehlern einen 400er. */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'Wert'}: ${issue.message}`)
      .join('; ');
    throw new HttpError(400, message);
  }
  return parsed.data;
}

/** Optionales Datum aus dem Request; leere Strings gelten als "nicht gesetzt". */
export const dateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  });

export const lineSchema = z.object({
  description: z.string().default(''),
  quantity: z.coerce.number().default(1),
  unit: z.string().default('Stk.'),
  unitPrice: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(0),
});

export type LineInputDto = z.infer<typeof lineSchema>;

/**
 * Baut eine CSV-Zeile nach RFC 4180: Felder mit Trennzeichen, Anfuehrungs-
 * zeichen oder Zeilenumbruch werden gequotet, innere Quotes verdoppelt.
 * Als Trennzeichen dient das Semikolon, das Excel im deutschen Sprachraum
 * erwartet.
 */
export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
  separator = ';',
): string {
  const escape = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /["\r\n;,\t]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  return [header, ...rows]
    .map((row) => row.map(escape).join(separator))
    .join('\r\n');
}
