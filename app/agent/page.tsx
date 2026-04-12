"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  Suspense,
  lazy,
  ComponentType,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "empty" | "working" | "render";

type Msg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "status"; text: string }
  | { kind: "file"; path: string }
  | { kind: "validation"; success: boolean; output: string; compId: string }
  | { kind: "error"; text: string };

type RenderState = "idle" | "rendering" | "done" | "error";

interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

const COMPOSITION_CONFIGS: Record<string, CompositionConfig> = {
  DubaiHistoryVideo: { durationInFrames: 920, fps: 30, width: 1080, height: 1920 },
  AIVideo:           { durationInFrames: 300, fps: 30, width: 1080, height: 1080 },
  LogoReveal:        { durationInFrames: 90,  fps: 30, width: 1080, height: 1080 },
  SocialReel:        { durationInFrames: 300, fps: 30, width: 1080, height: 1920 },
};

// keyword → hint chips (purely client-side, no API)
const KEYWORD_CHIPS: [RegExp, string[]][] = [
  [/\b(30s|30 sec|thirty)\b/i,  ["30 seconds", "hook in 3s", "snappy cuts"]],
  [/\b(60s|60 sec|sixty)\b/i,   ["60 seconds", "storytelling arc", "b-roll"]],
  [/\bdubai\b/i,                ["aerial drone shots", "golden hour", "skyline timelapse"]],
  [/\bmusic\b/i,                ["beat-synced cuts", "bass drop reveal", "fade in audio"]],
  [/\bmotivat/i,                ["bold text overlay", "cinematic grade", "power phrases"]],
  [/\blogo\b/i,                 ["LogoReveal comp", "2D reveal", "brand colors"]],
  [/\bai\b/i,                   ["AIVideo comp", "tech aesthetic", "cyan accents"]],
  [/\bcaption/i,                ["word-by-word", "auto-subtitle", "burn-in subs"]],
  [/\btiktok\b/i,               ["9:16 vertical", "hook < 2s", "trending audio"]],
  [/\binstagram\b/i,            ["square 1:1", "Reels format", "story safe zone"]],
];

function getChips(input: string): string[] {
  const chips = new Set<string>();
  for (const [re, suggestions] of KEYWORD_CHIPS) {
    if (re.test(input)) suggestions.forEach(s => chips.add(s));
    if (chips.size >= 4) break;
  }
  return [...chips].slice(0, 4);
}

// ── Lazy Remotion player to avoid SSR issues ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PlayerComponent: ComponentType<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LazyPlayer = lazy(async () => {
  const mod = await import("@remotion/player");
  PlayerComponent = mod.Player;
  return { default: mod.Player };
});

// ── Composition loader ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadComposition(id: string): Promise<ComponentType<any> | null> {
  const base = id.split("-")[0];
  try {
    if (base === "DubaiHistoryVideo") {
      const m = await import("../../remotion/compositions/DubaiHistoryVideo");
      return m.DubaiHistoryVideo as ComponentType;
    }
    if (base === "AIVideo") {
      const m = await import("../../remotion/compositions/AIVideo");
      return m.AIVideo as ComponentType;
    }
    if (base === "LogoReveal") {
      const m = await import("../../remotion/compositions/LogoReveal");
      return m.LogoReveal as ComponentType;
    }
    if (base === "SocialReel") {
      const m = await import("../../remotion/compositions/SocialReel");
      return m.SocialReel as ComponentType;
    }
  } catch {
    // composition module not found — preview unavailable
  }
  return null;
}

// ── Preview pane ──────────────────────────────────────────────────────────────

function PreviewPane({
  activeComp,
  renderState,
  renderProgress,
  renderFrameLog,
  onRender,
  onDownload,
}: {
  activeComp: string | null;
  renderState: RenderState;
  renderProgress: number;
  renderFrameLog: string;
  onRender: () => void;
  onDownload: () => void;
}) {
  const [comp, setComp] = useState<ComponentType | null>(null);
  const [compLoaded, setCompLoaded] = useState(false);

  useEffect(() => {
    setComp(null);
    setCompLoaded(false);
    if (!activeComp) return;
    loadComposition(activeComp).then(c => {
      setComp(() => c);
      setCompLoaded(true);
    });
  }, [activeComp]);

  const cfg = activeComp ? (COMPOSITION_CONFIGS[activeComp.split("-")[0]] ?? null) : null;
  const canPreview = compLoaded && comp && cfg && PlayerComponent;

  return (
    <div className="flex flex-col h-full">
      {/* Preview area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {!activeComp && (
          <div className="flex flex-col items-center gap-4 select-none">
            {/* Pulsing gradient blob */}
            <div
              className="w-40 h-40 rounded-full opacity-20"
              style={{
                background: "radial-gradient(circle, #7c3aed 0%, #4f46e5 50%, transparent 70%)",
                animation: "pulse-blob 3s ease-in-out infinite",
              }}
            />
            <p
              className="text-xs tracking-widest uppercase"
              style={{ color: "var(--t3)", animation: "fade-breath 3s ease-in-out infinite" }}
            >
              Waiting for Gemma…
            </p>
          </div>
        )}

        {activeComp && !canPreview && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-xs" style={{ color: "var(--t3)" }}>Loading preview…</p>
          </div>
        )}

        {canPreview && (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              opacity: 1,
              transform: "scale(1)",
              transition: "opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <div
              style={{
                aspectRatio: `${cfg.width} / ${cfg.height}`,
                maxWidth: "100%",
                maxHeight: "100%",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <Suspense fallback={<div className="w-full h-full bg-zinc-900 animate-pulse rounded-lg" />}>
                <LazyPlayer
                  component={comp}
                  durationInFrames={cfg.durationInFrames}
                  fps={cfg.fps}
                  compositionWidth={cfg.width}
                  compositionHeight={cfg.height}
                  style={{ width: "100%", height: "100%" }}
                  controls
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* Render progress overlay */}
        {renderState === "rendering" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4"
            style={{ background: "rgba(9,9,11,0.85)", backdropFilter: "blur(8px)" }}
          >
            <div className="w-64 flex flex-col gap-3">
              <div className="flex justify-between text-xs" style={{ color: "var(--t2)" }}>
                <span>Rendering…</span>
                <span className="font-mono">{Math.round(renderProgress)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${renderProgress}%`,
                    background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                    transition: "width 0.3s cubic-bezier(0.16,1,0.3,1)",
                  }}
                />
              </div>
              {renderFrameLog && (
                <p className="text-xs font-mono text-center" style={{ color: "var(--t3)" }}>
                  {renderFrameLog}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {activeComp && (
        <div
          className="shrink-0 flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: "var(--b0)" }}
        >
          <p className="text-xs font-mono" style={{ color: "var(--t3)" }}>
            {activeComp}
          </p>

          <div className="flex gap-2">
            {renderState === "done" && (
              <button
                onClick={onDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: "rgba(34,197,94,0.12)",
                  color: "#22c55e",
                  border: "1px solid rgba(34,197,94,0.25)",
                  transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download MP4
              </button>
            )}

            {renderState !== "rendering" && (
              <button
                onClick={onRender}
                disabled={false}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold"
                style={{
                  background: renderState === "done"
                    ? "rgba(124,58,237,0.15)"
                    : "linear-gradient(135deg, #7c3aed, #6d28d9)",
                  color: "#e9d5ff",
                  border: renderState === "done" ? "1px solid rgba(124,58,237,0.4)" : "none",
                  boxShadow: renderState === "idle" ? "0 0 20px rgba(124,58,237,0.35), 0 0 40px rgba(124,58,237,0.15)" : "none",
                  transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {renderState === "done" ? "Re-render" : "Render → MP4"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Render history sidebar ────────────────────────────────────────────────────

function RenderHistory({
  open,
  onClose,
  refreshKey,
  onSelectComp,
}: {
  open: boolean;
  onClose: () => void;
  refreshKey: number;
  onSelectComp: (id: string) => void;
}) {
  const [compositions, setCompositions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/render-video")
      .then(r => r.json())
      .then(d => setCompositions(d.compositions ?? []));
  }, [refreshKey]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.35s cubic-bezier(0.16,1,0.3,1)",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 w-72 flex flex-col"
        style={{
          background: "var(--s1)",
          borderLeft: "1px solid var(--b0)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--b0)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Compositions</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--t3)", background: "var(--s2)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {compositions.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: "var(--t4)" }}>
              No compositions yet — ask Gemma to create one
            </p>
          ) : (
            compositions.map(id => (
              <button
                key={id}
                onClick={() => { onSelectComp(id); onClose(); }}
                className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                style={{
                  background: "var(--s2)",
                  border: "1px solid var(--b0)",
                  transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--s3)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--b1)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--s2)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--b0)";
                }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-lg"
                  style={{ background: "var(--s3)" }}>
                  🎬
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono truncate" style={{ color: "var(--t1)" }}>{id}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
                    {COMPOSITION_CONFIGS[id.split("-")[0]]
                      ? `${COMPOSITION_CONFIGS[id.split("-")[0]].width}×${COMPOSITION_CONFIGS[id.split("-")[0]].height} · ${COMPOSITION_CONFIGS[id.split("-")[0]].fps}fps`
                      : "custom"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Message bubble components ─────────────────────────────────────────────────

function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5" style={{ opacity: 0.6 }}>
      <div className="w-1 h-1 rounded-full bg-violet-500" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
      <span className="text-xs" style={{ color: "var(--t3)" }}>{text}</span>
    </div>
  );
}

function AssistantBubble({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold"
        style={{
          background: "rgba(124,58,237,0.15)",
          border: "1px solid rgba(167,139,250,0.25)",
          color: "#a78bfa",
        }}
      >
        G
      </div>
      <div
        className="flex-1 min-w-0 rounded-2xl rounded-tl-sm px-4 py-3 overflow-hidden"
        style={{
          background: "var(--s2)",
          border: "1px solid var(--b0)",
        }}
      >
        {!text && streaming ? (
          <div className="flex gap-1 py-1">
            {[0, 1, 2].map(n => (
              <div
                key={n}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "var(--t4)",
                  animation: `bounce-dot 1s ease-in-out ${n * 0.14}s infinite alternate`,
                }}
              />
            ))}
          </div>
        ) : (
          <pre
            className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto"
            style={{ color: "var(--t2)" }}
          >
            {text}
            {streaming && (
              <span
                className="inline-block w-0.5 h-3.5 ml-0.5 align-text-bottom"
                style={{ background: "#a78bfa", animation: "cursor-blink 1s step-end infinite" }}
              />
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

function FilePill({ path }: { path: string }) {
  return (
    <div
      className="ml-9 flex items-center gap-2 px-3 py-1.5 rounded-full w-fit text-xs font-mono"
      style={{
        background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.2)",
        color: "#22c55e",
        animation: "slide-in-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {path}
    </div>
  );
}

function ValidationPill({
  success,
  output,
  compId,
}: {
  success: boolean;
  output: string;
  compId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="ml-9 rounded-xl px-4 py-3 text-xs"
      style={{
        background: success ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
        border: `1px solid ${success ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
        animation: "slide-in-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: success ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
          {success ? `✓ ${compId} validated` : "⚠ Validation failed"}
        </span>
        {!success && output && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs ml-2"
            style={{ color: "var(--t4)" }}
          >
            {expanded ? "less" : "details"}
          </button>
        )}
      </div>
      {expanded && !success && (
        <pre
          className="mt-2 text-xs whitespace-pre-wrap opacity-70 max-h-32 overflow-y-auto"
          style={{ color: "#ef4444" }}
        >
          {output}
        </pre>
      )}
    </div>
  );
}

function ErrorBubble({ text }: { text: string }) {
  return (
    <div
      className="ml-9 flex gap-2 rounded-xl px-3 py-2.5"
      style={{
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.18)",
      }}
    >
      <span style={{ color: "#ef4444" }}>⚠</span>
      <span className="text-xs leading-relaxed" style={{ color: "#fca5a5" }}>{text}</span>
    </div>
  );
}

// ── Empty state input ─────────────────────────────────────────────────────────

function EmptyInput({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const chips = getChips(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-8 px-6"
      style={{
        opacity: 1,
        transition: "opacity 0.4s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Glow ring behind textarea */}
      <div className="relative w-full max-w-2xl">
        <div
          className="absolute -inset-px rounded-2xl pointer-events-none"
          style={{
            background: value
              ? "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(109,40,217,0.2))"
              : "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(109,40,217,0.08))",
            transition: "background 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ background: "var(--s1)", border: "1px solid transparent" }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKey}
            disabled={busy}
            rows={3}
            placeholder="What reel do you want to create today?"
            className="w-full bg-transparent text-lg leading-relaxed resize-none focus:outline-none px-6 pt-6 pb-4 disabled:opacity-50"
            style={{
              color: "var(--t1)",
              caretColor: "#7c3aed",
              maxHeight: 200,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          />
          <div className="flex items-center justify-end px-4 pb-4">
            <button
              onClick={onSubmit}
              disabled={busy || !value.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: value.trim() ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "var(--s3)",
                color: "#e9d5ff",
                boxShadow: value.trim() ? "0 0 24px rgba(124,58,237,0.4), 0 0 48px rgba(124,58,237,0.12)" : "none",
                transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-violet-300/30 border-t-violet-300 rounded-full animate-spin" />
              ) : (
                <>
                  Create
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hint chips — appear as user types */}
      <div
        className="flex flex-wrap gap-2 justify-center"
        style={{
          maxWidth: 480,
          opacity: chips.length ? 1 : 0,
          transform: chips.length ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.35s cubic-bezier(0.16,1,0.3,1), transform 0.35s cubic-bezier(0.16,1,0.3,1)",
          pointerEvents: chips.length ? "auto" : "none",
        }}
      >
        {chips.map((chip, i) => (
          <button
            key={chip}
            onClick={() => onChange(value.trim() ? `${value.trim()}, ${chip}` : chip)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: "rgba(124,58,237,0.10)",
              border: "1px solid rgba(124,58,237,0.25)",
              color: "#c4b5fd",
              opacity: 0,
              animation: `chip-appear 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both`,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.2)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.45)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.10)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.25)";
            }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Animation keyframes (injected once) ───────────────────────────────────────

const GLOBAL_KEYFRAMES = `
@keyframes pulse-blob {
  0%, 100% { transform: scale(1); opacity: 0.15; }
  50%       { transform: scale(1.15); opacity: 0.25; }
}
@keyframes fade-breath {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 0.6; }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50%       { opacity: 1; transform: scale(1.4); }
}
@keyframes bounce-dot {
  from { transform: translateY(0); opacity: 0.4; }
  to   { transform: translateY(-4px); opacity: 1; }
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
@keyframes slide-in-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chip-appear {
  from { opacity: 0; transform: scale(0.85) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes working-enter {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
`;

function GlobalKeyframes() {
  return <style>{GLOBAL_KEYFRAMES}</style>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshRender, setRefreshRender] = useState(0);

  // Gemma timer
  const [elapsed, setElapsed] = useState(0);
  const [gemmaStarted, setGemmaStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active composition + render state
  const [activeComp, setActiveComp] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderFrameLog, setRenderFrameLog] = useState("");
  const [downloadPath, setDownloadPath] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const stickyInputRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdxRef = useRef(-1);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Elapsed timer
  useEffect(() => {
    if (gemmaStarted) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gemmaStarted]);

  const send = useCallback(async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);
    setPhase("working");
    setMsgs(m => [...m, { kind: "user", text }]);
    setGemmaStarted(false);
    streamingIdxRef.current = -1;

    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: text }),
    });
    if (!res.body) { setBusy(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let ev: Record<string, string>;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }

        if (ev.type === "done") break;

        if (ev.type === "status") {
          setMsgs(m => [...m, { kind: "status", text: ev.text }]);
        }

        if (ev.type === "token" && !gemmaStarted) {
          setGemmaStarted(true);
        }

        if (ev.type === "token") {
          setMsgs(m => {
            const idx = streamingIdxRef.current;
            if (idx < 0 || m[idx]?.kind !== "assistant") {
              const next = [...m, { kind: "assistant" as const, text: ev.tok, streaming: true }];
              streamingIdxRef.current = next.length - 1;
              return next;
            }
            const next = [...m];
            const cur = next[idx];
            if (cur.kind === "assistant") next[idx] = { ...cur, text: cur.text + ev.tok };
            return next;
          });
        }

        if (ev.type === "file_written") {
          setGemmaStarted(false);
          streamingIdxRef.current = -1;
          setMsgs(m => {
            const next = [...m];
            const last = next[next.length - 1];
            if (last?.kind === "assistant") next[next.length - 1] = { ...last, streaming: false };
            return [...next, { kind: "file", path: ev.path }];
          });
          setRefreshRender(r => r + 1);
        }

        if (ev.type === "validation") {
          const success = ev.success === "true" || (ev as unknown as Record<string, boolean>).success === true;
          const compId = ev.compId;
          setMsgs(m => [...m, { kind: "validation", success, output: ev.output, compId }]);
          if (success && compId) {
            setActiveComp(compId);
            setRenderState("idle");
            setPhase("render");
          }
        }

        if (ev.type === "error") {
          setGemmaStarted(false);
          streamingIdxRef.current = -1;
          setMsgs(m => [...m, { kind: "error", text: ev.content }]);
        }
      }
    }

    setGemmaStarted(false);
    setBusy(false);
    setTimeout(() => stickyInputRef.current?.focus(), 60);
  }, [input, busy, gemmaStarted]);

  async function handleRender() {
    if (!activeComp) return;
    setRenderState("rendering");
    setRenderProgress(0);
    setRenderFrameLog("");
    setDownloadPath(null);

    const res = await fetch("/api/render-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ composition: activeComp }),
    });
    if (!res.body) { setRenderState("error"); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "progress") {
            setRenderProgress(ev.percent ?? 0);
            if (ev.frame != null) setRenderFrameLog(`frame ${ev.frame}`);
          }
          if (ev.type === "done") {
            setRenderState("done");
            setRenderProgress(100);
            if (ev.file) setDownloadPath(ev.file);
          }
          if (ev.type === "error") {
            setRenderState("error");
            setRenderFrameLog(ev.output ?? "Render failed");
          }
        } catch { /* malformed SSE line */ }
      }
    }
  }

  function handleDownload() {
    if (!downloadPath) return;
    const a = document.createElement("a");
    a.href = downloadPath;
    a.download = downloadPath.split("/").pop() ?? "reel.mp4";
    a.click();
  }

  function handleStickyKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleStickyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  const isWorking = phase === "working" || phase === "render";

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "#09090b", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <GlobalKeyframes />

      {/* Top bar */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3 z-10"
        style={{
          borderBottom: isWorking ? "1px solid var(--b0)" : "1px solid transparent",
          transition: "border-color 0.4s cubic-bezier(0.16,1,0.3,1)",
          background: isWorking ? "rgba(9,9,11,0.8)" : "transparent",
          backdropFilter: isWorking ? "blur(12px)" : "none",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#e9d5ff" }}
          >
            V
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--t1)" }}>VisioReels</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
              <span className="text-xs" style={{ color: "#4ade80" }}>gemma4 · local · free</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {gemmaStarted && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)" }}>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3].map(n => (
                  <div
                    key={n}
                    className="w-1 h-1 rounded-full"
                    style={{
                      background: "#a78bfa",
                      animation: `bounce-dot 0.8s ease-in-out ${n * 0.12}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono tabular-nums" style={{ color: "#a78bfa" }}>
                {elapsed}s
              </span>
            </div>
          )}

          {isWorking && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs"
              style={{
                background: "var(--s2)",
                border: "1px solid var(--b0)",
                color: "var(--t2)",
                transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--s3)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--t1)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--s2)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--t2)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              History
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">

        {/* Empty state */}
        <div
          className="absolute inset-0"
          style={{
            opacity: phase === "empty" ? 1 : 0,
            pointerEvents: phase === "empty" ? "auto" : "none",
            transition: "opacity 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <EmptyInput
            value={input}
            onChange={setInput}
            onSubmit={() => send()}
            busy={busy}
          />
        </div>

        {/* Working + render split layout */}
        <div
          className="absolute inset-0 flex"
          style={{
            opacity: isWorking ? 1 : 0,
            pointerEvents: isWorking ? "auto" : "none",
            transform: isWorking ? "scale(1)" : "scale(0.97)",
            transition: "opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Left — chat panel */}
          <div className="flex flex-col" style={{ width: "55%", borderRight: "1px solid var(--b0)" }}>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-5 space-y-3 max-w-none">
                {msgs.map((msg, i) => {
                  if (msg.kind === "user") return (
                    <div key={i} className="flex justify-end" style={{ animation: "slide-in-up 0.35s cubic-bezier(0.16,1,0.3,1) both" }}>
                      <div
                        className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#f5f3ff" }}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                  if (msg.kind === "status") return <StatusLine key={i} text={msg.text} />;
                  if (msg.kind === "assistant") return (
                    <div key={i} style={{ animation: "slide-in-up 0.35s cubic-bezier(0.16,1,0.3,1) both" }}>
                      <AssistantBubble text={msg.text} streaming={msg.streaming} />
                    </div>
                  );
                  if (msg.kind === "file") return <FilePill key={i} path={msg.path} />;
                  if (msg.kind === "validation") return (
                    <ValidationPill
                      key={i}
                      success={(msg as { success: boolean }).success}
                      output={(msg as { output: string }).output}
                      compId={(msg as { compId: string }).compId}
                    />
                  );
                  if (msg.kind === "error") return <ErrorBubble key={i} text={msg.text} />;
                  return null;
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Sticky follow-up input */}
            <div
              className="shrink-0 px-4 py-3"
              style={{ borderTop: "1px solid var(--b0)", background: "rgba(9,9,11,0.6)", backdropFilter: "blur(8px)" }}
            >
              <div
                className="flex gap-3 items-end rounded-2xl px-4 py-2.5"
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--b1)",
                  transition: "border-color 0.2s",
                }}
                onFocus={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.5)";
                }}
                onBlur={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--b1)";
                }}
              >
                <textarea
                  ref={stickyInputRef}
                  value={input}
                  onChange={handleStickyChange}
                  onKeyDown={handleStickyKey}
                  disabled={busy}
                  rows={1}
                  placeholder="Follow up… Enter to send"
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none leading-relaxed disabled:opacity-50"
                  style={{ color: "var(--t1)", caretColor: "#7c3aed", maxHeight: 120 }}
                />
                <button
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: input.trim() ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "var(--s3)",
                    transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {busy
                    ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>}
                </button>
              </div>
            </div>
          </div>

          {/* Right — preview pane */}
          <div className="flex flex-col" style={{ flex: 1 }}>
            <PreviewPane
              activeComp={activeComp}
              renderState={renderState}
              renderProgress={renderProgress}
              renderFrameLog={renderFrameLog}
              onRender={handleRender}
              onDownload={handleDownload}
            />
          </div>
        </div>
      </div>

      {/* Render history drawer */}
      <RenderHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        refreshKey={refreshRender}
        onSelectComp={id => { setActiveComp(id); setRenderState("idle"); setPhase("render"); }}
      />
    </div>
  );
}
