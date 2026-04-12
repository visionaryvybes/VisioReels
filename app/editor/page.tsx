'use client';

import { Topbar } from '@/components/editor/Topbar';
import { LeftSidebar } from '@/components/editor/LeftSidebar';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { RightInspector } from '@/components/editor/RightInspector';
import { Timeline } from '@/components/editor/Timeline';

export default function EditorPage() {
  return (
    <>
      <Topbar />
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <LeftSidebar />
        <PreviewPanel />
        <RightInspector />
      </div>
      <Timeline />
    </>
  );
}
