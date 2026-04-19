import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useVideoConfig } from "remotion";
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
};

function resolvePublicPath(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return staticFile(src.replace(/^\.?\//, ""));
}

export { computeHtmlSlideVideoDuration } from "@/lib/html-slide-duration";

// Different presentation types have incompatible generics — widen to shared base
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

// Varied transition cycle — more cinematic than fade-only
// iris and clockWipe need width/height so they're built dynamically in the component
type TransitionFactory = (w: number, h: number) => AnyPresentation;
const TRANSITIONS: TransitionFactory[] = [
  () => slide({ direction: "from-right" }) as AnyPresentation,
  (w, h) => iris({ width: w, height: h }) as unknown as AnyPresentation,
  () => wipe({ direction: "from-top-left" }) as AnyPresentation,
  (w, h) => clockWipe({ width: w, height: h }) as unknown as AnyPresentation,
  () => fade() as AnyPresentation,
  () => slide({ direction: "from-bottom" }) as AnyPresentation,
  () => flip({ direction: "from-right" }) as AnyPresentation,
  () => wipe({ direction: "from-top-right" }) as AnyPresentation,
  (w, h) => iris({ width: w, height: h }) as unknown as AnyPresentation,
  () => fade() as AnyPresentation,
];

export const HtmlSlideVideo: React.FC<HtmlSlideVideoProps> = ({
  slidePaths,
  sceneLengthInFrames = 90,
  transitionLengthInFrames = 18,
  narrationPaths,
}) => {
  const { width: vw, height: vh } = useVideoConfig();

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
            config: { damping: 180, stiffness: 200 },
            durationInFrames: transitionLengthInFrames,
          });
          const presentation = TRANSITIONS[i % TRANSITIONS.length](vw, vh);

          return (
            <React.Fragment key={`${i}-${src}`}>
              {i > 0 ? (
                <TransitionSeries.Transition
                  presentation={presentation}
                  timing={timing}
                />
              ) : null}
              <TransitionSeries.Sequence durationInFrames={sceneLengthInFrames}>
                <AbsoluteFill>
                  <Img
                    src={resolvePublicPath(src)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </AbsoluteFill>
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
