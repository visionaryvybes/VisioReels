'use client';

import { Clock, FolderOpen } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { useEditorStore } from '@/stores/editor-store';
import { COMPOSITION_CONFIGS } from '@/lib/composition-configs';

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  reels: 'Reels',
  shorts: 'Shorts',
  pinterest: 'Pinterest',
  x: 'X',
};

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}

export function HistoryPanel() {
  const { history, loadProject } = useProjectStore();
  const { setActiveComposition } = useEditorStore();

  const handleLoad = (id: string) => {
    loadProject(id);
    const proj = history.find((h) => h.id === id);
    if (proj?.composition) {
      const config = COMPOSITION_CONFIGS[proj.composition];
      if (config) setActiveComposition(proj.composition, config);
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
        <Clock size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
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
          History
        </span>
        {history.length > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontFamily: 'var(--font-dm-mono), monospace',
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            {history.length}/20
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.22)',
            fontSize: 11,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            lineHeight: 1.7,
          }}
        >
          No history yet.
          <br />
          Generate your first reel.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {history.map((proj) => (
            <div
              key={proj.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.055)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-syne), system-ui, sans-serif',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.8)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {proj.name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: '#a78bfa',
                      background: 'rgba(124,58,237,0.12)',
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}
                  >
                    {PLATFORM_LABELS[proj.platform] ?? proj.platform}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-dm-mono), monospace',
                      color: 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {formatTime(proj.createdAt)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleLoad(proj.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)';
                  e.currentTarget.style.color = '#a78bfa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                }}
              >
                <FolderOpen size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
