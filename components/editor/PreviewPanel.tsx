'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore } from '@/stores/editor-store';
import { useTimelineStore } from '@/stores/timeline-store';
import { loadCompositionComponent, COMPOSITION_CONFIGS } from '@/lib/composition-configs';
import type { ComponentType } from 'react';
import type { PlayerRef } from '@remotion/player';

// Dynamic import of Remotion Player — must be SSR-disabled
const RemotionPlayer = dynamic(
  () => import('@remotion/player').then((m) => ({ default: m.Player })),
  { ssr: false }
);

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 16,
        position: 'relative',
      }}
    >
      {/* Background blob */}
      <div
        style={{
          position: 'absolute',
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />

      {/* Logo mark */}
      <div
        style={{
          width: 56,
          height: 56,
          background: 'rgba(124,58,237,0.12)',
          border: '1px solid rgba(124,58,237,0.25)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <polygon points="6,4 20,12 6,20" fill="rgba(167,139,250,0.8)" />
        </svg>
      </div>

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontSize: 16,
            fontFamily: 'var(--font-syne), system-ui, sans-serif',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 6,
          }}
        >
          Generate your first reel
        </div>
        <div
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Open the AI panel on the left ←
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
      }}
    >
      <motion.div
        animate={{
          background: [
            'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)',
            'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)',
            'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
          color: 'rgba(255,255,255,0.35)',
        }}
      >
        Loading composition…
      </span>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
};

export function PreviewPanel() {
  const {
    activeComposition,
    compositionConfig,
    generationPhase,
    generationStatus,
    elapsed,
    lastError,
    setPreviewFrame,
    previewFrame,
  } = useEditorStore();

  const { currentFrame, setCurrentFrame, isPlaying, setPlaying } = useTimelineStore();

  const [CompComponent, setCompComponent] = useState<ComponentType | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

  // Load composition component when activeComposition changes
  useEffect(() => {
    if (!activeComposition) {
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

  // Subscribe to frame updates via addEventListener
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(e.detail.frame);
      setPreviewFrame(e.detail.frame);
    };

    player.addEventListener('frameupdate', onFrameUpdate);
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
    };
  });

  // Sync store playing state → player
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

  const isError = generationPhase === 'error';

  // Compute aspect ratio for player container
  const aspectW = config?.width ?? 1080;
  const aspectH = config?.height ?? 1920;
  const isPortrait = aspectH >= aspectW;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: '#080808',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Main content */}
      {!activeComposition && !isGenerating ? (
        <EmptyState />
      ) : loadingComp ? (
        <LoadingState />
      ) : CompComponent && config ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            padding: 16,
            gap: 10,
            boxSizing: 'border-box',
          }}
        >
          {/* Player container */}
          <div
            style={{
              flex: 1,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
            }}
          >
            <div
              style={{
                height: isPortrait ? '100%' : 'auto',
                width: isPortrait ? 'auto' : '100%',
                aspectRatio: `${aspectW} / ${aspectH}`,
                maxHeight: '100%',
                maxWidth: '100%',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 24px 48px rgba(0,0,0,0.5)',
              }}
            >
              <RemotionPlayer
                ref={playerRef}
                component={CompComponent as React.ComponentType<Record<string, unknown>>}
                durationInFrames={config.durationInFrames}
                fps={config.fps}
                compositionWidth={config.width}
                compositionHeight={config.height}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                initialFrame={previewFrame}
              />
            </div>
          </div>

          {/* Transport controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
            }}
          >
            <button
              onClick={() => {
                setCurrentFrame(0);
                playerRef.current?.seekTo(0);
              }}
              style={iconButtonStyle}
              title="Reset"
            >
              <RotateCcw size={14} />
            </button>

            <button
              onClick={() => {
                const newPlaying = !isPlaying;
                setPlaying(newPlaying);
                if (newPlaying) {
                  playerRef.current?.play();
                } else {
                  playerRef.current?.pause();
                }
              }}
              style={{
                ...iconButtonStyle,
                background: 'rgba(124,58,237,0.15)',
                borderColor: 'rgba(124,58,237,0.4)',
                color: '#a78bfa',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: 'rgba(255,255,255,0.4)',
                minWidth: 80,
                textAlign: 'center',
              }}
            >
              {currentFrame} / {config.durationInFrames}
            </div>

            {/* Scrubber */}
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
              style={{
                width: 140,
                accentColor: '#7c3aed',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Generating overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8,8,8,0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              backdropFilter: 'blur(4px)',
            }}
          >
            {/* Bouncing dots */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#a78bfa',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                color: 'rgba(255,255,255,0.7)',
                maxWidth: 280,
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              {generationStatus || 'Generating…'}
            </div>
            {elapsed > 0 && (
              <div
                style={{
                  fontSize: 12,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: 'rgba(255,255,255,0.3)',
                }}
              >
                {elapsed}s elapsed
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {isError && lastError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(8,8,8,0.9)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                color: '#ef4444',
                maxWidth: 320,
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              {lastError}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
