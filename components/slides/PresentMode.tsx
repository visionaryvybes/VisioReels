'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SlideFrame, type SlideData } from './SlideFrame';
import { ASPECT_RATIOS, type SlideAspect, type SlidePreset } from '@/lib/slide-presets';

export function PresentMode({
  slides,
  preset,
  aspect,
  brand,
  startIdx,
  onClose,
  onIndexChange,
}: {
  slides: SlideData[];
  preset: SlidePreset;
  aspect: SlideAspect;
  brand: string;
  startIdx: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
}) {
  const [i, setI] = useState(Math.min(startIdx, Math.max(0, slides.length - 1)));
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const pad = 80;
      const w = window.innerWidth - pad;
      const h = window.innerHeight - pad;
      setDim({ w, h });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (el) el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'ArrowRight' || e.key === ' ') { setI((x) => Math.min(slides.length - 1, x + 1)); }
      else if (e.key === 'ArrowLeft') { setI((x) => Math.max(0, x - 1)); }
      else if (e.key === 'Home') { setI(0); }
      else if (e.key === 'End') { setI(slides.length - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  useEffect(() => {
    onIndexChange?.(i);
    try { localStorage.setItem('visio-slides-present-idx', String(i)); } catch {}
  }, [i, onIndexChange]);

  const spec = ASPECT_RATIOS[aspect];
  const ratioW = spec.w || 1080;
  const ratioH = spec.h || 1080;
  // Fit the native aspect inside the viewport minus padding
  const fitScaleByWidth = dim.w / ratioW;
  const fitScaleByHeight = dim.h / ratioH;
  const scale = Math.min(fitScaleByWidth, fitScaleByHeight);
  const renderW = Math.max(200, Math.round(ratioW * scale));

  const s = slides[i];
  if (!s) return null;

  return (
    <div
      ref={wrapRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting slide ${i + 1} of ${slides.length}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'radial-gradient(circle at 50% 30%, #0a0a0a 0%, #000 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
      }}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: 'var(--font-dm-mono)',
        fontSize: 10,
        color: '#888',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
      }}>
        <span>Presenting · {preset.label}</span>
        <span>{String(i + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
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
          aria-label="Exit present mode"
        >
          Esc · Close
        </button>
      </div>

      {/* The slide */}
      {dim.w > 0 && (
        <SlideFrame
          slide={s}
          preset={preset}
          aspect={aspect}
          index={i}
          total={slides.length}
          brand={brand}
          width={renderW}
          selected={false}
        />
      )}

      {/* Bottom nav */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
      }}>
        <NavBtn label="← Prev" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {slides.map((_, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Go to slide ${k + 1}`}
              style={{
                width: 20, height: 4,
                background: k === i ? preset.accent : '#2a2a2a',
                border: 'none', padding: 0, cursor: 'pointer', borderRadius: 2,
              }}
            />
          ))}
        </div>
        <NavBtn label="Next →" disabled={i === slides.length - 1} onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} />
      </div>
    </div>
  );
}

function NavBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: '1px solid #2a2a2a',
        color: disabled ? '#333' : '#ccc',
        padding: '8px 14px',
        fontFamily: 'var(--font-dm-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 3,
      }}
    >
      {label}
    </button>
  );
}
