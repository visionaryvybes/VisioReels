import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export interface Metric {
  label: string;
  value: string;
  unit?: string;
  /** If provided, animates from 0 to this number over revealFrames */
  animateTo?: number;
}

interface Props {
  metrics: Metric[];
  frame?: number;
  color?: string;
  accentColor?: string;
  fontFamily?: string;
  monoFamily?: string;
  /** Stack direction */
  direction?: "row" | "column";
  revealFrames?: number;
  /** Stagger between each metric reveal */
  stagger?: number;
  fontSize?: number;
}

export const DataReadout: React.FC<Props> = ({
  metrics,
  frame: frameProp,
  color = "#E8EEF7",
  accentColor = "#4FC3F7",
  fontFamily = "Space Grotesk, sans-serif",
  monoFamily = "'JetBrains Mono', monospace",
  direction = "row",
  revealFrames = 30,
  stagger = 8,
  fontSize = 14,
}) => {
  const liveFrame = useCurrentFrame();
  const frame = frameProp ?? liveFrame;
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction === "column" ? "column" : "row",
        gap: direction === "column" ? 20 : 40,
        flexWrap: "wrap",
        fontFamily,
      }}
    >
      {metrics.map((m, i) => {
        const startFrame = i * stagger;
        const localFrame = Math.max(0, frame - startFrame);
        const progress = spring({
          frame: localFrame,
          fps,
          config: { damping: 20, stiffness: 160 },
        });
        const opacity = interpolate(localFrame, [0, revealFrames * 0.4], [0, 1], { extrapolateRight: "clamp" });

        const displayValue = m.animateTo !== undefined
          ? String(Math.round(interpolate(frame, [startFrame, startFrame + revealFrames], [0, m.animateTo], { extrapolateRight: "clamp" })))
          : m.value;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              opacity,
              transform: `translateY(${interpolate(progress, [0, 1], [12, 0])}px)`,
            }}
          >
            <div
              style={{
                fontFamily: monoFamily,
                fontSize: Math.round(fontSize * 0.85),
                color,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.55,
                fontWeight: 500,
              }}
            >
              {m.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontFamily: monoFamily,
                  fontSize: fontSize * 2.4,
                  color: accentColor,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {displayValue}
              </span>
              {m.unit && (
                <span
                  style={{
                    fontFamily: monoFamily,
                    fontSize: Math.round(fontSize * 1.1),
                    color,
                    opacity: 0.5,
                    letterSpacing: "0.06em",
                  }}
                >
                  {m.unit}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
