import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface Props {
  color?: string;
  size?: number;
  thickness?: number;
  opacity?: number;
  /** Animate corners sliding in from the edges over this many frames */
  revealFrames?: number;
}

export const HUDCorners: React.FC<Props> = ({
  color = "#4FC3F7",
  size = 40,
  thickness = 2,
  opacity = 0.8,
  revealFrames = 18,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, revealFrames], [0, 1], { extrapolateRight: "clamp" });
  const slideIn = interpolate(progress, [0, 1], [size * 0.4, 0]);

  const corner = (pos: "tl" | "tr" | "bl" | "br") => {
    const isTop = pos === "tl" || pos === "tr";
    const isLeft = pos === "tl" || pos === "bl";
    const xOffset = isLeft ? -slideIn : slideIn;
    const yOffset = isTop ? -slideIn : slideIn;
    const borderStyle = {
      borderTop: isTop ? `${thickness}px solid ${color}` : "none",
      borderBottom: !isTop ? `${thickness}px solid ${color}` : "none",
      borderLeft: isLeft ? `${thickness}px solid ${color}` : "none",
      borderRight: !isLeft ? `${thickness}px solid ${color}` : "none",
    };
    return (
      <div
        key={pos}
        style={{
          position: "absolute",
          [isTop ? "top" : "bottom"]: 24,
          [isLeft ? "left" : "right"]: 24,
          width: size,
          height: size,
          opacity: opacity * progress,
          transform: `translate(${xOffset}px, ${yOffset}px)`,
          ...borderStyle,
        }}
      />
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {corner("tl")}
      {corner("tr")}
      {corner("bl")}
      {corner("br")}
    </div>
  );
};
