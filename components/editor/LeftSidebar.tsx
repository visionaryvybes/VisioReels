'use client';

import { Sparkles, Image, Clock, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorStore, ActivePanel } from '@/stores/editor-store';
import { AIPanel } from './panels/AIPanel';
import { MediaPanel } from './panels/MediaPanel';
import { HistoryPanel } from './panels/HistoryPanel';
import { ExportPanel } from './panels/ExportPanel';

const TABS: { id: ActivePanel; icon: React.ReactNode; label: string }[] = [
  { id: 'ai',      icon: <Sparkles size={16} />,  label: 'AI' },
  { id: 'media',   icon: <Image size={16} />,      label: 'Media' },
  { id: 'history', icon: <Clock size={16} />,      label: 'History' },
  { id: 'export',  icon: <Download size={16} />,   label: 'Export' },
];

export function LeftSidebar() {
  const { activePanel, setActivePanel } = useEditorStore();

  const PanelContent = () => {
    switch (activePanel) {
      case 'ai':      return <AIPanel />;
      case 'media':   return <MediaPanel />;
      case 'history': return <HistoryPanel />;
      case 'export':  return <ExportPanel />;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        height: '100%',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Icon strip */}
      <div
        style={{
          width: 48,
          background: '#0a0a0a',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 2,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => {
          const active = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              title={tab.label}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: 'none',
                background: active ? 'rgba(124,58,237,0.18)' : 'transparent',
                color: active ? '#a78bfa' : 'rgba(255,255,255,0.35)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                cursor: 'pointer',
                transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                }
              }}
            >
              {active && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 2,
                    height: 20,
                    background: '#7c3aed',
                    borderRadius: '0 2px 2px 0',
                  }}
                />
              )}
              {tab.icon}
              <span
                style={{
                  fontSize: 8,
                  fontFamily: 'var(--font-syne), system-ui, sans-serif',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div
        style={{
          width: 192,
          background: '#0f0f0f',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ height: '100%' }}
          >
            <PanelContent />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
