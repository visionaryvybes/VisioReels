import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Project {
  id: string;
  name: string;
  composition: string | null;
  prompt: string;
  platform: string;
  createdAt: number;
  previewPath: string | null;
}

interface ProjectStore {
  current: Project;
  history: Project[];
  setName: (name: string) => void;
  setPlatform: (platform: string) => void;
  setComposition: (comp: string, prompt: string, preview: string) => void;
  saveToHistory: () => void;
  loadProject: (id: string) => void;
  removeHistoryItem: (id: string) => void;
  newProject: () => void;
}

function makeProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Reel',
    composition: null,
    prompt: '',
    platform: 'tiktok',
    createdAt: Date.now(),
    previewPath: null,
  };
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      current: makeProject(),
      history: [],

      setName: (name) =>
        set((s) => ({ current: { ...s.current, name } })),

      setPlatform: (platform) =>
        set((s) => ({ current: { ...s.current, platform } })),

      setComposition: (comp, prompt, preview) =>
        set((s) => ({
          current: {
            ...s.current,
            composition: comp,
            prompt,
            previewPath: preview,
          },
        })),

      saveToHistory: () => {
        const { current, history } = get();
        const exists = history.find((h) => h.id === current.id);
        const updated = exists
          ? history.map((h) => (h.id === current.id ? { ...current } : h))
          : [{ ...current }, ...history].slice(0, 20);
        set({ history: updated });
      },

      loadProject: (id) => {
        const { history } = get();
        const found = history.find((h) => h.id === id);
        if (found) set({ current: { ...found } });
      },

      removeHistoryItem: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),

      newProject: () => set({ current: makeProject() }),
    }),
    {
      name: 'visio-projects',
    }
  )
);
