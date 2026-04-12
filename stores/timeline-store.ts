import { create } from 'zustand';

export interface TimelineClip {
  id: string;
  composition: string;
  durationInFrames: number;
  fps: number;
  color: string;
  label: string;
}

interface TimelineStore {
  clips: TimelineClip[];
  currentFrame: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  addClip: (clip: Omit<TimelineClip, 'id'>) => void;
  setCurrentFrame: (f: number) => void;
  setPlaying: (p: boolean) => void;
  setSelected: (id: string | null) => void;
  clear: () => void;
}

const CLIP_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
];

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  clips: [],
  currentFrame: 0,
  isPlaying: false,
  selectedClipId: null,

  addClip: (clip) =>
    set((s) => {
      const id = crypto.randomUUID();
      const color = CLIP_COLORS[s.clips.length % CLIP_COLORS.length];
      const existing = s.clips.findIndex((c) => c.composition === clip.composition);
      if (existing !== -1) {
        const updated = [...s.clips];
        updated[existing] = { ...clip, id: updated[existing].id, color: updated[existing].color };
        return { clips: updated };
      }
      return { clips: [...s.clips, { ...clip, id, color }] };
    }),

  setCurrentFrame: (f) => set({ currentFrame: f }),

  setPlaying: (p) => {
    const { clips } = get();
    if (clips.length === 0) return;
    set({ isPlaying: p });
  },

  setSelected: (id) => set({ selectedClipId: id }),

  clear: () => set({ clips: [], currentFrame: 0, isPlaying: false, selectedClipId: null }),
}));
