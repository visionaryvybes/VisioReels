/**
 * Web context module — injects real-world vocabulary, trends, and cultural
 * references into brain/agent prompts.
 *
 * Two layers:
 *  1. Static rich cultural vocabulary (always available, zero latency)
 *  2. Live web: Reddit public JSON search (no API key; requires descriptive User-Agent)
 *     + Brave Search when BRAVE_SEARCH_API_KEY is set.
 *
 * Optional: set REDDIT_USER_AGENT to a string Reddit accepts (see reddit.com/wiki/api).
 */

export interface WebContext {
  query: string;
  snippet: string;
  source?: string;
}

// ── Static cultural vocabulary ─────────────────────────────────────────────

const ROAST_VOCABULARY = `
ROAST FORMULAS (for comedy/roast content):
- "The audacity of this man/woman..."
- "Sir, this is a Wendy's."
- "Nobody: / Him/Her:"
- "POV: You just got clocked."
- "I'm not saying... but I'm saying."
- "The way I screamed."
- "We need to talk about [specific thing]."
- "Certified L."
- "The delusion is astronomical."
- "Main character behavior."
- "Core memory unlocked (not in a good way)."
- "Fashion is dead and [name] killed it."
- "The confidence... I wish I had it."
- Roast structure: SETUP → SPECIFIC OBSERVATION → PUNCHLINE → ESCALATE → CALLBACK → SAVE
`;

const MEME_FORMATS_2025 = `
CURRENT MEME/SOCIAL FORMATS (2025):
- "POV:" format — second person, immediate
- "Nobody:" format — sets up absurdity
- "The [thing] → [other thing]" format
- "Brain rot tier list" energy for chaotic content
- "Delulu" / "slay" / "ate and left no crumbs"
- "Not [person] really [action]..."
- "The way I—" trailing off for comedic effect
- "Main character syndrome" for grandiose behavior
- "Core memory" for nostalgic/emotional beats
- "Understood the assignment" for success
- "Did not understood the assignment" for fails
- "Rent free" — something that lives in your head
- "OK but why is this so accurate"
- "Bestie no." for gentle calling out
- "Sir/Ma'am" prefix for calling someone out
`;

const PLATFORM_COPY_STYLES: Record<string, string> = {
  hype: `HYPE COPY PATTERNS:
- 1-3 ALL CAPS words: "IYKYK", "NO CAP", "DIFFERENT BREED"
- "Fire" openers: "This one's different."
- Energy markers: "🔥", "💀", "‼️" (but don't write emoji in captions)
- Hooks: "Wait for it.", "The ending though.", "You need to see this."`,

  social: `SOCIAL COPY PATTERNS (TikTok/Reels):
- Hook in first 2 words: "POV:", "Wait—", "Okay but"
- Trailing hooks: "comments are SENDING me", "the look he gives"
- CTA: "save this for later", "stitch this", "tell me I'm lying"
- Energy: casual, lowercase, like a text message going viral`,

  corporate: `CORPORATE COPY PATTERNS (LinkedIn/professional):
- Title Case benefit lines
- Problem → Solution → Result structure
- Power words: results, impact, growth, strategic, proven
- Avoid buzzwords: leverage, synergy, disrupt, pivot, ecosystem`,

  storytelling: `STORYTELLING COPY PATTERNS:
- Cinematic fragments: "The light at 6AM.", "Three months later.", "Nobody saw it coming."
- Emotional anchors: what was at stake, what changed
- Vary sentence length — short punches + longer context lines
- Build tension before payoff`,

  tutorial: `TUTORIAL COPY PATTERNS:
- Step numbers: "Step 1:", "Step 2:", "The result:"
- Kickers explain the WHY: "...so you don't waste 3 hours"
- Include a "most people don't know this" moment
- End with transformation: before → after`,
};

const CONTENT_TYPE_VOCABULARY: Record<string, string> = {
  portrait: `PORTRAIT copy: reference the expression, energy, outfit choice, body language. Strong choice: make the subject the hero. For roasts: specific visible details only.`,
  fashion: `FASHION copy: editorial language. "The silhouette.", "That drape.", "This season.". Reference color, texture, movement.`,
  architecture: `ARCHITECTURE copy: scale, materiality, light, shadow. "The geometry of ambition.", "Concrete and glass.", "Light at this angle—"`,
  "interior-design": `INTERIOR copy: warmth, mood, materiality. "The layering.", "That texture.", "A room that breathes."`  ,
  automotive: `AUTOMOTIVE copy: performance, engineering, desire. "Zero to obsession.", "Built different.", "The sound it makes."`,
  food: `FOOD copy: sensory, appetite-driving. "The sizzle.", "Patience rewarded.", "This one hit different."`,
  product: `PRODUCT copy: benefit-led, desire-driving. What does owning this FEEL like? Lead with that.`,
  landscape: `LANDSCAPE copy: atmosphere, wonder, scale. "Out here.", "Worth every step.", "This light."`,
};

// ── Live search (optional) ─────────────────────────────────────────────────

const DEFAULT_REDDIT_UA =
  "VisioReels/1.0 (short-form video creative tool; context for on-device LLM; +https://reddit.com)";

/**
 * Reddit site search via public `.json` endpoint — best-effort, no OAuth.
 * Aggregates a few post titles + selftext snippets into one context block.
 */
async function fetchRedditSearch(search: string): Promise<WebContext | null> {
  const q = search.trim().slice(0, 200);
  if (q.length < 2) return null;
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&limit=6&t=month&raw_json=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.REDDIT_USER_AGENT?.trim() || DEFAULT_REDDIT_UA,
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        children?: Array<{
          data?: {
            title?: string;
            selftext?: string;
            subreddit?: string;
            permalink?: string;
          };
        }>;
      };
    };
    const children = json.data?.children ?? [];
    const bits: string[] = [];
    for (const c of children) {
      const d = c.data;
      if (!d?.title?.trim()) continue;
      const sub = d.subreddit ?? "?";
      const body = (d.selftext ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      const line = body.length > 20 ? `r/${sub}: ${d.title} — ${body}` : `r/${sub}: ${d.title}`;
      bits.push(line);
      if (bits.length >= 4) break;
    }
    if (!bits.length) return null;
    return {
      query: `reddit:${q}`,
      snippet: bits.join("\n").slice(0, 950),
      source: `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
    };
  } catch {
    return null;
  }
}

async function fetchBraveSearch(query: string): Promise<WebContext | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3&text_decorations=false`,
      {
        headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as {
      web?: { results?: Array<{ title?: string; description?: string; url?: string }> }
    };
    const result = data.web?.results?.[0];
    if (!result?.description) return null;
    return {
      query,
      snippet: `${result.title}: ${result.description}`.slice(0, 400),
      source: result.url,
    };
  } catch {
    return null;
  }
}

// Wikipedia summary — only used when a query is explicitly prefixed `wiki:` (optional).
async function fetchWikipediaSummary(topic: string): Promise<WebContext | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const encoded = encodeURIComponent(topic.replace(/ /g, "_"));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { extract?: string; title?: string; content_urls?: { desktop?: { page?: string } } };
    if (!data.extract || data.extract.length < 30) return null;
    return {
      query: topic,
      snippet: data.extract.slice(0, 350),
      source: data.content_urls?.desktop?.page,
    };
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Derive search queries from brief + vision (always tries open web where possible). */
export function buildContextQueries(
  userBrief: string,
  contentTypes: string[],
  copyStyles: string[]
): string[] {
  const queries: string[] = [];
  const brief = userBrief.trim();

  const isRoast =
    /\broast\b|\bclown\b|\bdrag\b|\bexpose\b|\bmake fun of\b|\bclown on\b|\bether\b|\bdiss\b/i.test(
      brief
    );
  const hasPerson = /named?\s+([A-Za-z][A-Za-z'-]*)/i.test(brief);

  const keywordPhrase = brief
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^https?:/i.test(w))
    .slice(0, 8)
    .join(" ")
    .slice(0, 120);

  // ── Reddit (no API key) — real discussion tone, memes, roasts, trends
  if (keywordPhrase.length > 2) {
    queries.push(`reddit:${keywordPhrase}`);
  }
  if (isRoast) {
    queries.push("reddit:roast funny best lines");
    queries.push("reddit:clever insult playful");
  }

  if (hasPerson && !isRoast) {
    const nameMatch = brief.match(/(?:about|on|for|featuring|named?|called)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)/i);
    if (nameMatch) queries.push(`reddit:${nameMatch[1]} interesting`);
  }

  // Brave (requires BRAVE_SEARCH_API_KEY) — trend / caption flavor
  if (process.env.BRAVE_SEARCH_API_KEY) {
    if (isRoast) {
      queries.push("brave:viral comedy roast short video captions");
    } else if (keywordPhrase.length > 4) {
      queries.push(`brave:${keywordPhrase.slice(0, 80)} social video trend`);
    }
  }

  const uniqueTypes = [...new Set(contentTypes.filter(Boolean))];
  for (const ct of uniqueTypes.slice(0, 1)) {
    if (["architecture", "automotive", "fashion", "food"].includes(ct)) {
      if (process.env.BRAVE_SEARCH_API_KEY) {
        queries.push(`brave:${ct} editorial visual trend 2025`);
      } else {
        queries.push(`reddit:${ct} design inspiration aesthetic`);
      }
    }
  }

  if (!queries.length) {
    const fallback = [...uniqueTypes, ...copyStyles.filter(Boolean)].slice(0, 2).join(" ").trim();
    queries.push(
      fallback ? `reddit:${fallback.slice(0, 100)}` : "reddit:viral short video funny"
    );
  }

  const seen = new Set<string>();
  return queries.filter((q) => (seen.has(q) ? false : (seen.add(q), true))).slice(0, 6);
}

/**
 * Fetch web context: Reddit search (free) + Brave (if key set).
 * Query prefixes: "reddit:query", "wiki:Article_Title", "brave:query", or plain (Brave).
 */
export async function fetchWebContext(queries: string[]): Promise<WebContext[]> {
  if (!queries.length) return [];
  const results = await Promise.allSettled(
    queries.map((q) => {
      if (q.startsWith("wiki:")) return fetchWikipediaSummary(q.slice(5));
      if (q.startsWith("reddit:")) return fetchRedditSearch(q.slice(7));
      /** @deprecated use reddit: — kept so old queued jobs still resolve */
      if (q.startsWith("opensearch:")) return fetchRedditSearch(q.slice(11));
      if (q.startsWith("brave:")) return fetchBraveSearch(q.slice(6));
      return fetchBraveSearch(q);
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<WebContext> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);
}

/**
 * Format web context for injection into a Gemma prompt.
 * Also injects static vocabulary blocks relevant to the intent/content.
 */
export function formatWebContext(
  contexts: WebContext[],
  opts?: {
    isRoast?: boolean;
    captionTone?: string;
    contentTypes?: string[];
  }
): string {
  const parts: string[] = [];

  // Static vocabulary always injected
  if (opts?.isRoast) {
    parts.push(ROAST_VOCABULARY);
    parts.push(MEME_FORMATS_2025);
  } else {
    const toneCopy = PLATFORM_COPY_STYLES[opts?.captionTone ?? "social"];
    if (toneCopy) parts.push(toneCopy);
    parts.push(MEME_FORMATS_2025.split("\n").slice(0, 8).join("\n")); // abbreviated for non-roast
  }

  // Content-type vocabulary
  for (const ct of (opts?.contentTypes ?? []).slice(0, 2)) {
    const vocab = CONTENT_TYPE_VOCABULARY[ct];
    if (vocab) parts.push(vocab);
  }

  // Live web (Reddit threads + optional Brave — informal voice; do NOT override user/images)
  if (contexts.length) {
    parts.push(
      `═══ LIVE WEB CONTEXT (Reddit / search — how people actually talk; jokes and angles are inspiration only — obey USER BRIEF + VISION) ═══\n${contexts
        .map((c, i) => `  ${i + 1}. [${c.query}]\n     ${c.snippet}${c.source ? `\n     source: ${c.source}` : ""}`)
        .join("\n\n")}`
    );
  }

  if (!parts.length) return "";
  return `\n═══ CULTURAL VOCABULARY + COPY PATTERNS ═══\n${parts.join("\n\n")}\n`;
}
