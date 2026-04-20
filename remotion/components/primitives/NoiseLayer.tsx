import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { noise2D } from "@remotion/noise";

interface Props {
  /** Grain intensity — 0..1 */
  opacity?: number;
  /** How fast the grain animates per frame — lower = slower churn */
  speed?: number;
  /** Grain scale — larger = coarser film grain */
  scale?: number;
  /** CSS mix-blend-mode — "overlay" or "screen" for cinematic grain */
  blendMode?: "overlay" | "screen" | "multiply" | "normal";
  /** Seed string for deterministic noise */
  seed?: string;
}

export const NoiseLayer: React.FC<Props> = ({
  opacity = 0.12,
  speed = 0.4,
  scale = 80,
  blendMode = "overlay",
  seed = "grain",
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cols = Math.ceil(width / scale);
  const rows = Math.ceil(height / scale);
  const t = frame * speed;

  const cells = React.useMemo(() => {
    const arr: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({ x: c, y: r });
      }
    }
    return arr;
  }, [rows, cols]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        mixBlendMode: blendMode,
        opacity,
      }}
    >
      <svg width={width} height={height} style={{ display: "block" }}>
        {cells.map(({ x, y }) => {
          const n = noise2D(`${seed}-${x}-${y}`, x / cols + t * 0.01, y / rows + t * 0.007);
          const bright = Math.round(((n + 1) / 2) * 255);
          return (
            <rect
              key={`${x}-${y}`}
              x={x * scale}
              y={y * scale}
              width={scale + 1}
              height={scale + 1}
              fill={`rgb(${bright},${bright},${bright})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
