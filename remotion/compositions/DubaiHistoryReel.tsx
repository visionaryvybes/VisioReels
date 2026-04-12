import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  Easing,
  Sequence,
  Audio,
  staticFile,
  Img,
} from "remotion";

// --- Constants ---
const { fps } = () => {
  // This is a placeholder to satisfy the useVideoConfig requirement if needed,
  // but since we are defining the component, we rely on the context.
  return 30;
};
const slideFrames = 150; // 5 seconds per slide (150 frames at 30fps)
const totalSlides = 6;
const totalDuration = slideFrames * totalSlides;

// --- Helper Component for Animated Text ---
interface AnimatedTextProps {
  text: string;
  delayIndex: number;
  slideStartFrame: number;
}

const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  delayIndex,
  slideStartFrame,
}) => {
  const frame = useCurrentFrame();
  const currentSlideIndex = Math.floor((frame - slideStartFrame) / slideFrames);
  const slideProgress = (frame - slideStartFrame) % slideFrames;

  // Calculate the delay for staggering
  const delay = delayIndex * 10; // 10 frames delay per word
  const wordArray = text.split(" ");

  // Calculate the animation progress for the current word
  const wordIndex = wordArray.findIndex((word, i) => {
    // Simple check to determine which word is currently being animated
    // This is a simplified stagger logic for demonstration
    return Math.floor(slideProgress / 10) === i;
  });

  const word = wordArray[wordIndex] || "";
  const charArray = word.split("");
  const charIndex = Math.min(word.length - 1, Math.floor(slideProgress / 5)); // 5 frames per character

  // Interpolate opacity and translateY for the character
  const opacity = interpolate(
    slideProgress,
    [0, 100],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const translateY = interpolate(
    slideProgress,
    [0, 100],
    [50, 0],
    { extrapolateRight: "clamp" }
  );

  return (
    <span
      style={{
        opacity: opacity,
        transform: `translateY(${translateY}px)`,
        display: "inline-block",
        marginRight: "0.5em",
        transition: "transform 0.5s ease-out, opacity 0.5s ease-out",
      }}
    >
      {charArray.map((char, i) => (
        <span key={i} style={{ opacity: 1, transform: `translateY(0px)` }}>
          {char}
        </span>
      ))}
    </span>
  );
};

// --- Main Component ---
export const DubaiHistoryReel: React.FC = () => {
  const frame = useCurrentFrame();

  // Content structure: [Title, Description, Seed]
  const slidesData = [
    {
      title: "The Vision of Dubai",
      description: "From a small fishing village, a global metropolis was born through ambition and foresight.",
      seed: "dubai_vision",
      color: "rgba(0, 0, 0, 0.6)",
    },
    {
      title: "Pearling & Trade Roots",
      description: "For centuries, Dubai thrived on the Arabian Sea trade and the lucrative pearl trade.",
      seed: "dubai_pearls",
      color: "rgba(0, 0, 0, 0.6)",
    },
    {
      title: "The Oil Boom & Growth",
      description: "The discovery of oil fueled rapid development, transforming the landscape overnight.",
      seed: "dubai_oil",
      color: "rgba(0, 0, 0, 0.6)",
    },
    {
      title: "Modern Infrastructure",
      description: "Iconic structures like the Burj Khalifa symbolize human ingenuity and limitless ambition.",
      seed: "dubai_modern",
      color: "rgba(0, 0, 0, 0.6)",
    },
    {
      title: "A Global Hub",
      description: "Today, Dubai is a nexus of culture, luxury, and international commerce.",
      seed: "dubai_global",
      color: "rgba(0, 0, 0, 0.6)",
    },
    {
      title: "The Future Awaits",
      description: "Dubai continues to redefine what is possible, building tomorrow, today.",
      seed: "dubai_future",
      color: "rgba(0, 0, 0, 0.6)",
    },
  ];

  return (
    <AbsoluteFill>
      {/* Audio Background */}
      <Audio
        src={staticFile("audio/music-cinematic.wav")}
        volume={0.3}
        loop
      />

      {/* Sequence of Slides */}
      <Sequence from={0} durationInFrames={totalDuration}>
        {slidesData.map((slide, index) => (
          <Sequence
            key={index}
            from={index * slideFrames}
            durationInFrames={slideFrames}
          >
            {/* Background Image and Dark Overlay */}
            <div style={{ position: "absolute", width: "100%", height: "100%", zIndex: 0 }}>
              <Img
                src={`https://picsum.photos/seed/${slide.seed}/1080/1920`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {/* Dark Overlay for readability */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundColor: slide.color,
                  zIndex: 1,
                }}
              />
            </div>

            {/* Text Content (Z-index 2 ensures text is above the overlay) */}
            <div style={{ position: "absolute", width: "100%", height: "100%", zIndex: 2, display: "flex", flexDirection: "column", justifyContent: "space-evenly", padding: "10%", color: "white" }}>
              
              {/* Title */}
              <h1
                style={{
                  fontSize: "4rem",
                  fontWeight: "bold",
                  textAlign: "center",
                  textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                  opacity: 1,
                }}
              >
                {/* Staggered Title Animation */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {slide.title.split(" ").map((word, i) => (
                    <span key={i} style={{ marginRight: "15px" }}>
                      <AnimatedText
                        text={word}
                        delayIndex={i}
                        slideStartFrame={index * slideFrames}
                      />
                    </span>
                  ))}
                </div>
              </h1>

              {/* Description */}
              <p
                style={{
                  fontSize: "1.8rem",
                  textAlign: "center",
                  maxWidth: "80%",
                  margin: "0 auto",
                  padding: "20px",
                  textShadow: "1px 1px 3px rgba(0,0,0,0.9)",
                }}
              >
                {/* Staggered Description Animation */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {slide.description.split(" ").map((word, i) => (
                    <span key={i} style={{ marginRight: "10px" }}>
                      <AnimatedText
                        text={word}
                        delayIndex={i}
                        slideStartFrame={index * slideFrames}
                      />
                    </span>
                  ))}
                </div>
              </p>
            </div>
          </Sequence>
        ))}
      </Sequence>
    </AbsoluteFill>
  );
};