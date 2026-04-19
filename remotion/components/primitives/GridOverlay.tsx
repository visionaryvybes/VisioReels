import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface Props {
  opacity?: number;
  color?: string;
  /** Cell size in px at native 1080-wide canvas */
  cellSize?: number;
  /** Perspective vanishing-point grid instead of flat grid */
  perspective?: boolean;
  revealFrames?: number;
}

export const GridOverlay: React.FC<Props> = ({
  opacity = 0.08,
  color = "#4FC3F7",
  cellSize = 80,
  perspective = false,
  revealFrames = 30,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const revealed = interpolate(frame, [0, revealFrames], [0, 1], { extrapolateRight: "clamp" });

  if (perspective) {
    // Perspective grid using SVG vanishing-point lines
    const vx = width / 2;
    const vy = height * 0.42;
    const cols = 10;
    const rows = 8;
    const lines: React.ReactNode[] = [];
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * width;
      lines.push(
        <line key={`v${i}`} x1={vx} y1={vy} x2={x} y2={height} stroke={color} strokeWidth={0.7} />
      );
    }
    for (let j = 1; j <= rows; j++) {
      const t = j / rows;
      const y = vy + (height - vy) * t;
      const xLeft = vx - (vx) * t;
      const xRight = vx + (width - vx) * t;
      lines.push(
        <line key={`h${j}`} x1={xLeft} y1={y} x2={xRight} y2={y} stroke={color} strokeWidth={0.5} />
      );
    }
    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: opacity * revealed }}>
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {lines}
        </svg>
      </div>
    );
  }

  // Flat grid
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const vLines = Array.from({ length: cols }, (_, i) => (
    <line key={`v${i}`} x1={i * cellSize} y1={0} x2={i * cellSize} y2={height} stroke={color} strokeWidth={0.5} />
  ));
  const hLines = Array.from({ length: rows }, (_, i) => (
    <line key={`h${i}`} x1={0} y1={i * cellSize} x2={width} y2={i * cellSize} stroke={color} strokeWidth={0.5} />
  ));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: opacity * revealed }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {vLines}
        {hLines}
      </svg>
    </div>
  );
};
