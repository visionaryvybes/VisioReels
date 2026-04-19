'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SlideFrame, type SlideData, type SlideTweaks } from '@/components/slides/SlideFrame';
import { TweaksPanel } from '@/components/slides/TweaksPanel';
import { PresentMode } from '@/components/slides/PresentMode';
import { ThumbStrip, arrayMove } from '@/components/slides/ThumbStrip';
import {
  ASPECT_RATIOS,
  SLIDE_PRESETS,
  getPreset,
  type SlideAspect,
} from '@/lib/slide-presets';

interface UploadedImage {
  path: string;
  url: string;
  name: string;
  size: number;
}

interface VisionNote {
  path: string;
  subject: string;
  mood: string;
  objects: string[];
}

const TONES = ['confident', 'playful', 'quiet', 'provocative', 'educational', 'poetic'];

// ─── Measured width hook — gives us the container width for responsive scaling ──
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function SlidesPage() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);
  // Stable IDs for drag & drop. Parallel to `slides`.
  const [slideIds, setSlideIds] = useState<string[]>([]);
  // ── Undo/redo stack — snapshots of { slides, slideIds, deckTweaks } ─────
  const historyRef = useRef<Array<{ slides: SlideData[]; slideIds: string[]; deckTweaks: SlideTweaks }>>([]);
  const futureRef = useRef<Array<{ slides: SlideData[]; slideIds: string[]; deckTweaks: SlideTweaks }>>([]);
  const [, forceHistRender] = useState(0);
  const [aspect, setAspect] = useState<SlideAspect>('1:1');
  const [presetId, setPresetId] = useState<string>('editorial');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('');
  const [brand, setBrand] = useState('');
  const [selectedIdx, setSelectedIdxRaw] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState<'idle' | 'uploading' | 'generating' | 'exporting' | 'regenerating' | 'rewriting' | 'variations'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hook, setHook] = useState<string>('');
  // Platform-aware output from Gemma — ready to paste into IG / TikTok / LinkedIn / X / Pinterest
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'linkedin' | 'x' | 'pinterest' | 'general'>('instagram');
  const [caption, setCaption] = useState<string>('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [cta, setCta] = useState<string>('');
  const [tab, setTab] = useState<'setup' | 'preview' | 'edit'>('setup');
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [toast, setToast] = useState<string>('');
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [autoPreset, setAutoPreset] = useState<boolean>(true);
  const [suggestion, setSuggestion] = useState<{ id: string; label: string; reason: string } | null>(null);
  const [presetFilter, setPresetFilter] = useState<string>('');
  // Deck-wide tweaks — applied when a slide has no local override
  const [deckTweaks, setDeckTweaks] = useState<SlideTweaks>({});
  const [tweakScope, setTweakScope] = useState<'slide' | 'deck'>('slide');
  const [presenting, setPresenting] = useState(false);
  // Hero zoom — 0.5x to 2x, default fits the column.  Persisted per session.
  const [heroZoom, setHeroZoom] = useState(1);
  const [variations, setVariations] = useState<Array<{ presetId: string; slide: Partial<SlideData> }> | null>(null);
  // Per-image vision analysis (dominant color + extracted palette) — kept parallel to slides
  const [analyses, setAnalyses] = useState<Array<{ path: string; dominant: string; palette: string[]; brightness?: number } | null>>([]);
  const [visionNotes, setVisionNotes] = useState<VisionNote[]>([]);
  // Which image Gemma is conceptually scanning during the generate overlay (0-indexed, rolling)
  const [scanIdx, setScanIdx] = useState(0);
  // Reasoning stream lines shown in the generating overlay (newest last)
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [showReasoning, setShowReasoning] = useState(true);
  // Track whether the last carousel select was a manual tap (not scroll-sync)
  const manualSelectRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mainRef, mainW] = useContainerWidth<HTMLDivElement>();

  const preset = useMemo(() => getPreset(presetId), [presetId]);
  const aspectSpec = ASPECT_RATIOS[aspect];
  const previewAspectW = aspectSpec.w || 1;
  const previewAspectH = aspectSpec.h || 1;
  const selected = slides[selectedIdx];

  // ── Undo/redo — explicit push before each structural mutation ───────────
  const snapshot = useCallback(() => ({
    slides: slides.map((s) => ({ ...s, tweaks: s.tweaks ? { ...s.tweaks } : undefined })),
    slideIds: [...slideIds],
    deckTweaks: { ...deckTweaks },
  }), [slides, slideIds, deckTweaks]);

  const pushHistory = useCallback(() => {
    historyRef.current.push(snapshot());
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];
    forceHistRender((x) => x + 1);
  }, [snapshot]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snapshot());
    setSlides(prev.slides);
    setSlideIds(prev.slideIds);
    setDeckTweaks(prev.deckTweaks);
    forceHistRender((x) => x + 1);
    setToast('Undo');
  }, [snapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshot());
    setSlides(next.slides);
    setSlideIds(next.slideIds);
    setDeckTweaks(next.deckTweaks);
    forceHistRender((x) => x + 1);
    setToast('Redo');
  }, [snapshot]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  // Guard selectedIdx to always be in-range
  const setSelectedIdx = useCallback((v: number | ((x: number) => number)) => {
    setSelectedIdxRaw((prev) => {
      const next = typeof v === 'function' ? (v as (x: number) => number)(prev) : v;
      return Math.max(0, Math.min(next, Math.max(0, slides.length - 1)));
    });
  }, [slides.length]);

  useEffect(() => {
    if (selectedIdx > Math.max(0, slides.length - 1)) {
      setSelectedIdxRaw(Math.max(0, slides.length - 1));
    }
  }, [slides.length, selectedIdx]);

  // Keep slideIds in sync when slides.length changes
  useEffect(() => {
    setSlideIds((prev) => {
      if (prev.length === slides.length) return prev;
      return Array.from({ length: slides.length }, (_, i) =>
        `slide-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`
      );
    });
  }, [slides.length]);

  // ── Autosave draft to localStorage ─────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('visio-slides-draft');
      if (!saved) return;
      const d = JSON.parse(saved) as Partial<{
        topic: string; tone: string; brand: string; presetId: string; aspect: SlideAspect; platform: string;
      }>;
      if (typeof d.topic === 'string') setTopic(d.topic);
      if (typeof d.tone === 'string') setTone(d.tone);
      if (typeof d.brand === 'string') setBrand(d.brand);
      if (typeof d.presetId === 'string') setPresetId(d.presetId);
      if (d.aspect && ASPECT_RATIOS[d.aspect as SlideAspect]) setAspect(d.aspect as SlideAspect);
      if (typeof d.platform === 'string' && ['instagram', 'tiktok', 'linkedin', 'x', 'pinterest', 'general'].includes(d.platform)) {
        setPlatform(d.platform as typeof platform);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem('visio-slides-draft', JSON.stringify({ topic, tone, brand, presetId, aspect, platform }));
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [topic, tone, brand, presetId, aspect, platform]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Track viewport so we can choose layout flavours
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      setViewport(w < 900 ? 'mobile' : w < 1240 ? 'tablet' : 'desktop');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Auto-open inspect panel on mobile when a slide is picked manually (not on scroll-sync)
  useEffect(() => {
    if (viewport !== 'mobile' || slides.length === 0) return;
    if (!manualSelectRef.current) return;
    manualSelectRef.current = false;
    setTab('edit');
  }, [selectedIdx, viewport, slides.length]);

  // ── Uploads ────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy('uploading');
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.files) throw new Error(json.error ?? 'Upload failed');
      const next: UploadedImage[] = json.files;
      setImages((prev) => [...prev, ...next]);
      setSlides((prev) => {
        const seeded = next.map((img, i) => ({
          path: img.path,
          url: img.url,
          title: topic || 'Untitled',
          body: '',
          kicker: `${String(prev.length + i + 1).padStart(2, '0')} / --`,
          accent: preset.accent,
          textAlign: preset.align,
        } as SlideData));
        return [...prev, ...seeded];
      });
      setStatus(`${next.length} uploaded`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setBusy('idle');
    }
  }, [topic, preset]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    uploadFiles(Array.from(list).filter((f) => f.type.startsWith('image/')));
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    uploadFiles(files);
  };

  // ── Generate captions ──────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!images.length) {
      setError('upload images first');
      return;
    }
    setBusy('generating');
    setError(null);
    setStatus('Analyzing images…');
    const platformLabel = {
      instagram: 'Instagram carousel',
      tiktok: 'TikTok / Reels',
      linkedin: 'LinkedIn document',
      x: 'X thread cover',
      pinterest: 'Pinterest pin',
      general: 'general social',
    }[platform];
    setReasoning([
      `▸ vision pipeline · gemma4:e4b (local) · writing for ${platformLabel}`,
      `▸ ${images.length} photo${images.length === 1 ? '' : 's'} queued · ${images.reduce((s, i) => s + i.size, 0) / 1024 | 0} KB total`,
      `▸ stage 1 · sending each photo to the vision model (your originals are untouched — a low-res proxy is used only for vision so Gemma runs fast)`,
    ]);
    setScanIdx(0);

    // Simulate per-image scanning during the Ollama round-trip.  The backend
    // processes them in parallel, but the animation makes it feel transparent.
    // We pace phases slower now because composer uses a wider/deeper beam.
    const scanTimer = setInterval(() => {
      setScanIdx((s) => (s + 1) % Math.max(1, images.length));
    }, 1800);
    const phaseTimer = setTimeout(() => {
      setReasoning((r) => [...r, `▸ detecting subjects · extracting mood + object tags`]);
    }, 1600);
    const phaseTimer2 = setTimeout(() => {
      setReasoning((r) => [...r, `▸ stage 2 · composing a ${platformLabel} carousel from vision notes`]);
    }, 4200);
    const phaseTimer3 = setTimeout(() => {
      setReasoning((r) => [...r, `▸ writing hook · tuning voice to ${platform} lingo`]);
    }, 7200);
    const phaseTimer4 = setTimeout(() => {
      setReasoning((r) => [...r, `▸ drafting caption + hashtags · ranking presets against palette + mood`]);
    }, 10400);

    try {
      const res = await fetch('/api/slides/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          tone,
          preset: presetId,
          autoPreset,
          platform,
          brand,
          images: images.map((i) => ({ path: i.path, name: i.name })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'generate failed');

      // Auto-preset: if user opted in, adopt whatever the server picked.
      const nextPresetId: string = json.presetId ?? presetId;
      if (nextPresetId !== presetId) setPresetId(nextPresetId);
      const nextPreset = getPreset(nextPresetId);

      if (json.suggestedPreset) {
        setSuggestion({
          id: json.suggestedPreset.id,
          label: json.suggestedPreset.label,
          reason: json.suggestedPreset.reason ?? '',
        });
      }

      const analyses: { path: string; dominant: string; palette: string[]; brightness?: number }[] = json.analyses ?? [];
      setAnalyses(analyses);
      const notes: VisionNote[] = Array.isArray(json.notes) ? json.notes : [];
      setVisionNotes(notes);

      // Replay the actual reasoning gemma returned, in order, as terminal lines.
      const discoveredLines: string[] = [];
      notes.forEach((n, i) => {
        const subject = (n.subject || '').trim();
        const mood = (n.mood || '').trim();
        const objs = Array.isArray(n.objects) ? n.objects.filter(Boolean).slice(0, 5).join(', ') : '';
        if (subject) discoveredLines.push(`◆ img ${String(i + 1).padStart(2, '0')} → "${subject}"`);
        if (mood || objs) discoveredLines.push(`  mood: ${mood || '—'}${objs ? ` · objects: ${objs}` : ''}`);
      });
      if (json.suggestedPreset?.label) {
        discoveredLines.push(`✓ auto-pick → ${json.suggestedPreset.label} · ${json.suggestedPreset.reason ?? ''}`);
      }
      if (typeof json.hook === 'string' && json.hook.trim()) {
        discoveredLines.push(`✓ hook → "${json.hook.trim()}"`);
      }
      const rawHashtags: string[] = Array.isArray(json.hashtags) ? json.hashtags : [];
      if (rawHashtags.length) {
        discoveredLines.push(`✓ hashtags → ${rawHashtags.map((t) => '#' + t).join(' ')}`);
      }
      setReasoning((prev) => [...prev, ...discoveredLines, `✓ ready · ${images.length} slides composed for ${platformLabel}`]);

      const slidesPayload: {
        title: string;
        body?: string;
        kicker?: string;
        accent?: string;
        textAlign?: 'start' | 'center' | 'end';
      }[] = json.slides ?? [];

      setSlides(() => images.map((img, i) => {
        const s = slidesPayload[i];
        const a = analyses.find((x) => x.path === img.path);
        const note = notes.find((n) => n.path === img.path);
        return {
          path: img.path,
          url: img.url,
          title: s?.title ?? (topic || 'Untitled'),
          body: s?.body ?? '',
          kicker: s?.kicker ?? `${String(i + 1).padStart(2, '0')} / ${String(images.length).padStart(2, '0')}`,
          accent: s?.accent ?? a?.palette?.[0] ?? nextPreset.accent,
          textAlign: s?.textAlign ?? nextPreset.align,
          notes: note?.subject ?? undefined,
          imageBrightness: typeof a?.brightness === 'number' ? a.brightness : undefined,
          inkMode: 'auto',
        } as SlideData;
      }));
      setHook(typeof json.hook === 'string' ? json.hook : '');
      setCaption(typeof json.caption === 'string' ? json.caption : '');
      setHashtags(rawHashtags.filter((t): t is string => typeof t === 'string'));
      setCta(typeof json.cta === 'string' ? json.cta : '');
      setStatus(typeof json.topic === 'string' ? `Theme · ${json.topic}` : 'Generated');
      if (autoPreset && json.autoPresetUsed) {
        setToast(`Auto-picked ${json.suggestedPreset?.label ?? nextPreset.label}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'generate failed');
      setReasoning((r) => [...r, `✗ ${e instanceof Error ? e.message : 'failed'}`]);
    } finally {
      clearInterval(scanTimer);
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);
      clearTimeout(phaseTimer3);
      clearTimeout(phaseTimer4);
      setBusy('idle');
    }
  }, [images, topic, tone, presetId, autoPreset, platform, brand]);

  // ── Export ────────────────────────────────────────────────────────────────

  const exportAll = useCallback(async (format: 'png' | 'pdf' | 'zip' = 'zip') => {
    if (!slides.length) return;
    setBusy('exporting');
    setError(null);
    setStatus(
      format === 'pdf' ? 'Composing PDF…' :
      format === 'zip' ? 'Packing ZIP…' :
      'Compositing slides…'
    );
    try {
      const res = await fetch('/api/slides/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspect,
          preset: presetId,
          brand,
          format,
          slides: slides.map((s) => ({
            path: s.path,
            title: s.title,
            body: s.body,
            kicker: s.kicker,
            accent: s.accent,
            textAlign: s.textAlign,
            tweaks: { ...deckTweaks, ...(s.tweaks ?? {}) },
            imageBrightness: s.imageBrightness,
            inkMode: s.inkMode,
            textOffset: s.textOffset,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'export failed');

      if (format === 'pdf') {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${json.base64}`;
        a.download = `visio-slides-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus(`PDF · ${json.pages} pages`);
      } else if (format === 'zip') {
        const a = document.createElement('a');
        a.href = `data:application/zip;base64,${json.base64}`;
        a.download = `visio-slides-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus(`ZIP · ${json.files} slides`);
      } else {
        // Single-file PNG path — only practical when there's 1 slide.  For
        // 2+ slides, always use ZIP (browsers block multi-download loops).
        const out: { index: number; base64: string; mime: string }[] = json.slides ?? [];
        if (out.length <= 1) {
          for (const s of out) {
            const a = document.createElement('a');
            a.href = `data:${s.mime};base64,${s.base64}`;
            a.download = `slide-${String(s.index + 1).padStart(2, '0')}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            await new Promise((r) => setTimeout(r, 80));
          }
          setStatus(`Exported ${out.length} slide${out.length === 1 ? '' : 's'}`);
        } else {
          // Multi-slide PNG request: repack on the client to a single ZIP
          // so the browser never blocks the download chain.
          const JSZipMod = (await import('jszip')).default;
          const zip = new JSZipMod();
          out.forEach((s) => {
            const bin = atob(s.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            zip.file(`slide-${String(s.index + 1).padStart(2, '0')}.png`, bytes);
          });
          const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `visio-slides-${Date.now()}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          setStatus(`ZIP · ${out.length} slides`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'export failed');
    } finally {
      setBusy('idle');
    }
  }, [slides, aspect, presetId, brand, deckTweaks]);

  // ── Per-slide editing ─────────────────────────────────────────────────────

  const updateSlide = (i: number, patch: Partial<SlideData>) => {
    setSlides((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  };

  // Push history on accent / alignment / tweaks / textAlign changes (discrete actions).
  const updateSlideDiscrete = (i: number, patch: Partial<SlideData>) => {
    pushHistory();
    updateSlide(i, patch);
  };

  const removeSlide = (i: number) => {
    pushHistory();
    setSlides((prev) => prev.filter((_, k) => k !== i));
    setImages((prev) => prev.filter((_, k) => k !== i));
    setSlideIds((prev) => prev.filter((_, k) => k !== i));
    setSelectedIdx((s) => (s >= i && s > 0 ? s - 1 : s));
  };

  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    pushHistory();
    setSlides((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setImages((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSlideIds((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSelectedIdx((s) => (s === i ? j : s === j ? i : s));
  };

  // Drag-and-drop reorder from dnd-kit
  const reorderSlides = (from: number, to: number) => {
    if (from === to) return;
    pushHistory();
    setSlides((prev) => arrayMove(prev, from, to));
    setImages((prev) => arrayMove(prev, from, to));
    setSlideIds((prev) => arrayMove(prev, from, to));
    setSelectedIdx(to);
  };

  // ── Duplicate a slide ─────────────────────────────────────────────────────
  const duplicateSlide = (i: number) => {
    pushHistory();
    setSlides((prev) => {
      const s = prev[i];
      if (!s) return prev;
      const copy: SlideData = { ...s, kicker: `${String(prev.length + 1).padStart(2, '0')} / ${String(prev.length + 1).padStart(2, '0')}` };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    setImages((prev) => {
      const s = prev[i];
      if (!s) return prev;
      return [...prev.slice(0, i + 1), { ...s }, ...prev.slice(i + 1)];
    });
    setSlideIds((prev) => {
      if (!prev[i]) return prev;
      const newId = `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev.slice(0, i + 1), newId, ...prev.slice(i + 1)];
    });
    setToast('Slide duplicated');
  };

  // ── Apply tweak from TweaksPanel ──────────────────────────────────────────
  const applyTweak = (next: SlideTweaks) => {
    if (tweakScope === 'deck') {
      pushHistory();
      setDeckTweaks(next);
    } else if (selected) {
      updateSlideDiscrete(selectedIdx, { tweaks: next });
    }
  };
  const resetTweaks = () => {
    if (tweakScope === 'deck') {
      pushHistory();
      setDeckTweaks({});
      setToast('Deck tweaks reset');
    } else if (selected) {
      updateSlideDiscrete(selectedIdx, { tweaks: {} });
      setToast('Slide tweaks reset');
    }
  };
  const activeTweaks: SlideTweaks = tweakScope === 'deck' ? deckTweaks : (selected?.tweaks ?? {});
  // Effective tweaks merge deck + slide
  const effectiveTweaksFor = (s: SlideData): SlideTweaks => ({ ...deckTweaks, ...(s.tweaks ?? {}) });
  const slidesForRender = useMemo(
    () => slides.map((s) => ({ ...s, tweaks: effectiveTweaksFor(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slides, deckTweaks]
  );

  // ── Tone / rewrite buttons ────────────────────────────────────────────────
  const rewriteSlide = useCallback(async (i: number, mode: 'shorter' | 'longer' | 'punchier' | 'formal' | 'casual' | 'poetic') => {
    const s = slides[i];
    if (!s) return;
    setBusy('rewriting');
    setError(null);
    try {
      const res = await fetch('/api/slides/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: s.title, bodyText: s.body ?? '', mode, preset: presetId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'rewrite failed');
      updateSlideDiscrete(i, { title: j.title, body: j.body });
      setToast(`Rewritten · ${mode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rewrite failed');
    } finally {
      setBusy('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, presetId]);

  // ── Variations (3 directions) ─────────────────────────────────────────────
  const makeVariations = useCallback(async (i: number) => {
    const s = slides[i];
    if (!s) return;
    setBusy('variations');
    setError(null);
    try {
      const pool = SLIDE_PRESETS.filter((p) => p.id !== presetId);
      const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, 3).map((p) => p.id);
      const role = i === 0 ? 'first' : i === slides.length - 1 ? 'last' : 'body';
      const results = await Promise.all(picks.map(async (pid) => {
        const res = await fetch('/api/slides/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePath: s.path,
            preset: pid,
            tone,
            topic,
            index: i,
            total: slides.length,
            role,
            prevTitles: slides.map((x) => x.title).filter((_, k) => k !== i),
          }),
        });
        const j = await res.json();
        if (!res.ok) return null;
        return { presetId: pid, slide: j.slide as Partial<SlideData> };
      }));
      const kept = results.filter((x): x is { presetId: string; slide: Partial<SlideData> } => !!x);
      if (!kept.length) throw new Error('No variations returned');
      setVariations(kept);
      setToast(`${kept.length} directions generated`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'variations failed');
    } finally {
      setBusy('idle');
    }
  }, [slides, presetId, tone, topic]);

  const applyVariation = (v: { presetId: string; slide: Partial<SlideData> }) => {
    pushHistory();
    setPresetId(v.presetId);
    updateSlide(selectedIdx, {
      title: v.slide.title ?? slides[selectedIdx]?.title ?? '',
      body: v.slide.body ?? '',
      kicker: v.slide.kicker ?? slides[selectedIdx]?.kicker,
      accent: v.slide.accent ?? slides[selectedIdx]?.accent,
      textAlign: v.slide.textAlign ?? slides[selectedIdx]?.textAlign,
    });
    setVariations(null);
    setToast('Direction applied');
  };

  // ── Regenerate one slide ──────────────────────────────────────────────────
  const regenerateOne = useCallback(async (i: number) => {
    const s = slides[i];
    if (!s) return;
    setRegenIdx(i);
    setBusy('regenerating');
    setError(null);
    try {
      const role = i === 0 ? 'first' : i === slides.length - 1 ? 'last' : 'body';
      const res = await fetch('/api/slides/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath: s.path,
          preset: presetId,
          tone,
          topic,
          index: i,
          total: slides.length,
          role,
          prevTitles: slides.map((x) => x.title).filter((t, k) => k !== i),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'regenerate failed');
      const ns = json.slide as Partial<SlideData>;
      pushHistory();
      updateSlide(i, {
        title: ns.title ?? s.title,
        body: ns.body ?? s.body,
        kicker: ns.kicker ?? s.kicker,
        accent: ns.accent ?? s.accent,
        textAlign: ns.textAlign ?? s.textAlign,
      });
      setToast(`Slide ${i + 1} refreshed`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'regenerate failed');
    } finally {
      setBusy('idle');
      setRegenIdx(null);
    }
  }, [slides, presetId, tone, topic, pushHistory]);

  // ── Copy post-ready caption to clipboard ──────────────────────────────────
  // Returns the social-native caption (hook + body + CTA + hashtags) when Gemma
  // produced one; otherwise falls back to a numbered list of slide titles so
  // the user always gets SOMETHING copyable.
  const buildSocialCaption = useCallback((): string => {
    const parts: string[] = [];
    if (hook && hook.trim()) parts.push(hook.trim());
    if (caption && caption.trim()) {
      // Avoid duplicating the hook if it's already at the top of the caption.
      const cap = caption.trim();
      if (hook && cap.startsWith(hook.trim())) {
        parts[parts.length - 1] = cap;
      } else {
        parts.push(cap);
      }
    }
    if (cta && cta.trim() && !(caption && caption.toLowerCase().includes(cta.toLowerCase()))) {
      parts.push(cta.trim());
    }
    if (hashtags.length) {
      parts.push(hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' '));
    }
    if (parts.length === 0 && slides.length) {
      return slides
        .map((s, i) => {
          const head = `${i + 1}. ${s.title}`;
          return s.body ? `${head}\n${s.body}` : head;
        })
        .join('\n\n');
    }
    return parts.join('\n\n');
  }, [hook, caption, cta, hashtags, slides]);

  const copyCaptions = useCallback(async () => {
    if (!slides.length) return;
    const text = buildSocialCaption();
    try {
      await navigator.clipboard.writeText(text);
      setToast('Caption copied · ready to paste');
    } catch {
      setToast('Copy failed');
    }
  }, [buildSocialCaption, slides.length]);

  // Rewrite just the caption / hashtags for the currently-selected platform —
  // no vision reprocessing.  Lets the user tweak tone or swap platform after
  // the carousel is already composed.
  const rewriteCaption = useCallback(async () => {
    if (!slides.length) return;
    setBusy('rewriting');
    setError(null);
    try {
      const res = await fetch('/api/slides/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          tone,
          topic,
          brand,
          slides: slides.map((s) => {
            const note = visionNotes.find((n) => n.path === s.path);
            return {
              title: s.title,
              body: s.body,
              subject: note?.subject ?? '',
              mood: note?.mood ?? '',
              objects: note?.objects ?? [],
            };
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'rewrite failed');
      if (typeof json.hook === 'string') setHook(json.hook);
      if (typeof json.caption === 'string') setCaption(json.caption);
      if (Array.isArray(json.hashtags)) setHashtags(json.hashtags);
      if (typeof json.cta === 'string') setCta(json.cta);
      setToast(`Caption rewritten for ${platform}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rewrite failed');
    } finally {
      setBusy('idle');
    }
  }, [slides, platform, tone, topic, brand, visionNotes]);

  // ── Shuffle preset ────────────────────────────────────────────────────────
  const shufflePreset = () => {
    const others = SLIDE_PRESETS.filter((p) => p.id !== presetId);
    const pick = others[Math.floor(Math.random() * others.length)];
    if (pick) {
      setPresetId(pick.id);
      setToast(`Switched to ${pick.label}`);
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      // Global: undo / redo (work even in fields — browsers usually block in textareas
      // which is what we want — but we still handle for buttons/page)
      if (mod && !inField) {
        if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      }

      if (inField) return;
      if (!slides.length) return;

      if (e.key === 'ArrowRight') { setSelectedIdx((x) => Math.min(slides.length - 1, x + 1)); }
      else if (e.key === 'ArrowLeft') { setSelectedIdx((x) => Math.max(0, x - 1)); }
      else if (e.key === 'e' || e.key === 'E') { setTab('edit'); }
      else if (e.key === 'p' || e.key === 'P') { setTab('preview'); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); setPresenting(true); }
      else if (e.key === 'd' || e.key === 'D') { if (e.shiftKey) duplicateSlide(selectedIdx); }
      else if (e.key === 'Escape') { setPresenting(false); setVariations(null); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setHeroZoom((z) => Math.min(2, Math.round((z + 0.1) * 100) / 100)); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setHeroZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100)); }
      else if (e.key === '0') { e.preventDefault(); setHeroZoom(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, selectedIdx, undo, redo]);

  // ── Preview sizing ────────────────────────────────────────────────────────
  // New layout:
  //   Desktop/tablet — a BIG hero slide (fills most of the main column, driven by mainW),
  //                    plus a thumbnail strip below for nav + drag-to-reorder.
  //   Mobile         — one full-bleed slide per row with scroll-snap + dots.
  const isGenerating = busy !== 'idle';
  const canExport = slides.length > 0 && busy === 'idle';

  // Native aspect ratio — for 'original' we fall back to 1:1 for layout math.
  const ratioW = previewAspectW;
  const ratioH = previewAspectH;
  const ratio = ratioW / ratioH;

  // HERO — fit inside the main column.  `mainW` is already the content-box
  // width (padding excluded by ResizeObserver), so no extra subtraction.  When
  // zoomed in past 1× we allow the hero to grow (and an inner pan wrapper
  // gives horizontal scroll), but by default it always fits edge-to-edge.
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
  const maxHeroH = Math.max(320, viewportH - 260);
  const innerW = Math.max(0, mainW - 8); // tiny safety gutter so the border doesn't clip
  const widthByW = Math.min(innerW, 1200);
  const widthByH = maxHeroH * ratio;
  const baseHeroWidth = Math.max(240, Math.min(widthByW, widthByH));
  // Applied zoom — hero can be shrunk to explore composition or grown to read copy
  const heroWidth = Math.max(180, Math.round(baseHeroWidth * heroZoom));

  // Thumbnail width — keep small
  const thumbWidth = 140;

  // Mobile: one full-bleed slide.
  const mobileWidth = Math.max(240, mainW - 8);

  return (
    <div className="slides-root">
      <TopStrip busy={busy} status={status} error={error} hook={hook} />

      <div className="slides-mobile-tabs">
        <button
          className="slides-mobile-tab"
          data-active={tab === 'setup'}
          onClick={() => setTab('setup')}
        >
          Setup
        </button>
        <button
          className="slides-mobile-tab"
          data-active={tab === 'preview'}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
        <button
          className="slides-mobile-tab"
          data-active={tab === 'edit'}
          onClick={() => setTab('edit')}
        >
          Edit
        </button>
      </div>

      <div className="slides-body">
        {/* LEFT / TOP — source & controls */}
        <aside
          className="slides-source slides-pane"
          data-active={tab === 'setup'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Section title="Source" open={true}>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `1px dashed ${dragOver ? '#ccff00' : '#333'}`,
                  background: dragOver ? 'rgba(204,255,0,0.05)' : '#0b0b0b',
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '0.15em', color: '#888', textTransform: 'uppercase' }}>
                  Drop images · tap to pick
                </div>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#555' }}>
                  2 – 10 per carousel · JPG / PNG / WebP
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />
              {images.length > 0 && (
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#666' }}>
                  {images.length} image{images.length === 1 ? '' : 's'} ready
                </div>
              )}
            </Section>

            <Section title="Platform" open={true}>
              <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#666', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Where will you post this?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { id: 'instagram', label: 'Instagram', hint: 'carousel · 8–12 tags' },
                  { id: 'tiktok', label: 'TikTok', hint: 'hook-first · 3–5 tags' },
                  { id: 'linkedin', label: 'LinkedIn', hint: 'insight · 0–3 tags' },
                  { id: 'x', label: 'X / Twitter', hint: 'punchy · 0–2 tags' },
                  { id: 'pinterest', label: 'Pinterest', hint: 'keyword · 5–10 tags' },
                  { id: 'general', label: 'General', hint: 'platform-neutral' },
                ] as const).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    style={{
                      padding: '10px 10px',
                      background: platform === p.id ? '#0f0f0f' : '#080808',
                      color: platform === p.id ? '#fff' : '#888',
                      border: `1px solid ${platform === p.id ? '#ccff00' : '#232323'}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 4,
                    }}
                    aria-pressed={platform === p.id}
                  >
                    <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>{p.label}</div>
                    <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {p.hint}
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Brief" open={true}>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe your vision..."
                rows={3}
                style={textareaStyle}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                <input 
                  value={tone} 
                  onChange={(e) => setTone(e.target.value)} 
                  placeholder="Tone (e.g. confident, playful, quiet)" 
                  style={inputStyle} 
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {TONES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      style={{
                        padding: '4px 10px',
                        fontFamily: 'var(--font-dm-mono)',
                        fontSize: 10,
                        background: tone === t ? '#ccff00' : 'transparent',
                        color: tone === t ? '#000' : '#888',
                        border: `1px solid ${tone === t ? '#ccff00' : '#2a2a2a'}`,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderRadius: 100,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Canvas">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {(Object.keys(ASPECT_RATIOS) as SlideAspect[]).map((key) => {
                  const sp = ASPECT_RATIOS[key];
                  const active = aspect === key;
                  // Mini preview rectangle — drawn to scale inside a 40×40 slot.
                  const box = 34;
                  const rW = sp.w || 1;
                  const rH = sp.h || 1;
                  const scale = box / Math.max(rW, rH);
                  const bw = Math.round(rW * scale);
                  const bh = Math.round(rH * scale);
                  return (
                    <button
                      key={key}
                      onClick={() => setAspect(key)}
                      style={{
                        padding: '8px 6px',
                        background: active ? '#0f0f0f' : '#080808',
                        color: active ? '#fff' : '#888',
                        border: `1px solid ${active ? '#ccff00' : '#232323'}`,
                        textAlign: 'center',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        minHeight: 78,
                      }}
                      aria-pressed={active}
                      title={sp.label}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: box,
                          height: box,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          style={{
                            width: key === 'original' ? box - 4 : bw,
                            height: key === 'original' ? box - 4 : bh,
                            borderWidth: 1.5,
                            borderStyle: key === 'original' ? 'dashed' : 'solid',
                            borderColor: active ? '#ccff00' : '#3a3a3a',
                            background: active ? 'rgba(204,255,0,0.08)' : 'transparent',
                            borderRadius: 2,
                          }}
                        />
                      </span>
                      <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em' }}>{key}</span>
                      <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1.2 }}>
                        {sp.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Typography preset">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAutoPreset((v) => !v)}
                  style={{
                    padding: '6px 12px',
                    fontFamily: 'var(--font-dm-mono)',
                    fontSize: 10,
                    background: autoPreset ? 'linear-gradient(135deg, #ccff00 0%, #a855f7 100%)' : 'transparent',
                    color: autoPreset ? '#000' : '#888',
                    border: `1px solid ${autoPreset ? 'transparent' : '#2a2a2a'}`,
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    borderRadius: 100,
                    fontWeight: autoPreset ? 800 : 400,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title="Let Gemma pick the best preset based on your photos"
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: autoPreset ? '#000' : '#444',
                      boxShadow: autoPreset ? '0 0 8px rgba(0,0,0,0.4)' : 'none',
                    }}
                  />
                  Auto-pilot {autoPreset ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={shufflePreset}
                  style={{
                    padding: '4px 10px',
                    fontFamily: 'var(--font-dm-mono)',
                    fontSize: 9,
                    background: 'transparent',
                    color: '#888',
                    border: '1px solid #2a2a2a',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    borderRadius: 100,
                  }}
                >
                  ⇄ Shuffle
                </button>
              </div>

              {suggestion && (
                <div style={{
                  marginBottom: 8,
                  padding: '8px 10px',
                  border: '1px dashed #ccff0040',
                  background: 'rgba(204,255,0,0.04)',
                  borderRadius: 4,
                  fontFamily: 'var(--font-dm-mono)',
                  fontSize: 10,
                  color: '#aaa',
                  lineHeight: 1.5,
                }}>
                  <div style={{ color: '#ccff00', letterSpacing: '0.15em', textTransform: 'uppercase', fontSize: 9, marginBottom: 2 }}>
                    Gemma suggests
                  </div>
                  <div>
                    <strong style={{ color: '#fff' }}>{suggestion.label}</strong>
                    {suggestion.reason ? <span style={{ color: '#777' }}> · {suggestion.reason}</span> : null}
                  </div>
                  {presetId !== suggestion.id && (
                    <button
                      onClick={() => { setPresetId(suggestion.id); setToast(`Applied ${suggestion.label}`); }}
                      style={{
                        marginTop: 6,
                        padding: '3px 8px',
                        fontFamily: 'var(--font-dm-mono)',
                        fontSize: 9,
                        background: '#ccff00',
                        color: '#000',
                        border: 'none',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        borderRadius: 100,
                        fontWeight: 700,
                      }}
                    >
                      Apply
                    </button>
                  )}
                </div>
              )}

              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  value={presetFilter}
                  onChange={(e) => setPresetFilter(e.target.value)}
                  placeholder={`Search ${SLIDE_PRESETS.length} presets…`}
                  aria-label="Filter presets"
                  style={{
                    ...inputStyle,
                    padding: '8px 10px 8px 30px',
                    fontSize: 11,
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontFamily: 'var(--font-dm-mono)',
                    fontSize: 11,
                    color: '#555',
                  }}
                >
                  ⌕
                </span>
                {presetFilter && (
                  <button
                    onClick={() => setPresetFilter('')}
                    aria-label="Clear filter"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 2,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {(() => {
                const q = presetFilter.trim().toLowerCase();
                const filtered = q
                  ? SLIDE_PRESETS.filter((p) =>
                      p.label.toLowerCase().includes(q) ||
                      p.blurb.toLowerCase().includes(q) ||
                      p.id.toLowerCase().includes(q) ||
                      p.overlay.toLowerCase().includes(q)
                    )
                  : SLIDE_PRESETS;
                // Always surface the active preset even if filtered out.
                const hasActive = filtered.some((p) => p.id === presetId);
                const active = SLIDE_PRESETS.find((p) => p.id === presetId);
                const list = !hasActive && active ? [active, ...filtered] : filtered;
                return (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 4,
                        maxHeight: 340,
                        overflowY: 'auto',
                        paddingRight: 4,
                        border: '1px solid #141414',
                        background: '#050505',
                        borderRadius: 4,
                        padding: 4,
                      }}
                    >
                      {list.length === 0 && (
                        <div style={{ padding: 14, textAlign: 'center', fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#555', letterSpacing: '0.1em' }}>
                          No presets match &ldquo;{presetFilter}&rdquo;
                        </div>
                      )}
                      {list.map((p) => {
                        const isActive = presetId === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setPresetId(p.id)}
                            title={`${p.label} — ${p.blurb}`}
                            style={{
                              padding: '7px 10px',
                              background: isActive ? '#0f0f0f' : 'transparent',
                              color: isActive ? '#fff' : '#888',
                              border: `1px solid ${isActive ? p.accent : 'transparent'}`,
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              borderRadius: 3,
                              minHeight: 40,
                            }}
                            aria-pressed={isActive}
                          >
                            <span
                              aria-hidden
                              style={{
                                width: 22,
                                height: 22,
                                flexShrink: 0,
                                background: p.accent,
                                border: `1px solid ${isActive ? '#fff3' : 'rgba(255,255,255,0.06)'}`,
                                boxShadow: isActive ? `0 0 0 2px ${p.accent}30` : 'none',
                                borderRadius: 2,
                              }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                              <span
                                style={{
                                  fontFamily: p.titleFontVar,
                                  fontWeight: p.titleWeight,
                                  fontSize: 13,
                                  letterSpacing: p.titleTracking,
                                  color: isActive ? '#fff' : '#ccc',
                                  textTransform: p.titleCase === 'upper' ? 'uppercase' : 'none',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  lineHeight: 1.2,
                                }}
                              >
                                {p.label}
                              </span>
                              {isActive && (
                                <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#666', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
                                  {p.blurb}
                                </span>
                              )}
                            </div>
                            <span
                              aria-hidden
                              style={{
                                fontFamily: 'var(--font-dm-mono)',
                                fontSize: 8,
                                color: isActive ? p.accent : '#333',
                                letterSpacing: '0.15em',
                                textTransform: 'uppercase',
                                flexShrink: 0,
                              }}
                            >
                              {isActive ? '●' : p.overlay.slice(0, 4)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 6, fontFamily: 'var(--font-dm-mono)', fontSize: 8, color: '#444', letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'right' }}>
                      {list.length} / {SLIDE_PRESETS.length} presets
                    </div>
                  </>
                );
              })()}
            </Section>

            <Section title="Brand">
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Your Brand" style={inputStyle} />
            </Section>

            {slides.length > 0 && (
              <Section title="Stats" open={false}>
                <StatsGrid slides={slides} />
              </Section>
            )}

          </div>

          {/* Sticky Actions */}
          <div style={{
            position: 'sticky', bottom: -16, background: '#060606',
            paddingTop: 16, marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
            borderTop: '1px solid #1a1a1a', marginInline: -16, paddingInline: 16, paddingBottom: 16,
            zIndex: 20,
          }}>
            <button
              className="btn-primary"
              onClick={generate}
              disabled={isGenerating || !images.length}
            >
              {busy === 'generating' ? '◉ READING…' : '✨ GENERATE SLIDES'}
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => exportAll('zip')}
                disabled={!canExport || !slides.length}
                style={{ padding: '10px 8px', fontSize: 11 }}
                title="Download all slides in a single ZIP"
              >
                {busy === 'exporting' ? 'EXPORTING…' : `↓ ZIP${slides.length ? ` ×${slides.length}` : ''}`}
              </button>
              <button
                className="btn-ghost"
                onClick={() => exportAll('pdf')}
                disabled={!canExport || !slides.length}
                style={{ padding: '10px 8px', fontSize: 11 }}
                title="Download as a single PDF"
              >
                ↓ PDF
              </button>
              <button
                className="btn-ghost"
                onClick={copyCaptions}
                disabled={!slides.length}
                style={{ padding: '10px 8px', fontSize: 11 }}
                title="Copy hook + caption + hashtags — paste straight into your post"
              >
                📋 CAPTION
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER — carousel preview */}
        <main
          className="slides-main slides-pane"
          data-active={tab === 'preview'}
          ref={mainRef}
        >
          {slides.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <h1 className="fluid-h1">Carousel preview</h1>
                  <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    {slides.length} slide{slides.length === 1 ? '' : 's'} · {aspect} · {preset.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <IconBtn label="↺ Undo" onClick={undo} disabled={!canUndo} />
                  <IconBtn label="↻ Redo" onClick={redo} disabled={!canRedo} />
                  <IconBtn label="⛶ Present" onClick={() => setPresenting(true)} />
                </div>
              </header>

              {viewport === 'mobile' ? (
                <MobileCarousel
                  slides={slidesForRender}
                  preset={preset}
                  aspect={aspect}
                  brand={brand}
                  singleWidth={mobileWidth}
                  selectedIdx={selectedIdx}
                  onSelect={(i) => { manualSelectRef.current = true; setSelectedIdx(i); }}
                  onScrollSelect={(i) => { manualSelectRef.current = false; setSelectedIdx(i); }}
                  onMove={moveSlide}
                  onRemove={removeSlide}
                  onRegen={regenerateOne}
                  onDuplicate={duplicateSlide}
                  regenIdx={regenIdx}
                  busy={busy}
                  onEdit={() => setTab('edit')}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', width: '100%' }}>
                  {/* BIG HERO SLIDE */}
                  <div style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      fontFamily: 'var(--font-dm-mono)',
                      fontSize: 10,
                      color: '#666',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                    }}>
                      <span>
                        Slide {String(selectedIdx + 1).padStart(2, '0')} of {String(slides.length).padStart(2, '0')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => setHeroZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))}
                          aria-label="Zoom out"
                          title="Zoom out"
                          style={zoomBtnStyle}
                        >−</button>
                        <button
                          onClick={() => setHeroZoom(1)}
                          aria-label="Reset zoom"
                          title="Reset zoom"
                          style={{ ...zoomBtnStyle, minWidth: 56 }}
                        >{Math.round(heroZoom * 100)}%</button>
                        <button
                          onClick={() => setHeroZoom((z) => Math.min(2, Math.round((z + 0.1) * 100) / 100))}
                          aria-label="Zoom in"
                          title="Zoom in"
                          style={zoomBtnStyle}
                        >+</button>
                        <span style={{ marginInline: 8, color: '#2a2a2a' }}>│</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span
                            aria-hidden
                            style={{
                              width: 8,
                              height: 8,
                              background: selected?.accent ?? preset.accent,
                              boxShadow: `0 0 6px ${(selected?.accent ?? preset.accent)}80`,
                              borderRadius: 2,
                            }}
                          />
                          accent
                        </span>
                      </div>
                    </div>

                    {/* Pan wrapper — scrolls horizontally ONLY when heroWidth > container */}
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        overflowX: heroWidth > mainW ? 'auto' : 'hidden',
                        overflowY: 'hidden',
                        display: 'flex',
                        justifyContent: heroWidth > mainW ? 'flex-start' : 'center',
                        background: '#050505',
                        border: '1px solid #111',
                        cursor: heroZoom > 1 ? 'zoom-out' : 'zoom-in',
                      }}
                      onDoubleClick={(e) => {
                        // Click-to-zoom: ignore double-clicks that originate in the text
                        // block (those reset text position).  Look up the DOM tree to see
                        // if we're in a grabbable text wrapper.
                        const target = e.target as HTMLElement;
                        if (target.closest?.('[data-slide-text="true"]')) return;
                        setHeroZoom((z) => (z > 1 ? 1 : 1.5));
                      }}
                      title="Double-click to zoom · drag text to reposition"
                    >
                      {slidesForRender[selectedIdx] && (
                        <SlideFrame
                          key={`hero-${slideIds[selectedIdx] ?? selectedIdx}`}
                          slide={slidesForRender[selectedIdx]}
                          preset={preset}
                          aspect={aspect}
                          index={selectedIdx}
                          total={slides.length}
                          brand={brand}
                          width={heroWidth}
                          selected={false}
                          onTextMove={(offset) => {
                            pushHistory();
                            updateSlide(selectedIdx, { textOffset: offset ?? undefined });
                            setToast(offset ? 'Text repositioned' : 'Text reset');
                          }}
                        />
                      )}
                    </div>

                    {/* Seek slider — jump to any slide */}
                    {slides.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#666', letterSpacing: '0.1em' }}>
                          {String(selectedIdx + 1).padStart(2, '0')}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={slides.length - 1}
                          step={1}
                          value={selectedIdx}
                          onChange={(e) => {
                            manualSelectRef.current = true;
                            setSelectedIdx(parseInt(e.target.value, 10));
                          }}
                          aria-label="Jump to slide"
                          style={{ flex: 1, accentColor: '#ccff00' }}
                        />
                        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#666', letterSpacing: '0.1em' }}>
                          {String(slides.length).padStart(2, '0')}
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
                      <IconBtn label="← Prev" onClick={() => { manualSelectRef.current = true; setSelectedIdx((x) => Math.max(0, x - 1)); }} disabled={selectedIdx === 0} />
                      <IconBtn label={regenIdx === selectedIdx ? '…' : '↻ Refresh'} onClick={() => regenerateOne(selectedIdx)} disabled={busy !== 'idle'} />
                      <IconBtn label="⎘ Duplicate" onClick={() => duplicateSlide(selectedIdx)} disabled={busy !== 'idle'} />
                      <IconBtn label="3 directions" onClick={() => makeVariations(selectedIdx)} disabled={busy !== 'idle'} />
                      <IconBtn label="× Remove" onClick={() => removeSlide(selectedIdx)} danger />
                      <IconBtn label="Next →" onClick={() => { manualSelectRef.current = true; setSelectedIdx((x) => Math.min(slides.length - 1, x + 1)); }} disabled={selectedIdx === slides.length - 1} />
                    </div>

                    {/* ── EXPORT — placed right where the eye lands after reviewing ── */}
                    <InlineExport
                      count={slides.length}
                      busy={busy}
                      canExport={canExport}
                      preset={preset.label}
                      aspect={aspect}
                      onExportZip={() => exportAll('zip')}
                      onExportPdf={() => exportAll('pdf')}
                      onExportPng={() => exportAll('png')}
                      onCopyCaption={copyCaptions}
                      hasCaption={!!(caption || hook || hashtags.length)}
                    />
                  </div>

                  {/* THUMBNAIL STRIP — drag to reorder */}
                  {slides.length > 1 && slideIds.length === slides.length && (
                    <div style={{ width: '100%', maxWidth: '100%', paddingTop: 4 }}>
                      <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Drag to reorder
                      </div>
                      <ThumbStrip
                        slides={slidesForRender}
                        ids={slideIds}
                        preset={preset}
                        aspect={aspect}
                        brand={brand}
                        width={thumbWidth}
                        selectedIdx={selectedIdx}
                        onSelect={(i) => { manualSelectRef.current = true; setSelectedIdx(i); }}
                        onReorder={reorderSlides}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* RIGHT / BOTTOM — inspector */}
        <aside
          className="slides-inspect slides-pane"
          data-active={tab === 'edit'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {selected ? (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                      Slide {selectedIdx + 1} / {slides.length}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <IconBtn
                        label={regenIdx === selectedIdx ? '…' : '↻'}
                        onClick={() => regenerateOne(selectedIdx)}
                        disabled={busy !== 'idle'}
                      />
                      <IconBtn
                        label="⎘"
                        onClick={() => duplicateSlide(selectedIdx)}
                        disabled={busy !== 'idle'}
                      />
                      <IconBtn label="⛶" onClick={() => setPresenting(true)} />
                    </div>
                  </div>
                  {/* LIVE mini-SlideFrame — shows typography + text as rendered */}
                  <InspectorPreview
                    slide={{ ...selected, tweaks: effectiveTweaksFor(selected) }}
                    preset={preset}
                    aspect={aspect}
                    index={selectedIdx}
                    total={slides.length}
                    brand={brand}
                  />
                </div>

                {/* Gemma reasoning — what the vision model saw for this slide */}
                <GemmaReasoningCard
                  note={visionNotes.find((n) => n.path === selected.path)}
                  analysis={analyses.find((a) => a?.path === selected.path) ?? null}
                />

                {/* Post copy — the social-native caption Gemma wrote for THIS platform */}
                {(caption || hook || hashtags.length > 0) && (
                  <CaptionCard
                    platform={platform}
                    hook={hook}
                    caption={caption}
                    cta={cta}
                    hashtags={hashtags}
                    busy={busy === 'rewriting'}
                    onEditCaption={setCaption}
                    onEditHook={setHook}
                    onEditCta={setCta}
                    onCopy={copyCaptions}
                    onRewrite={rewriteCaption}
                    onRemoveTag={(t) => setHashtags((prev) => prev.filter((x) => x !== t))}
                    onAddTag={(t) => {
                      const clean = t.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
                      if (clean && /^[a-z0-9_]+$/.test(clean)) {
                        setHashtags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
                      }
                    }}
                  />
                )}

                <Field label={`Title · ${selected.title.length}/${preset.maxTitleChars} chars`}>
                  <textarea
                    value={selected.title}
                    onChange={(e) => updateSlide(selectedIdx, { title: e.target.value })}
                    rows={2}
                    style={textareaStyle}
                  />
                </Field>

                <Field label={`Body · ${(selected.body ?? '').length}/${preset.maxBodyChars} chars`}>
                  <textarea
                    value={selected.body ?? ''}
                    onChange={(e) => updateSlide(selectedIdx, { body: e.target.value })}
                    rows={3}
                    style={textareaStyle}
                  />
                </Field>

                <Field label="Kicker">
                  <input
                    value={selected.kicker ?? ''}
                    onChange={(e) => updateSlide(selectedIdx, { kicker: e.target.value })}
                    style={inputStyle}
                  />
                </Field>

                {/* TONE rewrite buttons — local AI reruns the copy with a new energy */}
                <Field label={busy === 'rewriting' ? 'Rewriting…' : 'Rewrite tone'}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                    {([
                      { key: 'shorter', label: '– Shorter' },
                      { key: 'longer', label: '+ Longer' },
                      { key: 'punchier', label: '⚡ Punchier' },
                      { key: 'formal', label: 'Formal' },
                      { key: 'casual', label: 'Casual' },
                      { key: 'poetic', label: 'Poetic' },
                    ] as const).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => rewriteSlide(selectedIdx, t.key)}
                        disabled={busy !== 'idle'}
                        style={{
                          padding: '8px 0',
                          background: 'transparent',
                          border: '1px solid #222',
                          color: busy === 'rewriting' ? '#444' : '#aaa',
                          fontFamily: 'var(--font-dm-mono)',
                          fontSize: 9,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
                          borderRadius: 3,
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Accent colour">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={selected.accent ?? preset.accent}
                      onChange={(e) => updateSlide(selectedIdx, { accent: e.target.value })}
                      style={{ width: 40, height: 32, background: 'transparent', border: '1px solid #222', cursor: 'pointer', padding: 0 }}
                    />
                    <input
                      value={selected.accent ?? preset.accent}
                      onChange={(e) => updateSlide(selectedIdx, { accent: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  {/* Quick swatches — vision palette (if available) merged with preset + neutrals */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const visionPalette = analyses[selectedIdx]?.palette ?? [];
                      const fallback = ['#ccff00', '#ff3d3d', '#00f0ff', '#ffb72a', '#a855f7'];
                      const merged: string[] = [];
                      const push = (c: string | undefined) => {
                        if (!c) return;
                        const key = c.toLowerCase();
                        if (merged.some((m) => m.toLowerCase() === key)) return;
                        merged.push(c);
                      };
                      push(preset.accent);
                      visionPalette.forEach(push);
                      fallback.forEach(push);
                      push('#ffffff');
                      push('#000000');
                      return merged.slice(0, 10);
                    })().map((c, i) => {
                      const isVision =
                        i > 0 &&
                        (analyses[selectedIdx]?.palette ?? []).some((p) => p.toLowerCase() === c.toLowerCase());
                      return (
                        <button
                          key={c + i}
                          onClick={() => updateSlideDiscrete(selectedIdx, { accent: c })}
                          aria-label={`Accent ${c}${isVision ? ' (from image)' : ''}`}
                          title={isVision ? 'From image' : c}
                          style={{
                            width: 22,
                            height: 22,
                            background: c,
                            border: `1px solid ${(selected.accent ?? preset.accent).toLowerCase() === c.toLowerCase() ? '#fff' : isVision ? '#ccff00' : '#2a2a2a'}`,
                            cursor: 'pointer',
                            padding: 0,
                            borderRadius: 4,
                            position: 'relative',
                          }}
                        />
                      );
                    })}
                  </div>
                </Field>

                <Field label="Alignment">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                    {(['start', 'center', 'end'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => updateSlideDiscrete(selectedIdx, { textAlign: a })}
                        style={{
                          padding: '10px 0',
                          background: (selected.textAlign ?? preset.align) === a ? '#ccff00' : 'transparent',
                          color: (selected.textAlign ?? preset.align) === a ? '#000' : '#888',
                          border: `1px solid ${(selected.textAlign ?? preset.align) === a ? '#ccff00' : '#222'}`,
                          fontFamily: 'var(--font-dm-mono)',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                          borderRadius: 4,
                        }}
                      >
                        {a === 'start' ? '← Left' : a === 'center' ? '↔ Center' : 'Right →'}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={`Text color${selected.imageBrightness != null ? ` · image lum ${Math.round(selected.imageBrightness * 100)}%` : ''}`}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                    {([
                      { id: 'auto', label: 'Auto', hint: 'match image' },
                      { id: 'light', label: '☀ Light', hint: 'force white' },
                      { id: 'dark', label: '☾ Dark', hint: 'force black' },
                    ] as const).map((m) => {
                      const active = (selected.inkMode ?? 'auto') === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => updateSlideDiscrete(selectedIdx, { inkMode: m.id })}
                          title={m.hint}
                          style={{
                            padding: '10px 6px',
                            background: active ? '#ccff00' : 'transparent',
                            color: active ? '#000' : '#bbb',
                            border: `1px solid ${active ? '#ccff00' : '#222'}`,
                            fontFamily: 'var(--font-dm-mono)',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            cursor: 'pointer',
                            borderRadius: 4,
                          }}
                          aria-pressed={active}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {/* Speaker notes — shown in Present mode, used for decks */}
                <details>
                  <summary style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#777', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', padding: '4px 0' }}>
                    🗒 Speaker notes {selected.notes ? `· ${selected.notes.length}` : ''}
                  </summary>
                  <textarea
                    value={selected.notes ?? ''}
                    onChange={(e) => updateSlide(selectedIdx, { notes: e.target.value })}
                    rows={3}
                    placeholder="Notes visible in present mode, not on the slide itself."
                    style={{ ...textareaStyle, marginTop: 6 }}
                  />
                </details>

                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', borderTop: '1px dashed #1a1a1a', paddingTop: 12, marginTop: 8, lineHeight: 1.8 }}>
                  <span style={{ color: '#666' }}>↹</span> shortcuts:{' '}
                  <kbd style={kbdStyle}>←</kbd>/<kbd style={kbdStyle}>→</kbd> nav ·{' '}
                  <kbd style={kbdStyle}>E</kbd>/<kbd style={kbdStyle}>P</kbd> tabs ·{' '}
                  <kbd style={kbdStyle}>F</kbd> present ·{' '}
                  <kbd style={kbdStyle}>⇧D</kbd> dup ·{' '}
                  <kbd style={kbdStyle}>⌘Z</kbd>/<kbd style={kbdStyle}>⌘⇧Z</kbd> undo
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.15em', padding: '12px 0' }}>
                Select a slide to edit
              </div>
            )}
          </div>
        </aside>
      </div>

      <BottomStrip />

      {/* Floating Tweaks panel (Claude Design-style live controls) */}
      {slides.length > 0 && (
        <TweaksPanel
          tweaks={activeTweaks}
          scope={tweakScope}
          onChange={applyTweak}
          onScope={setTweakScope}
          onReset={resetTweaks}
        />
      )}

      {/* Full-screen presenter mode */}
      {presenting && slides.length > 0 && (
        <PresentMode
          slides={slidesForRender}
          preset={preset}
          aspect={aspect}
          brand={brand}
          startIdx={selectedIdx}
          onClose={() => setPresenting(false)}
          onIndexChange={(i) => { manualSelectRef.current = false; setSelectedIdx(i); }}
        />
      )}

      {/* Variations overlay — 3 alternate directions generated in parallel */}
      {variations && slides.length > 0 && (
        <VariationsOverlay
          variations={variations}
          baseSlide={slides[selectedIdx]}
          aspect={aspect}
          brand={brand}
          slideIndex={selectedIdx}
          total={slides.length}
          effectiveTweaks={effectiveTweaksFor(slides[selectedIdx])}
          onApply={applyVariation}
          onClose={() => setVariations(null)}
        />
      )}

      {/* Gemma live-reasoning overlay — shown while generating */}
      {busy === 'generating' && images.length > 0 && (
        <GenerationOverlay
          images={images}
          scanIdx={scanIdx}
          analyses={analyses}
          reasoning={reasoning}
          onToggle={() => setShowReasoning((v) => !v)}
          showReasoning={showReasoning}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0a0a0a',
            border: '1px solid #2a2a2a',
            color: '#ccff00',
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '10px 18px',
            borderRadius: 100,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5), 0 0 20px rgba(204,255,0,0.15)',
            zIndex: 100,
            animation: 'fade-up 0.3s ease both',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Stats grid ──────────────────────────────────────────────────────────────
function StatsGrid({ slides }: { slides: SlideData[] }) {
  const totalWords = slides.reduce((acc, s) => acc + (s.title + ' ' + (s.body ?? '')).trim().split(/\s+/).filter(Boolean).length, 0);
  const avgTitle = Math.round(slides.reduce((acc, s) => acc + s.title.length, 0) / slides.length);
  const avgBody = Math.round(slides.reduce((acc, s) => acc + (s.body ?? '').length, 0) / slides.length);
  const tiles = [
    { label: 'Slides', value: slides.length, color: '#ccff00' },
    { label: 'Words', value: totalWords, color: '#a855f7' },
    { label: 'Avg title', value: avgTitle, color: '#00f0ff' },
    { label: 'Avg body', value: avgBody, color: '#ffb72a' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            padding: '10px 12px',
            border: `1px solid ${t.color}30`,
            background: `${t.color}08`,
            borderRadius: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div style={{ fontFamily: 'var(--font-syne)', fontSize: 24, fontWeight: 800, color: t.color, lineHeight: 1 }}>
            {t.value}
          </div>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile snap carousel ─────────────────────────────────────────────────────

function MobileCarousel({
  slides, preset, aspect, brand, singleWidth, selectedIdx, onSelect, onScrollSelect, onMove, onRemove, onEdit, onRegen, onDuplicate, regenIdx, busy,
}: {
  slides: SlideData[];
  preset: ReturnType<typeof getPreset>;
  aspect: SlideAspect;
  brand: string;
  singleWidth: number;
  selectedIdx: number;
  onSelect: (i: number) => void;
  onScrollSelect: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
  onEdit: () => void;
  onRegen: (i: number) => void;
  onDuplicate: (i: number) => void;
  regenIdx: number | null;
  busy: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Pick the slide whose centre is closest to viewport centre on scroll-stop
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const kids = Array.from(el.children) as HTMLElement[];
        const cx = el.scrollLeft + el.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        kids.forEach((k, i) => {
          const kc = k.offsetLeft + k.clientWidth / 2;
          const d = Math.abs(kc - cx);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        onScrollSelect(best);
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); if (t) clearTimeout(t); };
  }, [onScrollSelect]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 8,
          marginInline: -16,
          paddingInline: 16,
        }}
      >
        {slides.map((s, i) => (
          <div key={i} style={{ scrollSnapAlign: 'center', flexShrink: 0 }}>
            <SlideFrame
              slide={s}
              preset={preset}
              aspect={aspect}
              index={i}
              total={slides.length}
              brand={brand}
              width={singleWidth}
              selected={i === selectedIdx}
              onSelect={() => onSelect(i)}
            />
          </div>
        ))}
      </div>

      {/* Slide controls for the currently-focused slide */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: 28,
                height: 4,
                background: i === selectedIdx ? '#ccff00' : '#2a2a2a',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconBtn label="←" onClick={() => onMove(selectedIdx, -1)} disabled={selectedIdx === 0} />
          <IconBtn label="→" onClick={() => onMove(selectedIdx, 1)} disabled={selectedIdx === slides.length - 1} />
          <IconBtn label={regenIdx === selectedIdx ? '…' : '↻'} onClick={() => onRegen(selectedIdx)} disabled={busy !== 'idle'} />
          <IconBtn label="⎘" onClick={() => onDuplicate(selectedIdx)} disabled={busy !== 'idle'} />
          <IconBtn label="Edit" onClick={onEdit} />
          <IconBtn label="×" onClick={() => onRemove(selectedIdx)} danger />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TopStrip({ busy, status, error, hook }: { busy: string; status: string; error: string | null; hook: string }) {
  return (
    <header style={{
      minHeight: 54,
      borderBottom: '1px solid #1a1a1a',
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      gap: 12,
      background: 'linear-gradient(180deg, #0c0c0c 0%, #070707 100%)',
      flexShrink: 0,
      flexWrap: 'wrap',
      position: 'relative',
    }}>
      {/* Animated gradient accent line */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -1,
          height: 1,
          background: 'linear-gradient(90deg, transparent 0%, #ccff00 20%, #a855f7 50%, #00f0ff 80%, transparent 100%)',
          opacity: busy !== 'idle' ? 1 : 0.35,
          transition: 'opacity 0.3s ease',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <defs>
            <linearGradient id="logo-g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ccff00" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <rect width="18" height="18" fill="url(#logo-g)">
            <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" repeatCount="indefinite" />
          </rect>
          <rect x="4" y="4" width="10" height="10" fill="#060606" />
          <rect x="7" y="7" width="4" height="4" fill="url(#logo-g)" />
        </svg>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em' }}>
          VISIO SLIDES
        </span>
      </div>

      <nav style={{ display: 'flex', gap: 4 }}>
        <Link href="/editor" style={navLink}>Video</Link>
        <span style={{ ...navLink, background: '#111', borderColor: '#ccff0033', color: '#fff' }}>Slides</span>
      </nav>

      <div style={{ flex: 1, minWidth: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-dm-mono)', fontSize: 11, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {busy !== 'idle' && (
          <span style={{ color: '#ccff00', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccff00', animation: 'pulse-ring 1.4s ease-in-out infinite' }} />
            {busy}
          </span>
        )}
        {hook && busy === 'idle' && (
          <span style={{ color: '#888', letterSpacing: '0.02em', fontStyle: 'italic', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            &ldquo;{hook}&rdquo;
          </span>
        )}
        {status && (
          <span style={{ color: '#666', letterSpacing: '0.08em' }}>{status}</span>
        )}
        {error && (
          <span style={{ color: '#ef4444', letterSpacing: '0.08em' }}>{error}</span>
        )}
      </div>
    </header>
  );
}

function BottomStrip() {
  return (
    <footer style={{
      borderTop: '1px solid #1a1a1a',
      padding: '10px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      fontFamily: 'var(--font-dm-mono)',
      fontSize: 9,
      color: '#444',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      <span>Local-first · no data leaves your machine</span>
      <span>IG · LinkedIn · TikTok · X · Pinterest</span>
    </footer>
  );
}

function Section({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="slides-section-details" open={open}>
      <summary className="slides-section-summary">
        {title}
      </summary>
      <div className="slides-section-content">
        {children}
      </div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 36,
        height: 34,
        padding: '0 10px',
        background: 'transparent',
        border: `1px solid ${danger ? '#3a0f0f' : '#242424'}`,
        color: disabled ? '#333' : danger ? '#ef4444' : '#888',
        fontFamily: 'var(--font-dm-mono)',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ─── Gemma generation overlay — shows what the model is reading + reasoning ─
function GenerationOverlay({
  images, scanIdx, analyses, reasoning, onToggle, showReasoning,
}: {
  images: UploadedImage[];
  scanIdx: number;
  analyses: Array<{ path: string; dominant: string; palette: string[] } | null>;
  reasoning: string[];
  onToggle: () => void;
  showReasoning: boolean;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [reasoning]);
  return (
    <div
      aria-live="polite"
      aria-label="Gemma is reading your images"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 140,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(16px, 3vw, 40px)',
      }}
    >
      {/* local keyframes scoped via <style> — safe to repeat */}
      <style>{`
        @keyframes gemma-scan {
          0%   { transform: translateY(-8%); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(108%); opacity: 0; }
        }
        @keyframes gemma-pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes gemma-dot {
          0%, 80%, 100% { opacity: 0.25; }
          40%           { opacity: 1; }
        }
        @keyframes gemma-grid-drift {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(-32px, -32px); }
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: 960,
        display: 'grid',
        gridTemplateColumns: showReasoning ? '1fr 1fr' : '1fr',
        gap: 14,
      }}>
        {/* ─── Scanning images panel ─────────────────────────────────────── */}
        <div style={{
          position: 'relative',
          background: '#050505',
          border: '1px solid #1a1a1a',
          borderRadius: 6,
          padding: 14,
          overflow: 'hidden',
          minHeight: 280,
        }}>
          {/* animated grid backdrop */}
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage:
                'linear-gradient(rgba(204,255,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,0.05) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              animation: 'gemma-grid-drift 4s linear infinite',
              opacity: 0.6,
            }}
          />

          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#ccff00',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: '#ccff00', boxShadow: '0 0 12px #ccff00' }} />
              Gemma · vision
            </span>
            <span style={{ color: '#666' }}>
              {String(scanIdx + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}
            </span>
          </div>

          <div style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, images.length))}, 1fr)`,
            gap: 8,
          }}>
            {images.slice(0, 6).map((img, i) => {
              const isActive = i === scanIdx;
              const a = analyses[i];
              const dom = a?.dominant ?? '#222';
              return (
                <div
                  key={img.path}
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    overflow: 'hidden',
                    border: `1px solid ${isActive ? '#ccff00' : '#1f1f1f'}`,
                    borderRadius: 3,
                    transition: 'border-color 0.3s ease',
                  }}
                >
                  {/* image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      filter: isActive ? 'none' : 'grayscale(0.4) brightness(0.7)',
                      transition: 'filter 0.35s ease',
                    }}
                  />
                  {/* scanline (only on active) */}
                  {isActive && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0, right: 0, top: 0,
                        height: '18%',
                        background:
                          'linear-gradient(to bottom, rgba(204,255,0,0) 0%, rgba(204,255,0,0.28) 50%, rgba(204,255,0,0) 100%)',
                        boxShadow: '0 0 22px rgba(204,255,0,0.6)',
                        animation: 'gemma-scan 1.4s linear infinite',
                      }}
                    />
                  )}
                  {/* dominant swatch */}
                  {a && (
                    <div style={{
                      position: 'absolute', left: 6, bottom: 6,
                      display: 'flex', gap: 3, alignItems: 'center',
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: 2, background: dom, border: '1px solid rgba(255,255,255,0.15)',
                      }} />
                      <span style={{
                        fontFamily: 'var(--font-dm-mono)', fontSize: 8,
                        color: '#e5e5e5', letterSpacing: '0.1em',
                        background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 2,
                      }}>{dom.toUpperCase()}</span>
                    </div>
                  )}
                  {/* active pulse ring */}
                  {isActive && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        border: '1px solid rgba(204,255,0,0.6)',
                        animation: 'gemma-pulse-ring 1.4s ease-out infinite',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#888',
          }}>
            <span>Reading</span>
            <span style={{ display: 'inline-flex', gap: 3 }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: '#ccff00', animation: 'gemma-dot 1.2s infinite', animationDelay: '0s' }} />
              <span style={{ width: 4, height: 4, borderRadius: 999, background: '#ccff00', animation: 'gemma-dot 1.2s infinite', animationDelay: '0.2s' }} />
              <span style={{ width: 4, height: 4, borderRadius: 999, background: '#ccff00', animation: 'gemma-dot 1.2s infinite', animationDelay: '0.4s' }} />
            </span>
            <button
              onClick={onToggle}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#888',
                padding: '4px 10px',
                fontFamily: 'var(--font-dm-mono)',
                fontSize: 9,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderRadius: 3,
              }}
            >
              {showReasoning ? '↔ hide log' : '↔ show log'}
            </button>
          </div>
        </div>

        {/* ─── Reasoning terminal ────────────────────────────────────────── */}
        {showReasoning && (
          <div
            ref={logRef}
            style={{
              background: '#050505',
              border: '1px solid #1a1a1a',
              borderRadius: 6,
              padding: 14,
              minHeight: 280,
              maxHeight: 360,
              overflowY: 'auto',
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 11,
              lineHeight: 1.55,
              color: '#e5e5e5',
              whiteSpace: 'pre-wrap',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 10,
              fontSize: 9, letterSpacing: '0.25em', color: '#666',
              textTransform: 'uppercase',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ff5f56' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ffbd2e' }} />
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#27c93f' }} />
              <span style={{ marginLeft: 8 }}>gemma@localhost · /api/slides/generate</span>
            </div>
            {reasoning.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('✓') ? '#ccff00'
                  : line.startsWith('✗') ? '#ef4444'
                  : line.startsWith('◆') ? '#fff'
                  : line.startsWith('▸') ? '#aaa' : '#888',
              }}>
                {line}
              </div>
            ))}
            <div style={{ display: 'inline-block', width: 7, height: 13, background: '#ccff00', verticalAlign: 'middle', marginTop: 4, animation: 'gemma-dot 1s infinite' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inspector card: Gemma's reasoning for the currently selected slide ────
function GemmaReasoningCard({
  note, analysis,
}: {
  note: VisionNote | undefined;
  analysis: { path: string; dominant: string; palette: string[] } | undefined | null;
}) {
  if (!note && !analysis) return null;
  return (
    <details className="slides-section-details" open={false}>
      <summary className="slides-section-summary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: '#ccff00', boxShadow: '0 0 8px #ccff00' }} />
        Gemma reasoning
      </summary>
      <div className="slides-section-content" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {note?.subject && (
          <div>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
              Subject
            </div>
            <div style={{ fontSize: 12, color: '#e5e5e5', lineHeight: 1.45 }}>
              {note.subject}
            </div>
          </div>
        )}
        {note?.mood && (
          <div>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
              Mood
            </div>
            <div style={{
              display: 'inline-block',
              padding: '2px 8px',
              background: '#0a0a0a',
              border: '1px solid #2a2a2a',
              borderRadius: 2,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: '#ccff00',
              textTransform: 'uppercase',
            }}>{note.mood}</div>
          </div>
        )}
        {note?.objects && note.objects.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
              Detected
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {note.objects.map((o, i) => (
                <span key={i} style={{
                  padding: '2px 6px',
                  background: '#0a0a0a',
                  border: '1px solid #1f1f1f',
                  borderRadius: 2,
                  fontFamily: 'var(--font-dm-mono)',
                  fontSize: 10,
                  color: '#bbb',
                }}>{o}</span>
              ))}
            </div>
          </div>
        )}
        {analysis && (
          <div>
            <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
              Palette
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 18, height: 18, background: analysis.dominant, border: '1px solid #2a2a2a', borderRadius: 2 }} title={`Dominant ${analysis.dominant}`} />
              {analysis.palette.map((c) => (
                <span key={c} style={{ width: 14, height: 14, background: c, border: '1px solid #1f1f1f', borderRadius: 2 }} title={c} />
              ))}
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#666' }}>
                {analysis.dominant.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// ─── CaptionCard — platform-native copy ready to paste into IG / TikTok / LinkedIn ─
// Shows the hook, caption body, CTA and hashtags Gemma composed for the chosen
// platform.  Everything is editable inline so a human can finesse before posting,
// and there's a one-click copy that assembles the whole post in one go.
function CaptionCard({
  platform,
  hook,
  caption,
  cta,
  hashtags,
  busy,
  onEditCaption,
  onEditHook,
  onEditCta,
  onCopy,
  onRewrite,
  onRemoveTag,
  onAddTag,
}: {
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'pinterest' | 'general';
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  busy: boolean;
  onEditCaption: (v: string) => void;
  onEditHook: (v: string) => void;
  onEditCta: (v: string) => void;
  onCopy: () => void;
  onRewrite: () => void;
  onRemoveTag: (t: string) => void;
  onAddTag: (t: string) => void;
}) {
  const [adding, setAdding] = useState('');
  const platformLabel = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    x: 'X · Twitter',
    pinterest: 'Pinterest',
    general: 'Social',
  }[platform];

  const charCount = caption.length;
  // Platform-specific soft limits — just hints, not enforced.
  const softLimit =
    platform === 'x' ? 280 : platform === 'tiktok' ? 2200 : platform === 'linkedin' ? 3000 : 2200;

  const commitAddTag = () => {
    const v = adding;
    setAdding('');
    if (v.trim()) onAddTag(v);
  };

  return (
    <details
      open
      style={{
        border: '1px solid #1f1f1f',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #080808 100%)',
        padding: 12,
        borderRadius: 4,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#ccff00',
        }}
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: '#ccff00', boxShadow: '0 0 8px rgba(204,255,0,0.6)' }} />
        <span>Caption · {platformLabel}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555', fontSize: 9, letterSpacing: '0.12em' }}>
            {charCount}/{softLimit}
          </span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) onRewrite(); }}
            disabled={busy}
            title={`Rewrite caption for ${platformLabel}`}
            style={{
              padding: '3px 8px',
              background: busy ? '#1a1a1a' : 'transparent',
              color: busy ? '#666' : '#ccff00',
              border: '1px solid #2a2a2a',
              borderRadius: 100,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 9,
              letterSpacing: '0.14em',
              cursor: busy ? 'wait' : 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {busy ? '◉ writing…' : '↻ rewrite'}
          </button>
        </span>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {/* Hook */}
        <div>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
            Hook · slide 1 opener
          </div>
          <input
            value={hook}
            onChange={(e) => onEditHook(e.target.value)}
            placeholder="Your scroll-stopping opener"
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#050505',
              color: '#f5f5f5',
              border: '1px solid #1f1f1f',
              borderRadius: 2,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 12,
              letterSpacing: '0.02em',
            }}
          />
        </div>

        {/* Caption body */}
        <div>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
            Caption body
          </div>
          <textarea
            value={caption}
            onChange={(e) => onEditCaption(e.target.value)}
            placeholder={`Write like a native ${platformLabel} user — short paragraphs, line breaks, no corporate filler.`}
            rows={6}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#050505',
              color: '#f5f5f5',
              border: '1px solid #1f1f1f',
              borderRadius: 2,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 12,
              lineHeight: 1.55,
              resize: 'vertical',
            }}
          />
        </div>

        {/* CTA */}
        <div>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
            Call to action
          </div>
          <input
            value={cta}
            onChange={(e) => onEditCta(e.target.value)}
            placeholder="save this · follow for more · etc."
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#050505',
              color: '#f5f5f5',
              border: '1px solid #1f1f1f',
              borderRadius: 2,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 12,
            }}
          />
        </div>

        {/* Hashtags */}
        <div>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
            Hashtags · {hashtags.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {hashtags.map((t) => (
              <button
                key={t}
                onClick={() => onRemoveTag(t)}
                title="Click to remove"
                style={{
                  padding: '3px 8px',
                  background: '#0a0a0a',
                  border: '1px solid #1f1f1f',
                  borderRadius: 100,
                  fontFamily: 'var(--font-dm-mono)',
                  fontSize: 10,
                  color: '#ccff00',
                  cursor: 'pointer',
                }}
              >
                #{t} <span aria-hidden style={{ color: '#555', marginLeft: 2 }}>×</span>
              </button>
            ))}
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitAddTag(); }
              }}
              onBlur={commitAddTag}
              placeholder="+ add tag"
              style={{
                padding: '3px 8px',
                background: 'transparent',
                border: '1px dashed #2a2a2a',
                borderRadius: 100,
                fontFamily: 'var(--font-dm-mono)',
                fontSize: 10,
                color: '#888',
                width: 96,
              }}
            />
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={onCopy}
          style={{
            padding: '10px 14px',
            background: '#ccff00',
            color: '#000',
            border: 'none',
            borderRadius: 2,
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          📋 Copy caption for {platformLabel}
        </button>
      </div>
    </details>
  );
}

// ─── Inspector preview — live miniature SlideFrame that fills the inspector col ─
function InspectorPreview({
  slide, preset, aspect, index, total, brand,
}: {
  slide: SlideData;
  preset: ReturnType<typeof getPreset>;
  aspect: SlideAspect;
  index: number;
  total: number;
  brand: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      {w > 0 && (
        <SlideFrame
          slide={slide}
          preset={preset}
          aspect={aspect}
          index={index}
          total={total}
          brand={brand}
          width={w}
          selected={false}
        />
      )}
    </div>
  );
}

// ─── Variations overlay — shows 3 directions side by side ────────────────────
function VariationsOverlay({
  variations, baseSlide, aspect, brand, slideIndex, total, effectiveTweaks, onApply, onClose,
}: {
  variations: Array<{ presetId: string; slide: Partial<SlideData> }>;
  baseSlide: SlideData | undefined;
  aspect: SlideAspect;
  brand: string;
  slideIndex: number;
  total: number;
  effectiveTweaks: SlideTweaks;
  onApply: (v: { presetId: string; slide: Partial<SlideData> }) => void;
  onClose: () => void;
}) {
  if (!baseSlide) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a direction"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 1200,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#aaa', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Pick a direction · 3 alternates
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#ccc',
              padding: '6px 12px',
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            Esc · Close
          </button>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {variations.map((v) => {
            const p = getPreset(v.presetId);
            const s: SlideData = {
              ...baseSlide,
              title: v.slide.title ?? baseSlide.title,
              body: v.slide.body ?? baseSlide.body,
              kicker: v.slide.kicker ?? baseSlide.kicker,
              accent: v.slide.accent ?? p.accent,
              textAlign: v.slide.textAlign ?? p.align,
              tweaks: effectiveTweaks,
            };
            return (
              <div key={v.presetId} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0a0a0a', border: '1px solid #1a1a1a', padding: 10, borderRadius: 6 }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#888', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                  {p.label}
                </div>
                <SlideFrame
                  slide={s}
                  preset={p}
                  aspect={aspect}
                  index={slideIndex}
                  total={total}
                  brand={brand}
                  width={280}
                  selected={false}
                />
                <button
                  onClick={() => onApply(v)}
                  style={{
                    padding: '8px 0',
                    background: '#ccff00',
                    color: '#000',
                    border: 'none',
                    fontFamily: 'var(--font-dm-mono)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  Apply this direction
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '55vh', padding: '40px 16px 60px', position: 'relative', overflow: 'hidden' }}>
      {/* Animated orbital SVG background */}
      <svg
        aria-hidden
        viewBox="0 0 600 600"
        style={{ position: 'absolute', inset: 0, margin: 'auto', width: '90%', maxWidth: 600, height: 'auto', opacity: 0.55, pointerEvents: 'none' }}
      >
        <defs>
          <radialGradient id="g1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ccff00" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ccff00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="g2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="g3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="230" r="180" fill="url(#g1)">
          <animate attributeName="cx" values="180;260;180" dur="18s" repeatCount="indefinite" />
          <animate attributeName="cy" values="230;180;230" dur="22s" repeatCount="indefinite" />
        </circle>
        <circle cx="400" cy="360" r="160" fill="url(#g2)">
          <animate attributeName="cx" values="400;340;400" dur="20s" repeatCount="indefinite" />
          <animate attributeName="cy" values="360;420;360" dur="24s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="300" r="140" fill="url(#g3)">
          <animate attributeName="cx" values="300;360;300" dur="16s" repeatCount="indefinite" />
          <animate attributeName="cy" values="300;260;300" dur="19s" repeatCount="indefinite" />
        </circle>
        {/* Concentric rings */}
        <g stroke="#ffffff10" fill="none" strokeWidth="1">
          <circle cx="300" cy="300" r="100">
            <animate attributeName="r" values="100;110;100" dur="6s" repeatCount="indefinite" />
          </circle>
          <circle cx="300" cy="300" r="160">
            <animate attributeName="r" values="160;170;160" dur="7s" repeatCount="indefinite" />
          </circle>
          <circle cx="300" cy="300" r="220">
            <animate attributeName="r" values="220;232;220" dur="8s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>

      <div style={{ maxWidth: 560, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 10,
            letterSpacing: '0.35em',
            color: '#ccff00',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ccff00',
              boxShadow: '0 0 12px #ccff00',
              animation: 'pulse-ring 2s ease-in-out infinite',
            }}
          />
          Vision-powered carousels
        </div>

        <h2 className="fluid-display" style={{ margin: 0 }}>
          Write less.
          <br />
          <span style={{
            background: 'linear-gradient(135deg, #ccff00 0%, #a855f7 50%, #00f0ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Ship the carousel.</span>
        </h2>

        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 'clamp(13px, 1.8vw, 16px)', color: '#888', lineHeight: 1.55, maxWidth: 480 }}>
          Drop up to ten photos. Gemma <em>looks at each one</em>, names what it sees,
          then writes your headline, kicker and body in the typography preset you pick.
          Edit live, export as PNGs, copy captions in one click.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
          {['Vision AI', '18 presets', 'Multi-aspect', 'Local-first', '⇥ keyboard'].map((f) => (
            <span key={f} style={{
              padding: '6px 12px',
              border: '1px solid #ffffff15',
              borderRadius: 100,
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 10,
              color: '#aaa',
              letterSpacing: '0.08em',
              background: 'rgba(255,255,255,0.02)',
            }}>
              {f}
            </span>
          ))}
        </div>

        <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#444', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: 4 }}>
          Tap &ldquo;Setup&rdquo; to begin
        </div>
      </div>

      {/* ── Feature strip — compact marketing band below the hero ── */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        marginTop: 60,
        width: '100%',
        maxWidth: 1040,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 0,
        border: '1px solid #141414',
        borderRadius: 6,
        overflow: 'hidden',
        background: '#060606',
      }}>
        {[
          { n: '01', title: 'Gemma SEES', body: 'Vision model describes each photo before writing copy. No more off-topic captions.', colour: '#ccff00' },
          { n: '02', title: 'AUTO-PILOT', body: 'Scores all 18 presets against mood + palette. Picks your preset automatically.', colour: '#a855f7' },
          { n: '03', title: 'NATIVE RES', body: 'Export at your source resolution. No downscaling. Print-ready PNGs.', colour: '#00f0ff' },
          { n: '04', title: '$0 CLOUD', body: 'Runs entirely on your GPU via Ollama. Zero API bills. Zero uploads.', colour: '#ff3d7f' },
        ].map((f, i, arr) => (
          <div
            key={f.n}
            style={{
              padding: '20px 22px',
              borderRight: i < arr.length - 1 ? '1px solid #141414' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 130,
              textAlign: 'left',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 9,
              color: f.colour,
              letterSpacing: '0.25em',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ width: 4, height: 4, background: f.colour, borderRadius: '50%', boxShadow: `0 0 8px ${f.colour}` }} />
              {f.n}
            </div>
            <div style={{
              fontFamily: 'var(--font-syne)',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#fff',
            }}>
              {f.title}
            </div>
            <div style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 12,
              color: '#888',
              lineHeight: 1.5,
              margin: 0,
            }}>
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  border: '1px solid #1e1e1e',
  color: '#eee',
  padding: '10px 12px',
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 14,
  resize: 'vertical',
  outline: 'none',
  lineHeight: 1.45,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  border: '1px solid #1e1e1e',
  color: '#eee',
  padding: '10px 12px',
  fontFamily: 'var(--font-dm-mono)',
  fontSize: 13,
  outline: 'none',
  letterSpacing: '0.02em',
};

const zoomBtnStyle: React.CSSProperties = {
  minWidth: 28,
  height: 26,
  padding: '0 8px',
  background: 'transparent',
  border: '1px solid #242424',
  color: '#aaa',
  fontFamily: 'var(--font-dm-mono)',
  fontSize: 11,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  borderRadius: 2,
};

const navLink: React.CSSProperties = {
  padding: '6px 12px',
  fontFamily: 'var(--font-dm-mono)',
  fontSize: 11,
  color: '#888',
  textDecoration: 'none',
  border: '1px solid transparent',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  transition: 'none',
};

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  background: '#111',
  border: '1px solid #2a2a2a',
  borderRadius: 3,
  fontFamily: 'var(--font-dm-mono)',
  fontSize: 9,
  color: '#aaa',
  letterSpacing: 0,
};

// ─── Inline Export — sits right under the hero slide so the user never has
// to scroll back to the sidebar to download.  Primary action is ZIP for multi-
// slide decks (solves the browser's "only one file downloaded" block on rapid
// <a>.click() loops); PDF and single-PNG are secondaries.  Separate from the
// sidebar Export so it never disappears off-screen at laptop heights. ───
function InlineExport(props: {
  count: number;
  busy: string;
  canExport: boolean;
  preset: string;
  aspect: string;
  onExportZip: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onCopyCaption: () => void;
  hasCaption: boolean;
}) {
  const {
    count, busy, canExport, preset, aspect,
    onExportZip, onExportPdf, onExportPng, onCopyCaption, hasCaption,
  } = props;
  const isExporting = busy === 'exporting';
  const disabled = !canExport || isExporting;
  const multi = count > 1;
  return (
    <section
      aria-label="Export"
      style={{
        width: '100%',
        marginTop: 14,
        padding: 14,
        background: '#070707',
        border: '1px solid #171717',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 6, height: 6, background: '#ccff00', borderRadius: 1,
              boxShadow: '0 0 6px rgba(204,255,0,0.55)',
            }}
          />
          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#ccff00', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            Export
          </span>
          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            · {count} slide{count === 1 ? '' : 's'} · {aspect} · {preset}
          </span>
        </div>
        {isExporting && (
          <span
            role="status"
            style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#ccff00', letterSpacing: '0.15em', textTransform: 'uppercase' }}
          >
            Working…
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <button
          onClick={onExportZip}
          disabled={disabled}
          title={multi ? 'Download all PNGs in one ZIP' : 'Download the slide inside a ZIP'}
          style={{ ...exportBtn, background: '#ccff00', color: '#000', borderColor: '#ccff00' }}
        >
          ↓ ZIP {count ? `×${count}` : ''}
        </button>
        <button
          onClick={onExportPdf}
          disabled={disabled}
          title="Download all slides as a single PDF carousel"
          style={exportBtn}
        >
          ↓ PDF
        </button>
        <button
          onClick={onExportPng}
          disabled={disabled}
          title={multi ? 'Returns a ZIP anyway — browsers block multi-file downloads' : 'Download the PNG'}
          style={exportBtn}
        >
          ↓ PNG
        </button>
        <button
          onClick={onCopyCaption}
          disabled={!hasCaption}
          title={hasCaption ? 'Copy caption + hashtags to clipboard' : 'Generate slides first to get a caption'}
          style={exportBtn}
        >
          📋 Caption
        </button>
      </div>

      {multi && (
        <div
          style={{
            marginTop: 10,
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 9,
            color: '#555',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          Tip · ZIP is best for carousels · PDF keeps proofing simple
        </div>
      )}
    </section>
  );
}

const exportBtn: React.CSSProperties = {
  padding: '10px 8px',
  background: 'transparent',
  border: '1px solid #262626',
  color: '#e6e6e6',
  fontFamily: 'var(--font-dm-mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'none',
  borderRadius: 3,
};
