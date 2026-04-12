import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from "remotion";

// ── Data ──────────────────────────────────────────────────────────────────────

const SLIDES = [
  { words: ["AI", "&", "Coding", "is", "AWESOME."], color: "#7c3aed" },
  { words: ["It", "lets", "you", "build", "anything", "you", "imagine."], color: "#2563eb" },
  { words: ["In", "minutes,", "not", "months."], color: "#059669" },
  { words: ["From", "videos", "to", "apps", "to", "entire", "businesses."], color: "#d97706" },
  { words: ["The", "future", "belongs", "to", "builders."], color: "#7c3aed" },
];

const SLIDE_DURATION_S = 2; // seconds per slide

// ── Word ──────────────────────────────────────────────────────────────────────

function Word({
  word,
  index,
  accentColor,
  isLast,
}: {
  word: string;
  index: number;
  accentColor: string;
  isLast: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delay = index * 4; // 4 frames between each word
  const s = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 18, stiffness: 220, mass: 0.6 },
  });

  const y = interpolate(s, [0, 1], [28, 0]);
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const scale = interpolate(s, [0, 1], [0.75, 1]);

  // Last word gets accent colour
  const color = isLast ? accentColor : "#ffffff";

  return (
    <span
      style={{
        display: "inline-block",
        transform: `translateY(${y}px) scale(${scale})`,
        opacity,
        color,
        marginRight: 14,
        marginBottom: 8,
        fontWeight: 900,
        fontSize: 72,
        letterSpacing: "-2px",
        lineHeight: 1.1,
        textShadow: isLast
          ? `0 0 40px ${accentColor}88`
          : "0 4px 24px rgba(0,0,0,0.8)",
      }}
    >
      {word}
    </span>
  );
}

// ── Slide ─────────────────────────────────────────────────────────────────────

function Slide({
  words,
  accentColor,
}: {
  words: string[];
  accentColor: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = SLIDE_DURATION_S * fps;

  // Slide fades out in last 8 frames
  const exitStart = totalFrames - 8;
  const slideOpacity = interpolate(frame, [exitStart, totalFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 80px",
        opacity: slideOpacity,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 900 }}>
        {words.map((word, i) => (
          <Word
            key={i}
            word={word}
            index={i}
            accentColor={accentColor}
            isLast={i === words.length - 1}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ── Background ────────────────────────────────────────────────────────────────

function Background({ frame, totalFrames }: { frame: number; totalFrames: number }) {
  const progress = frame / totalFrames;

  // Slowly shifting gradient (Darker and more purple)
  const hue = interpolate(progress, [0, 1], [270, 220], { extrapolateRight: "clamp" });
  const hue2 = interpolate(progress, [0, 1], [250, 300], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 40%, hsl(${hue}, 70%, 4%) 0%, hsl(${hue2}, 50%, 2%) 60%, #000 100%)`,
      }}
    />
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ frame, totalFrames }: { frame: number; totalFrames: number }) {
  const width = interpolate(frame, [0, totalFrames], [0, 100], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 80,
          right: 80,
          height: 4,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${width}%`,
            background: "rgba(124,58,237,0.8)",
            borderRadius: 2,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export const AIVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const slideFrames = SLIDE_DURATION_S * fps;

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Background frame={frame} totalFrames={durationInFrames} />

      {SLIDES.map((slide, i) => (
        <Sequence
          key={i}
          from={i * slideFrames}
          durationInFrames={slideFrames}
          premountFor={slideFrames}
        >
          <Slide words={slide.words} accentColor={slide.color} />
        </Sequence>
      ))}

      <ProgressBar frame={frame} totalFrames={durationInFrames} />
    </AbsoluteFill>
  );
};