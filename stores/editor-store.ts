import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { ReelDecorId, ReelTypographyId } from '@/lib/reel-typography';
import type { ConceptBrief } from '@/lib/concept-brief';
import type { DirectorBrief } from '@/lib/director-brief';
export type { ConceptBrief };
export type { DirectorBrief };

export type ActivePanel = 'ai' | 'media' | 'history';
export type GenerationPhase =
  | 'idle'
  | 'reading'
  | 'generating'
  | 'writing'
  | 'validating'
  | 'done'
  | 'error';

/** Output canvas — mirrors the slides page options and covers every major social format. */
export type ReelAspect = '9:16' | '1:1' | '4:5' | '16:9';
/** Editing pace — drives scene + transition length. Fast = punchy TikTok, Chill = cinematic. */
export type ReelPace = 'chill' | 'balanced' | 'fast' | 'hype';

export const REEL_ASPECTS: Record<ReelAspect, { label: string; w: number; h: number; hint: string }> = {
  '9:16': { label: 'Story / Reel', w: 1080, h: 1920, hint: 'Reels · TikTok · Shorts · Stories' },
  '1:1':  { label: 'Feed square', w: 1080, h: 1080, hint: 'Instagram · LinkedIn feed' },
  '4:5':  { label: 'Portrait feed', w: 1080, h: 1350, hint: 'Instagram portrait · Pinterest' },
  '16:9': { label: 'Landscape', w: 1920, h: 1080, hint: 'LinkedIn · X · YouTube' },
};

/** Pace → scene length + transition length (frames at 30fps). */
export const REEL_PACE: Record<ReelPace, { sceneLen: number; transLen: number; blurb: string }> = {
  chill:    { sceneLen: 110, transLen: 24, blurb: '3.7s holds · slow cross-fade' },
  balanced: { sceneLen: 75,  transLen: 18, blurb: '2.5s · the default CinematicReel rhythm' },
  fast:     { sceneLen: 55,  transLen: 12, blurb: '1.8s · punchy TikTok-ready cuts' },
  hype:     { sceneLen: 38,  transLen: 8,  blurb: '1.2s · beat-driven reel energy' },
};

/**
 * HyperFrames-style creative vocabulary (maps to Gemma instructions — we render with Remotion).
 * Shared prompt fragments: `lib/hyperframes-prompt.ts` · https://github.com/heygen-com/hyperframes
 */
export type MotionFeel = 'smooth' | 'snappy' | 'bouncy' | 'dramatic' | 'dreamy';
export type CaptionTone = 'hype' | 'corporate' | 'tutorial' | 'storytelling' | 'social';
export type TransitionEnergy = 'calm' | 'medium' | 'high';

/** How /api/agent turns your brief into a video (AI panel). */
export type VideoPipelineMode = 'remotion' | 'hyperframes';

export const MOTION_FEEL: Record<MotionFeel, { label: string; remotionHint: string }> = {
  smooth:   { label: 'Smooth', remotionHint: 'long ease-out deceleration, gentle spring damping' },
  snappy:   { label: 'Snappy', remotionHint: 'short duration, decisive settle' },
  bouncy:   { label: 'Bouncy', remotionHint: 'spring with overshoot, playful' },
  dramatic: { label: 'Dramatic', remotionHint: 'expo-style slow tail, big contrast' },
  dreamy:   { label: 'Dreamy', remotionHint: 'sine ease, symmetrical, floaty' },
};

export const CAPTION_TONE: Record<CaptionTone, { label: string; copyRules: string }> = {
  hype:          { label: 'Hype', copyRules: 'short punchy ALL-CAPS, kinetic energy, 1–2 words max' },
  corporate:     { label: 'Corporate', copyRules: 'confident title case, clear benefit, restrained' },
  tutorial:      { label: 'Tutorial', copyRules: 'instructional, step-like, monospace-friendly phrasing' },
  storytelling:  { label: 'Story', copyRules: 'evocative, cinematic, serif-adjacent mood in kicker' },
  social:        { label: 'Social', copyRules: 'playful, scroll-stopping, emoji-free unless user asks' },
};

export const TRANSITION_ENERGY: Record<TransitionEnergy, { label: string; prefer: string }> = {
  calm:   { label: 'Calm', prefer: 'fade, slide-bottom — blur-crossfade energy' },
  medium: { label: 'Medium', prefer: 'slide-left/right, flip — push-slide energy' },
  high:   { label: 'High', prefer: 'wipe, flip, slide-* — zoom-through / punch-cut energy' },
};

/** Target runtime for generated video (Gemma + Remotion). */
export const DURATION_PRESETS: { sec: number; label: string }[] = [
  { sec: 10, label: '10s' },
  { sec: 15, label: '15s' },
  { sec: 20, label: '20s' },
  { sec: 30, label: '30s' },
  { sec: 45, label: '45s' },
  { sec: 60, label: '60s' },
  { sec: 90, label: '90s' },
  { sec: 120, label: '2m' },
  { sec: 180, label: '3m' },
  { sec: 300, label: '5m' },
];

interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface Attachment {
  name: string;
  url: string;   // browser-facing URL (e.g. /uploads/abc123.jpg)
  path: string;  // staticFile-relative path (e.g. uploads/abc123.jpg)
  size: number;
}

/** Per-attachment notes produced by the vision pre-flight. Parallel to attachments. */
export interface VisionNote {
  path: string;
  subject: string;      // "a red race car on a track"
  mood: string;         // "high-energy, cinematic dusk"
  palette: string[];    // dominant hexes
  brightness: number;   // 0..1
  composition?: string; // spatial layout: "subject fills right half, open sky left"
  text_zone?: string;   // best overlay placement: "bottom-left" | "bottom-center" | etc.
  content_type?: string; // image category: "interior-design" | "portrait" | etc.
  copy_style?: string;  // 3-5 word tone guide: "luxury lifestyle aspirational"
}

interface EditorStore {
  activePanel: ActivePanel;
  activeComposition: string | null;
  compositionConfig: CompositionConfig | null;
  /** Remotion props for `HtmlSlideVideo` when generated via the agent (slidePaths, dimensions, etc.). */
  compositionInputProps: Record<string, unknown> | null;
  generationPhase: GenerationPhase;
  generationStatus: string;
  streamingTokens: string;
  elapsed: number;
  lastError: string | null;
  prompt: string;
  previewFrame: number;
  attachments: Attachment[];
  // ── Canvas / direction ───────────────────────────────────────────────
  aspect: ReelAspect;
  pace: ReelPace;
  /** Caps how many attached images become scenes (2..10). */
  maxScenes: number;
  /** Enable/disable the vision pre-pass (faster off but worse captions). */
  useVision: boolean;
  visionNotes: VisionNote[];
  /** HyperFrames-style creative profile (drives Gemma copy + motion hints). */
  motionFeel: MotionFeel;
  captionTone: CaptionTone;
  transitionEnergy: TransitionEnergy;
  /** Target video length in seconds (drives frame count + Gemma prompt depth). */
  targetDurationSec: number;
  /** CinematicReel headline / kicker font stacks (same families as slide presets). */
  reelTypography: ReelTypographyId;
  /** Corner / film-strip overlays on generated reels. */
  reelDecor: ReelDecorId;
  /** remotion = AI → CinematicReel; hyperframes = AI → HTML slides → Playwright PNG → HtmlSlideVideo. */
  pipelineMode: VideoPipelineMode;
  /** Gemma's creative director brief — populated by brain pass before code gen. */
  concept: ConceptBrief | null;
  /** Full director brief with per-scene specs — populated alongside concept. */
  directorBrief: DirectorBrief | null;
  // ── TTS / Voicebox ───────────────────────────────────────────────────────
  /** Enable AI narration via Voicebox TTS (http://localhost:17493). */
  useTTS: boolean;
  /** Voicebox voice id / name to use for narration. */
  ttsVoice: string;
  /** Current TTS status message from the agent SSE stream. */
  ttsStatus: string | null;
  // actions
  setActivePanel: (p: ActivePanel) => void;
  setActiveComposition: (id: string, config: CompositionConfig) => void;
  setCompositionInputProps: (p: Record<string, unknown> | null) => void;
  setGenerationPhase: (p: GenerationPhase, status?: string) => void;
  appendToken: (tok: string) => void;
  clearTokens: () => void;
  setError: (e: string) => void;
  setPrompt: (p: string) => void;
  setElapsed: (n: number) => void;
  setPreviewFrame: (f: number) => void;
  addAttachments: (files: Attachment[]) => void;
  removeAttachment: (path: string) => void;
  clearAttachments: () => void;
  setAspect: (a: ReelAspect) => void;
  setPace: (p: ReelPace) => void;
  setMaxScenes: (n: number) => void;
  setUseVision: (v: boolean) => void;
  setVisionNotes: (notes: VisionNote[]) => void;
  upsertVisionNote: (note: VisionNote) => void;
  setMotionFeel: (m: MotionFeel) => void;
  setCaptionTone: (c: CaptionTone) => void;
  setTransitionEnergy: (t: TransitionEnergy) => void;
  setTargetDurationSec: (sec: number) => void;
  setReelTypography: (t: ReelTypographyId) => void;
  setReelDecor: (d: ReelDecorId) => void;
  setPipelineMode: (m: VideoPipelineMode) => void;
  setConcept: (c: ConceptBrief | null) => void;
  setDirectorBrief: (b: DirectorBrief | null) => void;
  setUseTTS: (v: boolean) => void;
  setTTSVoice: (v: string) => void;
  setTTSStatus: (msg: string | null) => void;
  reset: () => void;
}

const initialState = {
  activePanel: 'ai' as ActivePanel,
  activeComposition: null,
  compositionConfig: null,
  compositionInputProps: null as Record<string, unknown> | null,
  generationPhase: 'idle' as GenerationPhase,
  generationStatus: '',
  streamingTokens: '',
  elapsed: 0,
  lastError: null,
  prompt: '',
  previewFrame: 0,
  attachments: [] as Attachment[],
  aspect: '9:16' as ReelAspect,
  pace: 'balanced' as ReelPace,
  maxScenes: 6,
  useVision: true,
  visionNotes: [] as VisionNote[],
  motionFeel: 'snappy' as MotionFeel,
  captionTone: 'hype' as CaptionTone,
  transitionEnergy: 'medium' as TransitionEnergy,
  targetDurationSec: 30,
  reelTypography: 'syne' as ReelTypographyId,
  reelDecor: 'minimal' as ReelDecorId,
  pipelineMode: 'remotion' as VideoPipelineMode,
  directorBrief: null as DirectorBrief | null,
  concept: null as ConceptBrief | null,
  useTTS: false,
  ttsVoice: 'default',
  ttsStatus: null as string | null,
};

export const useEditorStore = create<EditorStore>()(
  persist(
    immer((set) => ({
      ...initialState,

      setActivePanel: (p) =>
        set((state) => {
          state.activePanel = p;
        }),

      setActiveComposition: (id, config) =>
        set((state) => {
          state.activeComposition = id;
          state.compositionConfig = config;
          state.previewFrame = 0;
        }),

      setCompositionInputProps: (p) =>
        set((state) => {
          state.compositionInputProps = p;
        }),

      setGenerationPhase: (p, status) =>
        set((state) => {
          state.generationPhase = p;
          if (status !== undefined) state.generationStatus = status;
        }),

      appendToken: (tok) =>
        set((state) => {
          // Keep last 4000 chars to avoid memory bloat
          const combined = state.streamingTokens + tok;
          state.streamingTokens = combined.slice(-4000);
        }),

      clearTokens: () =>
        set((state) => {
          state.streamingTokens = '';
        }),

      setError: (e) =>
        set((state) => {
          state.lastError = e;
          state.generationPhase = 'error';
          state.generationStatus = e;
        }),

      setPrompt: (p) =>
        set((state) => {
          state.prompt = p;
        }),

      setElapsed: (n) =>
        set((state) => {
          state.elapsed = n;
        }),

      setPreviewFrame: (f) =>
        set((state) => {
          state.previewFrame = f;
        }),

      addAttachments: (files) =>
        set((state) => {
          const seen = new Set(state.attachments.map((a) => a.path));
          for (const f of files) if (!seen.has(f.path)) state.attachments.push(f);
        }),

      removeAttachment: (p) =>
        set((state) => {
          state.attachments = state.attachments.filter((a) => a.path !== p);
        }),

      clearAttachments: () =>
        set((state) => {
          state.attachments = [];
          state.visionNotes = [];
        }),

      setAspect: (a) =>
        set((state) => {
          state.aspect = a;
        }),

      setPace: (p) =>
        set((state) => {
          state.pace = p;
        }),

      setMaxScenes: (n) =>
        set((state) => {
          state.maxScenes = Math.max(2, Math.min(24, Math.round(n)));
        }),

      setUseVision: (v) =>
        set((state) => {
          state.useVision = v;
        }),

      setVisionNotes: (notes) =>
        set((state) => {
          state.visionNotes = notes;
        }),

      upsertVisionNote: (note) =>
        set((state) => {
          const idx = state.visionNotes.findIndex((n) => n.path === note.path);
          if (idx >= 0) state.visionNotes[idx] = note;
          else state.visionNotes.push(note);
        }),

      setMotionFeel: (m) =>
        set((state) => {
          state.motionFeel = m;
        }),

      setCaptionTone: (c) =>
        set((state) => {
          state.captionTone = c;
        }),

      setTransitionEnergy: (t) =>
        set((state) => {
          state.transitionEnergy = t;
        }),

      setTargetDurationSec: (sec) =>
        set((state) => {
          state.targetDurationSec = Math.max(5, Math.min(600, Math.round(sec)));
        }),

      setReelTypography: (t) =>
        set((state) => {
          state.reelTypography = t;
        }),

      setReelDecor: (d) =>
        set((state) => {
          state.reelDecor = d;
        }),

      setPipelineMode: (m) =>
        set((state) => {
          state.pipelineMode = m;
        }),

      setConcept: (c) =>
        set((state) => {
          state.concept = c;
        }),

      setDirectorBrief: (b) =>
        set((state) => {
          state.directorBrief = b;
        }),

      setUseTTS: (v) =>
        set((state) => {
          state.useTTS = v;
        }),

      setTTSVoice: (v) =>
        set((state) => {
          state.ttsVoice = v;
        }),

      setTTSStatus: (msg) =>
        set((state) => {
          state.ttsStatus = msg;
        }),

      reset: () =>
        set((state) => {
          state.generationPhase = 'idle';
          state.generationStatus = '';
          state.streamingTokens = '';
          state.elapsed = 0;
          state.lastError = null;
          state.compositionInputProps = null;
          state.concept = null;
        }),
    })),
    {
      name: 'visio-editor',
      partialize: (state) => ({
        activePanel: state.activePanel,
        activeComposition: state.activeComposition,
        compositionConfig: state.compositionConfig,
        /** Required for HtmlSlideVideo preview after refresh — was omitted, causing empty slidePaths. */
        compositionInputProps: state.compositionInputProps,
        attachments: state.attachments,
        aspect: state.aspect,
        pace: state.pace,
        maxScenes: state.maxScenes,
        useVision: state.useVision,
        motionFeel: state.motionFeel,
        captionTone: state.captionTone,
        transitionEnergy: state.transitionEnergy,
        targetDurationSec: state.targetDurationSec,
        reelTypography: state.reelTypography,
        reelDecor: state.reelDecor,
        pipelineMode: state.pipelineMode,
        useTTS: state.useTTS,
        ttsVoice: state.ttsVoice,
      }),
    }
  )
);
