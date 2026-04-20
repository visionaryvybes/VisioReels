import fs from "fs";

const VOICEBOX_BASE = (process.env.VOICEBOX_URL ?? "http://localhost:17493").replace(/\/$/, "");

export interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  engine?: string;
}

/** A single preset voice entry returned by Voicebox /profiles/presets/kokoro */
export interface PresetVoiceEntry {
  voice_id: string;
  name: string;
  gender: "female" | "male";
  language: string;
}

/** A group of preset voices sharing the same accent + gender */
export interface PresetVoiceGroup {
  label: string;               // e.g. "American Female"
  gender: "female" | "male";
  accent: string;              // e.g. "american", "british", "spanish"
  voices: { id: string; name: string }[];
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
    { preset_engine: "kokoro", preset_voice_id: "af_bella" },
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
  instruct?: string;
  seed?: number;
  crossfade_ms?: number;
  effects_chain?: Array<{ type: string; params?: Record<string, number> }>;
}): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const body: Record<string, unknown> = {
      profile_id: opts.profileId,
      text: opts.text,
      normalize: true,
    };
    if (opts.engine) body.engine = opts.engine;
    if (opts.language) body.language = opts.language;
    if (opts.instruct) body.instruct = opts.instruct;
    if (opts.seed !== undefined) body.seed = opts.seed;
    if (opts.crossfade_ms !== undefined) body.crossfade_ms = opts.crossfade_ms;
    if (opts.effects_chain?.length) body.effects_chain = opts.effects_chain;

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

/**
 * Pre-warm the kokoro model so the FIRST real TTS call doesn't take 10-20s
 * waiting for the model to load. Fire once at the START of any pipeline that
 * uses TTS — run without await (fire-and-forget) so it runs in parallel with
 * vision + web context fetching.
 *
 * The warmup generates a 1-word utterance and discards the output.
 * If Voicebox is offline or returns an error the promise resolves quietly.
 */
export async function warmupVoicebox(profileId: string, engine?: string): Promise<void> {
  try {
    const controller = new AbortController();
    // Give warmup a generous timeout — model load can take up to 12s on some machines.
    const timer = setTimeout(() => controller.abort(), 20000);
    const body: Record<string, unknown> = {
      profile_id: profileId,
      text: "Ready.",
      normalize: false,
    };
    if (engine) body.engine = engine;

    const res = await fetch(`${VOICEBOX_BASE}/generate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Drain the body so the HTTP connection is properly released, then discard.
    if (res.ok && res.body) {
      await res.body.cancel();
    }
  } catch {
    // Offline or timeout — no-op. Real TTS calls will handle the retry themselves.
  }
}

/**
 * Fetch all kokoro preset voices from Voicebox and return a flat list with
 * gender/language inferred from the voice_id prefix.
 * Returns [] if Voicebox is unreachable.
 */
export async function listPresetVoices(): Promise<PresetVoiceEntry[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${VOICEBOX_BASE}/profiles/presets/kokoro`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return buildFallbackPresets();
    const data = (await res.json()) as { voices?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.voices)) return buildFallbackPresets();
    return data.voices.map((v) => {
      const vid = String(v.voice_id ?? v.id ?? "");
      const name = String(v.name ?? capitalizeFirst(vid.replace(/^[a-z]{2}_/, "")));
      return {
        voice_id: vid,
        name,
        ...inferGenderAndLanguage(vid),
      };
    });
  } catch {
    return buildFallbackPresets();
  }
}

/** If Voicebox is offline or returns no data, use the known 50-voice list. */
function buildFallbackPresets(): PresetVoiceEntry[] {
  const voices: Array<[string, string]> = [
    // American Female
    ["af_alloy", "Alloy"], ["af_aoede", "Aoede"], ["af_bella", "Bella"],
    ["af_heart", "Heart"], ["af_jessica", "Jessica"], ["af_kore", "Kore"],
    ["af_nicole", "Nicole"], ["af_nova", "Nova"], ["af_river", "River"],
    ["af_sarah", "Sarah"], ["af_sky", "Sky"],
    // American Male
    ["am_adam", "Adam"], ["am_echo", "Echo"], ["am_eric", "Eric"],
    ["am_fenrir", "Fenrir"], ["am_liam", "Liam"], ["am_michael", "Michael"],
    ["am_onyx", "Onyx"], ["am_puck", "Puck"], ["am_santa", "Santa"],
    // British Female
    ["bf_alice", "Alice"], ["bf_emma", "Emma"], ["bf_isabella", "Isabella"], ["bf_lily", "Lily"],
    // British Male
    ["bm_daniel", "Daniel"], ["bm_fable", "Fable"], ["bm_george", "George"], ["bm_lewis", "Lewis"],
    // Spanish
    ["ef_dora", "Dora"], ["em_alex", "Alex"],
    // French
    ["ff_siwis", "Siwis"],
    // Hindi
    ["hf_alpha", "Alpha"], ["hf_beta", "Beta"], ["hm_omega", "Omega"], ["hm_psi", "Psi"],
  ];
  return voices.map(([voice_id, name]) => ({
    voice_id,
    name,
    ...inferGenderAndLanguage(voice_id),
  }));
}

/** Derive gender and language from voice_id prefix (e.g. "af_" → american female). */
function inferGenderAndLanguage(voiceId: string): { gender: "female" | "male"; language: string } {
  const prefix = voiceId.slice(0, 2).toLowerCase();
  const genderChar = prefix[1];
  const gender: "female" | "male" = genderChar === "f" ? "female" : "male";
  const langMap: Record<string, string> = {
    a: "american",
    b: "british",
    e: "spanish",
    f: "french",
    h: "hindi",
  };
  const language = langMap[prefix[0]] ?? "other";
  return { gender, language };
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Ensure a Voicebox preset profile exists for the given voice_id.
 * If one already exists (matched by preset_voice_id or name), return it.
 * Otherwise create a new one named "VisioReels · {VoiceName}".
 * Returns null if Voicebox is unreachable.
 */
export async function ensurePresetProfile(
  voiceId: string,
  engine: string = "kokoro"
): Promise<VoiceProfile | null> {
  const list = await listVoiceProfiles();
  if (list === null) return null;

  // Look for an existing profile that already uses this voice
  const voiceIdLower = voiceId.toLowerCase();
  const existing = list.find((p) => {
    const nameLower = p.name.toLowerCase();
    // Match "VisioReels · <something>" profiles that contain the voice name portion
    const nameSuffix = voiceId.replace(/^[a-z]{2}_/, "").toLowerCase();
    return (
      nameLower.includes(voiceIdLower) ||
      (nameSuffix.length > 2 && nameLower.includes(nameSuffix))
    );
  });
  if (existing) return existing;

  // Derive a friendly name
  const presets = buildFallbackPresets();
  const entry = presets.find((p) => p.voice_id === voiceId);
  const voiceName = entry?.name ?? capitalizeFirst(voiceId.replace(/^[a-z]{2}_/, ""));
  const profileName = `VisioReels · ${voiceName}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${VOICEBOX_BASE}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        name: profileName,
        description: `Auto-created by VisioReels for voice ${voiceId}`,
        voice_type: "preset",
        language: "en",
        preset_engine: engine,
        preset_voice_id: voiceId,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const id = String(data.id ?? "");
    if (!id) return null;
    return {
      id,
      name: String(data.name ?? profileName),
      language: String(data.language ?? "en"),
      engine,
    };
  } catch {
    return null;
  }
}
