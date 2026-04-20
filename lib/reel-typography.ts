/** Reel / CinematicReel typography — mirrors slide preset font stacks (layout.tsx). */

export type ReelTypographyId =
  | 'syne'
  | 'brutal'
  | 'editorial'
  | 'swiss'
  | 'mono'
  | 'fraunces'
  | 'quiet'
  | 'zine'
  | 'luxe'
  | 'signal'
  | 'magazine'
  | 'glitch'
  | 'neo';

export type ReelDecorId = 'none' | 'minimal' | 'film' | 'chrome';
export type ReelThemeId =
  | 'impact'
  | 'brutal'
  | 'editorial'
  | 'swiss'
  | 'terminal'
  | 'manifesto'
  | 'luxe'
  | 'signal'
  | 'magazine'
  | 'glitch'
  | 'neo';

export const REEL_TYPOGRAPHY: Record<
  ReelTypographyId,
  { label: string; captionFont: string; kickerFont: string; theme: ReelThemeId }
> = {
  syne: {
    label: 'DISPLAY',
    captionFont: "var(--font-syne), 'Arial Black', system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), 'Courier New', monospace",
    theme: 'impact',
  },
  brutal: {
    label: 'BRUTAL',
    captionFont: "var(--font-archivo-black), system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), monospace",
    theme: 'brutal',
  },
  editorial: {
    label: 'EDITORIAL',
    captionFont: "var(--font-playfair), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
    theme: 'editorial',
  },
  swiss: {
    label: 'SWISS',
    captionFont: "var(--font-space-grotesk), system-ui, sans-serif",
    kickerFont: "var(--font-space-grotesk), system-ui, sans-serif",
    theme: 'swiss',
  },
  mono: {
    label: 'MONO',
    captionFont: "var(--font-dm-mono), monospace",
    kickerFont: "var(--font-dm-mono), monospace",
    theme: 'terminal',
  },
  fraunces: {
    label: 'MANIFESTO',
    captionFont: "var(--font-fraunces), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
    theme: 'manifesto',
  },
  quiet: {
    label: 'QUIET',
    captionFont: "var(--font-instrument-serif), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
    theme: 'editorial',
  },
  zine: {
    label: 'ZINE',
    captionFont: "var(--font-bricolage), system-ui, sans-serif",
    kickerFont: "var(--font-bricolage), system-ui, sans-serif",
    theme: 'brutal',
  },
  luxe: {
    label: 'LUXE',
    captionFont: "var(--font-instrument-serif), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
    theme: 'luxe',
  },
  signal: {
    label: 'SIGNAL',
    captionFont: "var(--font-syne), 'Arial Black', system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), 'Courier New', monospace",
    theme: 'signal',
  },
  magazine: {
    label: 'MAGAZINE',
    captionFont: "var(--font-playfair), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
    theme: 'magazine',
  },
  glitch: {
    label: 'GLITCH',
    captionFont: "var(--font-syne), 'Arial Black', system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), monospace",
    theme: 'glitch',
  },
  neo: {
    label: 'NEO',
    captionFont: "var(--font-space-grotesk), system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), monospace",
    theme: 'neo',
  },
};

export const REEL_DECOR_LABELS: Record<ReelDecorId, string> = {
  none: 'Clean',
  minimal: 'Corners + icons',
  film: 'Film frame',
  chrome: 'Tech frame',
};

export function parseReelTypographyId(v: unknown): ReelTypographyId {
  if (v === 'syne' || v === 'brutal' || v === 'editorial' || v === 'swiss' || v === 'mono' || v === 'fraunces' || v === 'quiet' || v === 'zine' || v === 'luxe' || v === 'signal' || v === 'magazine' || v === 'glitch' || v === 'neo') {
    return v;
  }
  return 'syne';
}

export function parseReelDecorId(v: unknown): ReelDecorId {
  if (v === 'none' || v === 'minimal' || v === 'film' || v === 'chrome') return v;
  return 'minimal';
}
