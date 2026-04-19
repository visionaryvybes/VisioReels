'use client';

import { useState, useRef } from 'react';
import { useEditorStore, REEL_ASPECTS, REEL_PACE, MOTION_FEEL } from '@/stores/editor-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

type RenderState = 'idle' | 'rendering' | 'done' | 'error';
interface RenderProgress { progress: number; frame: number; total: number; }

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid #1a1a1a', padding: '24px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#ccff00', fontFamily: 'var(--font-dm-mono), monospace', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function RightInspector() {
  const { activeComposition, compositionConfig, aspect, pace, motionFeel, captionTone, transitionEnergy, targetDurationSec } = useEditorStore();
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [renderProgress, setRenderProgress] = useState<RenderProgress>({ progress: 0, frame: 0, total: 0 });
  const [renderError, setRenderError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const config = activeComposition
    ? compositionConfig ?? COMPOSITION_CONFIGS[activeComposition]
    : null;

  // Fall back to the user's chosen canvas when no composition has rendered yet
  // — so the inspector still gives a live read of "what we'll render".
  const aspectMeta = REEL_ASPECTS[aspect];
  const displayWidth = config?.width ?? aspectMeta.w;
  const displayHeight = config?.height ?? aspectMeta.h;
  const displayFps = config?.fps ?? 30;
  const displayLen = config?.durationInFrames ?? null;

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

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

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
              case 'bundling':
                setRenderProgress({ progress: Math.round(((ev.progress as number) ?? 0) * 0.25), frame: 0, total: 0 });
                break;
              case 'encoding':
              case 'progress':
                setRenderProgress({ progress: (ev.progress as number) ?? 0, frame: (ev.frame as number) ?? 0, total: (ev.total as number) ?? 0 });
                break;
              case 'done':
                setRenderState('done');
                setRenderProgress({ progress: 100, frame: 0, total: 0 });
                break;
              case 'error':
                throw new Error(ev.output as string);
            }
          } catch {
            // ignore
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
        width: '100%',
        minWidth: 0,
        flex: 1,
        background: '#000',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      {/* Header */}
      <div style={{ padding: '24px 24px 0 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', letterSpacing: '0.05em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>RES:</span>
            <span style={{ color: '#ccc' }}>{displayWidth}×{displayHeight}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>FPS:</span>
            <span style={{ color: '#ccc' }}>{displayFps}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>LEN:</span>
            <span style={{ color: '#ccc' }}>{displayLen != null ? `${displayLen} FR` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>TARGET:</span>
            <span style={{ color: '#ccff00' }}>{targetDurationSec}s</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>CANVAS:</span>
            <span style={{ color: '#ccff00' }}>{aspect}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>PACE:</span>
            <span style={{ color: '#ccff00', textTransform: 'uppercase' }}>{pace}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>MOTION:</span>
            <span style={{ color: '#888', textTransform: 'capitalize' }}>{motionFeel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>COPY:</span>
            <span style={{ color: '#888', textTransform: 'capitalize' }}>{captionTone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>CUTS:</span>
            <span style={{ color: '#888', textTransform: 'uppercase' }}>{transitionEnergy}</span>
          </div>
          {!activeComposition && (
            <div style={{ marginTop: 8, color: '#555', fontSize: 10 }}>
              NO COMPOSITION · hit generate
            </div>
          )}
          {activeComposition && (
            <div style={{ marginTop: 4, color: '#666', fontSize: 10, lineHeight: 1.45 }}>
              {REEL_PACE[pace].blurb}
              <br />
              {MOTION_FEEL[motionFeel].remotionHint.slice(0, 72)}…
            </div>
          )}
        </div>
      </div>

      <InspectorSection title="VIDEO SETTINGS">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', alignItems: 'center', letterSpacing: '0.05em' }}>
            <span>FORMAT</span>
            <span style={{ color: '#ccc', border: '1px solid #333', padding: '4px 8px', borderRadius: 4 }}>MP4</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', alignItems: 'center', letterSpacing: '0.05em' }}>
            <span>QUALITY</span>
            <span style={{ color: '#ccc', border: '1px solid #333', padding: '4px 8px', borderRadius: 4 }}>HIGH</span>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="EXPORT VIDEO">
        <button
          onClick={handleRender}
          disabled={!activeComposition || renderState === 'rendering'}
          className="btn-primary"
          style={{
            width: '100%',
            cursor: !activeComposition || renderState === 'rendering' ? 'not-allowed' : 'pointer',
          }}
        >
          {renderState === 'rendering' ? 'RENDERING...' : 'START RENDER'}
        </button>

        {renderState === 'rendering' && (
          <div style={{ marginTop: 16, border: '1px solid #333', background: '#050505', padding: 16, borderRadius: 4 }}>
            <div style={{ height: 4, background: '#111', marginBottom: 12, overflow: 'hidden', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${renderProgress.progress}%`, background: '#ccff00', transition: 'width 0.2s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#888' }}>
              <span>FRAME {renderProgress.frame} / {renderProgress.total}</span>
              <span>{Math.round(renderProgress.progress)}%</span>
            </div>
          </div>
        )}

        {renderState === 'done' && activeComposition && (
          <a
            href={`/api/download?comp=${encodeURIComponent(activeComposition)}`}
            download={`${activeComposition}.mp4`}
            className="btn-primary"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 16, width: '100%',
              textDecoration: 'none'
            }}
          >
            DOWNLOAD VIDEO
          </a>
        )}

        {renderState === 'error' && renderError && (
          <div style={{ marginTop: 16, border: '1px solid #ff3300', background: '#1a0500', color: '#ff3300', padding: 14, fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', lineHeight: 1.5, borderRadius: 4 }}>
            FAILED: {renderError}
          </div>
        )}

        {(renderState === 'done' || renderState === 'error') && (
          <button
            onClick={() => { setRenderState('idle'); setRenderError(null); }}
            style={{ display: 'block', marginTop: 24, width: '100%', background: 'none', border: 'none', color: '#666', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', cursor: 'pointer', textAlign: 'center', textDecoration: 'underline', textTransform: 'uppercase' }}
          >
            START NEW RENDER
          </button>
        )}
      </InspectorSection>
    </div>
  );
}
