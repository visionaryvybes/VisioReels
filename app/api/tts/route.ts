import { listVoiceProfiles, listPresetVoices, type VoiceProfile } from "@/lib/voicebox";
import type { PresetVoiceGroup } from "@/lib/voicebox";

// GET /api/tts — returns { running: boolean, profiles: VoiceProfile[], presetVoices: PresetVoiceGroup[] }
export async function GET(): Promise<Response> {
  const profiles = await listVoiceProfiles();
  if (!profiles) {
    return Response.json({
      running: false,
      profiles: [] as VoiceProfile[],
      presetVoices: [] as PresetVoiceGroup[],
    });
  }

  // Build preset voice groups from raw Voicebox data
  const rawPresets = await listPresetVoices();

  // Group by accent + gender
  const groupMap = new Map<string, PresetVoiceGroup>();

  for (const entry of rawPresets) {
    const key = `${entry.language}__${entry.gender}`;
    if (!groupMap.has(key)) {
      const accentLabel = accentDisplayLabel(entry.language);
      groupMap.set(key, {
        label: `${accentLabel} ${entry.gender === "female" ? "Female" : "Male"}`,
        gender: entry.gender,
        accent: entry.language,
        voices: [],
      });
    }
    groupMap.get(key)!.voices.push({
      id: entry.voice_id,
      name: entry.name,
    });
  }

  const presetVoices = Array.from(groupMap.values());

  return Response.json({ running: true, profiles, presetVoices });
}

function accentDisplayLabel(language: string): string {
  const map: Record<string, string> = {
    american: "American",
    british: "British",
    spanish: "Spanish",
    french: "French",
    hindi: "Hindi",
  };
  return map[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}
