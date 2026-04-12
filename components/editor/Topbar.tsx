'use client';

import { useState, useRef, useEffect } from 'react';
import { Save, FilePlus, Keyboard } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { useEditorStore } from '@/stores/editor-store';

export function Topbar() {
  const { current, setName, saveToHistory, newProject } = useProjectStore();
  const reset = useEditorStore((s) => s.reset);
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
    reset();
  };

  // Global ⌘S shortcut
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
      style={{
        height: 48,
        background: '#0a0a0a',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div
          style={{
            width: 24,
            height: 24,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <polygon points="3,2 11,7 3,12" fill="white" />
          </svg>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-syne), system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
          }}
        >
          VisioReels
        </span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-dm-mono), monospace',
            color: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          v1.0 · local
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Editable project name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(124,58,237,0.5)',
              borderRadius: 6,
              color: 'white',
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              padding: '3px 8px',
              outline: 'none',
              minWidth: 160,
              textAlign: 'center',
            }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              background: 'none',
              border: '1px solid transparent',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'var(--font-syne), system-ui, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              padding: '3px 8px',
              cursor: 'pointer',
              transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            {current.name}
          </button>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Keyboard hint */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'rgba(255,255,255,0.25)',
            fontSize: 11,
            fontFamily: 'var(--font-dm-mono), monospace',
          }}
        >
          <Keyboard size={12} />
          <span>⌘S</span>
        </div>

        <button
          onClick={handleNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            fontWeight: 500,
            padding: '5px 10px',
            cursor: 'pointer',
            transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
          }}
        >
          <FilePlus size={14} />
          New
        </button>

        <button
          onClick={handleSave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            fontSize: 12,
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            fontWeight: 500,
            padding: '5px 12px',
            cursor: 'pointer',
            transition: 'all 0.15s cubic-bezier(0.16,1,0.3,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #7c3aed, #6d28d9)';
          }}
        >
          <Save size={14} />
          Save
        </button>
      </div>
    </header>
  );
}
