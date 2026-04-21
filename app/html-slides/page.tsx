"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

const SLIDE_DELIM = "\n---SLIDE---\n";

function splitSlides(raw: string): string[] {
  return raw
    .split(SLIDE_DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

type RenderResponse = {
  jobId: string;
  paths: string[];
  videoPath: string;
  inputProps: {
    videoPath: string;
    width: number;
    height: number;
    sceneLengthInFrames?: number;
  };
};

export default function HtmlSlidesPage() {
  const [raw, setRaw] = useState(`<div style="font:600 72px system-ui;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#e94560;height:100%;display:flex;align-items:center;justify-content:center;">HTML slide 1</div>
---SLIDE---
<div style="font:500 64px Georgia,serif;background:#0f0f0f;color:#f5f0e6;height:100%;display:flex;align-items:center;justify-content:center;">Slide two — same CSS as your export</div>`);
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1920);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResponse | null>(null);

  const inputProps = result?.inputProps ?? null;

  const onRender = useCallback(async () => {
    const slides = splitSlides(raw);
    if (slides.length === 0) {
      setError("Add at least one slide (non-empty blocks separated by ---SLIDE---).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/html-slides/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides, width, height }),
      });
      const data = (await res.json()) as { error?: string } & Partial<RenderResponse>;
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      if (!data.paths?.length || !data.inputProps?.videoPath) {
        throw new Error("Invalid response from server");
      }
      setResult(data as RenderResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [raw, width, height]);

  const cw = inputProps?.width ?? 1080;
  const ch = inputProps?.height ?? 1920;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#060606",
        color: "#f0f0f0",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #1a1a1a",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/"
            style={{ color: "#888", textDecoration: "none", fontSize: 14 }}
          >
            ← Home
          </Link>
          <h1
            style={{
              fontFamily: "var(--font-syne), system-ui, sans-serif",
              fontSize: 18,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
            HTML → MP4
          </h1>
        </div>
        <span style={{ fontSize: 13, color: "#666" }}>
          Playwright capture · ffmpeg encode · native video preview
        </span>
      </header>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: 24,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#9a9a9a", lineHeight: 1.5 }}>
            Paste one HTML fragment per slide. Separate slides with a line containing only{" "}
            <code style={{ color: "#c4f" }}>---SLIDE---</code>. Full{" "}
            <code style={{ color: "#8cf" }}>&lt;html&gt;</code> documents are also supported.
            Requires Chromium locally:{" "}
            <code style={{ color: "#9cf" }}>npx playwright install chromium</code>. Serverless
            hosts usually cannot run this — use local <code>npm run dev</code> or Docker.
          </p>
          <label style={{ fontSize: 12, color: "#777" }}>Slides (HTML)</label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 280,
              flex: 1,
              background: "#0e0e0e",
              border: "1px solid #222",
              borderRadius: 8,
              color: "#e8e8e8",
              fontFamily: "var(--font-dm-mono), ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 1.45,
              padding: 12,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#777" }}>
              W
              <input
                type="number"
                min={320}
                max={4096}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value) || 1080)}
                style={{
                  marginLeft: 8,
                  width: 88,
                  background: "#0e0e0e",
                  border: "1px solid #222",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "6px 8px",
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#777" }}>
              H
              <input
                type="number"
                min={320}
                max={4096}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value) || 1920)}
                style={{
                  marginLeft: 8,
                  width: 88,
                  background: "#0e0e0e",
                  border: "1px solid #222",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "6px 8px",
                }}
              />
            </label>
            <button
              type="button"
              onClick={onRender}
              disabled={busy}
              style={{
                marginLeft: "auto",
                background: busy ? "#333" : "linear-gradient(135deg,#7c3aed,#db2777)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: 8,
                cursor: busy ? "wait" : "pointer",
                fontFamily: "var(--font-syne), sans-serif",
              }}
            >
              {busy ? "Rendering…" : "Render HTML to MP4"}
            </button>
          </div>
          {error ? (
            <p style={{ margin: 0, fontSize: 13, color: "#f66", whiteSpace: "pre-wrap" }}>
              {error}
            </p>
          ) : null}
          {result ? (
            <p style={{ margin: 0, fontSize: 12, color: "#6a6" }}>
              Job <code style={{ color: "#9d9" }}>{result.jobId}</code> ·{" "}
              {result.paths.length} frame(s) · <code>{result.videoPath}</code>
            </p>
          ) : null}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, color: "#777" }}>MP4 preview</label>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #222",
              background: "#000",
              aspectRatio: `${cw} / ${ch}`,
              maxHeight: "min(70vh, 640px)",
            }}
          >
            {inputProps?.videoPath ? (
              <video
                src={`/${inputProps.videoPath}`}
                controls
                playsInline
                style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  minHeight: 200,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#555",
                  fontSize: 14,
                }}
              >
                Render to load the MP4
              </div>
            )}
          </div>
          {inputProps?.videoPath ? (
            <a
              href={`/api/download?path=${encodeURIComponent(inputProps.videoPath)}`}
              download="html-video.mp4"
              style={{ color: "#ccff00", fontSize: 12, textDecoration: "none" }}
            >
              Download MP4
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
}
