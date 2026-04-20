export function stripModelJsonNoise(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();
}

export function extractJsonObjectText(response: string): string | null {
  const fenced = response.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const clean = stripModelJsonNoise(response);
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) return clean.slice(first, last + 1);
  if (first >= 0) return clean.slice(first).trim();
  return null;
}

export function normalizeJsonCandidate(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0019]+/g, " ")
    .trim();
}

export function balancePossiblyTruncatedJson(input: string): string {
  const normalized = normalizeJsonCandidate(input);
  if (!normalized) return normalized;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" && stack[stack.length - 1] === "{") {
      stack.pop();
      continue;
    }
    if (ch === "]" && stack[stack.length - 1] === "[") {
      stack.pop();
    }
  }

  let repaired = normalized.replace(/,\s*$/g, "");
  while (/[,\s]$/.test(repaired)) {
    repaired = repaired.replace(/,\s*$/g, "").trimEnd();
  }

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === "{" ? "}" : "]";
  }

  return repaired;
}

export function parseModelJsonObject(
  raw: string
): { value: Record<string, unknown> | null; extracted: string | null; error?: string } {
  const extracted = extractJsonObjectText(raw);
  if (!extracted) {
    return { value: null, extracted: null, error: "No JSON object found in model output" };
  }

  const candidates = [
    extracted,
    normalizeJsonCandidate(extracted),
    balancePossiblyTruncatedJson(extracted),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { value: parsed as Record<string, unknown>, extracted: candidate };
      }
    } catch (e) {
      if (candidate === candidates[candidates.length - 1]) {
        return {
          value: null,
          extracted,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  return { value: null, extracted, error: "Unknown JSON parse failure" };
}

export function safeModelJsonObject(raw: string): Record<string, unknown> | null {
  return parseModelJsonObject(raw).value;
}
