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
] as const;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function findBannedPhrases(text: string): string[] {
  const haystack = normalizeText(text).toLowerCase();
  return BANNED_PHRASES.filter((phrase) => haystack.includes(phrase));
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
