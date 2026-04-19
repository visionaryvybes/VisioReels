import React from "react";
import { CinematicReel } from "../components/CinematicReel";

export const NewVideo: React.FC = () => {
  return (
    <CinematicReel
      brandName="VISIO●REEL"
      scenes={[
        {
          src: "uploads/31d1ed6165.png",
          caption: "SPEED",
          kicker: "velocity unlocked",
          accent: "#ff3d3d",
          transition: "slide-right",
        },
        {
          src: "uploads/7b1932ef9e.png",
          caption: "DUSK",
          kicker: "golden hour chase",
          accent: "#ff8a2a",
          transition: "flip",
        },
        {
          src: "uploads/dff976056a.png",
          caption: "LEGENDS",
          kicker: "parallel paths",
          accent: "#ff2d2d",
          transition: "fade",
        },
        {
          src: "uploads/eaed89d618.png",
          caption: "POWER",
          kicker: "titans collide",
          accent: "#ffd43a",
          transition: "wipe",
        },
        {
          src: "uploads/49edf50552.png",
          caption: "CALM",
          kicker: "in the garden",
          accent: "#54d38f",
          transition: "slide-bottom",
        },
        {
          src: "uploads/9ab4e2c73a.png",
          caption: "ESCAPE",
          kicker: "cliffside dreams",
          accent: "#8ab4ff",
          transition: "slide-left",
        },
      ]}
    />
  );
};
