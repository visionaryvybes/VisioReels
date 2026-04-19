import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

export interface StatusItem {
  label: string;
  status?: "ok" | "warn" | "info" | "active";
  value?: string;
}

interface Props {
  items: StatusItem[];
  color?: string;
  bgColor?: string;
  fontFamily?: string;
  fontSize?: number;
  position?: "top" | "bottom";
  revealFrames?: number;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "#54d38f",
  warn: "#FFD166",
  info: "#4FC3F7",
  active: "#FF6B35",
};

export const StatusBar: React.FC<Props> = ({
  items,
  color = "#E8EEF7",
  bgColor = "rgba(5,7,13,0.85)",
  fontFamily = "'JetBrains Mono', 'Courier New', monospace",
  fontSize = 18,
  position = "bottom",
  revealFrames = 20,
}) => {
  const frame = useCurrentFrame();
  const revealed = interpolate(frame, [0, revealFrames], [0, 1], { extrapolateRight: "clamp" });
  const slideY = interpolate(revealed, [0, 1], [position === "bottom" ? 24 : -24, 0]);

  return (
    <div
      style={{
        position: "absolute",
        [position]: 0,
        left: 0,
        right: 0,
        background: bgColor,
        borderTop: position === "bottom" ? "1px solid rgba(78,195,247,0.25)" : "none",
        borderBottom: position === "top" ? "1px solid rgba(78,195,247,0.25)" : "none",
        display: "flex",
        alignItems: "center",
        gap: 32,
        padding: "10px 32px",
        opacity: revealed,
        transform: `translateY(${slideY}px)`,
        backdropFilter: "blur(4px)",
      }}
    >
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: item.status ? STATUS_COLORS[item.status] ?? color : color,
              opacity: 0.9,
            }}
          />
          <span
            style={{
              fontFamily,
              fontSize,
              color,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              opacity: 0.75,
              fontWeight: 500,
            }}
          >
            {item.label}
          </span>
          {item.value && (
            <span
              style={{
                fontFamily,
                fontSize,
                color: item.status ? STATUS_COLORS[item.status] ?? color : color,
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              {item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
