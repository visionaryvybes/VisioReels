import fs from "fs";

const VOICEBOX_BASE = (process.env.VOICEBOX_URL ?? "http://localhost:17493").replace(/\/$/, "");

export interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  engine?: string;
}

/** VisioReels creates this preset profile in Voicebox when the user has zero voices but enables TTS. */
const AUTO_NARRATION_PROFILE_NAME = "VisioReels · Auto narration";

type PresetPick = { preset_engine: string; preset_voice_id: string };

/**
 * Ask Voicebox which preset engines are available and return one concrete voice_id.
 */
async function pickFirstPresetVoice(engine: "kokoro" | "qwen_custom_voice"): Promise<PresetPick | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${VOICEBOX_BASE}/profiles/presets/${engine}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { voices?: Array<{ voice_id?: string }> };
    const vid = data.voices?.[0]?.voice_id;
    if (typeof vid === "string" && vid.length > 0) {
      return { preset_engine: engine, preset_voice_id: vid };
    }
  } catch {
    /* unreachable server */
  }
  return null;
}

function configuredPresetFromEnv(): PresetPick | null {
  const engine = process.env.VOICEBOX_PRESET_ENGINE?.trim();
  const voiceId = process.env.VOICEBOX_PRESET_VOICE_ID?.trim();
  if (engine && voiceId) return { preset_engine: engine, preset_voice_id: voiceId };
  return null;
}

/**
 * Create a preset-backed Voicebox profile (no samples required). Used for auto-narration.
 */
export async function createPresetVoiceProfile(pick: PresetPick): Promise<VoiceProfile | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${VOICEBOX_BASE}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        name: AUTO_NARRATION_PROFILE_NAME,
        description: "Created by VisioReels for narration when no voice profiles exist",
        voice_type: "preset",
        language: "en",
        preset_engine: pick.preset_engine,
        preset_voice_id: pick.preset_voice_id,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const id = String(data.id ?? "");
    if (!id) return null;
    return {
      id,
      name: String(data.name ?? AUTO_NARRATION_PROFILE_NAME),
      language: String(data.language ?? "en"),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve which Voicebox profile_id to use for Gemma-sourced scene narration.
 * - If the user already has profiles: match ttsVoice by id/name, else first profile.
 * - If none exist but Voicebox is up: create (or reuse) a preset "Auto narration" profile.
 */
export async function resolveProfileForNarration(ttsVoice: string): Promise<VoiceProfile | null> {
  const list = await listVoiceProfiles();
  if (list === null) return null;

  if (list.length > 0) {
    const isAuto = (p: VoiceProfile) => p.name.includes("Auto narration");
    const userFirst = list.filter((p) => !isAuto(p));
    const pool = userFirst.length > 0 ? userFirst : list;
    const want = ttsVoice.trim().toLowerCase();
    const byMatch = pool.find(
      (p) =>
        p.id === ttsVoice ||
        (want.length > 0 &&
          want !== "default" &&
          p.name.toLowerCase().includes(want))
    );
    return byMatch ?? pool[0] ?? null;
  }

  const again = await listVoiceProfiles();
  if (again && again.length > 0) return again[0] ?? null;

  const attempts: PresetPick[] = [];
  const envPick = configuredPresetFromEnv();
  if (envPick) attempts.push(envPick);

  const k = await pickFirstPresetVoice("kokoro");
  if (k) attempts.push(k);
  const q = await pickFirstPresetVoice("qwen_custom_voice");
  if (q) attempts.push(q);

  const fallbacks: PresetPick[] = [
    { preset_engine: "kokoro", preset_voice_id: "af_heart" },
    { preset_engine: "qwen_custom_voice", preset_voice_id: "Ryan" },
  ];
  for (const fb of fallbacks) {
    if (!attempts.some((a) => a.preset_engine === fb.preset_engine && a.preset_voice_id === fb.preset_voice_id)) {
      attempts.push(fb);
    }
  }

  for (const pick of attempts) {
    const created = await createPresetVoiceProfile(pick);
    if (created) return created;
  }
  const afterFail = await listVoiceProfiles();
  if (afterFail?.length) {
    return (
      afterFail.find((p) => p.name.includes("Auto narration")) ?? afterFail[0] ?? null
    );
  }
  return null;
}

/**
 * Returns the list of voice profiles from Voicebox.
 * Returns null if Voicebox is not running or on any error/timeout.
 */
export async function listVoiceProfiles(): Promise<VoiceProfile[] | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${VOICEBOX_BASE}/profiles`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) return null;
    return data.map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      language: String(p.language ?? ""),
      engine: String(p.preset_engine ?? ""),
    }));
  } catch {
    return null;
  }
}

/**
 * Generate TTS for the given text via Voicebox and save the WAV to outputPath.
 * Returns true on success, false on any error.
 */
export async function generateSpeech(opts: {
  text: string;
  profileId: string;
  outputPath: string;
  engine?: string;
  language?: string;
}): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const body: Record<string, string> = {
      profile_id: opts.profileId,
      text: opts.text,
    };
    if (opts.engine) body.engine = opts.engine;
    if (opts.language) body.language = opts.language;

    const res = await fetch(`${VOICEBOX_BASE}/generate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(opts.outputPath, Buffer.from(arrayBuffer));
    return true;
  } catch {
    return false;
  }
}

/**
 * Quick health check — returns true if Voicebox is reachable.
 */
export async function isVoiceboxRunning(): Promise<boolean> {
  const result = await listVoiceProfiles();
  return !!result;
}
