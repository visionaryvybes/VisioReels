import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

export type ActivePanel = 'ai' | 'media' | 'history' | 'export';
export type GenerationPhase =
  | 'idle'
  | 'reading'
  | 'generating'
  | 'writing'
  | 'validating'
  | 'done'
  | 'error';

interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

interface EditorStore {
  activePanel: ActivePanel;
  activeComposition: string | null;
  compositionConfig: CompositionConfig | null;
  generationPhase: GenerationPhase;
  generationStatus: string;
  streamingTokens: string;
  elapsed: number;
  lastError: string | null;
  prompt: string;
  previewFrame: number;
  // actions
  setActivePanel: (p: ActivePanel) => void;
  setActiveComposition: (id: string, config: CompositionConfig) => void;
  setGenerationPhase: (p: GenerationPhase, status?: string) => void;
  appendToken: (tok: string) => void;
  clearTokens: () => void;
  setError: (e: string) => void;
  setPrompt: (p: string) => void;
  setElapsed: (n: number) => void;
  setPreviewFrame: (f: number) => void;
  reset: () => void;
}

const initialState = {
  activePanel: 'ai' as ActivePanel,
  activeComposition: null,
  compositionConfig: null,
  generationPhase: 'idle' as GenerationPhase,
  generationStatus: '',
  streamingTokens: '',
  elapsed: 0,
  lastError: null,
  prompt: '',
  previewFrame: 0,
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

      reset: () =>
        set((state) => {
          state.generationPhase = 'idle';
          state.generationStatus = '';
          state.streamingTokens = '';
          state.elapsed = 0;
          state.lastError = null;
        }),
    })),
    {
      name: 'visio-editor',
      partialize: (state) => ({
        activePanel: state.activePanel,
        activeComposition: state.activeComposition,
        compositionConfig: state.compositionConfig,
        prompt: state.prompt,
      }),
    }
  )
);
