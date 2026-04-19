// Automatic preset selector. Scores every preset against the vision notes +
// colour statistics, picks the best match, and returns the id plus reason.

import type { SlidePreset } from "./slide-presets";
import { SLIDE_PRESETS } from "./slide-presets";

export interface AutoInput {
  dominants: string[];
  brightnesses: number[];
  subjects: string[];
  moods: string[];
  objects: string[];
}

export interface AutoResult {
  preset: SlidePreset;
  reason: string;
  score: number;
  runners: { id: string; score: number }[];
}

const MOOD_RULES: Record<string, string[]> = {
  calm:       ["zen", "minimalist", "editorial"],
  serene:     ["zen", "minimalist", "polaroid"],
  quiet:      ["zen", "minimalist"],
  tranquil:   ["zen", "minimalist"],
  peace:      ["zen", "minimalist"],
  dramatic:   ["noir", "gradient"],
  cinematic:  ["noir", "gradient", "editorial"],
  moody:      ["noir", "gradient"],
  dark:       ["noir", "cyberpunk"],
  eerie:      ["noir"],
  luxurious:  ["editorial", "polaroid", "gradient"],
  opulent:    ["editorial", "gradient"],
  elegant:    ["editorial", "polaroid"],
  futuristic: ["cyberpunk", "y2k", "gradient"],
  tech:       ["cyberpunk", "bauhaus"],
  neon:       ["cyberpunk", "vaporwave", "y2k"],
  retro:      ["polaroid", "vaporwave", "risograph"],
  nostalgic:  ["polaroid", "zen"],
  vintage:    ["polaroid", "risograph"],
  bold:       ["acid", "tabloid", "bauhaus"],
  vibrant:    ["acid", "vaporwave", "gradient"],
  playful:    ["y2k", "acid", "risograph"],
  energetic:  ["tabloid", "acid"],
  minimal:    ["minimalist", "zen"],
  clean:      ["minimalist", "bauhaus"],
  warm:       ["polaroid", "editorial"],
  cold:       ["cyberpunk", "noir"],
  lush:       ["editorial", "polaroid"],
  tropical:   ["vaporwave", "gradient"],
};

const OBJECT_RULES: Record<string, string[]> = {
  mountain:     ["editorial", "zen", "polaroid"],
  forest:       ["editorial", "zen"],
  ocean:        ["gradient", "zen"],
  sea:          ["gradient", "zen"],
  beach:        ["polaroid", "vaporwave"],
  architecture: ["bauhaus", "editorial", "minimalist"],
  building:     ["bauhaus", "editorial"],
  skyscraper:   ["bauhaus", "cyberpunk"],
  sunset:       ["polaroid", "vaporwave", "gradient"],
  sunrise:      ["polaroid", "zen"],
  night:        ["noir", "cyberpunk"],
  city:         ["cyberpunk", "bauhaus", "tabloid"],
  car:          ["tabloid", "bauhaus"],
  food:         ["editorial", "polaroid"],
  portrait:     ["editorial", "noir", "polaroid"],
  face:         ["editorial", "noir"],
  person:       ["editorial", "polaroid"],
  neon:         ["cyberpunk", "vaporwave"],
  pool:         ["editorial", "gradient"],
  interior:     ["editorial", "minimalist", "bauhaus"],
  chair:        ["editorial", "minimalist"],
  plant:        ["editorial", "zen"],
  flower:       ["polaroid", "editorial"],
};

function hueOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = ((b - r) / d + 2);
  else h = ((r - g) / d + 4);
  return h * 60;
}

export function pickPreset(input: AutoInput): AutoResult {
  const text = [
    ...input.moods.map((m) => m.toLowerCase()),
    ...input.objects.map((o) => o.toLowerCase()),
    ...input.subjects.map((s) => s.toLowerCase()),
  ].join(" | ");

  const avgBrightness =
    input.brightnesses.length > 0
      ? input.brightnesses.reduce((a, b) => a + b, 0) / input.brightnesses.length
      : 0.5;

  const hues = input.dominants.map(hueOf);
  const avgHue = hues.length ? hues.reduce((a, b) => a + b, 0) / hues.length : 0;

  const reasons: string[] = [];
  const scores = new Map<string, number>();
  for (const p of SLIDE_PRESETS) scores.set(p.id, 0);

  const boost = (id: string, amount: number, why: string) => {
    const cur = scores.get(id);
    if (cur === undefined) return;
    scores.set(id, cur + amount);
    if (amount >= 2) reasons.push(why);
  };

  for (const [kw, ids] of Object.entries(MOOD_RULES)) {
    if (text.includes(kw)) {
      for (const id of ids) boost(id, 3, `${kw} → ${id}`);
    }
  }
  for (const [kw, ids] of Object.entries(OBJECT_RULES)) {
    if (text.includes(kw)) {
      for (const id of ids) boost(id, 2, `${kw} → ${id}`);
    }
  }

  if (avgBrightness > 0.68) {
    boost("minimalist", 2, "bright scenes → minimalist");
    boost("polaroid", 1.5, "bright scenes → polaroid");
    boost("editorial", 1, "bright scenes → editorial");
  } else if (avgBrightness < 0.3) {
    boost("noir", 3, "dark scenes → noir");
    boost("cyberpunk", 1.5, "dark scenes → cyberpunk");
    boost("gradient", 1, "dark scenes → gradient");
  } else {
    boost("editorial", 1, "mid-tones → editorial");
  }

  if ((avgHue >= 280 && avgHue <= 340) || avgHue >= 340) {
    boost("vaporwave", 1.5, "purple tones → vaporwave");
    boost("gradient", 1, "purple tones → gradient");
  } else if (avgHue >= 200 && avgHue < 280) {
    boost("cyberpunk", 1, "blue tones → cyberpunk");
    boost("editorial", 1, "blue tones → editorial");
  } else if (avgHue >= 80 && avgHue < 170) {
    boost("editorial", 1, "green tones → editorial");
    boost("zen", 1, "green tones → zen");
  } else if (avgHue < 20 || avgHue >= 340) {
    boost("tabloid", 1, "warm tones → tabloid");
    boost("acid", 1, "warm tones → acid");
  }

  boost("editorial", 0.5, "default baseline");

  const sorted = [...scores.entries()].sort(([, a], [, b]) => b - a);
  const [topId] = sorted[0];
  const top = SLIDE_PRESETS.find((p) => p.id === topId)!;

  const seen = new Set<string>();
  const shortReason =
    reasons
      .filter((r) => {
        const key = r.split("→")[0].trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 2)
      .join(" · ") || "best balance of brightness + palette";

  return {
    preset: top,
    reason: shortReason,
    score: sorted[0][1],
    runners: sorted.slice(0, 3).map(([id, score]) => ({ id, score })),
  };
}
