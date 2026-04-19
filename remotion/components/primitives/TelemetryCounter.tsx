import React from "react";
import { useVideoConfig, interpolate } from "remotion";

interface Props {
  /** Starting value */
  from?: number;
  /** Ending value */
  to: number;
  frame: number;
  /** Frame over which the counter animates */
  duration?: number;
  /** Decimal places to show */
  decimals?: number;
  label?: string;
  unit?: string;
  color?: string;
  labelColor?: string;
  fontFamily?: string;
  fontSize?: number;
  /** Show a colon separator for time formatting (HH:MM:SS) */
  timeFormat?: boolean;
}

function formatNumber(n: number, decimals: number, timeFormat: boolean): string {
  if (timeFormat) {
    const totalSec = Math.round(n);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }
  if (decimals === 0) return Math.round(n).toLocaleString("en-US");
  return n.toFixed(decimals);
}

export const TelemetryCounter: React.FC<Props> = ({
  from = 0,
  to,
  frame,
  duration = 60,
  decimals = 0,
  label,
  unit,
  color = "#4FC3F7",
  labelColor,
  fontFamily = "'JetBrains Mono', 'Courier New', monospace",
  fontSize = 64,
  timeFormat = false,
}) => {
  const { fps } = useVideoConfig();
  void fps;

  const value = interpolate(frame, [0, duration], [from, to], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const display = formatNumber(value, decimals, timeFormat);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
      {label && (
        <div
          style={{
            fontFamily,
            fontSize: Math.round(fontSize * 0.28),
            color: labelColor ?? color,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            opacity: 0.7,
            marginBottom: 4,
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontFamily,
            fontSize,
            color,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {display}
        </span>
        {unit && (
          <span
            style={{
              fontFamily,
              fontSize: Math.round(fontSize * 0.35),
              color: labelColor ?? color,
              opacity: 0.6,
              letterSpacing: "0.08em",
              textTransform: "lowercase",
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
