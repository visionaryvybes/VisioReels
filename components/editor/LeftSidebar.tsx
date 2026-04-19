'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore, ActivePanel } from '@/stores/editor-store';
import { AIPanel } from './panels/AIPanel';
import { MediaPanel } from './panels/MediaPanel';
import { HistoryPanel } from './panels/HistoryPanel';

const TABS: { id: ActivePanel; label: string }[] = [
  { id: 'ai',      label: 'AI GENERATOR' },
  { id: 'media',   label: 'MEDIA LIBRARY' },
  { id: 'history', label: 'HISTORY' },
];

export function LeftSidebar() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        width: '100%',
        minWidth: 0,
        height: '100%',
        borderRight: '1px solid #333',
        background: '#000',
      }}
    >
      {/* Horizontal Navigation */}
      <div style={{ padding: '12px 16px', background: '#050505', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', background: '#111', borderRadius: 8, padding: 4, border: '1px solid #222' }}>
          {TABS.map((tab) => {
            const active = activePanel === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                style={{
                  flex: 1,
                  height: 32,
                  border: 'none',
                  borderRadius: 6,
                  background: active ? '#ccff00' : 'transparent',
                  color: active ? '#000' : '#888',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: 10,
                  letterSpacing: '0.05em',
                  fontWeight: active ? 700 : 500,
                  transition: 'all 0.15s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!active) { e.currentTarget.style.color = '#ccc'; }
                }}
                onMouseLeave={(e) => {
                  if (!active) { e.currentTarget.style.color = '#888'; }
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel content */}
      <div
        style={{
          flex: 1,
          background: '#050505',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{ height: '100%' }}
          >
            {activePanel === 'ai' && <AIPanel />}
            {activePanel === 'media' && <MediaPanel />}
            {activePanel === 'history' && <HistoryPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
