import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  Audio,
  Sequence,
  staticFile,
  random,
} from "remotion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StyleConfig {
  transition: string;
  textStyle: string;
  colorGrade: string;
}

export interface SocialReelProps {
  script: string;
  captions: string[];
  imageSrc?: string;       // backward compat: single image
  imageSrcs?: string[];    // multi-image: array
  platform: string;
  mood: string;
  hook: string;
  cta?: string;
  bgMusicVolume?: number;  // 0 = mute, 1 = full (default 0.32)
  sfxVolume?: number;      // 0 = mute, 1 = full (default 0.7)
  style: StyleConfig;
}

// ─── Mood configs ─────────────────────────────────────────────────────────────

interface MoodConfig {
  imageFilter: string;
  topOverlay: string | null;
  bottomOverlay: string;
  fullOverlay: string | null;
  vignetteIntensity: number;
  hookColor: string;
  hookShadow: string;
  captionPillBg: string;
  captionHighlight: string;
  captionColor: string;
  progressColor: string;
  hasCinematicBars: boolean;
  barColor: string;
  flashColor: string;
  kenBurns: { startScale: number; endScale: number; tx: [number, number]; ty: [number, number] };
  hasFilmGrain: boolean;
  hasGlitch: boolean;
  hasChromatic: boolean;
  hasSpeedLines: boolean;
  grainIntensity: number;
}

const MOOD: Record<string, MoodConfig> = {
  cinematic: {
    imageFilter: "contrast(1.12) brightness(0.88) saturate(0.78)",
    topOverlay: "linear-gradient(to bottom, rgba(30,10,0,0.22) 0%, transparent 40%)",
    bottomOverlay: "linear-gradient(to top, rgba(0,30,40,0.65) 0%, rgba(0,20,30,0.3) 40%, transparent 65%)",
    fullOverlay: "rgba(10,20,5,0.08)",
    vignetteIntensity: 0.65,
    hookColor: "#f4c430",
    hookShadow: "0 0 40px rgba(244,196,48,0.5), 0 4px 12px rgba(0,0,0,0.9)",
    captionPillBg: "rgba(0,0,0,0.72)",
    captionHighlight: "#f4c430",
    captionColor: "#f0ece4",
    progressColor: "#f4c430",
    hasCinematicBars: true,
    barColor: "#000000",
    flashColor: "rgba(244,196,48,0.3)",
    kenBurns: { startScale: 1.0, endScale: 1.15, tx: [-1.5, 1.5], ty: [-1, 1] },
    hasFilmGrain: true,
    hasGlitch: false,
    hasChromatic: false,
    hasSpeedLines: false,
    grainIntensity: 0.055,
  },
  "dark-moody": {
    imageFilter: "saturate(0.3) contrast(1.28) brightness(0.68)",
    topOverlay: null,
    bottomOverlay: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 35%, transparent 65%)",
    fullOverlay: "rgba(10,18,45,0.28)",
    vignetteIntensity: 0.85,
    hookColor: "#ffffff",
    hookShadow: "0 0 30px rgba(255,45,45,0.4), 0 4px 16px rgba(0,0,0,1)",
    captionPillBg: "rgba(0,0,0,0.8)",
    captionHighlight: "#ff2d2d",
    captionColor: "#e8e8e8",
    progressColor: "#ff2d2d",
    hasCinematicBars: false,
    barColor: "#000000",
    flashColor: "rgba(255,255,255,0.9)",
    kenBurns: { startScale: 1.14, endScale: 1.26, tx: [0, 0], ty: [-3, 1] },
    hasFilmGrain: true,
    hasGlitch: true,
    hasChromatic: true,
    hasSpeedLines: false,
    grainIntensity: 0.075,
  },
  vibrant: {
    imageFilter: "saturate(1.7) brightness(1.08) contrast(1.06)",
    topOverlay: "linear-gradient(to bottom, rgba(255,80,0,0.1) 0%, transparent 35%)",
    bottomOverlay: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)",
    fullOverlay: "rgba(255,180,0,0.05)",
    vignetteIntensity: 0.45,
    hookColor: "#ffde00",
    hookShadow: "0 0 40px rgba(255,100,0,0.6), 0 4px 8px rgba(0,0,0,0.8)",
    captionPillBg: "rgba(0,0,0,0.65)",
    captionHighlight: "#ff6600",
    captionColor: "#ffffff",
    progressColor: "#ff6600",
    hasCinematicBars: false,
    barColor: "#000000",
    flashColor: "rgba(255,140,0,0.7)",
    kenBurns: { startScale: 1.0, endScale: 1.2, tx: [-3, 3], ty: [0, 0] },
    hasFilmGrain: false,
    hasGlitch: false,
    hasChromatic: false,
    hasSpeedLines: true,
    grainIntensity: 0,
  },
  minimal: {
    imageFilter: "brightness(1.05) contrast(0.96) saturate(0.88)",
    topOverlay: null,
    bottomOverlay: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 45%, transparent 65%)",
    fullOverlay: null,
    vignetteIntensity: 0.35,
    hookColor: "#ffffff",
    hookShadow: "0 2px 20px rgba(0,0,0,0.6)",
    captionPillBg: "rgba(255,255,255,0.12)",
    captionHighlight: "#ffffff",
    captionColor: "rgba(255,255,255,0.9)",
    progressColor: "rgba(255,255,255,0.6)",
    hasCinematicBars: false,
    barColor: "#000000",
    flashColor: "rgba(255,255,255,0.4)",
    kenBurns: { startScale: 1.0, endScale: 1.07, tx: [0, 0], ty: [0, 0] },
    hasFilmGrain: false,
    hasGlitch: false,
    hasChromatic: false,
    hasSpeedLines: false,
    grainIntensity: 0,
  },
  raw: {
    imageFilter: "contrast(1.07) brightness(1.02)",
    topOverlay: null,
    bottomOverlay: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 55%)",
    fullOverlay: null,
    vignetteIntensity: 0.3,
    hookColor: "#ffffff",
    hookShadow: "0 3px 12px rgba(0,0,0,0.9)",
    captionPillBg: "rgba(0,0,0,0.55)",
    captionHighlight: "#ffff00",
    captionColor: "#ffffff",
    progressColor: "rgba(255,255,0,0.7)",
    hasCinematicBars: false,
    barColor: "#000000",
    flashColor: "rgba(255,255,255,0.5)",
    kenBurns: { startScale: 1.02, endScale: 1.12, tx: [1.5, -1.5], ty: [1, -1] },
    hasFilmGrain: true,
    hasGlitch: false,
    hasChromatic: false,
    hasSpeedLines: true,
    grainIntensity: 0.04,
  },
  neon: {
    imageFilter: "saturate(1.4) brightness(0.78) contrast(1.2) hue-rotate(15deg)",
    topOverlay: "linear-gradient(to bottom, rgba(80,0,160,0.35) 0%, transparent 40%)",
    bottomOverlay: "linear-gradient(to top, rgba(0,0,60,0.8) 0%, rgba(0,160,255,0.1) 40%, transparent 65%)",
    fullOverlay: "linear-gradient(135deg, rgba(80,0,160,0.2) 0%, rgba(0,160,255,0.15) 100%)",
    vignetteIntensity: 0.9,
    hookColor: "#00e5ff",
    hookShadow: "0 0 60px rgba(0,229,255,0.7), 0 0 20px rgba(0,229,255,0.5), 0 4px 12px rgba(0,0,0,1)",
    captionPillBg: "rgba(0,0,0,0.75)",
    captionHighlight: "#bf00ff",
    captionColor: "#d4f4ff",
    progressColor: "#00e5ff",
    hasCinematicBars: false,
    barColor: "#000000",
    flashColor: "rgba(0,229,255,0.6)",
    kenBurns: { startScale: 1.1, endScale: 1.0, tx: [0, 0], ty: [0, 0] },
    hasFilmGrain: false,
    hasGlitch: true,
    hasChromatic: true,
    hasSpeedLines: false,
    grainIntensity: 0,
  },
};

const DEFAULT_MOOD = MOOD.cinematic;

function getMood(mood: string): MoodConfig {
  return MOOD[mood] ?? DEFAULT_MOOD;
}

// ─── Multi-image background with Ken Burns + cross-dissolve ───────────────────

function MultiBackground({ images, mood }: { images: string[]; mood: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cfg = getMood(mood);
  const kb = cfg.kenBurns;

  const count = Math.max(images.length, 1);
  const framesPerImage = Math.floor(durationInFrames / count);
  const rawIndex = Math.floor(frame / Math.max(framesPerImage, 1));
  const currentIndex = Math.min(rawIndex, count - 1);
  const currentImageFrame = frame - currentIndex * framesPerImage;

  // Ken Burns per segment
  const progress = Math.min(currentImageFrame / Math.max(framesPerImage, 1), 1);
  const scale = kb.startScale + (kb.endScale - kb.startScale) * progress;
  const tx = kb.tx[0] + (kb.tx[1] - kb.tx[0]) * progress;
  const ty = kb.ty[0] + (kb.ty[1] - kb.ty[0]) * progress;

  // Cross-dissolve at cut points
  const dissolveFrames = 6;
  const isDissolving = currentImageFrame < dissolveFrames && currentIndex > 0;
  const dissolveOpacity = isDissolving ? currentImageFrame / dissolveFrames : 1;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Previous image (shows during dissolve) */}
      {isDissolving && currentIndex > 0 && (
        <AbsoluteFill>
          <Img
            src={images[currentIndex - 1]}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: cfg.imageFilter,
            }}
          />
        </AbsoluteFill>
      )}
      {/* Current image */}
      <AbsoluteFill style={{ opacity: dissolveOpacity }}>
        <Img
          src={images[currentIndex]}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
            filter: cfg.imageFilter,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Color grade overlays ─────────────────────────────────────────────────────

function ColorGrade({ mood }: { mood: string }) {
  const cfg = getMood(mood);
  return (
    <>
      {cfg.fullOverlay && (
        <AbsoluteFill style={{ background: cfg.fullOverlay, pointerEvents: "none" }} />
      )}
      {cfg.topOverlay && (
        <AbsoluteFill style={{ background: cfg.topOverlay, pointerEvents: "none" }} />
      )}
      <AbsoluteFill style={{ background: cfg.bottomOverlay, pointerEvents: "none" }} />
    </>
  );
}

// ─── Vignette ─────────────────────────────────────────────────────────────────

function Vignette({ mood }: { mood: string }) {
  const cfg = getMood(mood);
  const a = cfg.vignetteIntensity;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${a * 0.6}) 75%, rgba(0,0,0,${a}) 100%)`,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Cinematic letterbox bars ─────────────────────────────────────────────────

function CinematicBars({ mood }: { mood: string }) {
  const cfg = getMood(mood);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!cfg.hasCinematicBars) return null;

  const barH = interpolate(frame, [0, fps * 0.5], [0, 88], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * (2 - t),
  });

  return (
    <>
      <AbsoluteFill style={{ top: 0, bottom: "auto", height: barH, background: cfg.barColor, pointerEvents: "none" }} />
      <AbsoluteFill style={{ top: "auto", bottom: 0, height: barH, background: cfg.barColor, pointerEvents: "none" }} />
    </>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ mood }: { mood: string }) {
  const cfg = getMood(mood);
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const pct = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ top: 0, bottom: "auto", height: 3, pointerEvents: "none" }}>
      <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.08)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: cfg.progressColor,
            boxShadow: `0 0 8px ${cfg.progressColor}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

// ─── CAPCUT EFFECT: Film Grain ────────────────────────────────────────────────

function FilmGrain({ mood }: { mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  if (!cfg.hasFilmGrain) return null;

  // Cycle seed every 2 frames for animated grain
  const seed = Math.floor(frame / 2) % 60;
  const filterId = `grain-${seed}`;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: cfg.grainIntensity, mixBlendMode: "overlay" as React.CSSProperties["mixBlendMode"] }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.75"
              numOctaves="4"
              seed={seed}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${filterId})`} />
      </svg>
    </AbsoluteFill>
  );
}

// ─── CAPCUT EFFECT: Zoom Burst (opening frames) ───────────────────────────────

function ZoomBurst() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const burstEnd = Math.floor(fps * 0.27); // ~8 frames at 30fps
  if (frame > burstEnd) return null;

  const scale = interpolate(frame, [0, burstEnd], [1.35, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  const opacity = interpolate(frame, [0, 3, burstEnd], [0.7, 0.15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        background: "rgba(255,255,255,0.2)",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── CAPCUT EFFECT: Light Leak ────────────────────────────────────────────────

function LightLeak({ atFrame, mood }: { atFrame: number; mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  const rel = frame - atFrame;
  const duration = 14;
  if (rel < 0 || rel > duration) return null;

  const opacity = interpolate(rel, [0, 3, 10, duration], [0, 0.85, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sweep position: diagonal corner-to-corner
  const x = interpolate(rel, [0, duration], [-20, 110], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      <div
        style={{
          position: "absolute",
          width: "60%",
          height: "220%",
          top: "-60%",
          left: `${x}%`,
          background: `radial-gradient(ellipse at center, ${cfg.flashColor} 0%, transparent 70%)`,
          transform: "rotate(-35deg)",
          filter: "blur(30px)",
        }}
      />
    </AbsoluteFill>
  );
}

// ─── CAPCUT EFFECT: Glitch Transition ─────────────────────────────────────────

function GlitchTransition({ atFrame, mood }: { atFrame: number; mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  if (!cfg.hasGlitch) return null;

  const rel = frame - atFrame;
  const duration = 8;
  if (rel < 0 || rel > duration) return null;

  // Generate 6 horizontal glitch strips
  const strips = Array.from({ length: 6 }, (_, i) => {
    const offsetX = (random(`glitch-x-${atFrame}-${i}-${rel}`) - 0.5) * 48;
    const offsetY = (random(`glitch-y-${atFrame}-${i}-${rel}`) - 0.5) * 4;
    return { offsetX, offsetY, top: (i / 6) * 100, height: 100 / 6 };
  });

  const masterOpacity = interpolate(rel, [0, 1, 6, duration], [0, 1, 0.7, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: masterOpacity }}>
      {strips.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: `${s.top}%`,
            left: 0,
            right: 0,
            height: `${s.height}%`,
            transform: `translate(${s.offsetX}px, ${s.offsetY}px)`,
            background: i % 2 === 0
              ? "rgba(0,229,255,0.08)"
              : "rgba(255,0,100,0.06)",
            mixBlendMode: "screen" as React.CSSProperties["mixBlendMode"],
          }}
        />
      ))}
      {/* Hard white flash on frame 0 */}
      {rel === 0 && (
        <AbsoluteFill style={{ background: "rgba(255,255,255,0.25)" }} />
      )}
    </AbsoluteFill>
  );
}

// ─── CAPCUT EFFECT: Chromatic Aberration ──────────────────────────────────────

function ChromaticAberration({ atFrame, imageSrc, mood }: { atFrame: number; imageSrc: string; mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  if (!cfg.hasChromatic) return null;

  const rel = frame - atFrame;
  const duration = 10;
  if (rel < 0 || rel > duration) return null;

  const intensity = interpolate(rel, [0, 2, 8, duration], [0, 8, 4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(rel, [0, 1, 8, duration], [0, 0.55, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {/* Red channel shifted right */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity,
          transform: `translateX(${intensity}px)`,
          mixBlendMode: "screen" as React.CSSProperties["mixBlendMode"],
        }}
      >
        <Img
          src={imageSrc}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            filter: "saturate(0) brightness(2) sepia(1) hue-rotate(-20deg)",
          }}
        />
      </AbsoluteFill>
      {/* Blue/cyan channel shifted left */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity,
          transform: `translateX(${-intensity}px)`,
          mixBlendMode: "screen" as React.CSSProperties["mixBlendMode"],
        }}
      >
        <Img
          src={imageSrc}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            filter: "saturate(0) brightness(2) sepia(1) hue-rotate(190deg)",
          }}
        />
      </AbsoluteFill>
    </>
  );
}

// ─── CAPCUT EFFECT: Speed Lines (vibrant/raw) ─────────────────────────────────

function SpeedLines({ mood, atFrame }: { mood: string; atFrame: number }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  if (!cfg.hasSpeedLines) return null;

  const rel = frame - atFrame;
  if (rel < 0 || rel > 6) return null;

  const opacity = interpolate(rel, [0, 2, 6], [0, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(rel, [0, 6], [0.1, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity,
        background: `radial-gradient(ellipse at center, transparent 15%, rgba(255,255,255,0.12) 30%, transparent 70%)`,
        transform: `scale(${scale})`,
      }}
    />
  );
}

// ─── CAPCUT EFFECT: Neon Scan Lines ───────────────────────────────────────────

function NeonScanLines({ mood }: { mood: string }) {
  if (mood !== "neon") return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity: 0.05,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(0,229,255,0.5) 0px, rgba(0,229,255,0.5) 1px, transparent 1px, transparent 4px)",
        backgroundSize: "100% 4px",
      }}
    />
  );
}

// ─── Flash transition ─────────────────────────────────────────────────────────

function FlashTransition({ atFrame, mood }: { atFrame: number; mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  const rel = frame - atFrame;
  if (rel < -2 || rel > 8) return null;

  const opacity = interpolate(rel, [-2, 0, 2, 8], [0, 1, 0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: cfg.flashColor,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

// ─── Hook text (word-by-word stagger) ─────────────────────────────────────────

function HookText({ hook, mood }: { hook: string; mood: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = getMood(mood);

  const holdUntil = fps * 3;
  const fadeEnd = holdUntil + fps * 0.4;

  const containerOpacity = interpolate(
    frame,
    [0, 4, holdUntil, fadeEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (frame > fadeEnd) return null;

  const words = hook.split(" ").filter(Boolean);
  const wordDelay = 4;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: 64,
        paddingRight: 64,
        opacity: containerOpacity,
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 1.15 }}>
        {words.map((word, i) => {
          const wordFrame = frame - i * wordDelay;
          const wordScale = spring({
            frame: wordFrame,
            fps,
            config: { damping: 11, stiffness: 220, mass: 0.7 },
            from: 0.55,
            to: 1,
          });
          const wordOpacity = interpolate(wordFrame, [0, 5], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.22em",
                fontSize: mood === "neon" ? 78 : 74,
                fontWeight: 900,
                fontFamily: mood === "minimal" ? "Georgia, serif" : "Inter, system-ui, sans-serif",
                color: cfg.hookColor,
                textShadow: cfg.hookShadow,
                letterSpacing: "-0.02em",
                transform: `scale(${wordScale})`,
                opacity: wordOpacity,
              }}
            >
              {mood === "neon" ? (
                <span style={{
                  WebkitTextStroke: `2px ${cfg.hookColor}`,
                  color: "transparent",
                  filter: `drop-shadow(0 0 18px ${cfg.hookColor})`,
                }}>
                  {word}
                </span>
              ) : word}
            </span>
          );
        })}
      </div >
    </AbsoluteFill>
  );
}

// ─── Captions (CapCut-style word pop with highlight) ──────────────────────────

function CaptionWord({
  word,
  isHighlighted,
  startFrame,
  mood,
}: {
  word: string;
  isHighlighted: boolean;
  startFrame: number;
  mood: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = getMood(mood);
  const rel = frame - startFrame;

  const opacity = spring({
    frame: rel,
    fps,
    config: { damping: 18, stiffness: 350, mass: 0.4 },
    from: 0,
    to: 1,
  });

  const ty = interpolate(rel, [0, 8], [10, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = spring({
    frame: rel,
    fps,
    config: { damping: 10, stiffness: 450, mass: 0.3 },
    from: 0.7,
    to: 1,
  });

  if (rel < 0) {
    return (
      <span style={{ opacity: 0, display: "inline-block", margin: "0 4px" }}>{word}</span>
    );
  }

  return (
    <span
      style={{
        display: "inline-block",
        margin: "0 5px",
        opacity,
        transform: `scale(${scale}) translateY(${ty}px)`,
        color: isHighlighted ? cfg.captionHighlight : cfg.captionColor,
        fontWeight: 900,
        fontSize: mood === "minimal" ? 46 : 54,
        fontFamily: mood === "minimal" ? "Georgia, serif" : "Inter, system-ui, sans-serif",
        letterSpacing: "-0.01em",
        lineHeight: 1.2,
        textShadow: isHighlighted
          ? `0 0 30px ${cfg.captionHighlight}88, 0 2px 8px rgba(0,0,0,0.9)`
          : "0 2px 8px rgba(0,0,0,0.9)",
        ...(mood === "neon" && isHighlighted
          ? { filter: `drop-shadow(0 0 12px ${cfg.captionHighlight})` }
          : {}),
      }}
    >
      {word}
    </span>
  );
}

function Captions({
  captions,
  startFrame,
  mood,
}: {
  captions: string[];
  startFrame: number;
  mood: string;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cfg = getMood(mood);

  if (frame < startFrame) return null;

  const safeCaptions = captions.length > 0 ? captions : ["Watch", "this", "space"];
  const captionDuration = Math.max(
    Math.floor((durationInFrames - startFrame) / safeCaptions.length),
    1
  );

  const relFrame = frame - startFrame;
  const currentIndex = Math.min(
    Math.floor(relFrame / captionDuration),
    safeCaptions.length - 1
  );

  if (currentIndex < 0) return null;

  const currentCaption = safeCaptions[currentIndex];
  if (!currentCaption) return null;

  const words = currentCaption.split(/\s+/).filter(Boolean);
  const captionStartFrame = startFrame + currentIndex * captionDuration;
  const wordDelay = Math.max(Math.floor(fps / 8), 2);

  const captionRelFrame = frame - captionStartFrame;
  const slideY = interpolate(captionRelFrame, [0, 6], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const highlightIndex = captionRelFrame < fps * 0.4 ? 0 : -1;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 160,
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          background: cfg.captionPillBg,
          backdropFilter: "blur(6px)",
          borderRadius: 18,
          padding: "14px 24px",
          transform: `translateY(${slideY}px)`,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          maxWidth: "90%",
        }}
      >
        {words.map((word, i) => (
          <CaptionWord
            key={`${currentIndex}-${i}`}
            word={word}
            isHighlighted={i === highlightIndex}
            startFrame={captionStartFrame + i * wordDelay}
            mood={mood}
          />
        ))}
      </div >
    </AbsoluteFill>
  );
}

// ─── CTA card (last ~1.5s) ────────────────────────────────────────────────────

function CTACard({ cta, mood }: { cta?: string; mood: string }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cfg = getMood(mood);

  if (!cta) return null;

  const showFrom = durationInFrames - Math.floor(fps * 1.5);
  const rel = frame - showFrom;

  if (rel < 0) return null;

  const opacity = spring({
    frame: rel,
    fps,
    config: { damping: 18, stiffness: 200 },
    from: 0,
    to: 1,
  });

  const scale = spring({
    frame: rel,
    fps,
    config: { damping: 14, stiffness: 280 },
    from: 0.85,
    to: 1,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 52,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          background: `${cfg.captionPillBg}`,
          border: `2px solid ${cfg.progressColor}44`,
          borderRadius: 24,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 28,
          paddingRight: 28,
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        <div
          style={{
            color: cfg.progressColor,
            fontSize: 38,
            fontWeight: 900,
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            textShadow: `0 0 24px ${cfg.progressColor}88`,
          }}
        >
          {cta}
        </div >
      </div>
    </AbsoluteFill>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────

// ─── Sound effect (Sequence-based, correct Remotion pattern) ─────────────────

function SoundEffect({ src, atFrame, durationInFrames = 30, volume = 1 }: {
  src: string; atFrame: number; durationInFrames?: number; volume?: number;
}) {
  if (atFrame < 0) return null;
  return (
    <Sequence from={atFrame} durationInFrames={durationInFrames} layout="none">
      <Audio src={src} volume={volume} />
    </Sequence>
  );
}

// ─── Background music (loops for full duration) ────────────────────────────

const MOOD_MUSIC: Record<string, string> = {
  cinematic:    "audio/music-cinematic.wav",
  "dark-moody": "audio/music-dark-moody.wav",
  vibrant:      "audio/music-vibrant.wav",
  minimal:      "audio/music-minimal.wav",
  raw:          "audio/music-raw.wav",
  neon:         "audio/music-neon.wav",
};

function BackgroundMusic({ mood, volume = 0.35 }: { mood: string; volume?: number }) {
  const { durationInFrames } = useVideoConfig();
  const track = MOOD_MUSIC[mood];
  if (!track) return null;
  return (
    <Sequence from={0} durationInFrames={durationInFrames} layout="none">
      <Audio src={staticFile(track)} volume={volume} loop />
    </Sequence>
  );
}

// ─── Main composition ─────────────────────────────────────────────────────────

export function SocialReel(props: SocialReelProps) {
  const { mood, hook, captions, cta, style } = props;
  const { fps, durationInFrames } = useVideoConfig();

  // Volume controls
  const bgVol  = props.bgMusicVolume  ?? 0.32;
  const sfxVol = props.sfxVolume      ?? 0.7;

  // Per-mood SFX multiplier
  const moodSfx: Record<string, number> = {
    cinematic: 0.55, "dark-moody": 0.75, vibrant: 0.95,
    minimal: 0.22, raw: 0.6, neon: 0.85,
  };
  const vol = (moodSfx[mood] ?? 0.6) * sfxVol;

  // Normalize image sources (backward compat)
  const images: string[] = props.imageSrcs?.length
    ? props.imageSrcs
    : props.imageSrc
      ? [props.imageSrc]
      : [""];

  const count = Math.max(images.length, 1);
  const framesPerImage = Math.floor(durationInFrames / count);

  // Cut points: where each new image starts
  const cutPoints = Array.from({ length: count }, (_, i) => i * framesPerImage);

  // Hook→captions transition frame
  const hookEndFrame = fps * 3;

  // Primary image for chromatic aberration
  const primaryImage = images[0] ?? "";

  // Transition style
  const transitionType = style?.transition ?? "cut";
  const useDissolve = transitionType === "cross-dissolve" || transitionType === "fade";

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ── Background music (full duration, mood-matched) */}
      <BackgroundMusic mood={mood} volume={bgVol} />

      {/* ── Layer 0: Background images */}
      <MultiBackground images={images} mood={mood} />

      {/* ── Layer 1: Color grade */}
      <ColorGrade mood={mood} />

      {/* ── Layer 2: Vignette */}
      <Vignette mood={mood} />

      {/* ── Layer 3: Film grain */}
      <FilmGrain mood={mood} />

      {/* ── Layer 4: Neon scan lines */}
      <NeonScanLines mood={mood} />

      {/* ── Layer 5: Cinematic bars */}
      <CinematicBars mood={mood} />

      {/* ── Layer 6: Per-image cut transitions + SFX */}
      {cutPoints.slice(1).map((cutFrame) => (
        <React.Fragment key={cutFrame}>
          {!useDissolve && <FlashTransition atFrame={cutFrame} mood={mood} />}
          <LightLeak atFrame={cutFrame} mood={mood} />
          <GlitchTransition atFrame={cutFrame} mood={mood} />
          <ChromaticAberration atFrame={cutFrame} imageSrc={primaryImage} mood={mood} />
          {/* Whoosh on cut */}
          <SoundEffect src={staticFile("audio/whoosh.wav")} atFrame={Math.max(0, cutFrame - 2)} durationInFrames={fps} volume={vol * 0.8} />
          {/* Impact hit */}
          <SoundEffect src={staticFile("audio/impact.wav")} atFrame={cutFrame + 3} durationInFrames={fps} volume={vol * 0.55} />
          {/* Glitch blip for neon/dark-moody */}
          {(mood === "neon" || mood === "dark-moody") && (
            <SoundEffect src={staticFile("audio/glitch.wav")} atFrame={cutFrame} durationInFrames={fps} volume={vol * 0.9} />
          )}
        </React.Fragment>
      ))}

      {/* ── Layer 7: Hook→captions cut */}
      <FlashTransition atFrame={hookEndFrame} mood={mood} />
      <SpeedLines mood={mood} atFrame={hookEndFrame} />
      <SoundEffect src={staticFile("audio/whoosh.wav")} atFrame={Math.max(0, hookEndFrame - 2)} durationInFrames={fps} volume={vol} />

      {/* ── Layer 8: Opening zoom burst */}
      <ZoomBurst />
      {/* Opening impact + zoom sfx */}
      <SoundEffect src={staticFile("audio/impact.wav")} atFrame={0} durationInFrames={fps} volume={vol * 0.45} />
      {(mood === "vibrant" || mood === "raw") && (
        <SoundEffect src={staticFile("audio/zoom.wav")} atFrame={2} durationInFrames={fps} volume={vol * 0.65} />
      )}

      {/* ── Layer 9: Progress bar */}
      <ProgressBar mood={mood} />

      {/* ── Layer 10: Hook text */}
      <HookText hook={hook} mood={mood} />

      {/* ── Layer 11: Captions */}
      <Captions captions={captions} startFrame={hookEndFrame} mood={mood} />

      {/* ── Layer 12: CTA */}
      <CTACard cta={cta} mood={mood} />
    </AbsoluteFill>
  );
}