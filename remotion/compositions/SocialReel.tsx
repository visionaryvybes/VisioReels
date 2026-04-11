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

interface StyleConfig {
  transition: string;
  textStyle: string;
  colorGrade: string;
}

interface SocialReelProps {
  script: string;
  captions: string[];
  imageSrc: string;
  platform: string;
  mood: string;
  hook: string;
  style: StyleConfig;
}

// Ken Burns slow zoom background
function Background({ imageSrc }: { imageSrc: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
      }}
    >
      <Img
        src={imageSrc}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
}

// Bottom gradient overlay for text readability
function GradientOverlay() {
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.2) 50%, transparent 70%)",
        pointerEvents: "none",
      }}
    />
  );
}

// Hook text — slams in at frame 0, holds 3 seconds, fades out
function HookText({ hook }: { hook: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const holdUntil = fps * 3; // 3 seconds
  const fadeStart = holdUntil;
  const fadeEnd = holdUntil + fps * 0.5;

  const opacity = interpolate(frame, [0, 6, fadeStart, fadeEnd], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.8 },
    from: 0.7,
    to: 1,
  });

  if (frame > fadeEnd) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#ffffff",
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1.1,
            textShadow: "0 4px 24px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,1)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {hook}
        </p>
      </div>
    </AbsoluteFill>
  );
}

// Word-by-word caption animation with spring physics
function CaptionWord({
  word,
  startFrame,
  index,
}: {
  word: string;
  startFrame: number;
  index: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relativeFrame = frame - startFrame;

  const opacity = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 16, stiffness: 300, mass: 0.5 },
    from: 0,
    to: 1,
  });

  const scale = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 10, stiffness: 400, mass: 0.3 },
    from: 0.6,
    to: 1,
  });

  const translateY = interpolate(
    relativeFrame,
    [0, 8],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  if (relativeFrame < 0) {
    return (
      <span key={index} style={{ opacity: 0, display: "inline-block", margin: "0 4px" }}>
        {word}
      </span>
    );
  }

  return (
    <span
      key={index}
      style={{
        display: "inline-block",
        margin: "0 6px",
        opacity,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        color: "#ffffff",
        textShadow:
          "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 12px rgba(0,0,0,0.8)",
        fontWeight: 800,
        fontSize: 52,
        fontFamily: "Inter, system-ui, sans-serif",
        letterSpacing: "-0.01em",
        lineHeight: 1.2,
      }}
    >
      {word}
    </span>
  );
}

// Full captions layer — renders one caption line at a time
function Captions({
  captions,
  startFrame,
}: {
  captions: string[];
  startFrame: number;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const captionDuration = Math.floor(
    (durationInFrames - startFrame) / Math.max(captions.length, 1)
  );

  const currentCaptionIndex = Math.min(
    Math.floor((frame - startFrame) / captionDuration),
    captions.length - 1
  );

  if (frame < startFrame || currentCaptionIndex < 0) return null;

  const currentCaption = captions[currentCaptionIndex];
  if (!currentCaption) return null;

  const words = currentCaption.split(" ").filter(Boolean);
  const captionStartFrame = startFrame + currentCaptionIndex * captionDuration;
  const wordDelay = Math.floor(fps / 10); // ~3 frames per word at 30fps

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 140,
        paddingLeft: 40,
        paddingRight: 40,
      }}
    >
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 4,
          maxWidth: "90%",
        }}
      >
        {words.map((word, i) => (
          <CaptionWord
            key={`${currentCaptionIndex}-${i}`}
            word={word}
            startFrame={captionStartFrame + i * wordDelay}
            index={i}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}

// Platform watermark — top right, subtle
function PlatformWatermark({ platform }: { platform: string }) {
  const NAMES: Record<string, string> = {
    tiktok: "TikTok",
    reels: "Instagram Reels",
    shorts: "YouTube Shorts",
    pinterest: "Pinterest",
    x: "X",
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "flex-start",
        padding: 32,
      }}
    >
      <div
        style={{
          marginLeft: "auto",
          backgroundColor: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
          borderRadius: 8,
          padding: "6px 14px",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 22,
            fontWeight: 500,
            fontFamily: "Inter, system-ui, sans-serif",
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          {NAMES[platform] ?? platform}
        </p>
      </div>
    </AbsoluteFill>
  );
}

export const SocialReel: React.FC<SocialReelProps> = ({
  script,
  captions,
  imageSrc,
  platform,
  hook,
  style,
}) => {
  const { fps } = useVideoConfig();

  // Hook shows for first 3 seconds, then captions take over
  const hookDuration = fps * 3;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background with Ken Burns */}
      <Background imageSrc={imageSrc} />

      {/* Gradient overlay */}
      <GradientOverlay />

      {/* Hook — first 3 seconds */}
      <Sequence from={0} durationInFrames={hookDuration + fps}>
        <HookText hook={hook} />
      </Sequence>

      {/* Captions — after hook */}
      <Captions captions={captions.length > 0 ? captions : [script]} startFrame={hookDuration} />

      {/* Platform watermark */}
      <PlatformWatermark platform={platform} />
    </AbsoluteFill>
  );
};
