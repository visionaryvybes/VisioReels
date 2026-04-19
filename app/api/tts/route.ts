import { listVoiceProfiles, type VoiceProfile } from "@/lib/voicebox";

// GET /api/tts — returns { running: boolean, profiles: VoiceProfile[] }
// Calls listVoiceProfiles(); if null, running=false profiles=[]; otherwise running=true, profiles=[...]
export async function GET(): Promise<Response> {
  const profiles = await listVoiceProfiles();
  if (!profiles) {
    return Response.json({ running: false, profiles: [] as VoiceProfile[] });
  }
  return Response.json({ running: true, profiles });
}
