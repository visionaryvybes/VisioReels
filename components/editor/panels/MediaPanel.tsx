'use client';

import { useEffect, useState } from 'react';
import { Film, Loader } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

export function MediaPanel() {
  const [compositions, setCompositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { setActiveComposition } = useEditorStore();

  useEffect(() => {
    fetch('/api/render-video')
      .then((r) => r.json())
      .then((data: { compositions?: string[] }) => {
        setCompositions(data.compositions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLoad = (compId: string) => {
    const config = COMPOSITION_CONFIGS[compId];
    if (config) {
      setActiveComposition(compId, config);
    }
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Film size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-syne), system-ui, sans-serif',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.6)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Compositions
        </span>
      </div>

      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '24px 0',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--font-dm-sans), system-ui, sans-serif' }}>
            Loading…
          </span>
        </div>
      ) : compositions.length === 0 ? (
        <div
          style={{
            padding: '20px 0',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.25)',
            fontSize: 11,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            lineHeight: 1.6,
          }}
        >
          No compositions found.
          <br />
          Generate your first reel in the AI tab.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {compositions.map((compId) => {
            const config = COMPOSITION_CONFIGS[compId];
            const durationSec = config
              ? Math.round(config.durationInFrames / config.fps)
              : '?';
            const dims = config ? `${config.width}×${config.height}` : '';

            return (
              <div
                key={compId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-syne), system-ui, sans-serif',
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.85)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {compId}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: 'rgba(255,255,255,0.3)',
                      marginTop: 2,
                    }}
                  >
                    {dims} · {durationSec}s
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(compId)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(124,58,237,0.4)',
                    background: 'rgba(124,58,237,0.12)',
                    color: '#a78bfa',
                    fontSize: 11,
                    fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
                    fontWeight: 500,
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(124,58,237,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(124,58,237,0.12)';
                  }}
                >
                  Load
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload placeholder */}
      <div
        style={{
          marginTop: 'auto',
          padding: '14px',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 8,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.2)',
          fontSize: 10,
          fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
          lineHeight: 1.6,
        }}
      >
        Upload images or videos
        <br />
        coming soon
      </div>
    </div>
  );
}
