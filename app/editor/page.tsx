'use client';

import { useState } from 'react';
import { Topbar } from '@/components/editor/Topbar';
import { LeftSidebar } from '@/components/editor/LeftSidebar';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { RightInspector } from '@/components/editor/RightInspector';
import { Timeline } from '@/components/editor/Timeline';

type MobileTab = 'ai' | 'preview' | 'export';

export default function EditorPage() {
  const [tab, setTab] = useState<MobileTab>('preview');

  // Keep editor state across visits (zustand persist + in-memory timeline) so
  // previews and HtmlSlideVideo props stay in sync. Use Topbar **New** for a full reset.

  return (
    <div className="editor-shell">
      <Topbar />

      {/* Mobile-only tab switcher (desktop media query hides it) */}
      <div className="editor-mobile-tabs">
        <button
          className="editor-mobile-tab"
          data-active={tab === 'ai'}
          onClick={() => setTab('ai')}
        >
          AI
        </button>
        <button
          className="editor-mobile-tab"
          data-active={tab === 'preview'}
          onClick={() => setTab('preview')}
        >
          Preview
        </button>
        <button
          className="editor-mobile-tab"
          data-active={tab === 'export'}
          onClick={() => setTab('export')}
        >
          Export
        </button>
      </div>

      <div className="editor-cols">
        <div className="editor-pane editor-left" data-active={tab === 'ai'}>
          <LeftSidebar />
        </div>

        <div className="editor-pane" data-active={tab === 'preview'}>
          <PreviewPanel />
        </div>

        <div className="editor-pane editor-right" data-active={tab === 'export'}>
          <RightInspector />
        </div>
      </div>

      <Timeline />
    </div>
  );
}
