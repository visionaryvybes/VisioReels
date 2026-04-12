import React from "react";
import { Composition } from "remotion";
import { SocialReel } from "./compositions/SocialReel";
import { LogoReveal } from "./compositions/LogoReveal";
import { DubaiHistoryVideo } from "./compositions/DubaiHistoryVideo";
import { AIVideo } from "./compositions/AIVideo";
import { PLATFORMS } from "../lib/platforms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SocialReelComponent = SocialReel as unknown as React.ComponentType<any>;

const defaultProps = {
  script: "AI and coding is awesome — it lets you build anything you imagine.",
  captions: [
    "AI & coding is awesome",
    "Build anything you imagine",
    "In minutes not months",
    "The future belongs to builders",
  ],
  imageSrc: "",
  platform: "tiktok",
  mood: "cinematic",
  hook: "AI & Coding is AWESOME 🔥",
  style: { transition: "cross-dissolve", textStyle: "bold-white", colorGrade: "teal-orange" },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {PLATFORMS.map((platform) => (
        <Composition
          key={platform.id}
          id={`SocialReel-${platform.id}`}
          component={SocialReelComponent}
          durationInFrames={platform.durationInFrames}
          fps={platform.fps}
          width={platform.width}
          height={platform.height}
          defaultProps={{ ...defaultProps, platform: platform.id }}
        />
      ))}

      <Composition
        id="LogoReveal"
        component={LogoReveal}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{}}
      />

      {/* 10-second word-by-word caption video */}
      <Composition
        id="AIVideo"
        component={AIVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{}}
      />
      {/* 30s Dubai history: 5 slides × 200 frames – 4 transitions × 20 frames = 920 frames */}
      <Composition
        id="DubaiHistoryVideo"
        component={DubaiHistoryVideo}
        durationInFrames={920}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{}}
      />
    </>
  );
};
