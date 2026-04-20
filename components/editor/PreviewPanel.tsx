'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/stores/editor-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { loadCompositionComponent, COMPOSITION_CONFIGS } from '@/lib/composition-configs';
import type { ComponentType } from 'react';
import type { PlayerRef } from '@remotion/player';

const RemotionPlayer = dynamic(
  () => import('@remotion/player').then((m) => ({ default: m.Player })),
  { ssr: false }
);

function requestFullscreen(el: HTMLElement) {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
  };
  if (el.requestFullscreen) return el.requestFullscreen();
  if (anyEl.webkitRequestFullscreen) return anyEl.webkitRequestFullscreen();
  if (anyEl.mozRequestFullScreen) return anyEl.mozRequestFullScreen();
  return Promise.reject(new Error('Fullscreen not supported'));
}

function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
  };
  if (document.exitFullscreen) return document.exitFullscreen();
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
  if (doc.mozCancelFullScreen) return doc.mozCancelFullScreen();
  return Promise.reject(new Error('Exit fullscreen not supported'));
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated orbital SVG backdrop */}
      <svg
        aria-hidden
        viewBox="0 0 600 600"
        style={{ position: 'absolute', inset: 0, margin: 'auto', width: '90%', maxWidth: 520, height: 'auto', opacity: 0.4, pointerEvents: 'none' }}
      >
        <defs>
          <radialGradient id="ep1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ccff00" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ccff00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ep2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="220" cy="240" r="170" fill="url(#ep1)">
          <animate attributeName="cx" values="200;260;200" dur="18s" repeatCount="indefinite" />
          <animate attributeName="cy" values="240;200;240" dur="22s" repeatCount="indefinite" />
        </circle>
        <circle cx="380" cy="360" r="150" fill="url(#ep2)">
          <animate attributeName="cx" values="380;340;380" dur="20s" repeatCount="indefinite" />
          <animate attributeName="cy" values="360;410;360" dur="24s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: 10,
            letterSpacing: '0.3em',
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
              animation: 'lp-pulse-dot 2s ease-in-out infinite',
            }}
          />
          AI-powered reels
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 'clamp(1.6rem, 3.8vw, 2.8rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            margin: 0,
          }}
        >
          Describe it.{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #ccff00 0%, #a855f7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            We render it.
          </span>
        </h2>

        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#888', lineHeight: 1.55, margin: 0, maxWidth: 400 }}>
          Write a brief in the left panel. Gemma composes the scenes, Remotion renders the MP4. Everything runs on your GPU.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          {['Local AI', 'MP4 export', 'Timeline', 'Zero API cost'].map((f) => (
            <span
              key={f}
              style={{
                padding: '4px 10px',
                border: '1px solid #ffffff15',
                borderRadius: 100,
                fontFamily: 'var(--font-dm-mono)',
                fontSize: 9,
                color: '#aaa',
                letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {f}
            </span>
          ))}
        </div>

        <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#444', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: 6 }}>
          Write a brief in the AI panel →
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
      <div style={{ padding: 16, border: '1px solid #ccff00', background: '#000', color: '#ccff00', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, letterSpacing: '0.1em' }}>
        LOADING VIDEO...
      </div>
    </div>
  );
}

export function PreviewPanel() {
  const {
    activeComposition,
    compositionConfig,
    compositionInputProps,
    generationPhase,
    setPreviewFrame,
    previewFrame,
  } = useEditorStore();

  const { currentFrame, setCurrentFrame, isPlaying, setPlaying } = useTimelineStore();

  const [CompComponent, setCompComponent] = useState<ComponentType | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const fullViewRef = useRef<HTMLDivElement>(null);
  const [isFullView, setIsFullView] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullView(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullView = () => {
    const el = fullViewRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void requestFullscreen(el).catch(() => {});
    } else {
      void exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (!activeComposition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompComponent(null);
      return;
    }
    setLoadingComp(true);
    setCompComponent(null);

    loadCompositionComponent(activeComposition)
      .then((comp) => {
        setCompComponent(() => comp);
      })
      .catch(() => {
        setCompComponent(null);
      })
      .finally(() => setLoadingComp(false));
  }, [activeComposition]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !CompComponent) return;

    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
      setPreviewFrame(e.detail.frame);
    };

    player.addEventListener('frameupdate', onFrameUpdate);
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
    };
  }, [CompComponent, setCurrentFrame, setPreviewFrame]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying]);

  const config = activeComposition
    ? compositionConfig ?? COMPOSITION_CONFIGS[activeComposition]
    : null;

  const isGenerating =
    generationPhase === 'generating' ||
    generationPhase === 'reading' ||
    generationPhase === 'writing' ||
    generationPhase === 'validating';

  const aspectW = config?.width ?? 1080;
  const aspectH = config?.height ?? 1920;
  const isPortrait = aspectH >= aspectW;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: '#0a0a0a',
        backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Corner reticles */}
      <div style={{ position: 'absolute', top: 24, left: 24, width: 16, height: 16, borderTop: '2px solid #333', borderLeft: '2px solid #333' }} />
      <div style={{ position: 'absolute', top: 24, right: 24, width: 16, height: 16, borderTop: '2px solid #333', borderRight: '2px solid #333' }} />
      <div style={{ position: 'absolute', bottom: 24, left: 24, width: 16, height: 16, borderBottom: '2px solid #333', borderLeft: '2px solid #333' }} />
      <div style={{ position: 'absolute', bottom: 24, right: 24, width: 16, height: 16, borderBottom: '2px solid #333', borderRight: '2px solid #333' }} />

      {!activeComposition && !isGenerating ? (
        <EmptyState />
      ) : loadingComp ? (
        <LoadingState />
      ) : CompComponent && config ? (
        <div
          ref={fullViewRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            padding: 'clamp(12px, 3vw, 48px)',
            boxSizing: 'border-box',
            gap: 'clamp(8px, 2vw, 24px)',
            background: isFullView ? '#0a0a0a' : undefined,
          }}
        >
          {/* Player container */}
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <div
              style={{
                position: 'relative',
                height: isPortrait ? '100%' : 'auto',
                width: isPortrait ? 'auto' : '100%',
                aspectRatio: `${aspectW} / ${aspectH}`,
                maxHeight: '100%',
                maxWidth: '100%',
                background: '#000',
                border: '1px solid #333',
                boxShadow: '0 24px 48px rgba(0,0,0,0.8)',
                overflow: 'hidden',
              }}
            >
              <RemotionPlayer
                ref={playerRef}
                key={
                  activeComposition === 'HtmlSlideVideo'
                    ? JSON.stringify(
                        (compositionInputProps?.slidePaths as string[] | undefined) ?? []
                      )
                    : activeComposition
                }
                component={CompComponent as React.ComponentType<Record<string, unknown>>}
                durationInFrames={config.durationInFrames}
                fps={config.fps}
                compositionWidth={config.width}
                compositionHeight={config.height}
                style={{ width: '100%', height: '100%' }}
                acknowledgeRemotionLicense
                controls={false}
                initialFrame={previewFrame}
                {...(activeComposition === 'HtmlSlideVideo'
                  ? {
                      inputProps:
                        compositionInputProps ?? { slidePaths: [] as string[] },
                    }
                  : {})}
              />
              {/* Captures clicks so full view works even when the canvas swallows events (controls=false). */}
              <div
                role="button"
                tabIndex={0}
                title="Click for full view (Esc to exit)"
                aria-label={isFullView ? 'Video preview' : 'Open full view'}
                onClick={() => {
                  if (document.fullscreenElement) return;
                  toggleFullView();
                }}
                onKeyDown={(e) => {
                  if (document.fullscreenElement) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleFullView();
                  }
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  cursor: isFullView ? 'default' : 'pointer',
                  background: 'transparent',
                  pointerEvents: isFullView ? 'none' : 'auto',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                aria-label={isFullView ? 'Exit full view' : 'Full view'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullView();
                }}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  padding: 0,
                  border: '1px solid #444',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#ccff00',
                  cursor: 'pointer',
                  transition: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#ccff00';
                  e.currentTarget.style.background = 'rgba(204,255,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#444';
                  e.currentTarget.style.background = 'rgba(0,0,0,0.65)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="square" />
                </svg>
              </button>
            </div>
          </div>

          {/* Brutalist Transport Controls */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#000', border: '1px solid #333', padding: '8px 16px', gap: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' }}>
            <button
              type="button"
              onClick={() => { setCurrentFrame(0); playerRef.current?.seekTo(0); }}
              style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, letterSpacing: '0.05em', transition: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = '#888'}
            >
              [RESTART]
            </button>

            <button
              type="button"
              onClick={() => {
                const newPlaying = !isPlaying;
                setPlaying(newPlaying);
                if (newPlaying) playerRef.current?.play();
                else playerRef.current?.pause();
              }}
              style={{
                background: isPlaying ? '#ccff00' : 'transparent', border: `1px solid ${isPlaying ? '#ccff00' : '#888'}`, color: isPlaying ? '#000' : '#fff',
                cursor: 'pointer', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, letterSpacing: '0.05em', fontWeight: 700, padding: '4px 12px', transition: 'none'
              }}
            >
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            <button
              type="button"
              onClick={toggleFullView}
              style={{
                background: 'transparent',
                border: '1px solid #555',
                color: '#aaa',
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: 10,
                letterSpacing: '0.05em',
                fontWeight: 700,
                padding: '4px 12px',
                transition: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ccff00';
                e.currentTarget.style.color = '#ccff00';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#555';
                e.currentTarget.style.color = '#aaa';
              }}
            >
              {isFullView ? '[EXIT FULL]' : '[FULL VIEW]'}
            </button>

            <div style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', color: '#ccff00', minWidth: 80, textAlign: 'center', borderLeft: '1px solid #333', paddingLeft: 16 }}>
              F:{String(currentFrame).padStart(4, '0')}
            </div>

            <input
              type="range"
              min={0}
              max={config.durationInFrames - 1}
              value={currentFrame}
              onChange={(e) => {
                const f = parseInt(e.target.value);
                setCurrentFrame(f);
                setPreviewFrame(f);
                playerRef.current?.seekTo(f);
              }}
              style={{ width: 'min(240px, 60vw)', accentColor: '#ccff00', cursor: 'pointer', height: 2, background: '#333', appearance: 'none' }}
            />
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
