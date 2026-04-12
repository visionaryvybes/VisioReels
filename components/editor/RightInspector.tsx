'use client';

import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Download, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore } from '@/stores/editor-store';
import { useProjectStore } from '@/stores/project-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';
import { PLATFORMS } from '@/lib/platforms';

type RenderState = 'idle' | 'rendering' | 'done' | 'error';

interface RenderProgress {
  progress: number;
  frame: number;
  total: number;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 10,
          fontFamily: 'var(--font-syne), system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
      >
        {title}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RightInspector() {
  const { activeComposition, compositionConfig } = useEditorStore();
  const { current, setPlatform } = useProjectStore();
  const [crf, setCrf] = useState(18);
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderProgress, setRenderProgress] = useState<RenderProgress>({ progress: 0, frame: 0, total: 0 });
  const [renderError, setRenderError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const config = activeComposition
    ? compositionConfig ?? COMPOSITION_CONFIGS[activeComposition]
    : null;

  const estimatedMB = config
    ? Math.round((config.durationInFrames / config.fps) * 2)
    : 0;

  const handleRender = async () => {
    if (!activeComposition || renderState === 'rendering') return;

    setRenderState('rendering');
    setRenderError(null);
    setRenderProgress({ progress: 0, frame: 0, total: 0 });

    try {
      const res = await fetch('/api/render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition: activeComposition }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
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
              case 'progress':
              case 'encoding':
                setRenderProgress({
                  progress: (ev.progress as number) ?? 0,
                  frame: (ev.frame as number) ?? 0,
                  total: (ev.total as number) ?? 0,
                });
                break;
              case 'done':
                setRenderState('done');
                setRenderProgress({ progress: 100, frame: 0, total: 0 });
                break;
              case 'error':
                throw new Error(ev.output as string);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
              throw parseErr;
            }
          }
        }
      }
    } catch (e: unknown) {
      setRenderState('error');
      setRenderError(e instanceof Error ? e.message : 'Render failed');
    }
  };

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: '#0f0f0f',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      {/* Section: Platform & Format */}
      <CollapsibleSection title="Platform & Format">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {PLATFORMS.map((p) => {
              const selected = current.platform === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    border: selected
                      ? '1px solid rgba(124,58,237,0.55)'
                      : '1px solid rgba(255,255,255,0.08)',
                    background: selected
                      ? 'rgba(124,58,237,0.14)'
                      : 'rgba(255,255,255,0.03)',
                    color: selected ? '#a78bfa' : 'rgba(255,255,255,0.55)',
                    fontSize: 10,
                    fontFamily: 'var(--font-syne), system-ui, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                    }
                  }}
                >
                  <span>{p.name}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: selected ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {p.aspectRatio}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Composition info */}
          {config && (
            <div
              style={{
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                fontSize: 10,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: 'rgba(255,255,255,0.35)',
                lineHeight: 1.7,
              }}
            >
              <div>{config.width}×{config.height} px</div>
              <div>{config.fps} fps · {Math.round(config.durationInFrames / config.fps)}s</div>
              <div>{config.durationInFrames} frames</div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Quality */}
      <CollapsibleSection title="Quality">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
                fontSize: 11,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              <span>CRF</span>
              <span
                style={{
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: '#a78bfa',
                }}
              >
                {crf}
              </span>
            </div>
            <input
              id="crf-slider"
              name="crf-slider"
              type="range"
              min={15}
              max={28}
              value={crf}
              onChange={(e) => setCrf(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#7c3aed', cursor: 'pointer' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 4,
                fontSize: 9,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: 'rgba(255,255,255,0.2)',
              }}
            >
              <span>lossless</span>
              <span>smaller</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              Codec
            </span>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: 'rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.05)',
                padding: '2px 7px',
                borderRadius: 4,
              }}
            >
              H.264
            </span>
          </div>

          {estimatedMB > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                Est. size
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: 'rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '2px 7px',
                  borderRadius: 4,
                }}
              >
                ~{estimatedMB} MB
              </span>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Render & Export */}
      <CollapsibleSection title="Render & Export">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Render button */}
          <button
            onClick={handleRender}
            disabled={!activeComposition || renderState === 'rendering'}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: 8,
              border: 'none',
              background:
                renderState === 'rendering'
                  ? 'rgba(124,58,237,0.3)'
                  : !activeComposition
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: !activeComposition ? 'rgba(255,255,255,0.3)' : 'white',
              fontSize: 13,
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontWeight: 700,
              cursor: !activeComposition || renderState === 'rendering' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
              boxShadow:
                activeComposition && renderState === 'idle'
                  ? '0 0 16px rgba(124,58,237,0.35)'
                  : 'none',
            }}
          >
            {renderState === 'rendering' ? (
              <>
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Rendering…
              </>
            ) : (
              'Render → MP4'
            )}
          </button>

          {/* Progress bar */}
          <AnimatePresence>
            {renderState === 'rendering' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div
                  style={{
                    height: 4,
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    animate={{ width: `${renderProgress.progress}%` }}
                    transition={{ duration: 0.4 }}
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-dm-mono), monospace',
                    color: 'rgba(255,255,255,0.35)',
                    textAlign: 'center',
                  }}
                >
                  {renderProgress.total > 0
                    ? `frame ${renderProgress.frame} / ${renderProgress.total}`
                    : `${renderProgress.progress}%`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Done state */}
          <AnimatePresence>
            {renderState === 'done' && activeComposition && (
              <motion.a
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                href={`/out/${activeComposition}.mp4`}
                download
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '10px',
                  borderRadius: 8,
                  border: '1px solid rgba(52,211,153,0.35)',
                  background: 'rgba(52,211,153,0.1)',
                  color: '#34d399',
                  fontSize: 13,
                  fontFamily: 'var(--font-syne), system-ui, sans-serif',
                  fontWeight: 700,
                  textDecoration: 'none',
                  transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(52,211,153,0.18)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(52,211,153,0.1)';
                }}
              >
                <Download size={14} />
                Download MP4
              </motion.a>
            )}
          </AnimatePresence>

          {/* Error state */}
          <AnimatePresence>
            {renderState === 'error' && renderError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  padding: '8px 10px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 6,
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                  color: '#ef4444',
                  lineHeight: 1.5,
                }}
              >
                {renderError.slice(0, 200)}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reset render state */}
          {(renderState === 'done' || renderState === 'error') && (
            <button
              onClick={() => { setRenderState('idle'); setRenderError(null); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 10,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                cursor: 'pointer',
                textAlign: 'center',
                padding: '4px',
              }}
            >
              Render again
            </button>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
