/**
 * Shared HyperFrames-style prompt fragments for Visio Reels.
 * Used by /api/agent (Remotion) and /api/slides/generate (carousel copy).
 * @see https://github.com/heygen-com/hyperframes
 */

export type HyperframesMotionFeel =
  | "smooth"
  | "snappy"
  | "bouncy"
  | "dramatic"
  | "dreamy";

export type HyperframesCaptionTone =
  | "hype"
  | "corporate"
  | "tutorial"
  | "storytelling"
  | "social";

export type HyperframesTransitionEnergy = "calm" | "medium" | "high";

export interface HyperframesCreativeProfile {
  motionFeel: HyperframesMotionFeel;
  captionTone: HyperframesCaptionTone;
  transitionEnergy: HyperframesTransitionEnergy;
}

/** Remotion / JSON reel generation — creative vocabulary for Gemma. */
export function buildHyperframesCreativeBlock(
  c: HyperframesCreativeProfile
): string {
  const motionLines: Record<HyperframesMotionFeel, string> = {
    smooth: "Motion feel: SMOOTH — natural deceleration, luxury pacing, no harsh pops.",
    snappy: "Motion feel: SNAPPY — quick decisive settles, short beats, confident.",
    bouncy: "Motion feel: BOUNCY — playful overshoot energy (think scale-pop on key words).",
    dramatic: "Motion feel: DRAMATIC — long glide, strong contrast between stillness and motion.",
    dreamy: "Motion feel: DREAMY — floaty, symmetrical, slow symmetrical reveals.",
  };
  const captionLines: Record<HyperframesCaptionTone, string> = {
    hype: "Caption tone: HYPE — heavy impact, 1–2 uppercase power words, kinetic social energy.",
    corporate: "Caption tone: CORPORATE — clear title-case headlines, trustworthy, minimal slang.",
    tutorial: "Caption tone: TUTORIAL — instructional, step-by-step vibe, monospace-friendly phrasing in kickers.",
    storytelling: "Caption tone: STORYTELLING — evocative, cinematic, emotional hook in the kicker.",
    social: "Caption tone: SOCIAL — scroll-stopping, playful, platform-native (no emoji unless user asked).",
  };
  const transLines: Record<HyperframesTransitionEnergy, string> = {
    calm: "Transition energy: CALM — prefer fade; slide-bottom for gentle reveals; avoid harsh wipes.",
    medium: "Transition energy: MEDIUM — mix slide-left/right and flip; one kinetic beat per scene change.",
    high: "Transition energy: HIGH — prefer wipe, flip, aggressive slide-*; punchy cuts between scenes.",
  };
  return `═══ CREATIVE DIRECTIVE (HyperFrames-style vocabulary) ═══
${motionLines[c.motionFeel]}
${captionLines[c.captionTone]}
${transLines[c.transitionEnergy]}
Map transitions to JSON "transition" field: slide-right | slide-left | slide-top | slide-bottom | flip | fade | wipe.
`;
}

/**
 * Carousel slide copy — same beat / contrast discipline as HyperFrames scene pacing.
 * Injected into slides composer so Gemma treats each slide as a “cut” in a thread.
 */
export function buildHyperframesSlidesStagingBlock(): string {
  return `═══ HYPERFRAMES STAGING (carousel = cut-by-cut storyboard) ═══
- Each slide is ONE beat in a thread — like a transition between scenes: hook → rise → payoff. Titles are punchy “cuts”, not mini-essays.
- Contrast adjacent slides: vary length and rhythm (short punch vs one longer payoff line); avoid repeating the same openers or nouns.
- Ground every beat in the IMAGE MANIFEST — if a line could apply to any stock photo, rewrite it.
- Kinetic diction: strong verbs, concrete nouns, numbers where natural; no filler adjectives (“stunning”, “bold journey”).
- Kickers (01 / 05) stay minimal — they frame the beat, they don’t compete with the title.
`;
}

/**
 * Image reels: more scenes than uploads — reuse paths with different copy/angles (not a 1:1 slideshow).
 */
export function buildReelRemixDirective(imageCount: number, maxScenes: number): string {
  const cap = Math.max(2, Math.min(24, maxScenes));
  const target =
    imageCount <= 0
      ? cap
      : imageCount === 1
        ? Math.min(cap, Math.max(4, Math.round(cap * 0.75)))
        : Math.min(cap, Math.max(imageCount + 1, Math.round(imageCount * 1.6)));
  const floorHint =
    imageCount <= 1
      ? 2
      : Math.min(cap, imageCount + 1);
  return `═══ REMIX / RE-USE (beat variety — same assets, different scenes) ═══
- You have ${imageCount} image path(s). Aim for ${target} to ${cap} scenes (inclusive). Prefer the high end when cap allows — avoid a thin 1:1 slideshow.
- The SAME "src" string may appear in MULTIPLE scenes. Each repeat needs a NEW caption angle (hook / detail / contrast / callback / payoff) and varied transition.
- Order is NOT fixed: shuffle, echo, or bookend the same frame. Forbidden: only scene 1→image1, scene 2→image2… in strict order with no repeats when ${cap} > ${imageCount}.
- Ken Burns in Remotion already zooms/pans — vary copy and story beats when the same image returns.
- Minimum useful length: at least ${floorHint} scenes when you have assets (unless cap is lower).
`;
}
