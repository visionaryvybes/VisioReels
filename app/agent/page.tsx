"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Msg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; tool: string; detail: string; result?: string; open?: boolean }
  | { kind: "error"; text: string };

type History = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "List all my Remotion compositions",
  "Create a 3-second logo reveal with spring animations on white background",
  "Add a word-by-word caption animation to SocialReel-tiktok",
  "Show me the current SocialReel composition code",
];

const TOOL_ICONS: Record<string, string> = {
  read_file: "📖",
  write_file: "✏️",
  run_command: "⚡",
  list_files: "📁",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
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
    let assistantFinal = "";
    let streamingIdx = -1;

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
            streamingIdx = next.length - 1;
            streamingIdxRef.current = streamingIdx;
            return next;
          });
        }

        if (ev.type === "token") {
          assistantFinal += ev.tok;
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
          assistantFinal = ev.content;
          setMsgs((m) => {
            const idx = streamingIdxRef.current;
            const next = [...m];
            if (idx >= 0 && next[idx]?.kind === "assistant") {
              next[idx] = { kind: "assistant", text: ev.content, streaming: false };
            }
            return next;
          });
        }

        if (ev.type === "reasoning") {
          setMsgs((m) => {
            const idx = streamingIdxRef.current;
            const next = [...m];
            if (idx >= 0 && next[idx]?.kind === "assistant") {
              next[idx] = { kind: "assistant", text: ev.content, streaming: false };
            }
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
              const cur = next[i];
              if (cur.kind === "tool" && cur.tool === ev.tool && !cur.result) {
                next[i] = { ...cur, result: ev.result };
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

    setHistory((h) => [
      ...h,
      { role: "user", content: text },
      { role: "assistant", content: assistantFinal },
    ]);
    setBusy(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, busy, history]);

  function toggleTool(idx: number) {
    setMsgs((m) => {
      const next = [...m];
      const cur = next[idx];
      if (cur.kind === "tool") next[idx] = { ...cur, open: !cur.open };
      return next;
    });
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800/60 bg-zinc-900/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center text-xs font-bold">V</div>
          <span className="font-semibold text-zinc-100 text-sm">VisioReels Agent</span>
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        <span className="text-xs text-zinc-500">Gemma 4 · Remotion co-pilot · 100% local</span>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Ollama running</span>
          </div>
          <a
            href="http://localhost:3000"
            target="_blank"
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors border border-violet-500/30 rounded-md px-2.5 py-1 hover:border-violet-400/50"
          >
            Remotion Studio ↗
          </a>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

          {/* Empty state */}
          {msgs.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-16 gap-6">
              <div className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-2xl">🎬</div>
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold text-zinc-100">What do you want to build?</h2>
                <p className="text-sm text-zinc-500">Describe a video and Gemma writes the Remotion code.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="text-left text-sm text-zinc-400 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-all leading-snug disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {msgs.map((msg, i) => {
            if (msg.kind === "user") return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[75%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.text}
                </div>
              </div>
            );

            if (msg.kind === "assistant") return (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">G</div>
                <div className="flex-1 min-w-0">
                  {msg.streaming && !msg.text ? (
                    <div className="flex gap-1 mt-2">
                      {[0,1,2].map(n => (
                        <div key={n} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: `${n * 0.12}s` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                      {msg.streaming && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />}
                    </div>
                  )}
                </div>
              </div>
            );

            if (msg.kind === "tool") return (
              <div key={i} className="ml-10">
                <button
                  onClick={() => toggleTool(i)}
                  className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors group w-full"
                >
                  <span className="text-base">{TOOL_ICONS[msg.tool] ?? "🔧"}</span>
                  <span className="font-mono text-violet-400">{msg.tool}</span>
                  {msg.detail && (
                    <span className="text-zinc-600 truncate max-w-xs group-hover:text-zinc-400">
                      {msg.detail.length > 50 ? "…" + msg.detail.slice(-47) : msg.detail}
                    </span>
                  )}
                  {msg.result !== undefined && (
                    <span className="ml-auto text-emerald-500">✓</span>
                  )}
                  {msg.result === undefined && (
                    <span className="ml-auto text-zinc-600 animate-spin text-base">⋯</span>
                  )}
                  <span className="text-zinc-700">{msg.open ? "▲" : "▼"}</span>
                </button>
                {msg.open && msg.result && (
                  <pre className="mt-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {msg.result}
                  </pre>
                )}
              </div>
            );

            if (msg.kind === "error") return (
              <div key={i} className="ml-10 flex items-start gap-2 bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3">
                <span className="text-red-400 shrink-0">⚠</span>
                <span className="text-sm text-red-300">{msg.text}</span>
              </div>
            );

            return null;
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 border-t border-zinc-800/60 bg-zinc-900/40 backdrop-blur px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end bg-zinc-900 border border-zinc-700/60 rounded-2xl px-4 py-3 focus-within:border-violet-500/60 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              disabled={busy}
              rows={1}
              placeholder="Describe what to build… (Enter to send, Shift+Enter for newline)"
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed disabled:opacity-50 min-h-[22px]"
              style={{ maxHeight: 160 }}
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {busy
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              }
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-xs text-zinc-700">Gemma reads & writes <code className="text-zinc-600">remotion/</code> directly</span>
            <span className="text-xs text-zinc-700">Tool results are collapsible ▼</span>
          </div>
        </div>
      </div>
    </div>
  );
}
