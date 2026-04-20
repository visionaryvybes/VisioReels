export type CaptionTone = "hype" | "corporate" | "tutorial" | "storytelling" | "social";
export type MotionFeel = "smooth" | "snappy" | "bouncy" | "dramatic" | "dreamy";

export interface VoiceDirection {
  instruct: string;           // instruction to TTS model on HOW to deliver
  seed: number;               // reproducible seed derived from content hash
  crossfade_ms: number;       // crossfade between chunks
  effects_chain?: EffectConfig[]; // optional post-processing
}

export interface EffectConfig {
  type: string;
  params?: Record<string, number>;
}

/**
 * Maps creative settings → Voicebox generation parameters.
 * The instruct string is the most powerful control — it shapes delivery.
 */
export function buildVoiceDirection(opts: {
  captionTone: CaptionTone;
  motionFeel: MotionFeel;
  contentSeed?: string; // hash source for reproducibility (e.g. componentName)
  /** Comedy roast: drier, more side-eye delivery — not corporate narrator */
  roastDelivery?: boolean;
  sceneRole?: "hook" | "build" | "payoff" | "cta";
}): VoiceDirection {
  const { captionTone, motionFeel, contentSeed, roastDelivery, sceneRole = "build" } = opts;

  // Derive a stable numeric seed from the content identifier
  // Same content → same seed → same voice performance every render
  const seed = contentSeed
    ? Math.abs(contentSeed.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7919)) % 100000
    : 42;

  // Map captionTone to primary voice delivery instruction
  const toneInstructs: Record<CaptionTone, string> = {
    hype: "Speak with high energy and urgency. Short punchy sentences, crisp consonants. Each word lands with impact. Fast pace, upward inflection on key words. Think hype man, not announcer.",
    corporate: "Speak clearly and confidently at a measured pace. Professional authority without stiffness. Each sentence is deliberate. Crisp, warm, trustworthy. No filler, no rush.",
    tutorial: "Speak like a knowledgeable friend explaining something step by step. Slightly slower than natural speech. Clear enunciation. Pause briefly between steps. Friendly and approachable.",
    storytelling: "Speak cinematically. Slower pace with deliberate pauses for effect. Vary your pace — slow on emotional beats, quicker on narrative momentum. Rich, warm tone. Breathe the story.",
    social: "Conversational, authentic. Sounds like talking to a friend on camera — natural rhythm, occasional emphasis on surprising words. Not scripted. Relaxed but engaged.",
  };

  // Motion feel adds a secondary layer of energy/pacing
  const motionModifiers: Record<MotionFeel, string> = {
    smooth: " Keep transitions between sentences smooth and flowing.",
    snappy: " Keep it tight — no trailing off at sentence ends.",
    bouncy: " Light, playful energy throughout.",
    dramatic: " Long pauses before key reveals. Let silence work.",
    dreamy: " Slightly soft and ethereal. Like narrating a dream.",
  };

  const sceneRoleModifiers = {
    hook: " Start strong. Land the first phrase immediately and make the opening feel deliberate.",
    build: " Build momentum sentence by sentence without sounding rushed.",
    payoff: " Slow slightly on the reveal and let the final phrase breathe.",
    cta: " Keep the closing clean and direct. No salesy lift at the end.",
  } as const;

  let instruct = (toneInstructs[captionTone] + motionModifiers[motionFeel] + sceneRoleModifiers[sceneRole]).slice(0, 500);
  if (roastDelivery) {
    instruct =
      ("Dry comedy roast. Side-eye energy, slightly deadpan; never corporate or motivational. " +
        instruct).slice(0, 500);
  }

  // Crossfade: cinematic tones get longer crossfade, hype gets snappier cuts
  const crossfade_ms = captionTone === "storytelling" || motionFeel === "dreamy" ? 80
    : captionTone === "hype" || motionFeel === "snappy" ? 20
    : 50;

  // Effects: storytelling gets light reverb for depth; hype gets none (dry = punchy)
  let effects_chain: EffectConfig[] | undefined;
  if (captionTone === "storytelling" || motionFeel === "dramatic" || motionFeel === "dreamy") {
    effects_chain = [{
      type: "reverb",
      params: { room_size: 0.25, damping: 0.7, wet_level: 0.12, dry_level: 0.88, width: 0.8 },
    }];
  }

  return { instruct, seed, crossfade_ms, effects_chain };
}

/**
 * Build the narration TEXT itself to match the tone.
 * Transforms raw caption + kicker into a natural spoken sentence.
 */
export function buildNarrationText(opts: {
  caption: string;
  kicker?: string;
  narration?: string; // Gemma's dedicated narration field if present
  captionTone: CaptionTone;
  sceneIndex: number;
  totalScenes: number;
}): string {
  const { caption, kicker, narration, captionTone } = opts;
  const antiJargon = (text: string) =>
    text
      .replace(/\bPOV:\s*/gi, "")
      .replace(/\bit'?s giving\b/gi, "it feels")
      .replace(/\bno cap\b/gi, "honestly")
      .replace(/\bsave (this|it)( for later)?\b/gi, "")
      .replace(/\bfollow for (more|part ?2|pt ?2)\b/gi, "")
      .replace(/\bmain character\b/gi, "centerpiece")
      .replace(/\bquiet luxury\b/gi, "restrained luxury")
      .replace(/\s{2,}/g, " ")
      .trim();

  // If Gemma wrote a dedicated narration, use it (already natural speech)
  if (narration && narration.trim().length > 10) return antiJargon(narration.trim());

  // Otherwise, synthesize from caption + kicker
  const parts: string[] = [];

  // Kicker as intro context (strip numbering like "01 / 05", "PHASE 01 · LAUNCH")
  if (kicker) {
    const cleanKicker = antiJargon(kicker)
      .replace(/^\d+\s*[\/·]\s*\d+\s*/g, "")  // strip "01 / 05"
      .replace(/PHASE\s+\d+\s*[·:]\s*/gi, "")  // strip "PHASE 01 ·"
      .replace(/T\+[\w:]+\s*[·:]\s*/gi, "")    // strip "T+MISSION ·"
      .trim();
    if (cleanKicker.length > 3) parts.push(cleanKicker);
  }

  // Caption: clean up ALL-CAPS for natural speech
  const cleanCaption = antiJargon(caption)
    .replace(/\./g, ". ")           // ensure space after periods
    .replace(/\s+/g, " ")
    .trim();

  parts.push(cleanCaption);

  const stitched = parts.join(". ").replace(/\.\s*\./g, ".").trim();

  // For hype tone: stay punchy, but avoid 1-3 word fragments that sound broken in TTS.
  if (captionTone === "hype") {
    if (parts.length > 1 && cleanCaption.split(/\s+/).filter(Boolean).length < 6) {
      return stitched;
    }
    return cleanCaption;
  }

  // For social: add casual connector if kicker + caption are separate
  if (captionTone === "social" && parts.length > 1) {
    return parts.join(" — ");
  }

  return stitched;
}
