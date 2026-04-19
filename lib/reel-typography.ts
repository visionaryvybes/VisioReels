/** Reel / CinematicReel typography — mirrors slide preset font stacks (layout.tsx). */

export type ReelTypographyId =
  | 'syne'
  | 'brutal'
  | 'editorial'
  | 'swiss'
  | 'mono'
  | 'fraunces';

export type ReelDecorId = 'none' | 'minimal' | 'film';

export const REEL_TYPOGRAPHY: Record<
  ReelTypographyId,
  { label: string; captionFont: string; kickerFont: string }
> = {
  syne: {
    label: 'DISPLAY',
    captionFont: "var(--font-syne), 'Arial Black', system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), 'Courier New', monospace",
  },
  brutal: {
    label: 'BRUTAL',
    captionFont: "var(--font-archivo-black), system-ui, sans-serif",
    kickerFont: "var(--font-dm-mono), monospace",
  },
  editorial: {
    label: 'EDITORIAL',
    captionFont: "var(--font-playfair), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
  },
  swiss: {
    label: 'SWISS',
    captionFont: "var(--font-space-grotesk), system-ui, sans-serif",
    kickerFont: "var(--font-space-grotesk), system-ui, sans-serif",
  },
  mono: {
    label: 'MONO',
    captionFont: "var(--font-dm-mono), monospace",
    kickerFont: "var(--font-dm-mono), monospace",
  },
  fraunces: {
    label: 'MANIFESTO',
    captionFont: "var(--font-fraunces), Georgia, serif",
    kickerFont: "var(--font-dm-sans), system-ui, sans-serif",
  },
};

export const REEL_DECOR_LABELS: Record<ReelDecorId, string> = {
  none: 'Clean',
  minimal: 'Corners + icons',
  film: 'Film frame',
};

export function parseReelTypographyId(v: unknown): ReelTypographyId {
  if (v === 'syne' || v === 'brutal' || v === 'editorial' || v === 'swiss' || v === 'mono' || v === 'fraunces') {
    return v;
  }
  return 'syne';
}

export function parseReelDecorId(v: unknown): ReelDecorId {
  if (v === 'none' || v === 'minimal' || v === 'film') return v;
  return 'minimal';
}
