/**
 * Design-token bridge.
 *
 * The single source of truth for the design system is the CSS custom-property
 * block in `src/app/globals.css` (`:root { --accent, --bg, --fg, ... }`).
 * Tailwind utilities and component styles already consume those variables.
 *
 * Canvas / WebGL animations can't use `var(--accent)` directly — they need real
 * numeric colors. This module reads the SAME CSS variables at runtime and hands
 * back parsed forms (rgb array, hex, 0xRRGGBB int for three.js, an rgba()
 * builder, and the "r, g, b" string used in canvas templates). Change a token
 * once in globals.css and every consumer — CSS and animations — updates.
 *
 * Call `themeColors()` (or `color(name)`) from inside a client effect, after
 * mount, so `getComputedStyle` sees the resolved theme.
 */

export type RGB = [number, number, number];

/** Fallbacks mirror the globals.css defaults — used only during SSR or if a
 *  variable is somehow missing. globals.css remains the source of truth. */
const FALLBACK: Record<string, string> = {
  '--accent': '#d4ff00',
  '--accent-soft': '#a3c200',
  '--accent-fg': '#0a0a0a',
  '--bg': '#050505',
  '--bg-elevated': '#0d0d0d',
  '--bg-soft': '#141414',
  '--fg': '#f5f5f5',
  '--fg-strong': '#ffffff',
  '--fg-muted': '#8c8c8c',
  '--fg-subtle': '#5a5a5a',
  '--border': '#1e1e1e',
  '--border-strong': '#2e2e2e',
};

/** Read a raw CSS variable from :root (trimmed). Falls back to the known
 *  default, then to the provided fallback. */
export function cssVar(name: string, fallback = ''): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACK[name] ?? fallback;
}

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Parse "#rgb", "#rrggbb", "rgb(...)" or "rgba(...)" into an [r,g,b] tuple. */
export function parseColor(input: string): RGB {
  const s = input.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).map(Number);
    return [clamp255(parts[0]), clamp255(parts[1]), clamp255(parts[2])];
  }
  return [212, 255, 0];
}

export type Color = {
  /** original CSS value (resolved), e.g. "rgb(212, 255, 0)" */
  css: string;
  rgb: RGB;
  /** "#d4ff00" */
  hex: string;
  /** 0xd4ff00 — for THREE.Color / 0x literals */
  int: number;
  /** "212, 255, 0" — drop into `rgba(${c.rgbStr}, 0.4)` canvas templates */
  rgbStr: string;
  /** rgba string builder, e.g. accent.rgba(0.4) → "rgba(212, 255, 0, 0.4)" */
  rgba: (alpha: number) => string;
  /** normalized [r,g,b] in 0..1 — for GLSL vec3 uniforms */
  glsl: RGB;
};

/** Resolve a CSS color variable into every form the animations need. */
export function color(varName: string, fallbackHex?: string): Color {
  const css = cssVar(varName, fallbackHex);
  const rgb = parseColor(css || fallbackHex || '#d4ff00');
  const [r, g, b] = rgb;
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return {
    css: css || hex,
    rgb,
    hex,
    int: (r << 16) | (g << 8) | b,
    rgbStr: `${r}, ${g}, ${b}`,
    rgba: (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`,
    glsl: [r / 255, g / 255, b / 255],
  };
}

/** Snapshot of the design-system colors most used by animations. */
export function themeColors() {
  return {
    accent: color('--accent'),
    accentSoft: color('--accent-soft'),
    accentFg: color('--accent-fg'),
    bg: color('--bg'),
    bgElevated: color('--bg-elevated'),
    bgSoft: color('--bg-soft'),
    fg: color('--fg'),
    fgStrong: color('--fg-strong'),
    fgMuted: color('--fg-muted'),
    fgSubtle: color('--fg-subtle'),
    border: color('--border'),
  };
}

export type ThemeColors = ReturnType<typeof themeColors>;
