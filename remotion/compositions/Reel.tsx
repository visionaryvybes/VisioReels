import React from "react";
import {
  CinematicReel,
  type CinematicReelProps,
  type ReelScene,
} from "../components/CinematicReel";

// `Reel` is the dynamic, data-driven composition. Everything flows through
// defaultProps → calculateMetadata so duration adapts to the scene count.
// Gemma outputs a JSON scene array; the /api/agent route injects it here.

export const DEFAULT_SCENES: ReelScene[] = [];

export const Reel: React.FC<CinematicReelProps> = (props) => {
  return <CinematicReel {...props} />;
};
