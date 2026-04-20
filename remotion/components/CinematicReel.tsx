import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  springTiming,
  type TransitionPresentation,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import type { ReelThemeId } from "../../lib/reel-typography";

// ─── Public API ──────────────────────────────────────────────────────────────
// This is the JSON schema Gemma produces. Keep it intentionally small:
// only fields that survive being LLM-generated reliably.

export type TransitionKind =
  | "slide-right"
  | "slide-left"
  | "slide-top"
  | "slide-bottom"
  | "flip"
  | "fade"
  | "wipe"
  | "wipe-right"
  | "wipe-bottom"
  | "clock-wipe"
  | "iris";

export interface ReelScene {
  /**
   * Image source. Accepts either:
   *   - a relative path starting with "uploads/" (passed through staticFile)
   *   - a full https URL (passed through unchanged — e.g. Unsplash)
   */
  src: string;
  caption: string;
  kicker?: string;
  /** Hex color, e.g. "#ff3d3d". Falls back to the palette cycle if omitted. */
  accent?: string;
  /** Override the transition INTO this scene. Ignored for scene 0. */
  transition?: TransitionKind;
  /** Natural spoken narration for TTS — used by agent route, stripped before render. */
  narration?: string;
}

export type ReelDecorStyle = "none" | "minimal" | "film";
export type ReelMotionFeel = "smooth" | "snappy" | "bouncy" | "dramatic" | "dreamy";
export type ReelTransitionEnergy = "calm" | "medium" | "high";

/**
 * Visual grade presets — CSS filter chains translated from video-use grade.py.
 * Applied to each image for consistent cinematic treatment across the reel.
 *
 * "warm_cinematic"  — +12% contrast, crushed blacks, -12% sat, warm shadows/cool highs. Great for moody/editorial.
 * "neutral_punch"   — +6% contrast, subtle s-curve. Safe all-purpose grade.
 * "cool_editorial"  — desaturated, cool/blue shift. Architecture, tech, minimal.
 * "matte_film"      — lifted blacks (matte look), +15% contrast, -25% sat. Film poster feel.
 * "subtle"          — barely perceptible cleanup. Almost-none baseline.
 * "none"            — no filter applied (raw image).
 */
export type GradePreset =
  | "warm_cinematic"
  | "neutral_punch"
  | "cool_editorial"
  | "matte_film"
  | "subtle"
  | "none";

/** CSS filter string for each grade preset. */
export const GRADE_FILTERS: Record<GradePreset, string> = {
  warm_cinematic:  "contrast(1.12) brightness(0.98) saturate(0.88) sepia(0.10) hue-rotate(3deg)",
  neutral_punch:   "contrast(1.06) saturate(1.02)",
  cool_editorial:  "contrast(1.08) brightness(1.02) saturate(0.80) hue-rotate(-6deg)",
  matte_film:      "contrast(1.15) brightness(0.96) saturate(0.75) sepia(0.12)",
  subtle:          "contrast(1.03) saturate(0.98)",
  none:            "",
};

export interface CinematicReelProps {
  scenes: ReelScene[];
  brandName?: string;
  /** Headline font — CSS font-family stack (e.g. var(--font-syne)). */
  captionFontFamily?: string;
  /** Kicker / subtitle font. */
  kickerFontFamily?: string;
  /** Corner brackets, sparkles, or film perforations. */
  decorStyle?: ReelDecorStyle;
  /** Frames per scene. Default 75 (2.5s @ 30fps). */
  sceneLengthInFrames?: number;
  /** Frames per transition. Default 18. */
  transitionLengthInFrames?: number;
  /** Optional per-scene TTS audio paths (public-relative, e.g. "tts/scene-0.wav").
   *  When provided, the audio file at index i plays once at the start of scene i. */
  sceneTTSPaths?: string[];
  /** Visual color grade applied to every image. Default "neutral_punch". */
  gradePreset?: GradePreset;
  /** Layout system attached to the selected typography family. */
  theme?: ReelThemeId;
  /** Motion grammar for reveals and Ken Burns pacing. */
  motionFeel?: ReelMotionFeel;
  /** Transition family intensity. */
  transitionEnergy?: ReelTransitionEnergy;
}

// ─── Duration math (exported for calculateMetadata) ──────────────────────────
// TransitionSeries total = sum(sequence durations) − sum(transition durations).
// We pad the last scene by 20f so the outro caption can breathe.

export const computeReelDuration = (
  sceneCount: number,
  sceneLen = 75,
  transLen = 18
): number => {
  if (sceneCount <= 0) return 60;
  const body = sceneCount * sceneLen;
  const outroPad = 20;
  const transitions = Math.max(0, sceneCount - 1) * transLen;
  return body + outroPad - transitions;
};

// ─── Scene resolution (normalise user input) ─────────────────────────────────

const ACCENT_PALETTE = [
  "#ff3d3d",
  "#ff8a2a",
  "#ffd43a",
  "#54d38f",
  "#4cc9ff",
  "#a78bfa",
  "#ff6fb5",
  "#ffffff",
];

const TRANSITION_CYCLE: TransitionKind[] = [
  "slide-right",
  "flip",
  "iris",
  "wipe",
  "clock-wipe",
  "slide-bottom",
  "fade",
  "wipe-right",
  "slide-left",
  "iris",
  "flip",
  "slide-top",
];

type Vec = readonly [number, number, number]; // [scale, tx%, ty%]

// Auto-generated Ken Burns vectors so every scene feels different even when
// Gemma doesn't supply them. Alternates zoom-in / zoom-out and rotates
// through compass directions.
function kenBurnsFor(i: number): { from: Vec; to: Vec } {
  const dirs: [number, number][] = [
    [-2, 0],
    [2, 0],
    [0, -1],
    [0, 1],
    [-2, -1],
    [2, 1],
    [2, -1],
    [-2, 1],
  ];
  const [dx, dy] = dirs[i % dirs.length];
  // Even index → zoom in; odd → zoom out. Keeps variety.
  const zoomIn = i % 2 === 0;
  const lo = 1.08;
  const hi = 1.22;
  const from: Vec = zoomIn ? [lo, dx, dy] : [hi, dx, dy];
  const to: Vec = zoomIn ? [hi, -dx, -dy] : [lo, -dx, -dy];
  return { from, to };
}

function resolveSrc(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  // Strip any leading "./" or "/" so staticFile treats it relative to /public
  return staticFile(src.replace(/^\.?\//, ""));
}

interface ResolvedScene {
  src: string;
  caption: string;
  kicker: string;
  accent: string;
  transition: TransitionKind;
  burnFrom: Vec;
  burnTo: Vec;
}

type SceneArchetype = "hero" | "detail" | "proof" | "quote" | "cta";
type BarMode = "horizontal" | "vertical" | "none";

/** Keeps single-word headlines from clipping — scales down until the longest word fits. */
function fitCaptionFontSize(
  lines: string[],
  width: number,
  height: number,
  theme: ReelThemeId,
  lineCount: number
): number {
  const maxCaptionWidth = Math.round(width * 0.88);
  const baseFont =
    theme === "editorial" || theme === "luxe"
      ? Math.round(height * 0.045)
      : theme === "signal"
        ? Math.round(height * 0.049)
        : Math.round(height * 0.052);
  const longest =
    lines.length === 0
      ? "A"
      : lines.reduce((a, b) => (a.length >= b.length ? a : b), lines[0]);
  const len = Math.max(1, longest.length);
  const maxLs = theme === "editorial" || theme === "luxe" ? 2 : 7;
  let fontSize = baseFont;
  for (let step = 0; step < 120; step++) {
    const estWordW = len * fontSize * 0.58 + Math.max(0, len - 1) * maxLs;
    if (estWordW <= maxCaptionWidth * 0.9) break;
    fontSize -= 1;
  }
  if (lineCount >= 4) fontSize -= 6;
  if (lineCount >= 5) fontSize -= 6;
  return Math.max(12, Math.min(baseFont, fontSize));
}

function buildCaptionLines(caption: string, theme: ReelThemeId): string[] {
  const words = caption.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [caption.trim()];

  const maxCharsByTheme: Record<ReelThemeId, number> = {
    impact: 15,
    brutal: 14,
    editorial: 17,
    swiss: 18,
    terminal: 20,
    manifesto: 18,
    luxe: 18,
    signal: 16,
  };
  const maxLinesByTheme: Record<ReelThemeId, number> = {
    impact: 4,
    brutal: 4,
    editorial: 3,
    swiss: 3,
    terminal: 3,
    manifesto: 3,
    luxe: 3,
    signal: 4,
  };

  const maxChars = maxCharsByTheme[theme] ?? 16;
  const maxLines = maxLinesByTheme[theme] ?? 4;
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current.length === 0) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  while (lines.length > maxLines) {
    const tail = lines.pop();
    if (!tail || lines.length === 0) break;
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${tail}`;
  }

  return lines;
}

function resolveScenes(scenes: ReelScene[]): ResolvedScene[] {
  return scenes.map((s, i) => {
    const burns = kenBurnsFor(i);
    return {
      src: resolveSrc(s.src),
      caption: (s.caption ?? "").trim() || `SCENE ${i + 1}`,
      kicker: (s.kicker ?? "").trim(),
      accent: s.accent ?? ACCENT_PALETTE[i % ACCENT_PALETTE.length],
      transition: s.transition ?? TRANSITION_CYCLE[(i - 1 + TRANSITION_CYCLE.length) % TRANSITION_CYCLE.length],
      burnFrom: burns.from,
      burnTo: burns.to,
    };
  });
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

const FilmGrain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2);
  // Fixed filter ID avoids accumulating new SVG filter elements per frame —
  // React updates the seed attribute on the single existing filter node.
  return (
    <AbsoluteFill
      style={{
        opacity: 0.15,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <filter id="grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" opacity="1" />
      </svg>
    </AbsoluteFill>
  );
};

/** Lime corner ticks + sparkle glyph — stays inside safe padding. */
const SceneDecorMinimal: React.FC<{
  accent: string;
  width: number;
  height: number;
}> = ({ accent, width, height }) => {
  const s = Math.round(Math.min(width, height) * 0.028);
  const pad = Math.round(width * 0.04);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 6 }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block" }}
      >
        <path
          d={`M ${pad + s} ${pad} L ${pad} ${pad} L ${pad} ${pad + s}`}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          opacity={0.85}
        />
        <path
          d={`M ${width - pad - s} ${pad} L ${width - pad} ${pad} L ${width - pad} ${pad + s}`}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          opacity={0.85}
        />
        <path
          d={`M ${pad} ${height - pad - s} L ${pad} ${height - pad} L ${pad + s} ${height - pad}`}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          opacity={0.85}
        />
        <path
          d={`M ${width - pad} ${height - pad - s} L ${width - pad} ${height - pad} L ${width - pad - s} ${height - pad}`}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          opacity={0.85}
        />
        <text
          x={width - pad - s * 2}
          y={pad + s * 3}
          fill={accent}
          fontSize={s * 2.2}
          fontFamily="var(--font-dm-mono), monospace"
          opacity={0.9}
        >
          ✦
        </text>
      </svg>
    </AbsoluteFill>
  );
};

/** Simple film strip hint at top + bottom. */
const SceneDecorFilm: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const h = Math.round(height * 0.022);
  const hole = Math.round(width * 0.012);
  const n = Math.floor(width / (hole * 2.2));
  const holes = Array.from({ length: n }, (_, i) => i);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 6 }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: h,
          background: "rgba(0,0,0,0.65)",
          display: "flex",
          justifyContent: "space-evenly",
          alignItems: "center",
        }}
      >
        {holes.map((i) => (
          <div
            key={`t-${i}`}
            style={{
              width: hole,
              height: hole * 0.6,
              borderRadius: 2,
              background: "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: h,
          background: "rgba(0,0,0,0.65)",
          display: "flex",
          justifyContent: "space-evenly",
          alignItems: "center",
        }}
      >
        {holes.map((i) => (
          <div
            key={`b-${i}`}
            style={{
              width: hole,
              height: hole * 0.6,
              borderRadius: 2,
              background: "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const useSpringAnim = (
  startFrame: number,
  from: number,
  to: number,
  damping = 12,
  mass = 0.6
) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    from,
    to,
    config: { damping, mass, stiffness: 140 },
    durationInFrames: 30,
  });
};

function motionWordProfile(motionFeel: ReelMotionFeel) {
  switch (motionFeel) {
    case "smooth":
      return { start: 8, stagger: 8, travel: 30, flash: 0.22 };
    case "bouncy":
      return { start: 4, stagger: 5, travel: 62, flash: 0.52 };
    case "dramatic":
      return { start: 10, stagger: 10, travel: 82, flash: 0.18 };
    case "dreamy":
      return { start: 12, stagger: 9, travel: 22, flash: 0.12 };
    case "snappy":
    default:
      return { start: 6, stagger: 6, travel: 48, flash: 0.34 };
  }
}

function transitionTimingConfig(
  motionFeel: ReelMotionFeel,
  transitionEnergy: ReelTransitionEnergy
) {
  const byEnergy = {
    calm: { damping: 240, stiffness: 150 },
    medium: { damping: 185, stiffness: 200 },
    high: { damping: 130, stiffness: 260 },
  }[transitionEnergy];

  const byMotion = {
    smooth: { damping: 30, stiffness: -12 },
    snappy: { damping: -10, stiffness: 12 },
    bouncy: { damping: -40, stiffness: 26 },
    dramatic: { damping: 24, stiffness: -18 },
    dreamy: { damping: 42, stiffness: -26 },
  }[motionFeel];

  return {
    damping: Math.max(90, byEnergy.damping + byMotion.damping),
    stiffness: Math.max(110, byEnergy.stiffness + byMotion.stiffness),
  };
}

function accentForTheme(accent: string, theme: ReelThemeId): string {
  if (theme === "editorial") return `${accent}aa`;
  if (theme === "terminal") return `${accent}dd`;
  if (theme === "luxe") return `${accent}99`;
  if (theme === "signal") return `${accent}ee`;
  return accent;
}

function sceneLayout(
  theme: ReelThemeId,
  sceneIndex: number,
  sceneCount: number,
  width: number,
  height: number
) {
  const isFirst = sceneIndex === 0;
  const isLast = sceneIndex === sceneCount - 1;
  const base = {
    captionBottom: Math.round(height * 0.16),
    kickerBottom: Math.round(height * 0.07),
    barBottom: Math.round(height * 0.28),
    maxCaptionWidth: Math.round(width * 0.88),
    wordGap: Math.round(height * 0.008),
    justify: "center" as const,
    alignItems: "center" as const,
    textAlign: "center" as const,
    left: 0,
    right: 0,
    paddingX: Math.round(width * 0.06),
    stroke: "0.5px rgba(255,255,255,0.85)",
    uppercase: true,
    kickerWrap: true,
    barMode: "horizontal" as BarMode,
    barLeft: "8%",
    barWidthPct: 84,
    vignetteOpacity: 0.7,
    bottomGradient:
      "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 22%, rgba(0,0,0,0.15) 42%, transparent 58%)",
  };

  switch (theme) {
    case "editorial":
      return {
        ...base,
        justify: isFirst ? ("flex-end" as const) : ("flex-start" as const),
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.08),
        right: Math.round(width * 0.22),
        paddingX: 0,
        captionBottom: isFirst ? Math.round(height * 0.14) : Math.round(height * 0.2),
        kickerBottom: Math.round(height * 0.09),
        maxCaptionWidth: Math.round(width * 0.58),
        stroke: "0px transparent",
        uppercase: false,
        barMode: "none" as BarMode,
        barLeft: `${Math.round(width * 0.08)}px`,
        barWidthPct: 0,
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.52) 24%, rgba(0,0,0,0.12) 46%, transparent 62%)",
      };
    case "brutal":
      return {
        ...base,
        justify: "flex-end" as const,
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.07),
        right: Math.round(width * 0.12),
        maxCaptionWidth: Math.round(width * 0.8),
        wordGap: Math.round(height * 0.004),
        stroke: "0px transparent",
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.72) 30%, rgba(0,0,0,0.18) 52%, transparent 68%)",
      };
    case "swiss":
      return {
        ...base,
        justify: "flex-start" as const,
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.08),
        right: Math.round(width * 0.2),
        captionBottom: Math.round(height * 0.46),
        kickerBottom: Math.round(height * 0.16),
        barBottom: Math.round(height * 0.61),
        maxCaptionWidth: Math.round(width * 0.64),
        stroke: "0px transparent",
        barMode: "horizontal" as const,
        barLeft: "8%",
        barWidthPct: 54,
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.24) 18%, transparent 40%)",
      };
    case "terminal":
      return {
        ...base,
        justify: "center" as const,
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.08),
        right: Math.round(width * 0.08),
        captionBottom: Math.round(height * 0.26),
        kickerBottom: Math.round(height * 0.12),
        maxCaptionWidth: Math.round(width * 0.84),
        stroke: "0px transparent",
        uppercase: false,
        barMode: "horizontal" as const,
        barLeft: "8%",
        barWidthPct: 72,
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.58) 28%, rgba(0,0,0,0.16) 50%, transparent 66%)",
      };
    case "manifesto":
      return {
        ...base,
        justify: isLast ? ("center" as const) : ("flex-end" as const),
        alignItems: isLast ? ("center" as const) : ("flex-start" as const),
        textAlign: isLast ? ("center" as const) : ("left" as const),
        left: isLast ? 0 : Math.round(width * 0.07),
        right: isLast ? 0 : Math.round(width * 0.18),
        captionBottom: isLast ? Math.round(height * 0.28) : Math.round(height * 0.12),
        kickerBottom: Math.round(height * 0.08),
        maxCaptionWidth: isLast ? Math.round(width * 0.78) : Math.round(width * 0.72),
        stroke: "0px transparent",
        uppercase: false,
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.52) 24%, transparent 60%)",
      };
    case "luxe":
      return {
        ...base,
        justify: "flex-end" as const,
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.1),
        right: Math.round(width * 0.16),
        captionBottom: Math.round(height * 0.14),
        kickerBottom: Math.round(height * 0.085),
        barBottom: Math.round(height * 0.24),
        maxCaptionWidth: Math.round(width * 0.7),
        stroke: "0px transparent",
        uppercase: false,
        barMode: "horizontal" as const,
        barLeft: "10%",
        barWidthPct: 38,
        vignetteOpacity: 0.84,
        bottomGradient:
          "linear-gradient(to top, rgba(8,7,10,0.97) 0%, rgba(8,7,10,0.78) 22%, rgba(8,7,10,0.26) 48%, transparent 68%)",
      };
    case "signal":
      return {
        ...base,
        justify: "flex-end" as const,
        alignItems: "flex-start" as const,
        textAlign: "left" as const,
        left: Math.round(width * 0.06),
        right: Math.round(width * 0.08),
        captionBottom: Math.round(height * 0.18),
        kickerBottom: Math.round(height * 0.09),
        barBottom: Math.round(height * 0.31),
        maxCaptionWidth: Math.round(width * 0.84),
        stroke: "0px transparent",
        barMode: "horizontal" as const,
        barLeft: "6%",
        barWidthPct: 76,
        bottomGradient:
          "linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.82) 26%, rgba(0,0,0,0.28) 56%, transparent 74%)",
      };
    case "impact":
    default:
      return base;
  }
}

function sceneArchetypeFor(
  theme: ReelThemeId,
  sceneIndex: number,
  sceneCount: number
): SceneArchetype {
  const isFirst = sceneIndex === 0;
  const isLast = sceneIndex === sceneCount - 1;
  if (isFirst) return "hero";
  if (isLast) return "cta";
  if (theme === "editorial" || theme === "manifesto") {
    return sceneIndex % 2 === 0 ? "detail" : "hero";
  }
  if (theme === "luxe") {
    return sceneIndex % 2 === 0 ? "hero" : "detail";
  }
  if (theme === "signal") {
    return sceneIndex % 2 === 0 ? "proof" : "detail";
  }
  if (theme === "swiss" || theme === "terminal") {
    return sceneIndex % 2 === 0 ? "proof" : "detail";
  }
  return sceneIndex % 4 === 2 ? "quote" : sceneIndex % 2 === 0 ? "proof" : "detail";
}

function imageStyleForArchetype(archetype: SceneArchetype, frame: number, sceneLen: number) {
  const clip = interpolate(frame, [0, 10, sceneLen], [0.94, 1, 1], {
    extrapolateRight: "clamp",
  });
  switch (archetype) {
    case "detail":
      return {
        imageScaleBoost: 0.08,
        imageTranslateX: -6,
        imageTranslateY: -2,
        imageClipPath: `inset(${(1 - clip) * 18}% ${(1 - clip) * 8}% ${(1 - clip) * 10}% ${(1 - clip) * 20}% round 28px)`,
      };
    case "proof":
      return {
        imageScaleBoost: 0.02,
        imageTranslateX: 0,
        imageTranslateY: -1,
        imageClipPath: `inset(${(1 - clip) * 8}% ${(1 - clip) * 8}% ${(1 - clip) * 18}% ${(1 - clip) * 8}% round 18px)`,
      };
    case "quote":
      return {
        imageScaleBoost: 0.12,
        imageTranslateX: 4,
        imageTranslateY: 0,
        imageClipPath: "none",
      };
    case "cta":
      return {
        imageScaleBoost: 0.05,
        imageTranslateX: 0,
        imageTranslateY: 1,
        imageClipPath: "none",
      };
    case "hero":
    default:
      return {
        imageScaleBoost: 0,
        imageTranslateX: 0,
        imageTranslateY: 0,
        imageClipPath: "none",
      };
  }
}

const SceneFrame: React.FC<{
  scene: ResolvedScene;
  sceneLen: number;
  captionFontFamily: string;
  kickerFontFamily: string;
  decorStyle: ReelDecorStyle;
  gradeFilter?: string;
  theme: ReelThemeId;
  motionFeel: ReelMotionFeel;
  sceneIndex: number;
  sceneCount: number;
}> = ({
  scene,
  sceneLen,
  captionFontFamily,
  kickerFontFamily,
  decorStyle,
  gradeFilter = "",
  theme,
  motionFeel,
  sceneIndex,
  sceneCount,
}) => {
  const frame = useCurrentFrame();

  const t = interpolate(frame, [0, sceneLen], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const scale = scene.burnFrom[0] + (scene.burnTo[0] - scene.burnFrom[0]) * t;
  const tx = scene.burnFrom[1] + (scene.burnTo[1] - scene.burnFrom[1]) * t;
  const ty = scene.burnFrom[2] + (scene.burnTo[2] - scene.burnFrom[2]) * t;

  const { width, height } = useVideoConfig();
  const layout = sceneLayout(theme, sceneIndex, sceneCount, width, height);
  const motion = motionWordProfile(motionFeel);
  const sceneAccent = accentForTheme(scene.accent, theme);
  const archetype = sceneArchetypeFor(theme, sceneIndex, sceneCount);
  const imageTreatment = imageStyleForArchetype(archetype, frame, sceneLen);

  const captionLines = buildCaptionLines(scene.caption, theme);
  const kickerSlide = useSpringAnim(4, 40, 0, 18);
  const kickerOpacity = useSpringAnim(4, 0, 1, 18);

  // All sizes + positions scale with height so they work across 9:16, 1:1, 4:5, 16:9.
  const fontSize = fitCaptionFontSize(captionLines, layout.maxCaptionWidth, height, theme, captionLines.length);
  const letterSpacingMax = Math.min(
    theme === "editorial" || theme === "luxe" ? 4 : 8,
    Math.max(theme === "editorial" || theme === "luxe" ? 1 : 3, Math.round(fontSize * 0.1))
  );
  const letterSpacing = interpolate(frame, [0, sceneLen], [theme === "editorial" || theme === "luxe" ? 1 : 3, letterSpacingMax], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const barWidth = interpolate(frame, [6, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {/* Atmospheric underlayer — peeks at Ken Burns edges */}
      <AbsoluteFill>
        <Img
          src={scene.src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(80px) saturate(1.6) brightness(0.7)",
            transform: "scale(1.5)",
          }}
        />
      </AbsoluteFill>

      {/* Hero image — full-bleed cover + Ken Burns + grade preset */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale + imageTreatment.imageScaleBoost}) translate(${tx + imageTreatment.imageTranslateX}%, ${ty + imageTreatment.imageTranslateY}%)`,
          transformOrigin: "center center",
          clipPath: imageTreatment.imageClipPath,
        }}
      >
        <Img
          src={scene.src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: gradeFilter || "contrast(1.06) saturate(1.02)",
          }}
        />
      </AbsoluteFill>

      {/* Accent color-grade wash */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, ${scene.accent}22 100%)`,
          mixBlendMode: "soft-light",
        }}
      />

      {archetype === "proof" ? (
        <div
          style={{
            position: "absolute",
            top: "9%",
            right: "7%",
            minWidth: width * 0.22,
            padding: "14px 16px",
            border: `1px solid ${sceneAccent}88`,
            background: "rgba(0,0,0,0.42)",
            backdropFilter: "blur(10px)",
            color: "#fff",
            fontFamily: kickerFontFamily,
            zIndex: 5,
            boxShadow: `0 0 24px ${sceneAccent}25`,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 3, opacity: 0.6, textTransform: "uppercase" }}>
            Scene Read
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
            {String(sceneIndex + 1).padStart(2, "0")}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>
            {scene.kicker || "Evidence block"}
          </div>
        </div>
      ) : null}

      {theme === "signal" ? (
        <div
          style={{
            position: "absolute",
            top: "7%",
            left: "6%",
            padding: "8px 12px",
            border: `1px solid ${sceneAccent}`,
            background: "rgba(0,0,0,0.44)",
            color: "#fff",
            fontFamily: kickerFontFamily,
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            zIndex: 6,
            boxShadow: `0 0 22px ${sceneAccent}40`,
          }}
        >
          Cut {String(sceneIndex + 1).padStart(2, "0")}
        </div>
      ) : null}

      {theme === "luxe" ? (
        <div
          style={{
            position: "absolute",
            inset: "6%",
            border: "1px solid rgba(255,255,255,0.1)",
            zIndex: 3,
            pointerEvents: "none",
          }}
        />
      ) : null}

      {archetype === "quote" ? (
        <div
          style={{
            position: "absolute",
            left: "9%",
            right: "14%",
            top: "18%",
            bottom: "28%",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(to bottom, rgba(0,0,0,0.18), rgba(0,0,0,0.3))",
            backdropFilter: "blur(6px)",
            zIndex: 4,
            borderRadius: 24,
          }}
        />
      ) : null}

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
          opacity: layout.vignetteOpacity,
        }}
      />

      {/* Bottom gradient — taller scrim so text always sits in dark zone */}
      <AbsoluteFill
        style={{
          background: layout.bottomGradient,
        }}
      />

      {/* Accent bar */}
      {layout.barMode === "vertical" ? (
        <div
          style={{
            position: "absolute",
            top: "11%",
            bottom: "11%",
            left: layout.barLeft,
            width: 3,
            background: `linear-gradient(to bottom, transparent 0%, ${sceneAccent} 18%, ${sceneAccent} 82%, transparent 100%)`,
            boxShadow: `0 0 18px ${sceneAccent}`,
            borderRadius: 999,
          }}
        />
      ) : layout.barMode === "horizontal" ? (
        <div
          style={{
            position: "absolute",
            bottom: layout.barBottom,
            left: layout.barLeft,
            width: `${barWidth * layout.barWidthPct}%`,
            height: 2,
            background: sceneAccent,
            boxShadow: `0 0 14px ${sceneAccent}`,
            borderRadius: 2,
          }}
        />
      ) : null}

      {/* Caption */}
      {archetype === "quote" ? (
        <div
          style={{
            position: "absolute",
            top: "23%",
            left: "14%",
            right: "14%",
            zIndex: 6,
            color: "#fff",
          }}
        >
          <div
            style={{
              fontSize: Math.round(width * 0.12),
              color: sceneAccent,
              fontFamily: captionFontFamily,
              lineHeight: 0.7,
            }}
          >
            “
          </div>
          <div
            style={{
              fontSize: Math.round(fontSize * 0.92),
              fontWeight: 800,
              letterSpacing: layout.uppercase ? letterSpacing * 0.45 : 0,
              textTransform: layout.uppercase ? "uppercase" : "none",
              fontFamily: captionFontFamily,
              lineHeight: 1.04,
              textShadow: `0 4px 20px rgba(0,0,0,0.85)`,
            }}
          >
            {scene.caption}
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            bottom: layout.captionBottom,
            left: layout.left,
            right: layout.right,
            display: "flex",
            flexDirection: "column",
            justifyContent: layout.justify,
            alignItems: layout.alignItems,
            gap: Math.max(4, Math.round(height * 0.004)),
            padding: `0 ${layout.paddingX}px`,
            maxWidth: layout.maxCaptionWidth,
            width: layout.left === 0 && layout.right === 0 ? "100%" : undefined,
            margin: layout.left === 0 && layout.right === 0 ? "0 auto" : undefined,
            boxSizing: "border-box",
            overflow: "hidden",
            zIndex: 6,
          }}
        >
          {captionLines.map((line, i) => {
            const lineStart = motion.start + i * (motion.stagger + 2);
            const lineY = interpolate(
              frame,
              [lineStart, lineStart + 18],
              [motion.travel, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing:
                  motionFeel === "dramatic"
                    ? Easing.out(Easing.exp)
                    : motionFeel === "dreamy"
                      ? Easing.inOut(Easing.sin)
                      : Easing.out(Easing.cubic),
              }
            );
            const lineOp = interpolate(
              frame,
              [lineStart, lineStart + 14],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }
            );
            return (
              <span
                key={i}
                style={{
                  display: "block",
                  fontSize: archetype === "cta" ? Math.round(fontSize * 0.92) : fontSize,
                  fontWeight: archetype === "detail" ? 800 : 900,
                  color: "#fff",
                  letterSpacing,
                  textTransform: layout.uppercase ? "uppercase" : "none",
                  fontFamily: captionFontFamily,
                  lineHeight: theme === "editorial" || theme === "luxe" ? 0.96 : 1.02,
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  textShadow:
                    theme === "terminal"
                      ? `0 0 14px ${sceneAccent}, 0 0 2px rgba(255,255,255,0.6)`
                      : theme === "luxe"
                        ? `0 8px 30px rgba(0,0,0,0.88), 0 0 1px rgba(255,255,255,0.35)`
                      : `0 4px 20px rgba(0,0,0,0.9), 0 0 2px ${sceneAccent}`,
                  transform:
                    archetype === "proof"
                      ? `translateY(${lineY}px) translateX(${interpolate(frame, [lineStart, lineStart + 18], [-8, 0], { extrapolateRight: "clamp" })}px)`
                      : `translateY(${lineY}px)`,
                  opacity: lineOp,
                  WebkitTextStroke: layout.stroke,
                }}
              >
                {line}
              </span>
            );
          })}
        </div>
      )}

      {/* Kicker subtitle — sits below caption in the safe zone */}
      {scene.kicker ? (
        <div
          style={{
            position: "absolute",
            bottom: layout.kickerBottom,
            left: layout.left,
            right: layout.right,
            textAlign: layout.textAlign,
            transform: `translateY(${kickerSlide}px)`,
            opacity: kickerOpacity,
            padding: `0 ${Math.round(width * 0.02)}px`,
            maxWidth: layout.maxCaptionWidth,
            margin: layout.left === 0 && layout.right === 0 ? "0 auto" : undefined,
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              fontSize: Math.round(height * 0.018),
              fontWeight: theme === "luxe" ? 500 : 600,
              color:
                theme === "editorial" || theme === "luxe"
                  ? "rgba(255,255,255,0.82)"
                  : theme === "signal"
                    ? "rgba(255,255,255,0.76)"
                    : sceneAccent,
              letterSpacing: theme === "editorial" || theme === "luxe" ? 2 : 4,
              textTransform: "uppercase",
              fontFamily: kickerFontFamily,
              textShadow: "0 2px 8px rgba(0,0,0,0.9)",
              display: "inline-block",
              wordBreak: "break-word",
              hyphens: "auto",
              lineHeight: 1.35,
            }}
          >
            {theme === "editorial" || theme === "luxe" ? scene.kicker : `◆ ${scene.kicker} ◆`}
          </span>
        </div>
      ) : null}

      {decorStyle === "minimal" ? (
        <SceneDecorMinimal accent={scene.accent} width={width} height={height} />
      ) : null}
      {decorStyle === "film" ? (
        <SceneDecorFilm width={width} height={height} />
      ) : null}

      {/* Film grain + flash pop */}
      <FilmGrain />
      <AbsoluteFill
        style={{
          backgroundColor: "#fff",
          opacity: interpolate(frame, [0, 2, 4], [0, motion.flash, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};

// Persistent UI — letterbox, progress, brand, counter
const Chrome: React.FC<{
  brandName: string;
  sceneCount: number;
  sceneStride: number;
}> = ({ brandName, sceneCount, sceneStride }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const barHeight = interpolate(
    frame,
    [0, 18, durationInFrames - 18, durationInFrames],
    [0, 28, 28, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  const progress = Math.min(1, frame / durationInFrames);
  const sceneIndex = Math.min(
    sceneCount - 1,
    Math.floor(frame / Math.max(1, sceneStride))
  );

  const fadeIn = interpolate(frame, [10, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Split brandName so the dot separator can be tinted without string parsing inline.
  const brandParts = brandName.split("●");

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: barHeight,
          background: "#000",
          zIndex: 100,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: barHeight,
          background: "#000",
          zIndex: 100,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: barHeight + 36,
          left: 40,
          right: 40,
          height: 1,
          background: "rgba(255,255,255,0.08)",
          zIndex: 101,
          borderRadius: 1,
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "#fff",
            borderRadius: 1,
            boxShadow: "0 0 6px rgba(255,255,255,0.35)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: barHeight + 66,
          left: 40,
          zIndex: 101,
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 4,
          color: "rgba(255,255,255,0.92)",
          fontFamily: "var(--font-syne), system-ui, sans-serif",
          textShadow: "0 2px 6px rgba(0,0,0,0.8)",
          opacity: fadeIn,
        }}
      >
        {brandParts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < brandParts.length - 1 ? (
              <span style={{ color: "#a78bfa" }}>●</span>
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: barHeight + 66,
          right: 40,
          zIndex: 101,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 3,
          color: "rgba(255,255,255,0.72)",
          fontFamily: "var(--font-dm-mono), monospace",
          textShadow: "0 2px 6px rgba(0,0,0,0.8)",
          opacity: fadeIn,
        }}
      >
        {String(sceneIndex + 1).padStart(2, "0")}
        <span style={{ opacity: 0.4 }}>
          {" / "}
          {String(sceneCount).padStart(2, "0")}
        </span>
      </div>
    </>
  );
};

// ─── Transition factory ──────────────────────────────────────────────────────

// Different transition presentations have incompatible generic params
// (SlideProps vs WipeProps vs FadeProps...). They're all valid inputs to
// <TransitionSeries.Transition>, so we widen to a shared Record type.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

function makeTransitionPresentation(
  kind: TransitionKind,
  w: number,
  h: number
): AnyPresentation {
  switch (kind) {
    case "slide-right":
      return slide({ direction: "from-right" }) as AnyPresentation;
    case "slide-left":
      return slide({ direction: "from-left" }) as AnyPresentation;
    case "slide-top":
      return slide({ direction: "from-top" }) as AnyPresentation;
    case "slide-bottom":
      return slide({ direction: "from-bottom" }) as AnyPresentation;
    case "flip":
      return flip({ direction: "from-right" }) as AnyPresentation;
    case "wipe":
      return wipe({ direction: "from-top-left" }) as AnyPresentation;
    case "wipe-right":
      return wipe({ direction: "from-top-right" }) as AnyPresentation;
    case "wipe-bottom":
      return wipe({ direction: "from-bottom-left" }) as AnyPresentation;
    case "clock-wipe":
      return clockWipe({ width: w, height: h }) as unknown as AnyPresentation;
    case "iris":
      return iris({ width: w, height: h }) as unknown as AnyPresentation;
    case "fade":
    default:
      return fade() as AnyPresentation;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export const CinematicReel: React.FC<CinematicReelProps> = ({
  scenes,
  brandName = "VISIO●REEL",
  captionFontFamily = "var(--font-syne), 'Arial Black', system-ui, sans-serif",
  kickerFontFamily = "var(--font-dm-mono), 'Courier New', monospace",
  decorStyle = "minimal",
  sceneLengthInFrames = 75,
  transitionLengthInFrames = 18,
  sceneTTSPaths,
  gradePreset = "neutral_punch",
  theme = "impact",
  motionFeel = "snappy",
  transitionEnergy = "medium",
}) => {
  const gradeFilter = GRADE_FILTERS[gradePreset] ?? "";
  // All hooks must be called unconditionally before any early return.
  const { width: vw, height: vh } = useVideoConfig();

  if (!scenes || scenes.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          fontSize: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        (no scenes provided)
      </AbsoluteFill>
    );
  }

  const resolved = resolveScenes(scenes);
  const sceneLen = sceneLengthInFrames;
  const transLen = transitionLengthInFrames;
  const sceneStride = sceneLen - transLen;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {resolved.map((scene, i) => {
          const isLast = i === resolved.length - 1;
          const duration = isLast ? sceneLen + 20 : sceneLen;
          const entries: React.ReactNode[] = [];

          // Transition INTO this scene (skip for the first)
          if (i > 0) {
            const kind = scene.transition;
            // springTiming with high damping (critically damped, no bounce) replaces
            // linearTiming for all transition types — organic settle vs mechanical slide.
            const timing = springTiming({
              config: transitionTimingConfig(motionFeel, transitionEnergy),
              durationInFrames: transLen,
            });
            entries.push(
              <TransitionSeries.Transition
                key={`t-${i}`}
                presentation={makeTransitionPresentation(kind, vw, vh)}
                timing={timing}
              />
            );
          }

          entries.push(
            <TransitionSeries.Sequence
              key={`s-${i}`}
              durationInFrames={duration}
            >
              <SceneFrame
                scene={scene}
                sceneLen={sceneLen}
                captionFontFamily={captionFontFamily}
                kickerFontFamily={kickerFontFamily}
                decorStyle={decorStyle}
                gradeFilter={gradeFilter}
                theme={theme}
                motionFeel={motionFeel}
                sceneIndex={i}
                sceneCount={resolved.length}
              />
              {sceneTTSPaths?.[i] ? (
                <Audio
                  src={staticFile(sceneTTSPaths[i]!.replace(/^\.?\//, ""))}
                  volume={0.85}
                  endAt={sceneLen - 2}
                />
              ) : null}
            </TransitionSeries.Sequence>
          );

          return entries;
        })}
      </TransitionSeries>

      <Sequence from={0}>
        <Chrome
          brandName={brandName}
          sceneCount={resolved.length}
          sceneStride={sceneStride}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
