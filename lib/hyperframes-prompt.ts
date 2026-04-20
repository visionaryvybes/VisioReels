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

export type HyperframesStylePack =
  | "raw"
  | "brutalist"
  | "cinematic"
  | "beat_sync"
  | "glitch"
  | "monochrome"
  | "neon"
  | "minimal"
  | "code"
  | "vector"
  | "warm_grain"
  | "play_mode"
  | "swiss_grid"
  | "kinetic_type"
  | "decision_tree"
  | "product_promo"
  | "nyt_graph"
  | "vignelli"
  | "flash_white"
  | "parallax_pan"
  | "pixel_transition"
  | "chart_motion"
  | "ken_burns"
  | "zoom_pulse"
  | "card_flip"
  | "glitch_text"
  | "liquid_wave"
  | "bubble_pop";

const STYLE_ALIASES: Record<string, HyperframesStylePack> = {
  raw: "raw",
  brutalist: "brutalist",
  cinematic: "cinematic",
  beat_sync: "beat_sync",
  glitch: "glitch",
  monochrome: "monochrome",
  neon: "neon",
  minimal: "minimal",
  code: "code",
  vector: "vector",
  warm_grain: "warm_grain",
  "warm-grain": "warm_grain",
  play_mode: "play_mode",
  "play-mode": "play_mode",
  swiss_grid: "swiss_grid",
  "swiss-grid": "swiss_grid",
  kinetic_type: "kinetic_type",
  "kinetic-type": "kinetic_type",
  decision_tree: "decision_tree",
  "decision-tree": "decision_tree",
  product_promo: "product_promo",
  "product-promo": "product_promo",
  nyt_graph: "nyt_graph",
  "nyt-graph": "nyt_graph",
  vignelli: "vignelli",
  flash_white: "flash_white",
  "flash-white": "flash_white",
  parallax_pan: "parallax_pan",
  "parallax-pan": "parallax_pan",
  pixel_transition: "pixel_transition",
  "pixel-transition": "pixel_transition",
  chart_motion: "chart_motion",
  "chart-motion": "chart_motion",
  ken_burns: "ken_burns",
  "ken-burns": "ken_burns",
  zoom_pulse: "zoom_pulse",
  "zoom-pulse": "zoom_pulse",
  card_flip: "card_flip",
  "card-flip": "card_flip",
  glitch_text: "glitch_text",
  "glitch-text": "glitch_text",
  liquid_wave: "liquid_wave",
  "liquid-wave": "liquid_wave",
  bubble_pop: "bubble_pop",
  "bubble-pop": "bubble_pop",
};

const STYLE_PACK_LINES: Record<HyperframesStylePack, string[]> = {
  raw: [
    "RAW — reduce overlays; let the source image carry the scene; short captions only.",
    "Avoid ornamental boxes, fake UI chrome, and decorative lines unless the frame needs structure.",
  ],
  brutalist: [
    "BRUTALIST — oversized type, hard edges, assertive blocks, high contrast alignment.",
    "Use heavy geometry and rigid composition, but do not bury the subject under a giant panel.",
  ],
  cinematic: [
    "CINEMATIC — editorial pacing, restrained copy, richer color contrast, layered depth and scrims.",
    "Favor premium title cards, controlled fades, soft lens atmosphere, and elegant reveal timing.",
  ],
  beat_sync: [
    "BEAT_SYNC — cuts, pops, and emphasis should land on obvious beat points or phrase changes.",
    "Use alternating holds and punch-ins instead of constant motion everywhere.",
  ],
  glitch: [
    "GLITCH — use sparingly as an accent on transitions or emphasis words; never every scene.",
    "Think signal interference, RGB split, scanline disruption, then snap back to readability.",
  ],
  monochrome: [
    "MONOCHROME — constrain palette, emphasize tone and texture over rainbow accents.",
    "Typography and framing should do the work; contrast must stay very clean.",
  ],
  neon: [
    "NEON — vivid emissive accents on dark bases, but keep type readable and not gamer-cliche.",
    "Use glow on key edges or labels only, not entire paragraphs.",
  ],
  minimal: [
    "MINIMAL — fewer words, fewer layers, more breathing room, confident placement.",
    "Prefer one strong headline plus a short supporting line; remove any non-essential chrome.",
  ],
  code: [
    "CODE — data/HUD/terminal grammar is allowed: grids, diagnostics, labels, counters, monospace notes.",
    "Keep the structure intentional and premium, not fake 'hacker' decoration.",
  ],
  vector: [
    "VECTOR — integrate clean shape systems, diagrams, icons, strokes, and editorial geometry.",
    "Use SVG-style precision instead of blurry panels or generic stock overlays.",
  ],
  warm_grain: [
    "WARM_GRAIN — organic cream-toned grade, textured grain, calm editorial motion, tasteful captions.",
    "Use warm highlights, soft vignettes, and understated premium branding energy.",
  ],
  play_mode: [
    "PLAY_MODE — elastic social energy, bold cards, playful timing, dynamic stats, fast readable impact.",
    "Use springy motion and stacked moments that feel native to short-form product launches.",
  ],
  swiss_grid: [
    "SWISS_GRID — strict grid logic, asymmetric balance, disciplined spacing, sans serif hierarchy.",
    "Use clean alignment, information design clarity, and restrained motion instead of random flourishes.",
  ],
  kinetic_type: [
    "KINETIC_TYPE — typography is the main actor: scale shifts, line reveals, staggered entries, dramatic rhythm.",
    "Headlines can dominate, but must wrap elegantly and never collide with the subject.",
  ],
  decision_tree: [
    "DECISION_TREE — branching logic, labeled nodes, progression arrows, explainer storytelling.",
    "Best for process/tutorial/system videos where movement clarifies choices or steps.",
  ],
  product_promo: [
    "PRODUCT_PROMO — multi-scene product showcase language: hero intro, detail beats, feature callouts, payoff outro.",
    "Use premium reveal choreography and staged focus rather than static slide turns.",
  ],
  nyt_graph: [
    "NYT_GRAPH — editorial data storytelling: print-style charts, labels, annotations, quiet authority.",
    "Use nuanced motion and typographic discipline; avoid startup-dashboard clichés.",
  ],
  vignelli: [
    "VIGNELLI — portrait-first bold typography, modernist hierarchy, red-accent confidence, headline-driven layouts.",
    "Use strong margins and deliberate blocks instead of translucent full-height panels.",
  ],
  flash_white: [
    "FLASH_WHITE — occasional white-flash cut or exposure burst for impact between scenes.",
    "Use as a transition accent only; never let it dominate or hurt readability.",
  ],
  parallax_pan: [
    "PARALLAX_PAN — layered depth with foreground/background drift, subtle spatial separation, premium motion.",
    "Use parallax to guide attention and open breathing room for text placement.",
  ],
  pixel_transition: [
    "PIXEL_TRANSITION — mosaic/pixel breakup can be used for one or two scene changes when it fits the style.",
    "Keep it crisp and brief; transition should feel designed, not like compression artifacts.",
  ],
  chart_motion: [
    "CHART_MOTION — bars, lines, counters, progress arcs, and annotation beats should animate with clarity.",
    "Best when the story benefits from structured information rather than generic cinematic copy.",
  ],
  ken_burns: [
    "KEN_BURNS — premium pan-and-zoom photo storytelling, subtle reframing, documentary elegance.",
    "Use motion to reveal new details or safe text space, not random drifting.",
  ],
  zoom_pulse: [
    "ZOOM_PULSE — use restrained impact zooms on major reveal beats or emphasis words.",
    "Pulse should punctuate the scene, not turn the whole video into constant breathing motion.",
  ],
  card_flip: [
    "CARD_FLIP — reserve for one or two reveals where the scene benefits from a literal perspective turn.",
    "Keep the camera move smooth and premium, not novelty-heavy.",
  ],
  glitch_text: [
    "GLITCH_TEXT — text distortion can accent a key phrase, but legibility must recover instantly.",
    "Use as a punctuation mark, not the base typography system.",
  ],
  liquid_wave: [
    "LIQUID_WAVE — use fluid masks, ink-like distortion, or wave transitions for atmospheric scenes.",
    "Pair with slower pacing or editorial builds; avoid cheap screensaver energy.",
  ],
  bubble_pop: [
    "BUBBLE_POP — playful label entrances, stat chips, or social callouts can pop with soft overshoot.",
    "Keep the composition polished and sparse enough that the pops feel designed.",
  ],
};

export function extractHyperframesStylePacks(input: string): HyperframesStylePack[] {
  const styleLineMatch = input.match(/(?:^|\n)Style:\s*([^\n]+)/i);
  const explicitItems = styleLineMatch
    ? styleLineMatch[1].split(",").map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
    : [];

  const haystack = input.toLowerCase();
  const inferredItems = Object.keys(STYLE_ALIASES).filter((alias) =>
    haystack.includes(alias.replace(/_/g, " "))
      || haystack.includes(alias)
  );

  const seen = new Set<HyperframesStylePack>();
  for (const item of [...explicitItems, ...inferredItems]) {
    const normalized = STYLE_ALIASES[item];
    if (normalized) seen.add(normalized);
  }
  return [...seen];
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
Map transitions to JSON "transition" field: slide-right | slide-left | slide-top | slide-bottom | flip | fade | wipe | flash-cut | chromatic-split.
`;
}

export function buildHyperframesTemplatePackBlock(input: string): string {
  const packs = extractHyperframesStylePacks(input);
  if (!packs.length) return "";

  const lines = packs.flatMap((pack) => STYLE_PACK_LINES[pack] ?? []);
  return `═══ STYLE PACK DIRECTIVE (named templates / remix vocabulary) ═══
Active packs: ${packs.map((p) => p.toUpperCase()).join(" · ")}
${lines.map((line) => `- ${line}`).join("\n")}
- Combine packs coherently. Do not cram every visual idea into every scene.
- Prefer 1 hero pack + 1 support pack + 1 transition accent pack.
- If multiple packs conflict, keep readability and subject visibility first.
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
 * Image reels: remix beats vs strict one-scene-per-photo (roasts, slideshows).
 */
export function buildReelRemixDirective(
  imageCount: number,
  maxScenes: number,
  opts?: { oneScenePerImage?: boolean }
): string {
  const cap = Math.max(2, Math.min(24, maxScenes));
  const strict =
    opts?.oneScenePerImage === true ||
    (imageCount > 1 && cap === imageCount);

  if (strict && imageCount > 0) {
    return `═══ ONE SCENE PER IMAGE (mandatory) ═══
- The user uploaded ${imageCount} images. Output exactly ${imageCount} scenes — no more, no less.
- Scene order matches the image list: scene 1.src = first path, scene 2.src = second path, … in that order.
- Each "src" appears exactly once. Do not repeat paths. Do not skip an image.
- Each caption/roast must reference what is visible in THAT photo only.
`;
  }

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
