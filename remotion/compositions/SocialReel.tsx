import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  Sequence,
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
  imageSrc: string;
  platform: string;
  mood: string;
  hook: string;
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
    flashColor: "rgba(244,196,48,0.25)",
    kenBurns: { startScale: 1.0, endScale: 1.15, tx: [-1.5, 1.5], ty: [-1, 1] },
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
  },
};

const DEFAULT_MOOD = MOOD.cinematic;

function getMood(mood: string): MoodConfig {
  return MOOD[mood] ?? DEFAULT_MOOD;
}

// ─── Background with Ken Burns ────────────────────────────────────────────────

function Background({ imageSrc, mood }: { imageSrc: string; mood: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cfg = getMood(mood);
  const kb = cfg.kenBurns;

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = kb.startScale + (kb.endScale - kb.startScale) * progress;
  const tx = kb.tx[0] + (kb.tx[1] - kb.tx[0]) * progress;
  const ty = kb.ty[0] + (kb.ty[1] - kb.ty[0]) * progress;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={imageSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
          filter: cfg.imageFilter,
        }}
      />
    </AbsoluteFill>
  );
}

// ─── Color grade overlays ─────────────────────────────────────────────────────

function ColorGrade({ mood }: { mood: string }) {
  const cfg = getMood(mood);

  return (
    <>
      {/* Full color overlay */}
      {cfg.fullOverlay && (
        <AbsoluteFill style={{ background: cfg.fullOverlay, pointerEvents: "none" }} />
      )}

      {/* Top overlay */}
      {cfg.topOverlay && (
        <AbsoluteFill style={{ background: cfg.topOverlay, pointerEvents: "none" }} />
      )}

      {/* Bottom gradient (readability) */}
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
      <AbsoluteFill
        style={{
          top: 0, bottom: "auto",
          height: barH,
          background: cfg.barColor,
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          top: "auto", bottom: 0,
          height: barH,
          background: cfg.barColor,
          pointerEvents: "none",
        }}
      />
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
    <AbsoluteFill
      style={{
        top: 0, bottom: "auto",
        height: 3,
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.08)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: cfg.progressColor,
            boxShadow: `0 0 8px ${cfg.progressColor}`,
            transition: "none",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

// ─── Flash transition ─────────────────────────────────────────────────────────

function FlashTransition({ atFrame, mood }: { atFrame: number; mood: string }) {
  const frame = useCurrentFrame();
  const cfg = getMood(mood);

  const rel = frame - atFrame;
  if (rel < -2 || rel > 8) return null;

  const opacity = interpolate(
    rel,
    [-2, 0, 2, 8],
    [0, 1, 0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

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
  const wordDelay = 4; // frames between words

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
      </div>
    </AbsoluteFill>
  );
}

// ─── Caption card (TikTok pill style) ─────────────────────────────────────────

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
  // Guard against division-by-zero
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

  // Slide-up transition when caption changes
  const captionRelFrame = frame - captionStartFrame;
  const slideY = interpolate(captionRelFrame, [0, 6], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highlight the first word of each new caption
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
          gap: "2px 0px",
          border: mood === "neon" ? `1px solid rgba(0,229,255,0.2)` : "none",
          boxShadow: mood === "neon"
            ? `0 0 20px rgba(0,229,255,0.15), inset 0 0 20px rgba(0,0,0,0.4)`
            : "0 4px 24px rgba(0,0,0,0.4)",
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
      </div>
    </AbsoluteFill>
  );
}

// ─── Platform watermark ───────────────────────────────────────────────────────

function PlatformWatermark({ platform, mood }: { platform: string; mood: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = getMood(mood);

  const LABELS: Record<string, string> = {
    tiktok: "TikTok",
    reels: "Reels",
    shorts: "Shorts",
    pinterest: "Pinterest",
    x: "X",
  };

  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: 36,
        paddingTop: 48,
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          marginLeft: "auto",
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          border: `1px solid rgba(255,255,255,0.1)`,
          borderRadius: 10,
          padding: "6px 16px",
        }}
      >
        <span
          style={{
            color: cfg.progressColor,
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "0.04em",
          }}
        >
          {LABELS[platform] ?? platform}
        </span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Neon scan line effect ────────────────────────────────────────────────────

function NeonScanLines({ mood }: { mood: string }) {
  if (mood !== "neon") return null;
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
        pointerEvents: "none",
        mixBlendMode: "multiply",
      }}
    />
  );
}

// ─── Root composition ─────────────────────────────────────────────────────────

export const SocialReel: React.FC<SocialReelProps> = ({
  script,
  captions,
  imageSrc,
  platform,
  mood = "cinematic",
  hook,
}) => {
  const { fps } = useVideoConfig();

  const validMood = MOOD[mood] ? mood : "cinematic";
  const hookDuration = fps * 3;
  const captionStart = hookDuration;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>

      {/* 1 — Background (Ken Burns) */}
      <Background imageSrc={imageSrc} mood={validMood} />

      {/* 2 — Color grade overlays */}
      <ColorGrade mood={validMood} />

      {/* 3 — Vignette */}
      <Vignette mood={validMood} />

      {/* 4 — Neon scan lines */}
      <NeonScanLines mood={validMood} />

      {/* 5 — Cinematic letterbox bars */}
      <CinematicBars mood={validMood} />

      {/* 6 — Hook (first 3 seconds) */}
      <Sequence from={0} durationInFrames={hookDuration + fps}>
        <HookText hook={hook || script.slice(0, 40)} mood={validMood} />
      </Sequence>

      {/* 7 — Flash transition at hook→captions cut */}
      <FlashTransition atFrame={captionStart} mood={validMood} />

      {/* 8 — Captions */}
      <Captions
        captions={captions.length > 0 ? captions : script.split(" ").slice(0, 20)}
        startFrame={captionStart}
        mood={validMood}
      />

      {/* 9 — Progress bar */}
      <ProgressBar mood={validMood} />

      {/* 10 — Platform watermark */}
      <PlatformWatermark platform={platform} mood={validMood} />

    </AbsoluteFill>
  );
};
