'use client';

import { useRef, useEffect } from 'react';
import { useTimelineStore } from '@/stores/timeline-store';
import { useEditorStore } from '@/stores/editor-store';

export function Timeline() {
  const { clips, currentFrame, setCurrentFrame, setSelected, selectedClipId, addClip } = useTimelineStore();
  const activeComposition = useEditorStore((s) => s.activeComposition);
  const compositionConfig = useEditorStore((s) => s.compositionConfig);
  const trackRef = useRef<HTMLDivElement>(null);

  // Sync timeline from persisted editor store — fires whenever the active composition
  // changes (from SSE handler, page refresh, or manual composition switch).
  // This is the authoritative source: if a composition is active, it must appear in the timeline.
  useEffect(() => {
    if (activeComposition && compositionConfig) {
      addClip({
        composition: activeComposition,
        durationInFrames: compositionConfig.durationInFrames,
        fps: compositionConfig.fps ?? 30,
        label: activeComposition,
      });
    }
  }, [activeComposition, compositionConfig, addClip]);

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
      className="timeline-root"
      style={{
        flexShrink: 0,
        background: '#000',
        borderTop: '1px solid #333',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Track Label — hidden on mobile via .timeline-label */}
      <div
        className="timeline-label"
        style={{
          width: 320,
          flexShrink: 0,
          background: '#050505',
          borderRight: '1px solid #333',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1, padding: '24px 20px', display: 'flex', alignItems: 'flex-end', color: '#666', fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.05em' }}>
          MAIN VIDEO TRACK
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#000' }}>
        {/* Time Ruler */}
        <div
          style={{
            height: 48, borderBottom: '1px solid #222', position: 'relative', background: '#050505',
          }}
        >
          {/* Tick marks */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg, #333, #333 1px, transparent 1px, transparent 40px)', backgroundSize: '40px 100%' }} />

          {clips.length > 0 && Array.from({ length: 11 }).map((_, i) => {
            const frame = Math.round((i / 10) * totalFrames);
            const fps = clips[0]?.fps ?? 30;
            const sec = Math.round(frame / fps);
            return (
              <div key={i} style={{ position: 'absolute', left: `${i * 10}%`, bottom: 4, transform: 'translateX(-50%)', fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', userSelect: 'none', padding: '0 4px', background: '#050505' }}>
                {sec}s
              </div>
            );
          })}
        </div>

        {/* Track Area */}
        <div ref={trackRef} onClick={handleTrackClick} style={{ flex: 1, position: 'relative', cursor: 'crosshair' }}>
          {/* Background grid lines */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg, #111, #111 1px, transparent 1px, transparent 40px)', backgroundSize: '40px 100%' }} />

          {clips.length === 0 ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em' }}>
              [ TIMELINE IS EMPTY ]
            </div>
          ) : (
            clips.map((clip) => {
              const widthPct = totalFrames > 0 ? (clip.durationInFrames / totalFrames) * 100 : 100;
              const isSelected = selectedClipId === clip.id;

              return (
                <div
                  key={clip.id}
                  onClick={(e) => { e.stopPropagation(); setSelected(clip.id); }}
                  style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: 80, width: `${widthPct}%`,
                    background: isSelected ? '#333' : '#111',
                    border: `1px solid ${isSelected ? '#ccff00' : '#444'}`,
                    display: 'flex', alignItems: 'center', padding: '0 16px',
                    cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
                    transition: 'none'
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, color: isSelected ? '#ccff00' : '#888', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {clip.label}
                  </span>
                </div>
              );
            })
          )}

          {/* Playhead */}
          {clips.length > 0 && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${playheadPct}%`, width: 1, background: '#ff3300', pointerEvents: 'none', zIndex: 10 }}>
              <div style={{ position: 'absolute', top: -12, left: -6, width: 13, height: 12, background: '#ff3300', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
