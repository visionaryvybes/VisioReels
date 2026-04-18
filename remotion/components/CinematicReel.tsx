import React from "react";
import {
  AbsoluteFill,
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
  | "wipe";

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
}

export interface CinematicReelProps {
  scenes: ReelScene[];
  brandName?: string;
  /** Frames per scene. Default 75 (2.5s @ 30fps). */
  sceneLengthInFrames?: number;
  /** Frames per transition. Default 18. */
  transitionLengthInFrames?: number;
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
  "fade",
  "wipe",
  "slide-bottom",
  "slide-left",
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

const SceneFrame: React.FC<{ scene: ResolvedScene; sceneLen: number }> = ({
  scene,
  sceneLen,
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

  const words = scene.caption.split(" ");
  const kickerSlide = useSpringAnim(4, 40, 0, 18);
  const kickerOpacity = useSpringAnim(4, 0, 1, 18);

  // All sizes + positions scale with height so they work across 9:16, 1:1, 4:5, 16:9.
  const fontSize = Math.round(height * 0.052);      // 100px @ 1920, 56px @ 1080
  const captionBottom = Math.round(height * 0.16);  // 307px @ 1920, 173px @ 1080
  const kickerBottom = Math.round(height * 0.07);   // 134px @ 1920, 76px @ 1080
  const barBottom = Math.round(height * 0.28);      // 538px @ 1920, 302px @ 1080
  const wordGap = Math.round(height * 0.008);       // 15px @ 1920, 9px @ 1080
  const maxCaptionWidth = Math.round(width * 0.88); // never overflow the frame

  const letterSpacing = interpolate(frame, [0, sceneLen], [6, 10], {
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

      {/* Hero image — full-bleed cover + Ken Burns */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={scene.src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "contrast(1.12) saturate(1.15) brightness(1.02)",
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

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom gradient — taller scrim so text always sits in dark zone */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 22%, rgba(0,0,0,0.15) 42%, transparent 58%)",
        }}
      />

      {/* Accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: barBottom,
          left: "8%",
          width: `${barWidth * 84}%`,
          height: 2,
          background: scene.accent,
          boxShadow: `0 0 14px ${scene.accent}`,
          borderRadius: 2,
        }}
      />

      {/* Caption — word-by-word spring reveal, bottom-anchored */}
      <div
        style={{
          position: "absolute",
          bottom: captionBottom,
          left: 0,
          right: 0,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: wordGap,
          padding: `0 ${Math.round(width * 0.06)}px`,
          maxWidth: maxCaptionWidth,
          margin: "0 auto",
        }}
      >
        {words.map((word, i) => {
          const wordStart = 6 + i * 6;
          const wordY = interpolate(
            frame,
            [wordStart, wordStart + 18],
            [50, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }
          );
          const wordOp = interpolate(
            frame,
            [wordStart, wordStart + 14],
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
                display: "inline-block",
                fontSize,
                fontWeight: 900,
                color: "#fff",
                letterSpacing,
                textTransform: "uppercase",
                fontFamily:
                  "var(--font-syne), 'Arial Black', system-ui, sans-serif",
                lineHeight: 1.05,
                textShadow: `0 4px 20px rgba(0,0,0,0.9), 0 0 2px ${scene.accent}`,
                transform: `translateY(${wordY}px)`,
                opacity: wordOp,
                WebkitTextStroke: "0.5px rgba(255,255,255,0.85)",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>

      {/* Kicker subtitle — sits below caption in the safe zone */}
      {scene.kicker ? (
        <div
          style={{
            position: "absolute",
            bottom: kickerBottom,
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `translateY(${kickerSlide}px)`,
            opacity: kickerOpacity,
            padding: `0 ${Math.round(width * 0.08)}px`,
          }}
        >
          <span
            style={{
              fontSize: Math.round(height * 0.018),
              fontWeight: 600,
              color: scene.accent,
              letterSpacing: 4,
              textTransform: "uppercase",
              fontFamily: "var(--font-dm-mono), 'Courier New', monospace",
              textShadow: "0 2px 8px rgba(0,0,0,0.9)",
            }}
          >
            ◆ {scene.kicker} ◆
          </span>
        </div>
      ) : null}

      {/* Film grain + flash pop */}
      <FilmGrain />
      <AbsoluteFill
        style={{
          backgroundColor: "#fff",
          opacity: interpolate(frame, [0, 2, 4], [0, 0.65, 0], {
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
    [0, 90, 90, 0],
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
          height: 2,
          background: "rgba(255,255,255,0.15)",
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
            boxShadow: "0 0 8px rgba(255,255,255,0.5)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: barHeight + 66,
          left: 40,
          zIndex: 101,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 6,
          color: "#fff",
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
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 4,
          color: "rgba(255,255,255,0.85)",
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

function makeTransitionPresentation(kind: TransitionKind): AnyPresentation {
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
    case "fade":
    default:
      return fade() as AnyPresentation;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export const CinematicReel: React.FC<CinematicReelProps> = ({
  scenes,
  brandName = "VISIO●REEL",
  sceneLengthInFrames = 75,
  transitionLengthInFrames = 18,
}) => {
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
              config: { damping: 200 },
              durationInFrames: transLen,
            });
            entries.push(
              <TransitionSeries.Transition
                key={`t-${i}`}
                presentation={makeTransitionPresentation(kind)}
                timing={timing}
              />
            );
          }

          entries.push(
            <TransitionSeries.Sequence
              key={`s-${i}`}
              durationInFrames={duration}
            >
              <SceneFrame scene={scene} sceneLen={sceneLen} />
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
