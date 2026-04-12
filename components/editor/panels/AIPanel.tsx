'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Music, Smartphone, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore } from '@/stores/editor-store';
import { useProjectStore } from '@/stores/project-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

const KEYWORD_CHIPS: [RegExp, string[]][] = [
  [/\b(30s|30 sec|thirty)\b/i,  ['30 seconds', 'hook in 3s', 'snappy cuts']],
  [/\b(60s|60 sec|sixty)\b/i,   ['60 seconds', 'storytelling arc', 'b-roll']],
  [/\bdubai\b/i,                 ['aerial drone shots', 'golden hour', 'skyline']],
  [/\bmusic\b/i,                 ['beat-synced cuts', 'bass drop reveal', 'fade audio']],
  [/\bmotivat/i,                 ['bold text overlay', 'cinematic grade', 'power phrases']],
  [/\blogo\b/i,                  ['LogoReveal comp', '2D reveal', 'brand colors']],
  [/\bai\b/i,                    ['AIVideo comp', 'tech aesthetic', 'cyan accents']],
  [/\bcaption/i,                 ['word-by-word', 'auto-subtitle', 'burn-in subs']],
  [/\breels?\b/i,                ['SocialReel comp', 'hook first 2s', 'scroll-stopper']],
  [/\btiktok\b/i,                ['SocialReel-tiktok', '15s hook', 'trending sounds']],
];

function getChips(prompt: string): string[] {
  for (const [regex, chips] of KEYWORD_CHIPS) {
    if (regex.test(prompt)) return chips;
  }
  return ['cinematic', 'word-by-word captions', 'dark moody'];
}

const PLATFORM_QUICK = [
  { id: 'tiktok', label: 'TT', icon: <Music size={12} />, comp: 'SocialReel-tiktok' },
  { id: 'reels',  label: 'IG', icon: <Smartphone size={12} />, comp: 'SocialReel-reels' },
  { id: 'shorts', label: 'YT', icon: <Play size={12} />, comp: 'SocialReel-shorts' },
];

export function AIPanel() {
  const {
    prompt, setPrompt, generationPhase, generationStatus,
    streamingTokens, elapsed, setGenerationPhase, appendToken,
    clearTokens, setError, setElapsed, setActiveComposition,
    setActivePanel,
  } = useEditorStore();

  const { setPlatform, setComposition } = useProjectStore();
  const { addClip } = useTimelineStore();

  const [codeExpanded, setCodeExpanded] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const isGenerating = generationPhase === 'generating' || generationPhase === 'reading' || generationPhase === 'writing' || generationPhase === 'validating';

  // Autoresize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    clearTokens();
    setGenerationPhase('reading', 'Reading project files…');
    startTimer();

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: prompt }),
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
                setGenerationPhase('generating', generationStatus);
                break;
              case 'file_written': {
                const filePath = ev.path as string;
                setGenerationPhase('writing', `Writing ${filePath}…`);
                const compId = filePath.includes('SocialReel')
                  ? `SocialReel-${selectedPlatform}`
                  : filePath.replace(/^remotion\/compositions\//, '').replace(/\.tsx$/, '');
                const config = COMPOSITION_CONFIGS[compId] ?? COMPOSITION_CONFIGS['AIVideo'];
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
                setGenerationPhase('validating', ev.success ? 'Validation passed' : 'Validation failed');
                break;
              case 'done':
                stopTimer();
                setGenerationPhase('done', 'Generation complete');
                setActivePanel('ai');
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
  }, [prompt, isGenerating, selectedPlatform]);

  useEffect(() => () => stopTimer(), []);

  const chips = getChips(prompt);

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
        gap: 12,
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
            onClick={() => { setSelectedPlatform(p.id); setPlatform(p.id); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '5px 4px',
              borderRadius: 6,
              border: selectedPlatform === p.id
                ? '1px solid rgba(124,58,237,0.6)'
                : '1px solid rgba(255,255,255,0.08)',
              background: selectedPlatform === p.id
                ? 'rgba(124,58,237,0.15)'
                : 'rgba(255,255,255,0.04)',
              color: selectedPlatform === p.id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
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
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your reel… e.g. 'A 30s TikTok about Dubai's history with cinematic drone shots and word-by-word captions'"
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
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; }}
        />
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => setPrompt(prompt ? `${prompt}, ${chip}` : chip)}
            style={{
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 10,
              fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
              cursor: 'pointer',
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)';
              e.currentTarget.style.color = '#a78bfa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
            }}
          >
            {chip}
          </button>
        ))}
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
        onMouseEnter={(e) => {
          if (!isGenerating && prompt.trim()) {
            e.currentTarget.style.boxShadow = '0 0 24px rgba(124,58,237,0.6)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = isGenerating ? 'none' : '0 0 16px rgba(124,58,237,0.4)';
        }}
      >
        <Sparkles size={15} />
        {isGenerating ? 'Generating…' : 'Generate Reel'}
      </button>

      {/* Status area */}
      <AnimatePresence>
        {(isGenerating || generationPhase === 'done' || generationPhase === 'error') && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isGenerating && (
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
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
                {generationStatus}
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
            </div>

            {/* Streaming code preview */}
            {streamingTokens && (
              <div>
                <button
                  onClick={() => setCodeExpanded((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: 10,
                    fontFamily: 'var(--font-dm-mono), monospace',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {codeExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  code stream
                </button>
                <AnimatePresence>
                  {codeExpanded && (
                    <motion.pre
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        overflow: 'hidden',
                        fontSize: 10,
                        fontFamily: 'var(--font-dm-mono), monospace',
                        color: 'rgba(255,255,255,0.45)',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        marginTop: 4,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 120,
                        overflowY: 'auto',
                      }}
                    >
                      {streamingTokens.slice(-200)}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Done state */}
      <AnimatePresence>
        {generationPhase === 'done' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 10px',
              background: 'rgba(52,211,153,0.1)',
              border: '1px solid rgba(52,211,153,0.3)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
              color: '#34d399',
            }}
          >
            <span>✓</span>
            <span>Composition saved — preview loaded</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
