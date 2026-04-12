import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Logo mark (triangle) ──────────────────────────────────────────────────
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 160, mass: 0.8 },
  });

  const logoOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // ── Wordmark slides up after logo settles (~12 frames in) ─────────────────
  const wordmarkDelay = 12;
  const wordmarkProgress = spring({
    frame: Math.max(0, frame - wordmarkDelay),
    fps,
    config: { damping: 18, stiffness: 120 },
  });

  const wordmarkY = interpolate(wordmarkProgress, [0, 1], [24, 0]);
  const wordmarkOpacity = interpolate(wordmarkProgress, [0, 1], [0, 1]);

  // ── Tagline fades in last ─────────────────────────────────────────────────
  const tagDelay = 24;
  const tagOpacity = interpolate(frame, [tagDelay, tagDelay + 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // ── Subtle background dot scales up (ambient) ─────────────────────────────
  const bgScale = interpolate(frame, [0, 90], [0.6, 1.15], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Ambient radial glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          transform: `scale(${bgScale})`,
        }}
      />

      {/* Logo mark — violet triangle */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          marginBottom: 32,
        }}
      >
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
          <polygon
            points="48,8 88,80 8,80"
            fill="none"
            stroke="#7c3aed"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <polygon
            points="48,28 72,72 24,72"
            fill="#7c3aed"
            opacity="0.15"
          />
          <circle cx="48" cy="52" r="6" fill="#7c3aed" />
        </svg>
      </div>

      {/* Wordmark */}
      <div
        style={{
          transform: `translateY(${wordmarkY}px)`,
          opacity: wordmarkOpacity,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "-2px",
            color: "#09090b",
            lineHeight: 1,
          }}
        >
          Visio
          <span style={{ color: "#7c3aed" }}>Reels</span>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: tagOpacity,
          marginTop: 16,
          fontSize: 18,
          fontWeight: 400,
          color: "#71717a",
          letterSpacing: "0.5px",
          textAlign: "center",
        }}
      >
        AI-powered video creation
      </div>
    </AbsoluteFill>
  );
};
