import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { flip } from "@remotion/transitions/flip";
import type { TransitionPresentation } from "@remotion/transitions";

export type HtmlSlideVideoProps = {
  /** Paths relative to `/public`, e.g. `html-renders/<jobId>/0.png` */
  slidePaths: string[];
  /** Composition dimensions (set via `calculateMetadata` from render API). */
  width?: number;
  height?: number;
  sceneLengthInFrames?: number;
  transitionLengthInFrames?: number;
  /** Optional per-scene TTS audio paths (public-relative, e.g. "tts/scene-0.wav").
   *  When provided, the audio file at index i plays once at the start of scene i. */
  narrationPaths?: string[];
  motionFeel?: "smooth" | "snappy" | "bouncy" | "dramatic" | "dreamy";
  transitionEnergy?: "calm" | "medium" | "high";
};

function resolvePublicPath(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return staticFile(src.replace(/^\.?\//, ""));
}

export { computeHtmlSlideVideoDuration } from "../../lib/html-slide-duration";

// Different presentation types have incompatible generics — widen to shared base
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

// Varied transition cycle — more cinematic than fade-only
// iris and clockWipe need width/height so they're built dynamically in the component
type TransitionFactory = (w: number, h: number) => AnyPresentation;
const TRANSITION_FAMILIES: Record<
  NonNullable<HtmlSlideVideoProps["transitionEnergy"]>,
  TransitionFactory[]
> = {
  calm: [
    () => fade() as AnyPresentation,
    () => slide({ direction: "from-bottom" }) as AnyPresentation,
    (w, h) => iris({ width: w, height: h }) as unknown as AnyPresentation,
    () => fade() as AnyPresentation,
  ],
  medium: [
    () => slide({ direction: "from-right" }) as AnyPresentation,
    (w, h) => iris({ width: w, height: h }) as unknown as AnyPresentation,
    () => wipe({ direction: "from-top-left" }) as AnyPresentation,
    () => fade() as AnyPresentation,
    () => slide({ direction: "from-bottom" }) as AnyPresentation,
  ],
  high: [
    () => flip({ direction: "from-right" }) as AnyPresentation,
    () => wipe({ direction: "from-top-right" }) as AnyPresentation,
    (w, h) => clockWipe({ width: w, height: h }) as unknown as AnyPresentation,
    () => slide({ direction: "from-right" }) as AnyPresentation,
    (w, h) => iris({ width: w, height: h }) as unknown as AnyPresentation,
  ],
};

const cameraVectors = [
  { fromScale: 1.02, toScale: 1.08, fromX: -1.5, toX: 1.2, fromY: -1, toY: 1 },
  { fromScale: 1.08, toScale: 1.01, fromX: 1.2, toX: -1.2, fromY: 1.4, toY: -0.8 },
  { fromScale: 1.03, toScale: 1.1, fromX: 0.4, toX: -1.1, fromY: -1.4, toY: 1.2 },
  { fromScale: 1.1, toScale: 1.04, fromX: -1, toX: 1.1, fromY: 0.8, toY: -1.1 },
];

const SlideAtmosphere: React.FC<{
  motionFeel: NonNullable<HtmlSlideVideoProps["motionFeel"]>;
}> = ({ motionFeel }) => {
  const frame = useCurrentFrame();
  const grainOpacity =
    motionFeel === "dramatic" ? 0.12 : motionFeel === "dreamy" ? 0.06 : motionFeel === "snappy" ? 0.08 : 0.1;
  const pulse = interpolate(frame % 45, [0, 22, 44], [0.12, 0.2, 0.12], {
    extrapolateRight: "clamp",
  });

  return (
    <>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.02) 28%, rgba(0,0,0,0.38) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            motionFeel === "dreamy"
              ? "radial-gradient(circle at 20% 18%, rgba(255,224,178,0.18), transparent 34%), radial-gradient(circle at 82% 78%, rgba(141,214,255,0.14), transparent 36%)"
              : "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.12), transparent 28%), radial-gradient(circle at 82% 82%, rgba(255,255,255,0.08), transparent 26%)",
          mixBlendMode: "screen",
          opacity: pulse,
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          inset: "3.5%",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: grainOpacity,
          mixBlendMode: "overlay",
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.8px), radial-gradient(rgba(255,255,255,0.22) 0.4px, transparent 0.8px)",
          backgroundPosition: "0 0, 12px 11px",
          backgroundSize: "14px 14px, 17px 17px",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

const SlideStill: React.FC<{
  src: string;
  index: number;
  motionFeel: NonNullable<HtmlSlideVideoProps["motionFeel"]>;
}> = ({ src, index, motionFeel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vector = cameraVectors[index % cameraVectors.length];
  const motionStrength =
    motionFeel === "dramatic" ? 1.15 : motionFeel === "dreamy" ? 0.72 : motionFeel === "snappy" ? 0.95 : 0.85;
  const springProgress = spring({
    fps,
    frame,
    config: {
      damping: motionFeel === "bouncy" ? 12 : motionFeel === "dramatic" ? 24 : 18,
      stiffness: motionFeel === "bouncy" ? 110 : 90,
    },
  });
  const scale = interpolate(
    springProgress,
    [0, 1],
    [vector.fromScale, vector.toScale + (motionStrength - 0.85) * 0.05]
  );
  const tx = interpolate(springProgress, [0, 1], [vector.fromX, vector.toX]) * motionStrength;
  const ty = interpolate(springProgress, [0, 1], [vector.fromY, vector.toY]) * motionStrength;
  const overlayOpacity = interpolate(frame, [0, 12, 40], [0.24, 0.08, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <Img
          src={resolvePublicPath(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(42px) brightness(0.62) saturate(1.2)",
            transform: "scale(1.18)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
          transformOrigin: "center center",
        }}
      >
        <Img
          src={resolvePublicPath(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.12) 24%, transparent 55%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.42) 100%)",
          opacity: overlayOpacity,
          mixBlendMode: "screen",
        }}
      />
      <SlideAtmosphere motionFeel={motionFeel} />
    </AbsoluteFill>
  );
};

export const HtmlSlideVideo: React.FC<HtmlSlideVideoProps> = ({
  slidePaths,
  sceneLengthInFrames = 90,
  transitionLengthInFrames = 12,
  narrationPaths,
  motionFeel = "snappy",
  transitionEnergy = "medium",
}) => {
  const { width: vw, height: vh } = useVideoConfig();
  const transitions = TRANSITION_FAMILIES[transitionEnergy] ?? TRANSITION_FAMILIES.medium;
  const timingConfig =
    transitionEnergy === "high"
      ? { damping: 128, stiffness: 250 }
      : transitionEnergy === "calm"
        ? { damping: 220, stiffness: 155 }
        : { damping: 180, stiffness: 200 };

  if (!slidePaths?.length) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0a0a0a",
          color: "#666",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 32,
        }}
      >
        No slides — render HTML via /api/html-slides/render first
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>
        {slidePaths.map((src, i) => {
          // Spring timing for most transitions; slightly snappier for iris/wipe
          const timing = springTiming({
            config: timingConfig,
            durationInFrames: transitionLengthInFrames,
          });
          const presentation = transitions[i % transitions.length](vw, vh);

          return (
            <React.Fragment key={`${i}-${src}`}>
              {i > 0 ? (
                <TransitionSeries.Transition
                  presentation={presentation}
                  timing={timing}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={sceneLengthInFrames}>
                <SlideStill src={src} index={i} motionFeel={motionFeel} />
                {narrationPaths?.[i] ? (
                  <Audio
                    src={staticFile(narrationPaths[i]!.replace(/^\.?\//, ""))}
                    volume={0.85}
                  />
                ) : null}
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
