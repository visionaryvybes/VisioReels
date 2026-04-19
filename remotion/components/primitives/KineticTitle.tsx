import React from "react";
import { useVideoConfig, spring, interpolate } from "remotion";

interface Props {
  text: string;
  frame: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  letterSpacing?: string;
  textTransform?: React.CSSProperties["textTransform"];
  /** Frames between each word's entrance */
  stagger?: number;
  /** How each word enters: "slide-up" | "fade" | "scale" | "slide-right" */
  reveal?: "slide-up" | "fade" | "scale" | "slide-right";
  /** Start frame offset (delay before first word animates) */
  startFrame?: number;
  lineHeight?: number;
  textAlign?: React.CSSProperties["textAlign"];
}

export const KineticTitle: React.FC<Props> = ({
  text,
  frame,
  color = "#ffffff",
  fontFamily = "Space Grotesk, sans-serif",
  fontSize = 96,
  fontWeight = 800,
  letterSpacing = "-0.03em",
  textTransform = "none",
  stagger = 5,
  reveal = "slide-up",
  startFrame = 0,
  lineHeight = 1.0,
  textAlign = "left",
}) => {
  const { fps } = useVideoConfig();
  const words = text.split(" ");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: `0 ${fontSize * 0.28}px`,
        fontFamily,
        fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
        color,
        textTransform,
        textAlign,
        overflow: "hidden",
      }}
    >
      {words.map((word, i) => {
        const wordFrame = Math.max(0, frame - startFrame - i * stagger);
        const progress = spring({
          frame: wordFrame,
          fps,
          config: { damping: 18, stiffness: 180, mass: 1 },
        });

        let wordStyle: React.CSSProperties = {};
        if (reveal === "slide-up") {
          const y = interpolate(progress, [0, 1], [fontSize * 0.7, 0]);
          wordStyle = {
            transform: `translateY(${y}px)`,
            opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            display: "inline-block",
          };
        } else if (reveal === "fade") {
          wordStyle = {
            opacity: progress,
            display: "inline-block",
          };
        } else if (reveal === "scale") {
          const s = interpolate(progress, [0, 1], [0.7, 1]);
          wordStyle = {
            transform: `scale(${s})`,
            opacity: interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
            display: "inline-block",
            transformOrigin: "bottom left",
          };
        } else if (reveal === "slide-right") {
          const x = interpolate(progress, [0, 1], [-fontSize * 0.6, 0]);
          wordStyle = {
            transform: `translateX(${x}px)`,
            opacity: interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
            display: "inline-block",
          };
        }

        return (
          <span key={i} style={{ overflow: "hidden", display: "inline-block" }}>
            <span style={wordStyle}>{word}</span>
          </span>
        );
      })}
    </div>
  );
};
