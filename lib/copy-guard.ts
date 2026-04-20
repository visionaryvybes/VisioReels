const BANNED_PHRASES = [
  "in today's fast-paced world",
  "revolutionary",
  "game-changing",
  "unlock",
  "elevate",
  "here's the thing",
  "let's dive in",
  "buckle up",
  "the future of",
  "curated",
  "vibe check",
  "main character",
  "quiet luxury",
  "old money aesthetic",
  "save this for later",
  "follow for pt 2",
  "follow for more",
  "no cap",
  "it's giving",
  "living my best life",
  "journey",
  "disruptive",
  "synergy",
] as const;

const WEAK_PATTERNS = [
  "comment your thoughts",
  "link in bio",
  "follow for more",
] as const;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function findBannedPhrases(text: string): string[] {
  const haystack = normalizeText(text).toLowerCase();
  return BANNED_PHRASES.filter((phrase) => haystack.includes(phrase));
}

export function findWeakPatterns(text: string): string[] {
  const haystack = normalizeText(text).toLowerCase();
  return WEAK_PATTERNS.filter((phrase) => haystack.includes(phrase));
}

export function isThinText(text: string, minWords: number): boolean {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean).length < minWords;
}

export function sanitizeOneLine(text: string, limit: number): string {
  return normalizeText(text).slice(0, limit);
}

export function sanitizeParagraph(text: string, limit: number): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function isWeakHook(text: string): boolean {
  return sanitizeOneLine(text, 200).length < 12 || isThinText(text, 3);
}

export function isWeakCta(text: string): boolean {
  return sanitizeOneLine(text, 200).length < 8 || isThinText(text, 2);
}
