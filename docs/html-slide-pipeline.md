# HTML slide video pipeline

End-to-end: **brief and/or images → Ollama (Gemma) writes HTML slides → Playwright screenshots each slide → Remotion stitches PNGs into a video**.

Use it from **`/editor`**: AI panel → **PIPELINE** → **HTML slides** → add a **prompt**, **attachments**, or both → **Generate**.

---

## 1. What Gemma receives

`POST /api/agent` with `pipeline: "html_slides"` talks to **Ollama** at `OLLAMA_URL` (default `http://localhost:11434`), model from `OLLAMA_MODEL` (fallback `OLLAMA_FALLBACK_MODEL`).

- **Text brief** — optional if you attach images.
- **Images** — optional if you write a brief.
- **Vision** — when attachments exist, the server runs **sharp stats + Gemma vision** (subject, mood, palette). The model sees a **downscaled JPEG derivative** for speed; **files in `public/uploads/` are never recompressed** — those originals are what `<img src="uploads/…">` uses at full resolution. Disable vision with **`useVision: false`** to skip the describe step and use colour stats only.
- **Output** — Gemma returns **raw HTML fragments** separated by lines containing only **`---SLIDE---`** (no JSON required). A JSON `{"slides":[...]}` fallback still exists for legacy responses.

Copy and slide count are guided by your **creative** settings (motion feel, caption tone, length, max scenes). **`num_predict`** scales with slide cap and whether images are attached so generation stays efficient.

---

## 2. Ollama setup

Install and run [Ollama](https://ollama.com); pull the model you reference in `.env.local`.

If Generate fails with Ollama errors:

```bash
ollama list
curl -s http://localhost:11434/api/tags | head
```

---

## 3. Browser for screenshots (Playwright)

Rendering uses **Playwright’s headless Chromium** — not your daily browser unless configured.

### Recommended — bundled Chromium

From the project root (once):

```bash
npm run playwright:install
```

### Overrides

- **`PLAYWRIGHT_HTML_BROWSER_EXECUTABLE`** or **`BRAVE_PATH`** — force a Chromium binary (see `lib/html-slide-render.ts` for launch order and platform paths).
- Playwright may also try **Chrome / Edge** via `channel` if installed.

Restart `npm run dev` after changing env vars.

---

## 4. Render step (`lib/html-slide-render.ts`)

For each slide string, the server:

1. **Normalizes asset paths** — rewrites **`/uploads/…`** to **`uploads/…`** so **`file://`** + `<base>` resolve correctly (leading slashes would point at the filesystem root).
2. **Wraps** fragments in a minimal document when needed, injects **`<base href="file://…/public/">`**, **preconnects** to Google Fonts, and **hoists** `<link href="https://fonts.googleapis.com/...">` tags into `<head>`.
3. **`setContent` → `load` → wait for `<img>` decode → optional `networkidle`** when Google Fonts or `@import` URLs are present (timeout so offline slides still finish).
4. **`document.fonts.ready`** + **double `requestAnimationFrame`** before capture.
5. Viewport matches slide dimensions; **PNG** per slide under `public/html-renders/<jobId>/`.

---

## 5. Run locally

```bash
npm install
npm run playwright:install   # once
npm run dev
```

Open **`http://localhost:3000/editor`**, choose **HTML slides**, then generate with text, images, or both.

---

## 6. Same stack without the agent

**`/html-slides`** lets you paste HTML and call **`POST /api/html-slides/render`** — same **Playwright** pipeline and **`file://`** base behaviour.

---

## 7. Troubleshooting

| Symptom | What to do |
|--------|------------|
| `Executable doesn't exist` under `ms-playwright` | Run `npm run playwright:install` or set `PLAYWRIGHT_HTML_BROWSER_EXECUTABLE` / install Chrome for channel fallback. |
| “Couldn’t read any slides” / empty parse | Ask for fewer slides or shorter copy; retry. Ensure output uses `---SLIDE---` between slides. |
| Stuck or very slow | Fewer **max scenes**, shorter brief, or check Ollama load; vision adds one round-trip per image when enabled. |
| Wrong fonts in PNG | Prefer **system fonts** in HTML; avoid **`@import` Google Fonts** if the render environment cannot fetch them. |
| Images missing in PNG | Use paths under **`public/`**, e.g. **`uploads/yourfile.jpg`** — same strings Gemma is told to use in `<img src="…">`. |
