'use client';

import { useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { useTimelineStore } from '@/stores/timeline-store';

export function Timeline() {
  const { clips, currentFrame, isPlaying, setCurrentFrame, setPlaying, setSelected, selectedClipId } =
    useTimelineStore();

  const trackRef = useRef<HTMLDivElement>(null);

  const totalFrames = clips.reduce((max, c) => Math.max(max, c.durationInFrames), 1);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const frame = Math.round(ratio * totalFrames);
    setCurrentFrame(frame);
  };

  const playheadPct = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  return (
    <div
      style={{
        height: 120,
        flexShrink: 0,
        background: '#0d0d0d',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Track label area */}
      <div
        style={{
          width: 64,
          flexShrink: 0,
          background: '#0a0a0a',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Play/pause button in header */}
        <div
          style={{
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <button
            onClick={() => setPlaying(!isPlaying)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: isPlaying ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
              color: isPlaying ? '#a78bfa' : 'rgba(255,255,255,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: clips.length > 0 ? 'pointer' : 'not-allowed',
              opacity: clips.length === 0 ? 0.4 : 1,
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>
        </div>

        {/* Track label */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}
          >
            VIDEO
          </span>
        </div>
      </div>

      {/* Scrollable track area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Time ruler */}
        <div
          style={{
            height: 32,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '0 0 4px',
            position: 'relative',
            background: '#0b0b0b',
          }}
        >
          {clips.length > 0 &&
            Array.from({ length: 11 }).map((_, i) => {
              const frame = Math.round((i / 10) * totalFrames);
              const fps = clips[0]?.fps ?? 30;
              const sec = Math.round(frame / fps);
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${(i / 10) * 100}%`,
                    transform: 'translateX(-50%)',
                    fontSize: 9,
                    fontFamily: 'var(--font-dm-mono), monospace',
                    color: 'rgba(255,255,255,0.2)',
                    userSelect: 'none',
                  }}
                >
                  {sec}s
                </div>
              );
            })}
        </div>

        {/* Track row */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.025)',
            position: 'relative',
            cursor: clips.length > 0 ? 'crosshair' : 'default',
            overflow: 'hidden',
          }}
        >
          {clips.length === 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                  color: 'rgba(255,255,255,0.15)',
                }}
              >
                Generate a reel to populate the timeline
              </span>
            </div>
          ) : (
            clips.map((clip) => {
              const widthPct = totalFrames > 0 ? (clip.durationInFrames / totalFrames) * 100 : 100;
              const durationSec = Math.round(clip.durationInFrames / clip.fps);
              const isSelected = selectedClipId === clip.id;

              return (
                <div
                  key={clip.id}
                  onClick={(e) => { e.stopPropagation(); setSelected(clip.id); }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 6,
                    bottom: 6,
                    width: `${widthPct}%`,
                    background: clip.color,
                    borderRadius: 6,
                    border: isSelected
                      ? '1.5px solid rgba(255,255,255,0.5)'
                      : '1px solid rgba(255,255,255,0.15)',
                    opacity: 0.85,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    gap: 8,
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-syne), system-ui, sans-serif',
                      fontWeight: 600,
                      color: 'white',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {clip.label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: 'rgba(255,255,255,0.6)',
                      flexShrink: 0,
                    }}
                  >
                    {durationSec}s
                  </span>
                </div>
              );
            })
          )}

          {/* Playhead */}
          {clips.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${playheadPct}%`,
                width: 1.5,
                background: '#a78bfa',
                pointerEvents: 'none',
                boxShadow: '0 0 6px rgba(167,139,250,0.6)',
              }}
            >
              {/* Playhead head */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 10,
                  height: 10,
                  background: '#a78bfa',
                  borderRadius: '0 0 2px 2px',
                  clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Current frame readout */}
      <div
        style={{
          width: 80,
          flexShrink: 0,
          background: '#0a0a0a',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontFamily: 'var(--font-dm-mono), monospace',
            fontWeight: 500,
            color: clips.length > 0 ? '#a78bfa' : 'rgba(255,255,255,0.2)',
          }}
        >
          {currentFrame}
        </span>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-dm-mono), monospace',
            color: 'rgba(255,255,255,0.2)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          frame
        </span>
        {clips.length > 0 && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-dm-mono), monospace',
              color: 'rgba(255,255,255,0.2)',
            }}
          >
            / {totalFrames}
          </span>
        )}
      </div>
    </div>
  );
}
