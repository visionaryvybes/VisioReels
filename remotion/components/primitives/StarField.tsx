import React from "react";
import { useCurrentFrame, useVideoConfig, random } from "remotion";

interface Props {
  count?: number;
  /** Parallax scroll speed — px per frame (subtle) */
  speed?: number;
  opacity?: number;
  /** Seed string for deterministic randomness */
  seed?: string;
  /** Secondary star layer for depth (dimmer, smaller) */
  layers?: 1 | 2 | 3;
}

export const StarField: React.FC<Props> = ({
  count = 120,
  speed = 0.08,
  opacity = 0.7,
  seed = "stars",
  layers = 2,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const starLayers = React.useMemo(() => {
    return Array.from({ length: layers }, (_, li) => {
      const layerCount = Math.round(count / (li + 1));
      return Array.from({ length: layerCount }, (_, i) => ({
        id: i,
        x: random(`${seed}-l${li}-x${i}`) * width,
        y: random(`${seed}-l${li}-y${i}`) * height,
        r: random(`${seed}-l${li}-r${i}`) * (li === 0 ? 1.6 : 0.9) + 0.4,
        bright: random(`${seed}-l${li}-b${i}`),
        twinkleOffset: Math.floor(random(`${seed}-l${li}-t${i}`) * 90),
      }));
    });
  }, [count, seed, layers, width, height]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {starLayers.map((layer, li) =>
          layer.map((star) => {
            const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(((frame + star.twinkleOffset) / 55) * Math.PI));
            const yShift = (frame * speed * (li + 1) * 0.5) % height;
            const yPos = (star.y + yShift) % height;
            return (
              <circle
                key={`${li}-${star.id}`}
                cx={star.x}
                cy={yPos}
                r={star.r}
                fill="white"
                opacity={opacity * twinkle * (li === 0 ? 1 : 0.45)}
              />
            );
          })
        )}
      </svg>
    </div>
  );
};
