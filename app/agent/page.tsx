"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Msg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; tool: string; detail: string; result?: string; open?: boolean }
  | { kind: "error"; text: string };

type History = { role: "user" | "assistant"; content: string };
type RenderState = "idle" | "rendering" | "done" | "error";

const SUGGESTIONS = [
  "Create a 3-second logo reveal with spring animations on white background",
  "Add a word-by-word caption animation to SocialReel-tiktok",
  "Make the LogoReveal text slide in from below with overshoot spring",
  "List all Remotion compositions",
];

const TOOL_ICONS: Record<string, string> = {
  read_file: "📖", write_file: "✏️", run_command: "⚡", list_files: "📁",
};

// ── Render Panel ──────────────────────────────────────────────────────────────

function RenderPanel() {
  const [compositions, setCompositions] = useState<string[]>([]);
  const [renderStates, setRenderStates] = useState<Record<string, RenderState>>({});
  const [renderLogs, setRenderLogs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/render-video")
      .then((r) => r.json())
      .then((d) => setCompositions(d.compositions ?? []))
      .catch(() => {});
  }, []);

  async function render(composition: string) {
    setRenderStates((s) => ({ ...s, [composition]: "rendering" }));
    setRenderLogs((l) => ({ ...l, [composition]: "Starting render…" }));
    setExpanded(composition);

    const res = await fetch("/api/render-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ composition }),
    });

    if (!res.body) { setRenderStates((s) => ({ ...s, [composition]: "error" })); return; }

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
          if (ev.type === "start") setRenderLogs((l) => ({ ...l, [composition]: `Running…` }));
          if (ev.type === "done") {
            setRenderStates((s) => ({ ...s, [composition]: "done" }));
            setRenderLogs((l) => ({ ...l, [composition]: `✓ Saved: ${ev.file}` }));
          }
          if (ev.type === "error") {
            setRenderStates((s) => ({ ...s, [composition]: "error" }));
            setRenderLogs((l) => ({ ...l, [composition]: ev.output }));
          }
        } catch {}
      }
    }
  }

  if (!compositions.length) return (
    <div className="text-xs text-zinc-600 px-3 py-2">Loading compositions…</div>
  );

  return (
    <div className="space-y-1">
      {compositions.map((id) => {
        const state = renderStates[id] ?? "idle";
        const log = renderLogs[id];
        const isOpen = expanded === id;

        return (
          <div key={id} className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                state === "rendering" ? "bg-amber-400 animate-pulse" :
                state === "done"      ? "bg-emerald-500" :
                state === "error"     ? "bg-red-500" : "bg-zinc-700"
              }`} />
              <span className="text-xs text-zinc-300 font-mono flex-1 truncate" title={id}>{id}</span>
              <button
                onClick={() => render(id)}
                disabled={state === "rendering"}
                className="text-xs px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
              >
                {state === "rendering" ? "…" : state === "done" ? "Re-render" : "Render"}
              </button>
              {log && (
                <button onClick={() => setExpanded(isOpen ? null : id)} className="text-zinc-600 hover:text-zinc-400 text-xs">
                  {isOpen ? "▲" : "▼"}
                </button>
              )}
            </div>
            {isOpen && log && (
              <pre className="bg-zinc-950 border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400 whitespace-pre-wrap break-all max-h-36 overflow-y-auto leading-relaxed">
                {log}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Agent ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdxRef = useRef<number>(-1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    setMsgs((m) => [...m, { kind: "user", text }]);

    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, userMessage: text }),
    });
    if (!res.body) { setBusy(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let finalText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value, { stream: true }).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        let ev: Record<string, string>;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === "done") break;

        if (ev.type === "thinking") {
          setMsgs((m) => {
            const next = [...m, { kind: "assistant" as const, text: "", streaming: true }];
            streamingIdxRef.current = next.length - 1;
            return next;
          });
        }
        if (ev.type === "token") {
          finalText += ev.tok;
          setMsgs((m) => {
            const idx = streamingIdxRef.current;
            if (idx < 0) return m;
            const next = [...m];
            const cur = next[idx];
            if (cur?.kind === "assistant") next[idx] = { ...cur, text: cur.text + ev.tok };
            return next;
          });
        }
        if (ev.type === "message") {
          finalText = ev.content;
          setMsgs((m) => {
            const idx = streamingIdxRef.current;
            const next = [...m];
            if (idx >= 0 && next[idx]?.kind === "assistant")
              next[idx] = { kind: "assistant", text: ev.content, streaming: false };
            return next;
          });
        }
        if (ev.type === "reasoning") {
          setMsgs((m) => {
            const idx = streamingIdxRef.current;
            const next = [...m];
            if (idx >= 0 && next[idx]?.kind === "assistant")
              next[idx] = { kind: "assistant", text: ev.content, streaming: false };
            return next;
          });
        }
        if (ev.type === "tool_call") {
          setMsgs((m) => [...m, { kind: "tool", tool: ev.tool, detail: ev.detail, open: false }]);
        }
        if (ev.type === "tool_result") {
          setMsgs((m) => {
            const next = [...m];
            for (let i = next.length - 1; i >= 0; i--) {
              const c = next[i];
              if (c.kind === "tool" && c.tool === ev.tool && !c.result) {
                next[i] = { ...c, result: ev.result };
                break;
              }
            }
            return next;
          });
        }
        if (ev.type === "error") {
          setMsgs((m) => [...m, { kind: "error", text: ev.content }]);
        }
      }
    }

    setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: finalText }]);
    setBusy(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, busy, history]);

  function toggleTool(i: number) {
    setMsgs((m) => {
      const next = [...m];
      const c = next[i];
      if (c.kind === "tool") next[i] = { ...c, open: !c.open };
      return next;
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  }

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <aside className="w-64 shrink-0 border-r border-zinc-800/60 flex flex-col bg-zinc-900/30">
          <div className="px-4 py-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-5 h-5 rounded bg-violet-600 flex items-center justify-center text-xs font-bold">V</div>
              <span className="text-sm font-semibold text-zinc-100">VisioReels</span>
            </div>
            <p className="text-xs text-zinc-600 ml-7">Gemma 4 · Remotion</p>
          </div>

          {/* Render panel */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">Compositions</p>
              <RenderPanel />
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">Quick prompts</p>
              <div className="space-y-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 rounded-lg px-2.5 py-2 transition-all leading-snug disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-3 py-3 border-t border-zinc-800/60">
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Ollama running · gemma4:e4b</span>
            </div>
          </div>
        </aside>
      )}

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
          <button onClick={() => setSidebarOpen((o) => !o)} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-200">Agent</span>
          <span className="text-xs text-zinc-600">· reads & writes remotion/ directly</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-zinc-600">Render via sidebar →</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
            {msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-20 gap-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center text-xl">🎬</div>
                <div>
                  <p className="text-base font-semibold text-zinc-200">What do you want to build?</p>
                  <p className="text-sm text-zinc-600 mt-1">Gemma writes the Remotion code. Use sidebar to render.</p>
                </div>
              </div>
            )}

            {msgs.map((msg, i) => {
              if (msg.kind === "user") return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>
                </div>
              );

              if (msg.kind === "assistant") return (
                <div key={i} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/25 flex items-center justify-center text-xs shrink-0 mt-0.5 font-semibold text-violet-400">G</div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    {msg.streaming && !msg.text
                      ? <div className="flex gap-1 mt-1">{[0,1,2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: `${n*0.12}s` }} />)}</div>
                      : <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                          {msg.streaming && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />}
                        </div>
                    }
                  </div>
                </div>
              );

              if (msg.kind === "tool") return (
                <div key={i} className="ml-8">
                  <button onClick={() => toggleTool(i)} className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 group w-full transition-colors py-0.5">
                    <span>{TOOL_ICONS[msg.tool] ?? "🔧"}</span>
                    <span className="font-mono text-violet-500">{msg.tool}</span>
                    {msg.detail && <span className="text-zinc-700 truncate max-w-xs group-hover:text-zinc-500">{msg.detail.length > 48 ? "…" + msg.detail.slice(-45) : msg.detail}</span>}
                    <span className="ml-auto">
                      {msg.result === undefined ? <span className="text-zinc-700 animate-pulse">⋯</span> : <span className="text-emerald-600">✓</span>}
                    </span>
                    {msg.result && <span className="text-zinc-700">{msg.open ? "▲" : "▼"}</span>}
                  </button>
                  {msg.open && msg.result && (
                    <pre className="mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400 whitespace-pre-wrap break-all max-h-44 overflow-y-auto leading-relaxed">
                      {msg.result}
                    </pre>
                  )}
                </div>
              );

              if (msg.kind === "error") return (
                <div key={i} className="ml-8 flex gap-2 bg-red-950/20 border border-red-900/30 rounded-xl px-3 py-2">
                  <span className="text-red-500 shrink-0 text-sm">⚠</span>
                  <span className="text-xs text-red-400 leading-relaxed">{msg.text}</span>
                </div>
              );
              return null;
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-zinc-800/50 bg-zinc-900/30 px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-3 items-end bg-zinc-900 border border-zinc-700/50 rounded-2xl px-4 py-2.5 focus-within:border-violet-500/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              disabled={busy}
              rows={1}
              placeholder="Ask Gemma to build something… (Enter to send)"
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ maxHeight: 140 }}
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="w-8 h-8 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {busy
                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
