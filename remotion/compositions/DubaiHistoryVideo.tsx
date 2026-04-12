import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Audio,
  Img,
  staticFile,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide as slidePresentation } from "@remotion/transitions/slide";
import { fade as fadePresentation } from "@remotion/transitions/fade";
import { wipe as wipePresentation } from "@remotion/transitions/wipe";
import { noise2D } from "@remotion/noise";
import { loadFont } from "@remotion/google-fonts/Montserrat";

// ── Font ──────────────────────────────────────────────────────────────────────

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["latin"],
});

// ── Slides ────────────────────────────────────────────────────────────────────
// Real Unsplash Dubai photos (specific IDs, no API key needed)

const SLIDES = [
  {
    img: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1080&h=1920&fit=crop&q=80",
    era: "Pre-1960s",
    title: "A Pearl Diving Village",
    body: "Before skyscrapers, Dubai was a fishing and pearl diving port on the Arabian Gulf — population under 20,000.",
    accent: "#e5b96a",
    transition: "slide",
  },
  {
    img: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1080&h=1920&fit=crop&q=80",
    era: "1960s",
    title: "The Oil Discovery",
    body: "In 1966, oil was struck offshore. Sheikh Rashid used every dirham to build roads, a port, and an airport.",
    accent: "#f97316",
    transition: "wipe",
  },
  {
    img: "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5?w=1080&h=1920&fit=crop&q=80",
    era: "1990s–2000s",
    title: "Building the Impossible",
    body: "Palm Islands, the Burj Al Arab, and the Burj Khalifa — the tallest building on Earth — rose from the sand.",
    accent: "#38bdf8",
    transition: "fade",
  },
  {
    img: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=1080&h=1920&fit=crop&q=80",
    era: "2010s",
    title: "Global Hub",
    body: "Dubai became the world's busiest international airport hub, attracting 17 million residents from 200 nations.",
    accent: "#a78bfa",
    transition: "slide",
  },
  {
    img: "https://images.unsplash.com/photo-1493256338651-d82f7acb2b38?w=1080&h=1920&fit=crop&q=80",
    era: "Today",
    title: "The Future Is Now",
    body: "From a village to a global icon in 60 years. Dubai doesn't wait for tomorrow — it builds it.",
    accent: "#34d399",
    transition: "wipe",
  },
];

const SLIDE_FRAMES = 200; // ~6.7s per slide at 30fps
const TRANSITION_FRAMES = 20; // overlap between slides
// Total: 5×200 - 4×20 = 920 frames ≈ 30.7s

// ── Film grain overlay ────────────────────────────────────────────────────────

function FilmGrain() {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2); // changes every 2 frames for realistic grain
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.035, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={`grain-${seed}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72"
            numOctaves="4"
            seed={seed}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

// ── Ken Burns image with organic noise pan ────────────────────────────────────

function KenBurns({ src, seed }: { src: string; seed: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = frame / durationInFrames;

  // Slow zoom in
  const scale = interpolate(progress, [0, 1], [1.0, 1.09], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Organic drift with noise — subtle, cinematic
  const panX = noise2D(`${seed}px`, progress * 0.4, 0) * 18;
  const panY = noise2D(`${seed}py`, 0, progress * 0.4) * 12;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
          willChange: "transform",
        }}
      />
    </AbsoluteFill>
  );
}

// ── Word spring animation ─────────────────────────────────────────────────────

function Word({ word, i, color }: { word: string; i: number; color: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame: Math.max(0, frame - i * 4),
    fps,
    config: { damping: 22, stiffness: 180, mass: 0.8 },
  });

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: 12,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [32, 0])}px) scale(${interpolate(s, [0, 1], [0.85, 1])})`,
        color,
      }}
    >
      {word}
    </span>
  );
}

// ── Single slide scene ────────────────────────────────────────────────────────

function Scene({
  img,
  era,
  title,
  body,
  accent,
  slideIndex,
}: {
  img: string;
  era: string;
  title: string;
  body: string;
  accent: string;
  slideIndex: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Era badge slides in from left
  const eraBadgeSpring = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 24, stiffness: 200 } });
  const titleWords = title.split(" ");
  const bodyWords = body.split(" ");

  // Subtle vignette pulse using noise
  const vignetteOpacity = interpolate(
    noise2D(`vignette${slideIndex}`, frame / 200, 0),
    [-1, 1],
    [0.55, 0.72],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill>
      {/* Ken Burns image */}
      <KenBurns src={img} seed={`slide${slideIndex}`} />

      {/* Cinematic gradient — bottom heavy for text legibility */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(
            to top,
            rgba(0,0,0,0.95) 0%,
            rgba(0,0,0,0.7) 35%,
            rgba(0,0,0,0.3) 60%,
            rgba(0,0,0,0.15) 100%
          )`,
          opacity: vignetteOpacity,
        }}
      />

      {/* Top vignette */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 25%)",
          pointerEvents: "none",
        }}
      />

      {/* Text content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 64px 100px",
          fontFamily,
        }}
      >
        {/* Era badge */}
        <div
          style={{
            display: "inline-block",
            alignSelf: "flex-start",
            marginBottom: 18,
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 6,
            background: accent,
            color: "#000",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: eraBadgeSpring,
            transform: `translateX(${interpolate(eraBadgeSpring, [0, 1], [-40, 0])}px)`,
          }}
        >
          {era}
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-1.5px",
            color: "#fff",
            marginBottom: 22,
            textShadow: "0 4px 40px rgba(0,0,0,0.9)",
          }}
        >
          {titleWords.map((w, i) => (
            <Word key={i} word={w} i={i + 3} color="#fff" />
          ))}
        </div>

        {/* Accent line */}
        <div
          style={{
            width: interpolate(Math.min(frame, 30), [0, 30], [0, 80], { extrapolateRight: "clamp" }),
            height: 3,
            background: accent,
            borderRadius: 2,
            marginBottom: 20,
          }}
        />

        {/* Body */}
        <div
          style={{
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.82)",
            textShadow: "0 2px 16px rgba(0,0,0,0.95)",
          }}
        >
          {bodyWords.map((w, i) => (
            <Word key={i} word={w} i={i + titleWords.length + 8} color="rgba(255,255,255,0.85)" />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 64,
          right: 64,
          height: 3,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: accent,
            borderRadius: 2,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export const DubaiHistoryVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const currentSlideIndex = Math.min(
    Math.floor(frame / SLIDE_FRAMES),
    SLIDES.length - 1
  );
  const currentAccent = SLIDES[currentSlideIndex]?.accent ?? "#e5b96a";

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily }}>
      {/* Background music */}
      <Audio src={staticFile("audio/music-cinematic.wav")} volume={0.28} />

      {/* Slide transitions */}
      <TransitionSeries>
        {SLIDES.map((s, i) => (
          <React.Fragment key={i}>
            <TransitionSeries.Sequence durationInFrames={SLIDE_FRAMES}>
              <Scene {...s} slideIndex={i} />
            </TransitionSeries.Sequence>
            {i < SLIDES.length - 1 && (
              <TransitionSeries.Transition
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                presentation={(() => {
                  if (s.transition === "wipe") return wipePresentation({ direction: "from-left" }) as any;
                  if (s.transition === "fade") return fadePresentation() as any;
                  return slidePresentation({ direction: "from-right" }) as any;
                })()}
                timing={springTiming({
                  config: { damping: 200, stiffness: 1000 },
                  durationRestThreshold: 0.001,
                })}
              />
            )}
          </React.Fragment>
        ))}
      </TransitionSeries>

      {/* Film grain — cinematic texture */}
      <FilmGrain />

      {/* Progress bar */}
      <ProgressBar accent={currentAccent} />
    </AbsoluteFill>
  );
};
