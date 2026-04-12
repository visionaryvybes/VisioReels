'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Music, Smartphone, Play, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore } from '@/stores/editor-store';
import { useProjectStore } from '@/stores/project-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

// Style chips — never appended to textarea, sent as extra context
const STYLE_CHIPS = [
  'cinematic',
  'word-by-word captions',
  'dark moody',
  'beat-synced cuts',
  'bold text overlay',
  'Ken Burns photos',
  'film grain',
  'hook in 3s',
  'aerial drone shots',
  'golden hour',
  'bass drop reveal',
  'auto-subtitle',
];

const PLATFORM_QUICK = [
  { id: 'tiktok', label: 'TT', icon: <Music size={12} /> },
  { id: 'reels',  label: 'IG', icon: <Smartphone size={12} /> },
  { id: 'shorts', label: 'YT', icon: <Play size={12} /> },
];

export function AIPanel() {
  const {
    prompt, setPrompt, generationPhase, generationStatus,
    streamingTokens, elapsed, setGenerationPhase, appendToken,
    clearTokens, setError, setElapsed, setActiveComposition,
  } = useEditorStore();

  const { setPlatform, setComposition } = useProjectStore();
  const { addClip } = useTimelineStore();

  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const isGenerating =
    generationPhase === 'generating' ||
    generationPhase === 'reading' ||
    generationPhase === 'writing' ||
    generationPhase === 'validating';

  // Autoresize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  // Auto-scroll code stream to bottom
  useEffect(() => {
    codeEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingTokens]);

  const startTimer = () => {
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const toggleChip = (chip: string) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    // Build full prompt: user text + selected style chips
    const fullPrompt =
      selectedChips.length > 0
        ? `${prompt.trim()}\n\nStyle requirements: ${selectedChips.join(', ')}`
        : prompt.trim();

    clearTokens();
    setGenerationPhase('reading', 'Reading project files…');
    startTimer();

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: fullPrompt }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

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
              case 'status':
                setGenerationPhase('generating', ev.text as string);
                break;
              case 'token':
                appendToken(ev.tok as string);
                break;
              case 'file_written': {
                const filePath = ev.path as string;
                setGenerationPhase('writing', `Writing ${filePath}…`);
                const compId = filePath.includes('SocialReel')
                  ? `SocialReel-${selectedPlatform}`
                  : filePath
                      .replace(/^remotion\/compositions\//, '')
                      .replace(/\.tsx$/, '');
                const config =
                  COMPOSITION_CONFIGS[compId] ?? COMPOSITION_CONFIGS['AIVideo'];
                setActiveComposition(compId, config);
                setComposition(compId, prompt, `out/preview-${compId}.png`);
                addClip({
                  composition: compId,
                  durationInFrames: config.durationInFrames,
                  fps: config.fps,
                  color: '#7c3aed',
                  label: compId,
                });
                break;
              }
              case 'validation':
                setGenerationPhase(
                  'validating',
                  ev.success ? 'Validation passed' : 'Validation failed'
                );
                break;
              case 'done':
                stopTimer();
                setGenerationPhase('done', 'Generation complete');
                break;
              case 'error':
                stopTimer();
                setError(ev.content as string);
                break;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (e: unknown) {
      stopTimer();
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, isGenerating, selectedPlatform, selectedChips]);

  useEffect(() => () => stopTimer(), []);

  const phaseColor: Record<string, string> = {
    idle: 'rgba(255,255,255,0.3)',
    reading: '#a78bfa',
    generating: '#a78bfa',
    writing: '#34d399',
    validating: '#f59e0b',
    done: '#34d399',
    error: '#ef4444',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 10px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Platform quick-select */}
      <div style={{ display: 'flex', gap: 4 }}>
        {PLATFORM_QUICK.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setSelectedPlatform(p.id);
              setPlatform(p.id);
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '5px 4px',
              borderRadius: 6,
              border:
                selectedPlatform === p.id
                  ? '1px solid rgba(124,58,237,0.6)'
                  : '1px solid rgba(255,255,255,0.08)',
              background:
                selectedPlatform === p.id
                  ? 'rgba(124,58,237,0.15)'
                  : 'rgba(255,255,255,0.04)',
              color:
                selectedPlatform === p.id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
              fontSize: 10,
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {p.icon}
            {p.label}
          </button>
        ))}
      </div>

      {/* Prompt textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          id="ai-prompt"
          name="ai-prompt"
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your reel… e.g. 'A 30s TikTok about Dubai history with cinematic drone shots'"
          disabled={isGenerating}
          rows={3}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.9)',
            fontSize: 12,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            lineHeight: 1.5,
            padding: '10px',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s cubic-bezier(0.16,1,0.3,1)',
            opacity: isGenerating ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
          }}
        />
      </div>

      {/* Style chips — toggle-select, never injected into textarea */}
      <div>
        <div
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-dm-mono), monospace',
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 5,
          }}
        >
          Style hints (optional)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {STYLE_CHIPS.map((chip) => {
            const active = selectedChips.includes(chip);
            return (
              <button
                key={chip}
                onClick={() => toggleChip(chip)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: active
                    ? '1px solid rgba(124,58,237,0.5)'
                    : '1px solid rgba(255,255,255,0.08)',
                  background: active
                    ? 'rgba(124,58,237,0.15)'
                    : 'rgba(255,255,255,0.04)',
                  color: active ? '#a78bfa' : 'rgba(255,255,255,0.45)',
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                {chip}
                {active && <X size={8} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || isGenerating}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          padding: '10px',
          borderRadius: 8,
          border: 'none',
          background: isGenerating
            ? 'rgba(124,58,237,0.3)'
            : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: 'white',
          fontSize: 13,
          fontFamily: 'var(--font-syne), system-ui, sans-serif',
          fontWeight: 600,
          cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
          opacity: !prompt.trim() ? 0.5 : 1,
          transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: isGenerating ? 'none' : '0 0 16px rgba(124,58,237,0.4)',
        }}
      >
        <Sparkles size={15} />
        {isGenerating ? 'Generating…' : 'Generate Reel'}
      </button>

      {/* Status pill */}
      <AnimatePresence>
        {(isGenerating ||
          generationPhase === 'done' ||
          generationPhase === 'error') && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 10px',
              background:
                generationPhase === 'done'
                  ? 'rgba(52,211,153,0.1)'
                  : generationPhase === 'error'
                  ? 'rgba(239,68,68,0.08)'
                  : 'rgba(124,58,237,0.08)',
              border: `1px solid ${
                generationPhase === 'done'
                  ? 'rgba(52,211,153,0.3)'
                  : generationPhase === 'error'
                  ? 'rgba(239,68,68,0.3)'
                  : 'rgba(124,58,237,0.2)'
              }`,
              borderRadius: 6,
            }}
          >
            {isGenerating && (
              <motion.div
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: phaseColor[generationPhase] ?? '#a78bfa',
                  flexShrink: 0,
                }}
              />
            )}
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                color: phaseColor[generationPhase] ?? 'rgba(255,255,255,0.6)',
                flex: 1,
                lineHeight: 1.4,
              }}
            >
              {generationStatus || (generationPhase === 'done' ? '✓ Composition saved — preview loading' : '')}
            </span>
            {isGenerating && elapsed > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: 'rgba(255,255,255,0.3)',
                  flexShrink: 0,
                }}
              >
                {elapsed}s
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gemma live code stream — always visible when tokens flow */}
      <AnimatePresence>
        {streamingTokens && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: 'rgba(167,139,250,0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#a78bfa',
                }}
              />
              Gemma is writing
            </div>
            <div
              style={{
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(167,139,250,0.15)',
                borderRadius: 6,
                padding: '8px 10px',
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: 'rgba(167,139,250,0.85)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  lineHeight: 1.55,
                }}
              >
                {streamingTokens}
              </pre>
              <div ref={codeEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
