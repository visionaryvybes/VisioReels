'use client';

import { useProjectStore } from '@/stores/project-store';
import { useEditorStore } from '@/stores/editor-store';

export function HistoryPanel() {
  const { history, loadProject, removeHistoryItem } = useProjectStore();
  const resetEditor = useEditorStore((s) => s.reset);

  const handleLoad = (id: string) => {
    loadProject(id);
    resetEditor();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px', height: '100%', overflowY: 'auto' }}>
      {history.length === 0 ? (
        <div style={{ padding: '40px 0', color: '#666', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, letterSpacing: '0.1em', textAlign: 'center' }}>
          HISTORY EMPTY
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {history.map((h) => (
            <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px', background: '#000', border: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h.name}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono), monospace', color: '#666', letterSpacing: '0.1em' }}>
                    {new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={() => removeHistoryItem(h.id)}
                  style={{
                    background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 4, fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, fontWeight: 700, transition: 'none'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ff3300'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                >
                  [DELETE]
                </button>
              </div>
              <button
                onClick={() => handleLoad(h.id)}
                style={{
                  width: '100%', padding: '12px 0', border: '1px solid #ccff00', background: 'transparent', color: '#ccff00',
                  fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'none'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ccff00'; e.currentTarget.style.color = '#000'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ccff00'; }}
              >
                RESTORE PROJECT
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
