'use client';

import { useEffect, useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

export function MediaPanel() {
  const [compositions, setCompositions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { setActiveComposition } = useEditorStore();

  useEffect(() => {
    fetch('/api/render-video')
      .then((r) => r.json())
      .then((data: { compositions?: string[] }) => setCompositions(data.compositions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLoad = (compId: string) => {
    const config = COMPOSITION_CONFIGS[compId] ?? { durationInFrames: 300, fps: 30, width: 1080, height: 1920 };
    setActiveComposition(compId, config);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px', height: '100%', overflowY: 'auto' }}>
      {loading ? (
        <div style={{ padding: '40px 0', color: '#666', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, letterSpacing: '0.1em', textAlign: 'center' }}>
          SCANNING LIBRARY...
        </div>
      ) : compositions.length === 0 ? (
        <div style={{ padding: '40px 0', color: '#666', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, letterSpacing: '0.1em', textAlign: 'center' }}>
          LIBRARY EMPTY
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {compositions.map((compId) => {
            const config = COMPOSITION_CONFIGS[compId];
            const durationSec = config ? Math.round(config.durationInFrames / config.fps) : '?';
            const dims = config ? `${config.width}×${config.height}` : 'Custom';

            return (
              <div key={compId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#000', border: '1px solid #333' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {compId}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#888', display: 'flex', gap: 12, alignItems: 'center', letterSpacing: '0.1em' }}>
                    <span>{dims}</span>
                    <span>|</span>
                    <span>{durationSec}S</span>
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(compId)}
                  style={{
                    padding: '8px 16px', border: '1px solid #ccff00', background: 'transparent', color: '#ccff00',
                    fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'none'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#ccff00'; e.currentTarget.style.color = '#000'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ccff00'; }}
                >
                  LOAD
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
