/**
 * Leitet die Akzenttoene der Oberflaeche aus einer einzelnen Farbe ab.
 *
 * Eine feste Farbe reicht nicht: derselbe Ton, der auf Weiss gut lesbar
 * ist, verschwindet auf dunklem Grund. Deshalb wird die Helligkeit je
 * Farbschema in ein Band gezogen und die Schriftfarbe darauf nach
 * Kontrast gewaehlt - sonst waere ein heller Akzent mit weisser Schrift
 * unlesbar.
 */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexZuHsl(hex: string): Hsl | null {
  const treffer = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!treffer) return null;
  const zahl = parseInt(treffer[1], 16);
  const r = ((zahl >> 16) & 255) / 255;
  const g = ((zahl >> 8) & 255) / 255;
  const b = (zahl & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

const hsl = ({ h, s, l }: Hsl, alpha?: number) =>
  alpha === undefined
    ? `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
    : `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${alpha})`;

const grenze = (wert: number, min: number, max: number) =>
  Math.min(max, Math.max(min, wert));

export interface AkzentToene {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentOn: string;
}

export function leiteAkzentAb(hex: string, dunkel: boolean): AkzentToene | null {
  const basis = hexZuHsl(hex);
  if (!basis) return null;

  // Sehr blasse Farben taugen nicht als Akzent - Saettigung anheben.
  const s = Math.max(basis.s, 25);
  // Helligkeitsband je Schema: auf Dunkel muss der Ton heller sein, damit
  // er sich abhebt; auf Hell dunkler, damit weisse Schrift darauf traegt.
  const l = dunkel
    ? grenze(basis.l, 55, 78)
    : grenze(basis.l, 26, 46);

  const akzent = { h: basis.h, s, l };
  return {
    accent: hsl(akzent),
    accentHover: hsl({ ...akzent, l: grenze(dunkel ? l + 8 : l - 8, 8, 92) }),
    accentSoft: hsl(akzent, dunkel ? 0.17 : 0.13),
    // Schrift auf dem Akzent: Schwarz auf hellem Ton, Weiss auf dunklem.
    accentOn: l > 55 ? 'hsl(0 0% 8%)' : '#ffffff',
  };
}

/** Setzt die Toene als CSS-Variablen auf das Wurzelelement. */
export function setzeAkzent(hex: string): void {
  const wurzel = document.documentElement;
  const dunkel = wurzel.dataset.theme !== 'light';
  const toene = leiteAkzentAb(hex, dunkel);
  if (!toene) return;
  wurzel.style.setProperty('--accent', toene.accent);
  wurzel.style.setProperty('--accent-hover', toene.accentHover);
  wurzel.style.setProperty('--accent-soft', toene.accentSoft);
  wurzel.style.setProperty('--accent-on', toene.accentOn);
}
