'use client';

import { Download } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';

export function ExportPanel() {
  const { activeComposition, compositionConfig } = useEditorStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 10px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-syne), system-ui, sans-serif',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.6)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        Export
      </div>

      {!activeComposition ? (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.22)',
            fontSize: 11,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            lineHeight: 1.7,
          }}
        >
          Generate a composition first,
          <br />
          then export from the right panel.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              padding: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-dm-mono), monospace',
                color: '#a78bfa',
                marginBottom: 4,
              }}
            >
              {activeComposition}
            </div>
            {compositionConfig && (
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-dm-mono), monospace',
                  color: 'rgba(255,255,255,0.3)',
                  lineHeight: 1.6,
                }}
              >
                {compositionConfig.width}×{compositionConfig.height} · {compositionConfig.fps}fps
                <br />
                {Math.round(compositionConfig.durationInFrames / compositionConfig.fps)}s ·{' '}
                {compositionConfig.durationInFrames} frames
              </div>
            )}
          </div>

          <p
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
              color: 'rgba(255,255,255,0.3)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Use the Render panel on the right to render and download your MP4.
          </p>

          <a
            href={`/out/${activeComposition}.mp4`}
            download
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '9px',
              borderRadius: 8,
              border: '1px solid rgba(52,211,153,0.3)',
              background: 'rgba(52,211,153,0.08)',
              color: '#34d399',
              fontSize: 12,
              fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(52,211,153,0.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(52,211,153,0.08)';
            }}
          >
            <Download size={14} />
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
}
