import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface Props {
  opacity?: number;
  lineSpacing?: number;
  color?: string;
  /** Animate scanlines scrolling down */
  animate?: boolean;
  speed?: number;
}

export const ScanLines: React.FC<Props> = ({
  opacity = 0.06,
  lineSpacing = 4,
  color = "#000000",
  animate = false,
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const offset = animate ? (frame * speed) % (lineSpacing * 2) : 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        backgroundImage: `repeating-linear-gradient(
          180deg,
          ${color} 0px,
          ${color} 1px,
          transparent 1px,
          transparent ${lineSpacing}px
        )`,
        backgroundPositionY: `${offset}px`,
        mixBlendMode: "multiply",
      }}
    />
  );
};
