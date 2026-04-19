'use client';

import { useState } from 'react';
import type { SlideTweaks } from './SlideFrame';

export interface TweaksPanelProps {
  tweaks: SlideTweaks;
  scope: 'slide' | 'deck';
  onChange: (next: SlideTweaks) => void;
  onScope: (scope: 'slide' | 'deck') => void;
  onReset: () => void;
}

const DEFS: SlideTweaks = {
  typeScale: 1,
  padding: 8,
  grain: 0,
  imgBrightness: 1,
  imgContrast: 1,
};

export function TweaksPanel({ tweaks, scope, onChange, onScope, onReset }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const v = { ...DEFS, ...tweaks };
  const set = (patch: Partial<SlideTweaks>) => onChange({ ...v, ...patch });

  const isDirty = (Object.keys(DEFS) as (keyof SlideTweaks)[]).some(
    (k) => (tweaks[k] ?? DEFS[k]) !== DEFS[k]
  );

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 60,
        zIndex: 80,
        width: open ? 280 : 'auto',
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 10,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(204,255,0,0.08)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: isDirty ? '#ccff00' : '#aaa',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: isDirty ? '#ccff00' : '#2a2a2a',
            boxShadow: isDirty ? '0 0 6px #ccff0080' : 'none',
          }}
        />
        Tweaks {isDirty ? '· dirty' : ''}
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{open ? '–' : '+'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 2, background: '#050505', border: '1px solid #151515', borderRadius: 4 }}>
            {(['slide', 'deck'] as const).map((s) => (
              <button
                key={s}
                onClick={() => onScope(s)}
                style={{
                  padding: '6px 0',
                  background: scope === s ? '#ccff00' : 'transparent',
                  color: scope === s ? '#000' : '#888',
                  border: 'none',
                  fontFamily: 'var(--font-dm-mono)',
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  borderRadius: 3,
                }}
              >
                {s === 'slide' ? 'This slide' : 'Whole deck'}
              </button>
            ))}
          </div>

          <Slider label="Type scale" value={v.typeScale ?? 1} min={0.6} max={1.6} step={0.02}
            suffix="×" onChange={(n) => set({ typeScale: n })} />
          <Slider label="Padding" value={v.padding ?? 8} min={2} max={14} step={0.5}
            suffix="%" onChange={(n) => set({ padding: n })} />
          <Slider label="Grain" value={v.grain ?? 0} min={0} max={1} step={0.02}
            onChange={(n) => set({ grain: n })} />
          <Slider label="Brightness" value={v.imgBrightness ?? 1} min={0.4} max={1.6} step={0.02}
            suffix="×" onChange={(n) => set({ imgBrightness: n })} />
          <Slider label="Contrast" value={v.imgContrast ?? 1} min={0.4} max={1.6} step={0.02}
            suffix="×" onChange={(n) => set({ imgContrast: n })} />

          <button
            onClick={onReset}
            disabled={!isDirty}
            style={{
              marginTop: 2,
              padding: '8px 0',
              background: 'transparent',
              border: `1px solid ${isDirty ? '#2a2a2a' : '#151515'}`,
              color: isDirty ? '#888' : '#333',
              fontFamily: 'var(--font-dm-mono)',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              borderRadius: 3,
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

function Slider({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#555', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        <span>{label}</span>
        <span style={{ color: '#888' }}>{value.toFixed(2)}{suffix ?? ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ accentColor: '#ccff00', width: '100%' }}
      />
    </label>
  );
}
