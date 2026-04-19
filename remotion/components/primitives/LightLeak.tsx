import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface Props {
  color?: string;
  /** Frame at which the leak peaks */
  peakFrame?: number;
  /** Duration of the full leak flash */
  duration?: number;
  opacity?: number;
  /** Position: "top-left" | "top-right" | "center" | "bottom-left" */
  origin?: "top-left" | "top-right" | "center" | "bottom-left";
}

export const LightLeak: React.FC<Props> = ({
  color = "#FF6B35",
  peakFrame = 15,
  duration = 30,
  opacity = 0.35,
  origin = "top-right",
}) => {
  const frame = useCurrentFrame();
  const alpha = interpolate(
    frame,
    [0, peakFrame, duration],
    [0, opacity, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
  );

  const origins: Record<string, string> = {
    "top-left": "0% 0%",
    "top-right": "100% 0%",
    "center": "50% 50%",
    "bottom-left": "0% 100%",
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(ellipse 80% 60% at ${origins[origin]}, ${color}, transparent 70%)`,
        opacity: alpha,
        mixBlendMode: "screen",
      }}
    />
  );
};
