"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Msg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "status"; text: string }
  | { kind: "file"; path: string }
  | { kind: "validation"; success: boolean; output: string; compId: string }
  | { kind: "error"; text: string };

type RenderState = "idle" | "rendering" | "done" | "error";

const SUGGESTIONS = [
  "Add word-by-word caption animation to SocialReel-tiktok",
  "Create a 10 second video about AI and coding being awesome",
  "Make the LogoReveal text slide in from below with overshoot spring",
  "Add a glowing neon title animation to SocialReel-tiktok",
];

// ── Render Panel ──────────────────────────────────────────────────────────────

function RenderPanel({ onRefresh }: { onRefresh: number }) {
  const [compositions, setCompositions] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, RenderState>>({});
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/render-video").then(r => r.json()).then(d => setCompositions(d.compositions ?? []));
  }, [onRefresh]);

  async function render(id: string) {
    setStates(s => ({ ...s, [id]: "rendering" }));
    setLogs(l => ({ ...l, [id]: "Rendering…" }));
    setOpen(id);

    const res = await fetch("/api/render-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ composition: id }),
    });
    if (!res.body) { setStates(s => ({ ...s, [id]: "error" })); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "done") { setStates(s => ({ ...s, [id]: "done" })); setLogs(l => ({ ...l, [id]: `✓ ${ev.file}` })); }
          if (ev.type === "error") { setStates(s => ({ ...s, [id]: "error" })); setLogs(l => ({ ...l, [id]: ev.output })); }
        } catch {}
      }
    }
  }

  if (!compositions.length) return <p className="text-xs text-zinc-600 px-2 py-1">Loading…</p>;

  return (
    <div className="space-y-1">
      {compositions.map(id => {
        const state = states[id] ?? "idle";
        const log = logs[id];
        const isOpen = open === id;
        return (
          <div key={id} className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${state === "rendering" ? "bg-amber-400 animate-pulse" : state === "done" ? "bg-emerald-500" : state === "error" ? "bg-red-500" : "bg-zinc-700"}`} />
              <span className="text-xs text-zinc-300 font-mono flex-1 truncate">{id}</span>
              <button onClick={() => render(id)} disabled={state === "rendering"}
                className="text-xs px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors shrink-0">
                {state === "rendering" ? "…" : state === "done" ? "Re-render" : "Render"}
              </button>
              {log && <button onClick={() => setOpen(isOpen ? null : id)} className="text-zinc-600 hover:text-zinc-400 text-xs">{isOpen ? "▲" : "▼"}</button>}
            </div>
            {isOpen && log && (
              <pre className="bg-zinc-950 border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400 whitespace-pre-wrap max-h-28 overflow-y-auto">{log}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshRender, setRefreshRender] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdxRef = useRef(-1);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMsgs(m => [...m, { kind: "user", text }]);

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
      const lines = buf.split("\n"); buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let ev: Record<string, string>;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }

        if (ev.type === "done") break;

        if (ev.type === "status") {
          setMsgs(m => [...m, { kind: "status", text: ev.text }]);
        }

        if (ev.type === "token") {
          setMsgs(m => {
            const idx = streamingIdxRef.current;
            // If no streaming block yet, create one
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
          streamingIdxRef.current = -1; // close streaming block
          // Mark last assistant msg as done
          setMsgs(m => {
            const next = [...m];
            const last = next[next.length - 1];
            if (last?.kind === "assistant") next[next.length - 1] = { ...last, streaming: false };
            return [...next, { kind: "file", path: ev.path }];
          });
          setRefreshRender(r => r + 1);
        }

        if (ev.type === "validation") {
          setMsgs(m => [...m, {
            kind: "validation",
            success: ev.success === "true" || (ev as unknown as Record<string, boolean>).success === true,
            output: ev.output,
            compId: ev.compId,
          }]);
        }

        if (ev.type === "error") {
          streamingIdxRef.current = -1;
          setMsgs(m => [...m, { kind: "error", text: ev.content }]);
        }
      }
    }

    setBusy(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, busy]);

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

      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-60 shrink-0 border-r border-zinc-800/60 flex flex-col bg-zinc-900/30">
          <div className="px-4 py-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-violet-600 flex items-center justify-center text-xs font-bold">V</div>
              <span className="text-sm font-semibold">VisioReels</span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5 ml-7">Gemma 4 · local · free</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">Render</p>
              <RenderPanel onRefresh={refreshRender} />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-1">Try these</p>
              <div className="space-y-1">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)} disabled={busy}
                    className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-lg px-2.5 py-2 transition-all leading-snug disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-3 py-3 border-t border-zinc-800/60">
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>gemma4-coder · 32K ctx</span>
            </div>
          </div>
        </aside>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/30 shrink-0">
          <button onClick={() => setSidebarOpen(o => !o)} className="text-zinc-500 hover:text-zinc-300 p-1 rounded transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-zinc-200">Gemma Agent</span>
          <span className="text-xs text-zinc-600">writes code · you render</span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">

            {msgs.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-16 gap-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center text-2xl">🎬</div>
                <div>
                  <p className="text-base font-semibold text-zinc-200">What do you want to build?</p>
                  <p className="text-sm text-zinc-500 mt-1">Gemma writes the code. Hit Render in the sidebar.</p>
                </div>
              </div>
            )}

            {msgs.map((msg, i) => {
              if (msg.kind === "user") return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                </div>
              );

              if (msg.kind === "status") return (
                <div key={i} className="flex items-center gap-2 text-xs text-zinc-600 py-0.5">
                  <div className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
                  {msg.text}
                </div>
              );

              if (msg.kind === "assistant") return (
                <div key={i} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/25 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold text-violet-400">G</div>
                  <div className="flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl rounded-tl-sm px-4 py-3 overflow-hidden">
                    {!msg.text && msg.streaming
                      ? <div className="flex gap-1 py-1">{[0,1,2].map(n => <div key={n} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: `${n*0.12}s` }} />)}</div>
                      : <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
                          {msg.text}
                          {msg.streaming && <span className="inline-block w-0.5 h-3.5 bg-violet-400 ml-0.5 animate-pulse align-text-bottom" />}
                        </pre>
                    }
                  </div>
                </div>
              );

              if (msg.kind === "file") return (
                <div key={i} className="flex items-center gap-2 text-xs text-emerald-500 py-0.5 ml-8">
                  <span>✓</span>
                  <span className="font-mono">{msg.path}</span>
                  <span className="text-zinc-600">written</span>
                </div>
              );

              if (msg.kind === "validation") return (
                <div key={i} className={`ml-8 rounded-xl border px-4 py-3 text-xs ${(msg as {success:boolean}).success ? "border-emerald-800/40 bg-emerald-950/20 text-emerald-400" : "border-red-800/40 bg-red-950/20 text-red-400"}`}>
                  <div className="font-semibold mb-1">{(msg as {success:boolean}).success ? `✓ ${(msg as {compId:string}).compId} looks good — hit Render in sidebar` : "⚠ Validation error"}</div>
                  {!(msg as {success:boolean}).success && <pre className="text-xs opacity-70 whitespace-pre-wrap">{(msg as {output:string}).output}</pre>}
                </div>
              );

              if (msg.kind === "error") return (
                <div key={i} className="ml-8 flex gap-2 bg-red-950/20 border border-red-900/30 rounded-xl px-3 py-2">
                  <span className="text-red-500 shrink-0">⚠</span>
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
            <textarea ref={textareaRef} value={input} onChange={handleInput} onKeyDown={handleKey} disabled={busy} rows={1}
              placeholder="Describe what to build… Enter to send"
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed disabled:opacity-50" style={{ maxHeight: 140 }} />
            <button onClick={() => send()} disabled={busy || !input.trim()}
              className="w-8 h-8 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
              {busy
                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
            </button>
          </div>
          <p className="text-xs text-zinc-700 text-center mt-2">Gemma writes · Render button exports MP4 · zero API cost</p>
        </div>
      </div>
    </div>
  );
}
