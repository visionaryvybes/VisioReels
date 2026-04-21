'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  useEditorStore,
  REEL_ASPECTS,
  REEL_PACE,
  MOTION_FEEL,
  CAPTION_TONE,
  TRANSITION_ENERGY,
  DURATION_PRESETS,
  type ReelAspect,
  type ReelPace,
  type MotionFeel,
  type CaptionTone,
  type TransitionEnergy,
  type VisionNote,
  type ConceptBrief,
  type DirectorBrief,
  type PresetVoiceGroup,
} from '@/stores/editor-store';
import { useProjectStore } from '@/stores/project-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';
import { motion, AnimatePresence } from 'framer-motion';

// ── Voice picker constants ──────────────────────────────────────────────────

const ACCENT_FLAGS: Record<string, string> = {
  american: '🇺🇸',
  british: '🇬🇧',
  spanish: '🇪🇸',
  french: '🇫🇷',
  hindi: '🇮🇳',
  other: '🌍',
};

/** Used when Voicebox is online but hasn't returned preset data yet (or for offline fallback display). */
const FALLBACK_VOICE_GROUPS: PresetVoiceGroup[] = [
  { label: 'American Female', gender: 'female', accent: 'american', voices: [
    { id: 'af_alloy', name: 'Alloy' }, { id: 'af_aoede', name: 'Aoede' }, { id: 'af_bella', name: 'Bella' },
    { id: 'af_heart', name: 'Heart' }, { id: 'af_jessica', name: 'Jessica' }, { id: 'af_kore', name: 'Kore' },
    { id: 'af_nicole', name: 'Nicole' }, { id: 'af_nova', name: 'Nova' }, { id: 'af_river', name: 'River' },
    { id: 'af_sarah', name: 'Sarah' }, { id: 'af_sky', name: 'Sky' },
  ]},
  { label: 'American Male', gender: 'male', accent: 'american', voices: [
    { id: 'am_adam', name: 'Adam' }, { id: 'am_echo', name: 'Echo' }, { id: 'am_eric', name: 'Eric' },
    { id: 'am_fenrir', name: 'Fenrir' }, { id: 'am_liam', name: 'Liam' }, { id: 'am_michael', name: 'Michael' },
    { id: 'am_onyx', name: 'Onyx' }, { id: 'am_puck', name: 'Puck' }, { id: 'am_santa', name: 'Santa' },
  ]},
  { label: 'British Female', gender: 'female', accent: 'british', voices: [
    { id: 'bf_alice', name: 'Alice' }, { id: 'bf_emma', name: 'Emma' }, { id: 'bf_isabella', name: 'Isabella' }, { id: 'bf_lily', name: 'Lily' },
  ]},
  { label: 'British Male', gender: 'male', accent: 'british', voices: [
    { id: 'bm_daniel', name: 'Daniel' }, { id: 'bm_fable', name: 'Fable' }, { id: 'bm_george', name: 'George' }, { id: 'bm_lewis', name: 'Lewis' },
  ]},
  { label: 'Spanish Female', gender: 'female', accent: 'spanish', voices: [{ id: 'ef_dora', name: 'Dora' }]},
  { label: 'Spanish Male', gender: 'male', accent: 'spanish', voices: [{ id: 'em_alex', name: 'Alex' }]},
  { label: 'French Female', gender: 'female', accent: 'french', voices: [{ id: 'ff_siwis', name: 'Siwis' }]},
  { label: 'Hindi Female', gender: 'female', accent: 'hindi', voices: [{ id: 'hf_alpha', name: 'Alpha' }, { id: 'hf_beta', name: 'Beta' }]},
  { label: 'Hindi Male', gender: 'male', accent: 'hindi', voices: [{ id: 'hm_omega', name: 'Omega' }, { id: 'hm_psi', name: 'Psi' }]},
];

// ── Style chips ─────────────────────────────────────────────────────────────

const STYLE_CHIPS = [
  'RAW',
  'BRUTALIST',
  'CINEMATIC',
  'BEAT_SYNC',
  'GLITCH',
  'MONOCHROME',
  'NEON',
  'MINIMAL',
  /** Steers freeform TSX toward SVG / charts / HUD — no stock photos required */
  'CODE',
  'VECTOR',
  'WARM_GRAIN',
  'PLAY_MODE',
  'SWISS_GRID',
  'KINETIC_TYPE',
  'DECISION_TREE',
  'PRODUCT_PROMO',
  'NYT_GRAPH',
  'VIGNELLI',
  'FLASH_WHITE',
  'PARALLAX_PAN',
  'PIXEL_TRANSITION',
  'CHART_MOTION',
  'KEN_BURNS',
  'ZOOM_PULSE',
  'CARD_FLIP',
  'GLITCH_TEXT',
  'LIQUID_WAVE',
  'BUBBLE_POP',
];

const FEATURED_VOICE_STYLES: Record<string, { tag: string; note: string }> = {
  af_bella: { tag: 'Recommended', note: 'polished creator voice with stronger social cadence' },
  af_nova: { tag: 'Premium', note: 'bright, crisp, modern product-style read' },
  af_heart: { tag: 'Warm', note: 'soft, intimate storytelling delivery' },
  af_alloy: { tag: 'Studio', note: 'clean explainer / UI demo voice' },
  am_onyx: { tag: 'Cinematic', note: 'deep premium narrator with weight' },
  am_michael: { tag: 'Natural', note: 'casual trusted storyteller' },
  bm_george: { tag: 'Classic', note: 'measured British documentary tone' },
  bm_fable: { tag: 'Story', note: 'controlled long-form narration cadence' },
};

const ASPECT_ORDER: ReelAspect[] = ['9:16', '1:1', '4:5', '16:9'];
const PACE_ORDER: ReelPace[] = ['chill', 'balanced', 'fast', 'hype'];
const MOTION_ORDER: MotionFeel[] = ['smooth', 'snappy', 'bouncy', 'dramatic', 'dreamy'];
const CAPTION_ORDER: CaptionTone[] = ['hype', 'corporate', 'tutorial', 'storytelling', 'social'];
const TRANS_ORDER: TransitionEnergy[] = ['calm', 'medium', 'high'];

export function AIPanel() {
  const {
    prompt, setPrompt, generationPhase, generationStatus,
    streamingTokens, elapsed, setGenerationPhase, appendToken,
    clearTokens, setError, setElapsed, setActiveComposition, setCompositionInputProps,
    attachments, addAttachments, removeAttachment,
    aspect, setAspect, pace, setPace, maxScenes, setMaxScenes,
    useVision, setUseVision, visionNotes, upsertVisionNote, setVisionNotes,
    motionFeel, setMotionFeel, captionTone, setCaptionTone,
    transitionEnergy, setTransitionEnergy,
    targetDurationSec, setTargetDurationSec,
    pipelineMode,
    concept, setConcept,
    directorBrief, setDirectorBrief,
    useTTS, setUseTTS, ttsVoice, setTTSVoice,
    ttsVoiceId, setTTSVoiceId,
    ttsGender, setTTSGender,
    ttsAccent, setTTSAccent,
    ttsPresetVoices, setTTSPresetVoices,
    ttsStatus, setTTSStatus,
  } = useEditorStore();

  const { setComposition } = useProjectStore();
  const { addClip } = useTimelineStore();

  const [selectedChips, setSelectedChips] = useState<string[]>(['CINEMATIC', 'WARM_GRAIN']);
  const isHyperframes = true;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [vbRunning, setVbRunning] = useState<boolean | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const isGenerating = ['generating', 'reading', 'writing', 'validating'].includes(generationPhase);

  /** Must match handleGenerate — both REMOTION and HYPERFRAMES accept brief + images. */
  const canGenerate =
    prompt.trim().length > 0 || attachments.length > 0;

  const MIN_H = 120;
  const MAX_H = 280;
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_H), MAX_H);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    if (!useTTS) return;
    setVbRunning(null);
    fetch('/api/tts')
      .then(r => r.json())
      .then((d: { running: boolean; profiles: { id: string; name: string }[]; presetVoices: PresetVoiceGroup[] }) => {
        setVbRunning(d.running);
        if (d.presetVoices?.length) {
          setTTSPresetVoices(d.presetVoices);
        }
        // If still at default and we got preset voices, keep ttsVoiceId as-is (already "af_bella")
        // Only fall back to a profile id if there are no preset voices
        if (d.profiles?.length && !d.presetVoices?.length && ttsVoice === 'default') {
          setTTSVoice(d.profiles[0].id);
        }
      })
      .catch(() => setVbRunning(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useTTS]);

  useEffect(() => autosize(textareaRef.current), [autosize]);
  useEffect(() => codeEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [streamingTokens]);

  const startTimer = () => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 1000)), 1000);
  };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploadError(null); setUploading(true);
    try {
      const fd = new FormData();
      for (const f of arr) fd.append('files', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.files) throw new Error(json.error ?? 'Upload failed');
      addAttachments(json.files);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally { setUploading(false); }
  }, [addAttachments]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ''; }
  };
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); handleFiles(imgs); }
  };

  const handleGenerate = useCallback(async () => {
    const canRun =
      (prompt.trim() || attachments.length > 0);
    if (!canRun || isGenerating) return;
    const briefParts: string[] = [];
    if (prompt.trim()) briefParts.push(prompt.trim());
    if (selectedChips.length) briefParts.push(`Style: ${selectedChips.join(', ')}`);
    const fullPrompt = briefParts.join('\n\n');

    clearTokens();
    setVisionNotes([]);
    setConcept(null);
    setDirectorBrief(null);
    setTTSStatus(null);
    setGenerationPhase('reading', 'Analyzing request...');
    startTimer();

    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: fullPrompt,
          attachments: attachments.map(a => ({ path: a.path, name: a.name })),
          pipeline: 'hyperframes' as const,
          aspect,
          pace,
          maxScenes,
          useVision,
          motionFeel,
          captionTone,
          transitionEnergy,
          durationSeconds: targetDurationSec,
          useTTS,
          ttsVoice: ttsVoiceId,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Request failed (${res.status})`;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim();
        } catch {
          if (text.trim()) msg = text.trim().slice(0, 500);
        }
        throw new Error(msg);
      }
      if (!res.body) throw new Error('No response body from server');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line) as Record<string, unknown>;
            switch (ev.type) {
              case 'status': setGenerationPhase('generating', ev.text as string); break;
              case 'token': appendToken(ev.tok as string); break;
              case 'vision_note': {
                const n = ev.note as VisionNote;
                if (n && typeof n.path === 'string') upsertVisionNote(n);
                break;
              }
              case 'brain_concept': {
                if (ev.concept && typeof ev.concept === 'object') {
                  setConcept(ev.concept as ConceptBrief);
                }
                break;
              }
              case 'director_brief': {
                if (ev.brief && typeof ev.brief === 'object') {
                  setDirectorBrief(ev.brief as DirectorBrief);
                }
                break;
              }
              case 'file_written': {
                setCompositionInputProps(null);
                const compId = (ev.path as string).replace(/^remotion\/compositions\//, '').replace(/\.tsx$/, '');
                const config = COMPOSITION_CONFIGS[compId] ?? COMPOSITION_CONFIGS['Reel'];
                setActiveComposition(compId, config);
                setComposition(compId, prompt, `out/preview-${compId}.png`);
                addClip({ composition: compId, durationInFrames: config.durationInFrames, fps: config.fps, label: compId });
                break;
              }
              case 'html_slide_video':
              case 'html_video': {
                const w = typeof ev.width === 'number' ? ev.width : REEL_ASPECTS[aspect].w;
                const h = typeof ev.height === 'number' ? ev.height : REEL_ASPECTS[aspect].h;
                const d = typeof ev.durationInFrames === 'number' ? ev.durationInFrames : 300;
                const inputProps = ev.inputProps as Record<string, unknown>;
                setCompositionInputProps(inputProps);
                const compId = ev.type === 'html_video' ? 'HtmlVideo' : 'HtmlSlideVideo';
                setActiveComposition(compId, {
                  durationInFrames: d,
                  fps: 30,
                  width: w,
                  height: h,
                });
                setComposition(compId, prompt, 'html-video-preview');
                addClip({
                  composition: compId,
                  durationInFrames: d,
                  fps: 30,
                  label: 'HTML video',
                });
                break;
              }
              case 'reel_spec': {
                setCompositionInputProps(null);
                const w = typeof ev.width === 'number' ? ev.width : REEL_ASPECTS[aspect].w;
                const h = typeof ev.height === 'number' ? ev.height : REEL_ASPECTS[aspect].h;
                const d = typeof ev.durationInFrames === 'number' && ev.durationInFrames > 0 ? ev.durationInFrames : 300;
                const compId = typeof ev.componentName === 'string' && ev.componentName ? ev.componentName : 'Reel';
                setActiveComposition(compId, { durationInFrames: d, fps: 30, width: w, height: h });
                setComposition(compId, prompt, `out/preview-${compId}.png`);
                // addClip is also called reactively by Timeline's useEffect on activeComposition change.
                // Belt-and-suspenders: call it here too so clips are immediately visible.
                addClip({ composition: compId, durationInFrames: d, fps: 30, label: compId });
                break;
              }
              case 'composition_meta': {
                setCompositionInputProps(null);
                const w = typeof ev.width === 'number' ? ev.width : REEL_ASPECTS[aspect].w;
                const h = typeof ev.height === 'number' ? ev.height : REEL_ASPECTS[aspect].h;
                const d = typeof ev.durationInFrames === 'number' ? ev.durationInFrames : 300;
                setActiveComposition(ev.componentName as string, {
                  durationInFrames: d,
                  fps: 30,
                  width: w,
                  height: h,
                });
                break;
              }
              case 'validation': setGenerationPhase('validating', ev.success ? 'Validating code...' : 'Validation error found'); break;
              case 'done': stopTimer(); setGenerationPhase('done', 'Video generated successfully'); setTTSStatus(null); break;
              case 'error': stopTimer(); setError(ev.content as string); break;
              case 'tts_note': {
                const msg = ev.text as string;
                if (msg) setTTSStatus(msg);
                break;
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: unknown) {
      stopTimer();
      let msg = e instanceof Error ? e.message : 'An error occurred';
      if (/failed to fetch|network|chunk|incomplete|aborted|load failed|reset/i.test(msg)) {
        msg =
          'Agent stream interrupted before completion. Keep `ollama serve` running with your model loaded, avoid restarting the Next dev server during a long generation, and retry. ' +
          (msg ? `(${msg})` : '');
      }
      setError(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, isGenerating, selectedChips, attachments, aspect, pace, maxScenes, useVision, motionFeel, captionTone, transitionEnergy, targetDurationSec, pipelineMode, useTTS, ttsVoice, setCompositionInputProps, setConcept, setDirectorBrief]);

  useEffect(() => () => stopTimer(), []);

  const visionByPath = new Map(visionNotes.map((n) => [n.path, n]));

  return (
    <div className="ai-panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 'clamp(16px, 4vw, 24px)', height: '100%', overflowY: 'auto', minWidth: 0 }}>

      <Section label="ENGINE">
        <div
          style={{
            padding: '14px 12px',
            border: '2px solid #ccff00',
            background: 'linear-gradient(135deg, rgba(204,255,0,0.09), rgba(255,255,255,0.02))',
            color: '#ccff00',
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            position: 'relative',
          }}
        >
          ◉ HYPERFRAMES HTML
          <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 7, letterSpacing: '0.1em' }}>
            ACTIVE
          </span>
          <span style={{ display: 'block', marginTop: 8, color: '#91a65a', fontSize: 9, fontWeight: 400, lineHeight: 1.45, letterSpacing: '0.03em' }}>
            Gemma writes HTML/CSS/JS compositions. Playwright captures DOM frames. The old Remotion reel path is now legacy-only.
          </span>
        </div>
      </Section>

      {/* Target runtime — drives frame count + Gemma script depth */}
      <Section label="LENGTH" hint="total video duration · gemma scales copy & sequences">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 6 }}>
          {DURATION_PRESETS.map(({ sec, label }) => {
            const active = targetDurationSec === sec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => setTargetDurationSec(sec)}
                disabled={isGenerating}
                title={`${sec} seconds`}
                style={{
                  padding: '8px 4px',
                  borderRadius: 6,
                  border: `1px solid ${active ? '#ccff00' : '#222'}`,
                  background: active ? '#ccff00' : 'transparent',
                  color: active ? '#000' : '#888',
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Canvas — aspect selector */}
      <Section label="CANVAS" hint={REEL_ASPECTS[aspect].hint}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 6 }}>
          {ASPECT_ORDER.map((a) => {
            const meta = REEL_ASPECTS[a];
            const active = aspect === a;
            return (
              <button
                key={a}
                onClick={() => setAspect(a)}
                disabled={isGenerating}
                title={`${meta.label} · ${meta.w}×${meta.h}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '10px 4px',
                  borderRadius: 6,
                  border: `1px solid ${active ? '#ccff00' : '#222'}`,
                  background: active ? 'rgba(204,255,0,0.08)' : 'transparent',
                  color: active ? '#ccff00' : '#888',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <AspectThumb aspect={a} active={active} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>{a}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Pace — cut rhythm */}
      <Section label="PACE" hint={REEL_PACE[pace].blurb}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {PACE_ORDER.map((p) => {
            const active = pace === p;
            return (
              <button
                key={p}
                onClick={() => setPace(p)}
                disabled={isGenerating}
                style={{
                  padding: '8px 6px',
                  borderRadius: 6,
                  border: `1px solid ${active ? '#ccff00' : '#222'}`,
                  background: active ? '#ccff00' : 'transparent',
                  color: active ? '#000' : '#888',
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  textTransform: 'uppercase',
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </Section>

      {/* HyperFrames-style creative vocabulary → Gemma HTML renderer */}
      <Section
        label="CREATIVE"
        hint="motion · caption · cuts — inspired by HyperFrames prompt patterns"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: '#666', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', marginBottom: 6 }}>MOTION FEEL</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 4 }}>
              {MOTION_ORDER.map((m) => {
                const active = motionFeel === m;
                return (
                  <button
                    key={m}
                    type="button"
                    title={MOTION_FEEL[m].motionHint}
                    onClick={() => setMotionFeel(m)}
                    disabled={isGenerating}
                    style={{
                      padding: '6px 2px',
                      borderRadius: 4,
                      border: `1px solid ${active ? '#ccff00' : '#333'}`,
                      background: active ? 'rgba(204,255,0,0.1)' : 'transparent',
                      color: active ? '#ccff00' : '#777',
                      fontSize: 8,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#666', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', marginBottom: 6 }}>CAPTION TONE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 4 }}>
              {CAPTION_ORDER.map((c) => {
                const active = captionTone === c;
                return (
                  <button
                    key={c}
                    type="button"
                    title={CAPTION_TONE[c].copyRules}
                    onClick={() => setCaptionTone(c)}
                    disabled={isGenerating}
                    style={{
                      padding: '6px 2px',
                      borderRadius: 4,
                      border: `1px solid ${active ? '#ccff00' : '#333'}`,
                      background: active ? '#ccff00' : 'transparent',
                      color: active ? '#000' : '#777',
                      fontSize: 8,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#666', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', marginBottom: 6 }}>TRANSITION ENERGY</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TRANS_ORDER.map((t) => {
                const active = transitionEnergy === t;
                return (
                  <button
                    key={t}
                    type="button"
                    title={TRANSITION_ENERGY[t].prefer}
                    onClick={() => setTransitionEnergy(t)}
                    disabled={isGenerating}
                    style={{
                      padding: '8px 6px',
                      borderRadius: 6,
                      border: `1px solid ${active ? '#ccff00' : '#222'}`,
                      background: active ? 'rgba(204,255,0,0.12)' : 'transparent',
                      color: active ? '#ccff00' : '#888',
                      fontSize: 10,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Scenes + vision toggle */}
      <Section label="DIRECTION" hint="scene budget — same image can repeat across scenes (remix beats, not 1:1 slideshow)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', letterSpacing: '0.08em', marginBottom: 6 }}>
              <span>MAX SCENES</span>
              <span style={{ color: '#ccff00' }}>{maxScenes}</span>
            </div>
            <input
              type="range"
              min={2}
              max={24}
              step={1}
              value={maxScenes}
              onChange={(e) => setMaxScenes(parseInt(e.target.value, 10))}
              disabled={isGenerating}
              style={{ width: '100%', accentColor: '#ccff00' }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#aaa', letterSpacing: '0.08em', cursor: isGenerating ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={useVision}
              onChange={(e) => setUseVision(e.target.checked)}
              disabled={isGenerating}
              style={{ accentColor: '#ccff00' }}
            />
            VISION PRE-PASS · let gemma LOOK at each image first
          </label>
        </div>
      </Section>

      {/* TTS / Voicebox narration */}
      <Section label="VOICE" hint="Voicebox TTS — reads Gemma's scene/slide copy aloud. Pick a preset voice or it will auto-create a narrator.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Enable toggle row */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#aaa', letterSpacing: '0.08em', cursor: isGenerating ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={useTTS}
              onChange={(e) => setUseTTS(e.target.checked)}
              disabled={isGenerating}
              style={{ accentColor: '#ccff00' }}
            />
            AI NARRATION
            {useTTS && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 8,
                letterSpacing: '0.12em',
                color: vbRunning === null ? '#888' : vbRunning ? '#54d38f' : '#ff4444',
              }}>
                {vbRunning === null ? '·  CHECKING…' : vbRunning ? '●  ONLINE' : '●  OFFLINE'}
              </span>
            )}
          </label>

          {/* Voice picker — only when enabled + Voicebox is running */}
          {useTTS && vbRunning === true && (() => {
            // Compute which groups match the current gender filter
            const sourceGroups: PresetVoiceGroup[] = ttsPresetVoices.length > 0
              ? ttsPresetVoices
              : FALLBACK_VOICE_GROUPS;

            const genderGroups = sourceGroups.filter(g => g.gender === ttsGender);
            const accentGroups = genderGroups.filter(g => g.accent === ttsAccent);
            // Find the group matching current gender+accent (or first group for that gender)
            const activeGroup = accentGroups[0] ?? genderGroups[0] ?? sourceGroups[0] ?? null;
            const voiceChips = activeGroup?.voices ?? [];

            // Derive display name + label for selected voice
            const allVoices = sourceGroups.flatMap(g => g.voices.map(v => ({ ...v, gender: g.gender, accent: g.accent, label: g.label })));
            const selectedVoiceMeta = allVoices.find(v => v.id === ttsVoiceId);
            const selectedName = selectedVoiceMeta?.name ?? ttsVoiceId;
            const selectedLabel = selectedVoiceMeta?.label ?? '';
            const featuredVoices = allVoices.filter(v => FEATURED_VOICE_STYLES[v.id]);

            // All accents available for current gender
            const availableAccents = [...new Set(genderGroups.map(g => g.accent))];

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Gender toggle */}
                <div style={{ display: 'flex', gap: 5 }}>
                  {(['female', 'male'] as const).map(g => {
                    const active = ttsGender === g;
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setTTSGender(g);
                          // Auto-pick first voice for new gender if current voice doesn't match
                          const newGenderGroups = sourceGroups.filter(gr => gr.gender === g);
                          const newAccentGroup = newGenderGroups.find(gr => gr.accent === ttsAccent) ?? newGenderGroups[0];
                          const firstVoice = newAccentGroup?.voices[0];
                          if (firstVoice && !newGenderGroups.flatMap(gr => gr.voices).some(v => v.id === ttsVoiceId)) {
                            setTTSVoiceId(firstVoice.id);
                          }
                        }}
                        disabled={isGenerating}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '100px',
                          border: `1px solid ${active ? '#7c3aed' : '#222'}`,
                          background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
                          color: active ? '#a78bfa' : '#555',
                          fontSize: 9,
                          fontFamily: 'var(--font-dm-mono), monospace',
                          letterSpacing: '0.08em',
                          cursor: isGenerating ? 'not-allowed' : 'pointer',
                          textTransform: 'uppercase',
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {g === 'female' ? '♀ FEMALE' : '♂ MALE'}
                      </button>
                    );
                  })}
                </div>

                {/* Accent chips */}
                {availableAccents.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {availableAccents.map(acc => {
                      const active = ttsAccent === acc;
                      const flag = ACCENT_FLAGS[acc] ?? '🌍';
                      return (
                        <button
                          key={acc}
                          onClick={() => {
                            setTTSAccent(acc);
                            // Auto-select first voice for new accent
                            const newGroup = genderGroups.find(g => g.accent === acc);
                            const firstVoice = newGroup?.voices[0];
                            if (firstVoice && !newGroup?.voices.some(v => v.id === ttsVoiceId)) {
                              setTTSVoiceId(firstVoice.id);
                            }
                          }}
                          disabled={isGenerating}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '100px',
                            border: `1px solid ${active ? '#7c3aed' : '#222'}`,
                            background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
                            color: active ? '#a78bfa' : '#555',
                            fontSize: 9,
                            fontFamily: 'var(--font-dm-mono), monospace',
                            letterSpacing: '0.06em',
                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                            textTransform: 'capitalize',
                          }}
                        >
                          {flag} {acc.charAt(0).toUpperCase() + acc.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Voice name grid */}
                {featuredVoices.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 9, color: '#666', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em' }}>
                      FEATURED PRESETS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {featuredVoices.map(v => {
                        const active = ttsVoiceId === v.id;
                        const meta = FEATURED_VOICE_STYLES[v.id];
                        return (
                          <button
                            key={v.id}
                            onClick={() => setTTSVoiceId(v.id)}
                            disabled={isGenerating}
                            title={meta.note}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 10,
                              border: `1px solid ${active ? '#ccff00' : '#2a2a2a'}`,
                              background: active ? 'rgba(204,255,0,0.12)' : 'rgba(255,255,255,0.02)',
                              color: active ? '#ccff00' : '#cfcfcf',
                              fontSize: 9,
                              fontFamily: 'var(--font-dm-mono), monospace',
                              letterSpacing: '0.04em',
                              cursor: isGenerating ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{v.name}</div>
                            <div style={{ opacity: 0.65, marginTop: 2 }}>{meta.tag}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {voiceChips.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {voiceChips.map(v => {
                      const active = ttsVoiceId === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setTTSVoiceId(v.id)}
                          disabled={isGenerating}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '100px',
                            border: `1px solid ${active ? '#ccff00' : '#222'}`,
                            background: active ? 'rgba(204,255,0,0.1)' : 'transparent',
                            color: active ? '#ccff00' : '#666',
                            fontSize: 9,
                            fontFamily: 'var(--font-dm-mono), monospace',
                            letterSpacing: '0.06em',
                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                            fontWeight: active ? 700 : 400,
                          }}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected voice summary */}
                <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.06em' }}>
                  🎙 {selectedName}{selectedLabel ? ` · ${selectedLabel}` : ''}{FEATURED_VOICE_STYLES[ttsVoiceId] ? ` · ${FEATURED_VOICE_STYLES[ttsVoiceId].note}` : ''} · kokoro
                </div>
              </div>
            );
          })()}

          {/* Offline fallback — show when enabled but VB is not running */}
          {useTTS && vbRunning === false && (
            <div style={{ fontSize: 9, color: '#ff4444', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.06em', lineHeight: 1.5 }}>
              Start Voicebox → run: <span style={{ color: '#888' }}>scripts/start-voicebox.sh</span>
            </div>
          )}

          {ttsStatus && (
            <div style={{ fontSize: 9, color: '#54d38f', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.04em', lineHeight: 1.45 }}>
              {ttsStatus}
            </div>
          )}
        </div>
      </Section>

      {/* Vibe/Style Chips */}
      <Section label="VIBE" hint="stylistic chips blended into the prompt">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STYLE_CHIPS.map(c => {
            const active = selectedChips.includes(c);
            return (
              <button
                key={c} onClick={() => setSelectedChips(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}
                style={{
                  padding: '6px 12px',
                  borderRadius: '100px',
                  border: '1px solid',
                  borderColor: active ? '#ccff00' : '#222',
                  background: active ? '#ccff00' : 'transparent',
                  color: active ? '#000' : '#888',
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {c}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Prompt Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #333', background: '#000' }}>
        <textarea
          ref={textareaRef} value={prompt} onChange={(e) => { setPrompt(e.target.value); autosize(e.currentTarget); }} onPaste={onPaste}
          placeholder="> DESCRIBE YOUR VISION (motion graphics, charts, HUD, line art — no photos required)…"
          disabled={isGenerating}
          style={{
            width: '100%', minHeight: MIN_H, background: 'transparent', color: '#00ff00', border: 'none',
            fontSize: 12, fontFamily: 'var(--font-dm-mono), monospace', padding: '16px', resize: 'none', outline: 'none', lineHeight: 1.6
          }}
        />
        <p style={{ margin: 0, padding: '0 16px 10px', fontSize: 9, color: '#555', fontFamily: 'var(--font-dm-mono), monospace', lineHeight: 1.45 }}>
          HTML-first: Gemma writes DOM/CSS/JS motion graphics. Attach images for visual reads; use style chips for GSAP-like movement, typography, charts, and branded layouts.
        </p>
        <div style={{ display: 'flex', borderTop: '1px solid #333', padding: '12px 16px', justifyContent: 'space-between', alignItems: 'center', background: '#050505' }}>
          <button
            onClick={() => fileInputRef.current?.click()} disabled={isGenerating || uploading}
            style={{
              background: 'transparent', border: '1px solid #555', color: '#ccc',
              padding: '6px 12px', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'none'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#ccc'}
          >
            {uploading ? 'UPLOADING...' : 'ATTACH MEDIA'}
          </button>
          {uploadError && (
            <span
              role="alert"
              title={uploadError}
              style={{ fontSize: 10, color: '#ff5560', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              ! {uploadError}
            </span>
          )}
          {!uploadError && attachments.length > 0 && (
            <span style={{ fontSize: 10, color: '#666', fontFamily: 'var(--font-dm-mono), monospace', textTransform: 'uppercase' }}>
              {attachments.length} ATTACHED
            </span>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onPickFiles} style={{ display: 'none' }} />
      </div>

      {/* Attachments (with vision notes overlay) */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {attachments.map((a, i) => {
              const note = visionByPath.get(a.path);
              return (
                <div key={a.path} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', border: `1px solid ${note ? '#ccff00' : '#333'}`, background: '#000', minWidth: 0 }}>
                  <Image src={a.url} alt={a.name} fill style={{ objectFit: 'cover' }} unoptimized priority={i === 0} />
                  {note?.subject && (
                    <div
                      title={note.subject}
                      style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.35) 70%, transparent 100%)',
                        padding: '8px 26px 6px 8px',
                        maxHeight: '48%',
                        color: '#ccff00',
                        fontSize: 10,
                        fontFamily: 'var(--font-dm-mono), monospace',
                        lineHeight: 1.3,
                        letterSpacing: '0.02em',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,
                        wordBreak: 'break-word',
                        textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                      }}
                    >
                      {note.subject}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeAttachment(a.path)}
                    style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, background: '#ff3300', color: '#fff', border: 'none', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, fontWeight: 'bold', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                  >
                    X
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execute Button */}
      {isHyperframes && !prompt.trim() && attachments.length === 0 ? (
        <p
          role="status"
          style={{
            margin: '0 0 8px',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #3d3d1a',
            background: 'rgba(204,255,0,0.06)',
            color: '#b9c97a',
            fontSize: 11,
            fontFamily: 'var(--font-dm-sans), sans-serif',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: '#ccff00' }}>HYPERFRAMES:</strong> add a brief and/or attach images. Gemma designs HTML/CSS/JS scenes, Playwright captures them, then local ffmpeg encodes MP4.
        </p>
      ) : null}
      <button
        type="button"
        title={
          !canGenerate
            ? 'Add a prompt or attach images'
            : undefined
        }
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        style={{
          padding: '16px', background: isGenerating ? '#111' : !canGenerate ? '#1a1a1a' : '#ccff00', color: isGenerating ? '#444' : !canGenerate ? '#555' : '#000',
          border: `1px solid ${isGenerating ? '#333' : !canGenerate ? '#333' : '#ccff00'}`, fontSize: 14, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700,
          cursor: isGenerating || !canGenerate ? 'not-allowed' : 'pointer', transition: 'none', marginTop: 8, letterSpacing: '0.05em'
        }}
      >
          {isGenerating ? '> GENERATING...' : `> HYPERFRAMES HTML  ·  ${targetDurationSec}s  ·  ${aspect}`}
      </button>

      {/* Brain Concept Brief */}
      <AnimatePresence>
        {concept && (
          <motion.div
            key="concept-brief"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              border: '1px solid #2a3a00',
              background: 'linear-gradient(135deg, #0d1400 0%, #000 100%)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.14em', color: '#ccff00', fontWeight: 700 }}>
                ◈ BRAIN · CREATIVE BRIEF
              </span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontFamily: 'var(--font-dm-mono), monospace', color: '#e8ff80', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                {concept.title}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#aac000', lineHeight: 1.5 }}>
                {concept.logline}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'HOOK', value: concept.hook },
                { label: 'PALETTE', value: concept.color_story },
                { label: 'TYPOGRAPHY', value: concept.typography_mood },
                { label: 'MOTION', value: concept.motion_energy },
              ].map(({ label, value }) => value ? (
                <div key={label} style={{ background: '#0a0f00', border: '1px solid #1a2400', padding: '8px 10px' }}>
                  <span style={{ display: 'block', fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', color: '#99bb33', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#c8e860', lineHeight: 1.4 }}>{value}</span>
                </div>
              ) : null)}
            </div>
            {concept.scene_beats.length > 0 && (
              <div style={{ background: '#060900', border: '1px solid #1a2400', padding: '10px 12px' }}>
                <span style={{ display: 'block', fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', color: '#99bb33', letterSpacing: '0.12em', marginBottom: 8 }}>SCENE BEATS</span>
                <ol style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {concept.scene_beats.map((beat, i) => (
                    <li key={i} style={{ fontSize: 9, fontFamily: 'var(--font-dm-mono), monospace', color: '#99bb44', lineHeight: 1.45 }}>{beat}</li>
                  ))}
                </ol>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Director Brief — per-scene breakdown */}
      <AnimatePresence>
        {directorBrief && directorBrief.scenes.length > 0 && (
          <motion.div
            key="director-brief"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              border: '1px solid #1a1f00',
              background: 'linear-gradient(135deg, #080a00 0%, #000 100%)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.14em', color: '#88cc00', fontWeight: 700 }}>
                ◈ DIRECTOR · SCENE BREAKDOWN
              </span>
              <span style={{ fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', color: '#88aa22', letterSpacing: '0.08em' }}>
                {directorBrief.scenes.length} SCENES · {directorBrief.overall_energy.toUpperCase()} ENERGY
              </span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-dm-mono), monospace', color: '#aabb44', lineHeight: 1.45, marginBottom: 4 }}>
              {directorBrief.typography.headline_font} · {directorBrief.typography.mono_font} · {directorBrief.motion_language}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {directorBrief.scenes.map((scene, i) => (
                <div
                  key={i}
                  style={{
                    background: '#040600',
                    border: `1px solid ${scene.accent}22`,
                    padding: '7px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        background: scene.accent,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 7, fontFamily: 'var(--font-dm-mono), monospace', color: scene.accent, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {i + 1} · {scene.layout}
                    </span>
                    {scene.primitives.length > 0 && (
                      <span style={{ fontSize: 7, fontFamily: 'var(--font-dm-mono), monospace', color: '#7a9900', letterSpacing: '0.06em', marginLeft: 'auto' }}>
                        {scene.primitives.join(' · ')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#ccee60', fontWeight: 700, lineHeight: 1.25 }}>
                    {scene.headline}
                  </div>
                  {scene.kicker && (
                    <div style={{ fontSize: 8, fontFamily: 'var(--font-dm-mono), monospace', color: '#aabb44', lineHeight: 1.3 }}>
                      {scene.kicker}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Output */}
      <AnimatePresence>
        {generationPhase !== 'idle' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ border: `1px solid ${generationPhase === 'error' ? '#ff3300' : '#333'}`, background: '#050505', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: generationPhase === 'error' ? '#ff3300' : '#ccff00', fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 600, textTransform: 'uppercase' }}>
              STATUS: {generationStatus} {elapsed > 0 && <span style={{ color: '#666', marginLeft: 'auto' }}>[{elapsed}S]</span>}
            </div>

            {streamingTokens && (
              <div style={{ background: '#000', padding: 12, fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', maxHeight: 150, overflowY: 'auto', border: '1px solid #222' }}>
                {streamingTokens}
                <motion.span
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  style={{ display: 'inline-block', width: 6, height: 10, background: '#ccff00', marginLeft: 4, verticalAlign: 'baseline' }}
                />
                <div ref={codeEndRef} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        marginBottom: 10,
        fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em',
      }}
      >
        <span style={{ color: '#ccff00', fontWeight: 700, display: 'block' }}>{label}</span>
        {hint ? (
          <span style={{
            display: 'block',
            marginTop: 6,
            color: '#555',
            fontSize: 9,
            textTransform: 'lowercase',
            letterSpacing: '0.04em',
            lineHeight: 1.45,
            maxWidth: '100%',
          }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Tiny preview of an aspect — rectangle + subtle split to suggest camera direction. */
function AspectThumb({ aspect, active }: { aspect: ReelAspect; active: boolean }) {
  const ratios: Record<ReelAspect, { w: number; h: number }> = {
    '9:16': { w: 14, h: 24 },
    '1:1':  { w: 20, h: 20 },
    '4:5':  { w: 18, h: 22 },
    '16:9': { w: 26, h: 14 },
  };
  const { w, h } = ratios[aspect];
  return (
    <div
      style={{
        width: w,
        height: h,
        border: `1.5px solid ${active ? '#ccff00' : '#555'}`,
        background: active ? 'rgba(204,255,0,0.12)' : 'transparent',
        position: 'relative',
        borderRadius: 2,
      }}
    >
      <div style={{
        position: 'absolute', left: 1, right: 1, bottom: 2, height: 2,
        background: active ? '#ccff00' : '#555',
      }} />
    </div>
  );
}
