/**
 * Cultural intelligence — platform vocabulary, meme patterns, business language.
 * Built-in database that replaces DuckDuckGo Instant Answer fetches (which return
 * empty results). The Gemma brain receives this as context before writing any copy.
 *
 * Updated: 2026
 */

export type Platform =
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "x"
  | "pinterest"
  | "general";

export type Industry =
  | "tech"
  | "fashion"
  | "real-estate"
  | "fitness"
  | "food"
  | "automotive"
  | "finance"
  | "creative"
  | "architecture"
  | "travel"
  | "general";

export type ContentTone =
  | "hype"
  | "corporate"
  | "tutorial"
  | "storytelling"
  | "social";

// ─── Platform vocabulary ──────────────────────────────────────────────────────

export const PLATFORM_VOCAB: Record<
  Platform,
  {
    hooks: string[];
    ctas: string[];
    filler_words_to_avoid: string[];
    native_phrases: string[];
    format_rules: string;
  }
> = {
  tiktok: {
    hooks: [
      "POV:",
      "wait for it →",
      "nobody talks about",
      "this is your sign to",
      "the part where",
      "not me",
      "telling my kids this was",
      "ratio if",
      "live footage of me",
      "me when",
      "it's giving",
      "the way",
    ],
    ctas: [
      "save this",
      "follow for pt 2",
      "duet this",
      "stitch this",
      "drop a 🔥",
      "tag someone who needs this",
    ],
    filler_words_to_avoid: [
      "amazing",
      "stunning",
      "incredible",
      "revolutionary",
      "game-changing",
      "journey",
      "elevate",
    ],
    native_phrases: [
      "no cap",
      "lowkey",
      "fr fr",
      "it's giving",
      "understood the assignment",
      "main character",
      "era",
      "rent free",
      "based",
      "w take",
    ],
    format_rules:
      "Hook in 3 words max. Text on screen for first 2s. Pattern interrupt before second beat.",
  },
  instagram: {
    hooks: [
      "save this →",
      "did you know",
      "this is why",
      "unpopular opinion:",
      "the truth about",
      "stop scrolling",
      "here's what nobody tells you",
      "if this doesn't resonate",
      "swipe to see",
      "the before and after",
    ],
    ctas: [
      "save for later",
      "share with a friend",
      "double tap if",
      "follow for more",
      "comment your thoughts",
      "link in bio",
    ],
    filler_words_to_avoid: [
      "hustle",
      "grind",
      "vibe",
      "aesthetic journey",
      "curated life",
      "living my best life",
    ],
    native_phrases: [
      "hot girl summer",
      "that girl",
      "soft life",
      "quiet luxury",
      "old money aesthetic",
      "coastal grandmother",
      "mob wife",
      "clean girl",
      "dark academia",
    ],
    format_rules:
      "Slide 1 is the hook — must stop the thumb. Last slide = clear CTA. Every slide is a cut.",
  },
  linkedin: {
    hooks: [
      "I made a mistake.",
      "Controversial take:",
      "3 years ago, I",
      "Most people don't know this.",
      "I'm going to be honest.",
      "We need to talk about",
      "I fired my best client.",
      "Hot take:",
    ],
    ctas: [
      "What would you add?",
      "Thoughts?",
      "Have you seen this too?",
      "Share if this resonates.",
      "What's your experience been?",
    ],
    filler_words_to_avoid: [
      "excited to announce",
      "thrilled",
      "honored",
      "humbled",
      "synergy",
      "disruptive",
      "thought leader",
      "circle back",
    ],
    native_phrases: [
      "building in public",
      "lessons learned",
      "what I wish I knew",
      "real talk",
      "here's the thing",
      "unpacked",
      "open to connection",
      "DM me",
    ],
    format_rules:
      "First line must hook without needing to click 'see more'. Line breaks every 1-2 sentences. End with a question.",
  },
  x: {
    hooks: [
      "hot take:",
      "unpopular opinion:",
      "thread 🧵",
      "counterpoint:",
      "real talk:",
      "genuinely curious:",
      "this is underrated:",
      "nobody is saying",
    ],
    ctas: [
      "quote with your take",
      "bookmark this",
      "reply with yours",
      "RT if you agree",
    ],
    filler_words_to_avoid: [
      "game-changer",
      "revolutionary",
      "legendary",
      "absolutely",
      "literally amazing",
    ],
    native_phrases: [
      "ratio",
      "this is the way",
      "certified W",
      "L take",
      "cope",
      "based",
      "skill issue",
      "touch grass",
      "extremely online",
    ],
    format_rules:
      "Under 280 chars hits hardest. No hashtags in body copy. Dry wit outperforms enthusiasm.",
  },
  pinterest: {
    hooks: [
      "how to",
      "the best",
      "easy",
      "beautiful",
      "perfect for",
      "ideas for",
      "inspiration for",
    ],
    ctas: [
      "save to your board",
      "pin for later",
      "get the look",
      "more ideas →",
    ],
    filler_words_to_avoid: ["inspo", "vibe check", "aesthetic goals"],
    native_phrases: [
      "cottagecore",
      "maximalist",
      "dopamine dressing",
      "aesthetic",
      "mood board",
      "capsule wardrobe",
      "quiet luxury",
    ],
    format_rules:
      "Keywords first. Searchable language. Text on image must be legible. Vertical format only.",
  },
  general: {
    hooks: [
      "here's the truth:",
      "what nobody tells you:",
      "the real story:",
    ],
    ctas: ["save this", "share this", "follow for more"],
    filler_words_to_avoid: ["amazing", "incredible", "revolutionary"],
    native_phrases: [],
    format_rules: "Match the platform your audience lives on.",
  },
};

// ─── Industry vocabulary ──────────────────────────────────────────────────────

export const INDUSTRY_VOCAB: Record<
  Industry,
  {
    power_words: string[];
    concepts: string[];
    anti_generic: string[];
  }
> = {
  tech: {
    power_words: [
      "ship it",
      "10x",
      "async",
      "iterate",
      "deploy",
      "refactor",
      "latency",
      "throughput",
      "edge",
      "zero to one",
    ],
    concepts: [
      "move fast",
      "build in public",
      "fail fast",
      "product-market fit",
      "growth loops",
      "moats",
      "compounding returns",
      "technical debt",
    ],
    anti_generic: [
      "Write specific version numbers, stack names, metrics (ms, %, 10x). Never say 'cutting-edge technology'.",
    ],
  },
  fashion: {
    power_words: [
      "edit",
      "archive",
      "drape",
      "silhouette",
      "proportion",
      "considered",
      "effortless",
      "understated",
      "directional",
    ],
    concepts: [
      "quiet luxury",
      "old money",
      "coastal",
      "mob wife",
      "clean girl",
      "dark academia",
      "gorpcore",
      "Y2K revival",
    ],
    anti_generic: [
      "Reference specific fabrics, cuts, proportions. Never say 'timeless style' or 'fashion-forward'.",
    ],
  },
  "real-estate": {
    power_words: [
      "off-market",
      "trophy asset",
      "cash flow",
      "cap rate",
      "appreciation",
      "yield",
      "equity",
      "pocket listing",
    ],
    concepts: [
      "passive income",
      "house hacking",
      "BRRRR method",
      "short-term rentals",
      "appreciation markets",
      "cash-flow markets",
    ],
    anti_generic: [
      "Use specific numbers: sqft, $/sqft, cap rate %, location. Never say 'luxurious living' or 'dream home'.",
    ],
  },
  fitness: {
    power_words: [
      "progressive overload",
      "compound lifts",
      "hypertrophy",
      "periodization",
      "zone 2",
      "VO2 max",
      "RPE",
      "PR",
    ],
    concepts: [
      "training age",
      "muscle confusion myth",
      "consistency over intensity",
      "sleep is training",
      "deload week",
    ],
    anti_generic: [
      "Specific exercises, rep ranges, percentages. Never say 'transform your body' or 'unleash your potential'.",
    ],
  },
  food: {
    power_words: [
      "umami",
      "maillard",
      "emulsify",
      "deglaze",
      "season at every layer",
      "mise en place",
      "acid balance",
      "render",
    ],
    concepts: [
      "one-pan dinners",
      "meal prep",
      "restaurant-quality at home",
      "technique over recipe",
      "fridge foraging",
    ],
    anti_generic: [
      "Specific ingredients, techniques, timing. Never say 'delicious recipe' or 'mouth-watering'.",
    ],
  },
  automotive: {
    power_words: [
      "torque",
      "hp",
      "0-60",
      "track-ready",
      "forced induction",
      "aero",
      "camber",
      "stance",
      "build",
      "spec",
    ],
    concepts: [
      "daily driver",
      "weekend warrior",
      "track day",
      "project car",
      "barn find",
      "numbers matching",
      "resto-mod",
    ],
    anti_generic: [
      "Specific make/model/year, performance specs, modification details. Never say 'pure driving experience'.",
    ],
  },
  finance: {
    power_words: [
      "alpha",
      "compound",
      "DCA",
      "dollar-cost average",
      "portfolio",
      "rebalance",
      "hedge",
      "beta",
      "yield curve",
    ],
    concepts: [
      "index funds",
      "tax-loss harvesting",
      "Roth conversion",
      "emergency fund first",
      "sequence of returns risk",
    ],
    anti_generic: [
      "Specific percentages, timeframes, fund names. Never say 'secure your financial future' or 'wealth building'.",
    ],
  },
  creative: {
    power_words: [
      "iteration",
      "brief",
      "reference",
      "mood board",
      "creative direction",
      "concept",
      "execution",
      "craft",
    ],
    concepts: [
      "show don't tell",
      "negative space",
      "tension and release",
      "audience as collaborator",
      "earned emotion",
    ],
    anti_generic: [
      "Specific medium, tools, process details. Never say 'creative journey' or 'artistic vision'.",
    ],
  },
  architecture: {
    power_words: [
      "fenestration",
      "massing",
      "program",
      "circulation",
      "threshold",
      "datum",
      "materiality",
      "detail",
    ],
    concepts: [
      "biophilic design",
      "adaptive reuse",
      "passive house",
      "form follows function",
      "genius loci",
      "section cut",
    ],
    anti_generic: [
      "Reference specific buildings, architects, materials, proportions. Never say 'stunning design' or 'modern masterpiece'.",
    ],
  },
  travel: {
    power_words: [
      "off-season",
      "shoulder season",
      "slow travel",
      "digital nomad",
      "base camp",
      "hidden gem",
      "local",
    ],
    concepts: [
      "city as locals live it",
      "one bag travel",
      "points and miles",
      "workation",
      "bleisure",
      "micro-adventure",
    ],
    anti_generic: [
      "Specific city neighborhood, hotel name, dish name. Never say 'breathtaking views' or 'unforgettable experience'.",
    ],
  },
  general: {
    power_words: ["specific", "concrete", "real", "honest", "direct"],
    concepts: ["show the work", "be specific not generic", "earned credibility"],
    anti_generic: ["Always name the specific thing. Never describe — show."],
  },
};

// ─── Meme / format patterns for 2025-2026 ─────────────────────────────────────

export const CURRENT_MEME_FORMATS = [
  "POV: [relatable situation in 5 words]",
  "[Thing] that [other thing]. I'll start: [example]",
  "tell me [X] without telling me [X]",
  "the way [thing] [reaction]",
  "it's giving [energy/aesthetic]",
  "understood the assignment ✓ / did not understand the assignment ✗",
  "[number] types of [thing]. which one are you?",
  "before and after [with no context]",
  "the [job/aesthetic/type] starter pack",
  "things [group] would understand",
  "signs you're a [identity] [content type]",
  "if [platform/thing] was honest",
];

// ─── Anti-generic phrase bank ─────────────────────────────────────────────────

export const BANNED_AI_PHRASES = [
  "in today's fast-paced world",
  "game-changing",
  "revolutionary",
  "groundbreaking",
  "unlock your potential",
  "elevate your",
  "transform your",
  "curated",
  "journey",
  "hustle",
  "grind",
  "stunning",
  "breathtaking",
  "amazing",
  "incredible",
  "inspiring",
  "world-class",
  "best-in-class",
  "state-of-the-art",
  "leverage",
  "synergy",
  "paradigm shift",
  "let's dive in",
  "buckle up",
  "stay tuned",
  "here are X ways to",
  "you won't believe",
  "this changed everything",
  "I wish I knew this sooner",
  "the secret that [experts/gurus] don't want you to know",
  "living my best life",
  "manifest",
  "alignment",
  "bold",
  "vibrant",
  "seamless",
  "innovative",
];

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Detect likely industry from user brief + image content types.
 */
export function detectIndustry(
  brief: string,
  contentTypes: string[]
): Industry {
  const text = [brief, ...contentTypes].join(" ").toLowerCase();
  if (/tech|software|code|startup|saas|app|product|dev|engineer/i.test(text))
    return "tech";
  if (/fashion|style|outfit|clothing|wear|designer|brand|dress|luxury/i.test(text))
    return "fashion";
  if (/real.?estate|property|house|home|apartment|listing|invest/i.test(text))
    return "real-estate";
  if (/gym|fitness|workout|training|lift|run|health|body/i.test(text))
    return "fitness";
  if (/food|cook|recipe|restaurant|meal|dish|eat|chef/i.test(text))
    return "food";
  if (/car|auto|vehicle|drive|motor|racing|mechanic/i.test(text))
    return "automotive";
  if (/finance|invest|money|stock|crypto|budget|wealth/i.test(text))
    return "finance";
  if (/design|creative|art|brand|agency|studio|film|photo/i.test(text))
    return "creative";
  if (/architect|building|structure|interior|space|room|decor/i.test(text))
    return "architecture";
  if (/travel|trip|explore|adventure|destination|flight|hotel/i.test(text))
    return "travel";
  return "general";
}

/**
 * Build a cultural context block to inject into Gemma's prompt.
 * This replaces the weak DuckDuckGo fetches with high-quality built-in intelligence.
 */
export function buildCulturalContext(opts: {
  brief: string;
  platform: Platform;
  captionTone: ContentTone;
  contentTypes: string[];
  copyStyles: string[];
}): string {
  const { brief, platform, captionTone, contentTypes, copyStyles } = opts;
  const industry = detectIndustry(brief, contentTypes);
  const pVocab = PLATFORM_VOCAB[platform] ?? PLATFORM_VOCAB.general;
  const iVocab = INDUSTRY_VOCAB[industry] ?? INDUSTRY_VOCAB.general;

  // Suppress unused-variable warning — copyStyles available for future expansion
  void copyStyles;

  return `═══ CULTURAL INTELLIGENCE (use this to write NON-GENERIC copy) ═══
Platform: ${platform.toUpperCase()} — ${pVocab.format_rules}

NATIVE HOOKS for ${platform} (pick one, adapt it):
${pVocab.hooks
    .slice(0, 5)
    .map((h) => `  • "${h}"`)
    .join("\n")}

NATIVE CTAs (don't invent generic ones):
${pVocab.ctas
    .slice(0, 4)
    .map((c) => `  • "${c}"`)
    .join("\n")}

INDUSTRY: ${industry.toUpperCase()} — power vocabulary to use:
  Words: ${iVocab.power_words.slice(0, 8).join(", ")}
  Concepts: ${iVocab.concepts.slice(0, 4).join(", ")}
  ${iVocab.anti_generic[0]}

TONE-SPECIFIC NATIVE PHRASES (${captionTone}):
${
    (pVocab.native_phrases ?? []).length
      ? (pVocab.native_phrases ?? [])
          .slice(0, 5)
          .map((p) => `  • "${p}"`)
          .join("\n")
      : "  (use direct, specific language)"
  }

MEME/FORMAT INSPIRATION (adapt if fits the brief):
${CURRENT_MEME_FORMATS.slice(0, 3)
    .map((f) => `  • ${f}`)
    .join("\n")}

BANNED (these words scream generic AI — delete on sight):
${BANNED_AI_PHRASES.slice(0, 12).join(", ")}`;
}
