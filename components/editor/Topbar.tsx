'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useProjectStore } from '@/stores/project-store';
import { useEditorStore } from '@/stores/editor-store';
import { useTimelineStore } from '@/stores/timeline-store';

export function Topbar() {
  const { current, setName, saveToHistory, newProject } = useProjectStore();
  const reset = useEditorStore((s) => s.reset);
  const clearAttachments = useEditorStore((s) => s.clearAttachments);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(current.name);
  }, [current.name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitName = () => {
    const trimmed = draft.trim() || 'Untitled Reel';
    setName(trimmed);
    setDraft(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') {
      setDraft(current.name);
      setEditing(false);
    }
  };

  const handleSave = () => {
    saveToHistory();
  };

  const handleNew = () => {
    saveToHistory();
    newProject();
    useTimelineStore.getState().clear();
    clearAttachments();
    useEditorStore.setState({
      activeComposition: null,
      compositionConfig: null,
      compositionInputProps: null,
      directorBrief: null,
      visionNotes: [],
      prompt: '',
      previewFrame: 0,
    });
    reset();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header
      className="editor-topbar"
      style={{
        background: '#000',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* LEFT: Branding + Workspace switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, background: '#ccff00' }} />
          <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: '0.06em' }}>
            VISIO REELS
          </span>
          <span className="editor-topbar-hide-mobile" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, color: '#666', marginLeft: 4 }}>| LOCAL PROJECT</span>
        </div>

        <nav style={{ display: 'flex', gap: 4 }}>
          <span style={{
            padding: '4px 10px', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, color: '#fff', background: '#111',
            border: '1px solid #2a2a2a', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'default'
          }}>
            Video
          </span>
          <Link href="/slides" style={{
            padding: '4px 10px', fontFamily: 'var(--font-dm-mono), monospace', fontSize: 10, color: '#888', background: 'transparent',
            border: '1px solid transparent', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none'
          }}>
            Slides →
          </Link>
          <Link
            href="/html-slides"
            title="Render HTML/CSS slides to MP4 with the HyperFrames-style local pipeline"
            style={{
              padding: '4px 10px',
              fontFamily: 'var(--font-dm-mono), monospace',
              fontSize: 10,
              color: '#ccff00',
              background: 'rgba(204,255,0,0.06)',
              border: '1px solid rgba(204,255,0,0.35)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            HTML → video
          </Link>
        </nav>
      </div>

      {/* CENTER: Editable project name */}
      <div className="editor-topbar-center">
        {editing ? (
          <input
            id="project-name"
            name="project-name"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleKeyDown}
            style={{
              background: '#0a0a0a', border: '1px solid #333', color: '#ccff00',
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, padding: '6px 12px',
              outline: 'none', minWidth: 200, textAlign: 'center', letterSpacing: '0.05em'
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              background: 'none', border: '1px solid transparent', color: '#888',
              fontFamily: 'var(--font-dm-mono), monospace', fontSize: 11, padding: '6px 12px',
              cursor: 'pointer', letterSpacing: '0.05em', whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
          >
            [ {current.name} ]
          </button>
        )}
      </div>

      {/* RIGHT: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleNew}
          style={{
            background: 'transparent', border: '1px solid #333', color: '#888',
            fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace',
            padding: '6px 12px', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
        >
          New
        </button>

        <button
          onClick={handleSave}
          style={{
            background: '#ccff00', border: '1px solid #ccff00', color: '#000',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-dm-mono), monospace',
            padding: '6px 16px', cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase',
            boxShadow: '0 0 12px rgba(204,255,0,0.15)'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#ccff00'; e.currentTarget.style.borderColor = '#ccff00'; }}
        >
          Save
        </button>
      </div>
    </header>
  );
}
