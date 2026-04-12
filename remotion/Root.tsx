import React from "react";
import { Composition } from "remotion";
import { SocialReel } from "./compositions/SocialReel";
import { PLATFORMS } from "../lib/platforms";

// Cast required for Remotion's Composition generic — double-cast via unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SocialReelComponent = SocialReel as unknown as React.ComponentType<any>;

const defaultProps = {
  script: "Your video script will appear here. Upload an image and generate a script first.",
  captions: ["Your", "video", "captions", "go here"],
  imageSrc: "",
  platform: "tiktok",
  mood: "cinematic",
  hook: "Wait for it...",
  style: {
    transition: "cross-dissolve",
    textStyle: "bold-white",
    colorGrade: "teal-orange",
  },
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
          defaultProps={{
            ...defaultProps,
            platform: platform.id,
          }}
        />
      ))}
    </>
  );
};
