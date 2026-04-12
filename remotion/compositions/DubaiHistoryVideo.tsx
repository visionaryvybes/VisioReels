import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Sequence,
  Audio,
  Img,
  staticFile,
} from "remotion";

// ── Slide data ────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    imgSeed: "dubai_pearls_port",
    title: "A Pearl Diving Village",
    body: "Before skyscrapers, Dubai was a humble fishing and pearl diving port on the Arabian coast.",
  },
  {
    imgSeed: "dubai_desert_trade",
    title: "The Rise of Trade",
    body: "In the early 1900s, Sheikh Maktoum opened Dubai to free trade — merchants flocked from around the world.",
  },
  {
    imgSeed: "dubai_oil_boom",
    title: "Oil Changes Everything",
    body: "Oil discovered in 1966 funded roads, hospitals, and airports almost overnight.",
  },
  {
    imgSeed: "dubai_burj_khalifa",
    title: "The World's Tallest Ambitions",
    body: "The Burj Khalifa, Palm Islands, and the Dubai Mall turned the city into a global icon.",
  },
  {
    imgSeed: "dubai_future_expo",
    title: "The Future is Now",
    body: "Today Dubai hosts millions of visitors yearly — a city that built tomorrow in just 50 years.",
  },
];

const FPS = 30;
const SLIDE_SECONDS = 6; // 6s per slide × 5 = 30s total
const SLIDE_FRAMES = SLIDE_SECONDS * FPS;

// ── Word spring animation ─────────────────────────────────────────────────────

function Word({ word, i }: { word: string; i: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame: Math.max(0, frame - i * 3),
    fps,
    config: { damping: 20, stiffness: 200, mass: 0.7 },
  });

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: 10,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`,
      }}
    >
      {word}
    </span>
  );
}

// ── Single slide ──────────────────────────────────────────────────────────────

function Slide({ imgSeed, title, body }: { imgSeed: string; title: string; body: string }) {
  const frame = useCurrentFrame(); // local frame (0 = start of this slide)

  // Slide fades out in the last 12 frames
  const slideOpacity = interpolate(frame, [SLIDE_FRAMES - 12, SLIDE_FRAMES - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  // Title springs in from left after 4 frames
  const { fps } = useVideoConfig();
  const titleSpring = spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 22, stiffness: 180 } });

  const titleX = interpolate(titleSpring, [0, 1], [-60, 0]);

  const titleWords = title.split(" ");
  const bodyWords = body.split(" ");

  return (
    <AbsoluteFill style={{ opacity: slideOpacity }}>
      {/* Background image */}
      <Img
        src={`https://picsum.photos/seed/${imgSeed}/1080/1920`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Dark gradient overlay */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.25) 100%)",
        }}
      />

      {/* Text block */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 60px 120px",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-1px",
            marginBottom: 20,
            transform: `translateX(${titleX}px)`,
            opacity: titleSpring,
            textShadow: "0 4px 32px rgba(0,0,0,0.8)",
          }}
        >
          {titleWords.map((w, i) => (
            <Word key={i} word={w} i={i} />
          ))}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 34,
            fontWeight: 400,
            color: "rgba(255,255,255,0.82)",
            lineHeight: 1.5,
            textShadow: "0 2px 12px rgba(0,0,0,0.9)",
          }}
        >
          {bodyWords.map((w, i) => (
            <Word key={i} word={w} i={i + titleWords.length + 4} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ totalFrames }: { totalFrames: number }) {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, totalFrames], [0, 100], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", bottom: 36, left: 60, right: 60, height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "rgba(255,200,80,0.9)", borderRadius: 2 }} />
      </div>
    </AbsoluteFill>
  );
}

// ── Main composition ──────────────────────────────────────────────────────────

export const DubaiHistoryVideo: React.FC = () => {
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Background music */}
      <Audio src={staticFile("audio/music-cinematic.wav")} volume={0.3} />

      {/* Slides */}
      {SLIDES.map((slide, i) => (
        <Sequence key={i} from={i * SLIDE_FRAMES} durationInFrames={SLIDE_FRAMES}>
          <Slide {...slide} />
        </Sequence>
      ))}

      <ProgressBar totalFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
