import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type LaunchOptions, type Page } from "playwright";

/**
 * Auto-detect Brave / Chrome on disk (Playwright’s `channel: chrome` is Google Chrome.app, not Brave).
 * Override with `PLAYWRIGHT_HTML_BROWSER_EXECUTABLE` or `BRAVE_PATH`.
 */
function envChromiumExecutable(): string | null {
  const env =
    process.env.PLAYWRIGHT_HTML_BROWSER_EXECUTABLE?.trim() ||
    process.env.BRAVE_PATH?.trim();
  if (!env) return null;
  if (!fs.existsSync(env)) {
    throw new Error(
      `PLAYWRIGHT_HTML_BROWSER_EXECUTABLE / BRAVE_PATH points to a missing file:\n${env}`
    );
  }
  return env;
}

function autoDetectedChromiumExecutables(): string[] {
  const out: string[] = [];
  if (process.platform === "darwin") {
    out.push("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
    out.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else if (process.platform === "win32") {
    out.push(
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
    );
  } else {
    out.push("/usr/bin/brave-browser", "/usr/bin/brave", "/snap/bin/brave");
  }
  return [...new Set(out.filter((p) => fs.existsSync(p)))];
}

/**
 * Launch order: optional forced path → Playwright’s downloaded Chromium → Brave/Chrome paths →
 * Chrome / Edge channels.
 */
async function launchChromiumForCapture(): Promise<Browser> {
  const attempts: LaunchOptions[] = [];
  const baseArgs = [
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-dev-shm-usage",
  ];

  const forced = envChromiumExecutable();
  if (forced) {
    attempts.push({ headless: true, executablePath: forced, args: baseArgs });
  }

  attempts.push({ headless: true, args: baseArgs });

  for (const executablePath of autoDetectedChromiumExecutables()) {
    attempts.push({ headless: true, executablePath, args: baseArgs });
  }

  attempts.push(
    { headless: true, channel: "chrome", args: baseArgs },
    { headless: true, channel: "chrome-beta", args: baseArgs },
    { headless: true, channel: "msedge", args: baseArgs }
  );

  let lastErr: unknown;
  for (const opts of attempts) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      lastErr = e;
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `${msg}\n\n` +
      `Fix (pick one):\n` +
      `  • Recommended:  npm run playwright:install   (downloads Playwright’s Chromium)\n` +
      `  • Or set Brave explicitly:  export PLAYWRIGHT_HTML_BROWSER_EXECUTABLE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"\n` +
      `  • Or install Google Chrome — the app will try to use it via Playwright’s channel.`
  );
}

export type RenderHtmlSlidesOptions = {
  slides: string[];
  width: number;
  height: number;
  /** Absolute path to the Next.js `public` directory */
  publicDir: string;
  jobId?: string;
};

/** `file://` base so `<img src="uploads/…">` resolves without a running dev server. */
function assetBaseHref(publicDir: string): string {
  const u = pathToFileURL(path.join(publicDir, ".")).href;
  return u.endsWith("/") ? u : `${u}/`;
}

/**
 * Leading `/uploads/...` breaks with `<base href="file://.../public/">` (resolves to filesystem root).
 */
function fixPublicAssetPaths(html: string): string {
  return html
    .replace(/\b(src|href)=(["'])\/uploads\//gi, "$1=$2uploads/")
    .replace(/url\((["']?)\/uploads\//gi, "url($1uploads/");
}

/** Hoist Google Font `<link>` tags into `<head>`; strip from fragment so order is valid. */
function stripFontLinks(html: string): { hoisted: string; rest: string } {
  const collected: string[] = [];
  const rest = html
    .replace(/<link[^>]+href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>/gi, (m) => {
      collected.push(m);
      return "";
    })
    .replace(/<link[^>]+href=["'][^"']*fonts\.gstatic\.com[^"']*["'][^>]*>/gi, (m) => {
      collected.push(m);
      return "";
    });
  return { hoisted: collected.join("\n"), rest: rest.trim() };
}

function injectBaseIfNeeded(html: string, baseHref: string): string {
  if (!baseHref || /<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${baseHref}" />`);
  }
  return html;
}

function injectAfterHeadOpen(html: string, injection: string): string {
  if (!/<head[^>]*>/i.test(html)) return html;
  return html.replace(/<head([^>]*)>/i, (m, g1) => `<head${g1}>${injection}`);
}

const FONT_PRECONNECT = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
`;

/** Paths are POSIX-style, relative to `public/` (e.g. `html-renders/<id>/0.png`). */
export type HtmlSlideRenderResult = {
  jobId: string;
  paths: string[];
};

function wrapHtml(slideHtml: string, publicDir: string): string {
  const baseHref = assetBaseHref(publicDir);
  const fixed = fixPublicAssetPaths(slideHtml);
  const { hoisted, rest } = stripFontLinks(fixed);
  const trimmed = rest.trim();
  const headExtras = `${FONT_PRECONNECT}${hoisted ? `${hoisted}\n` : ""}`;

  if (/^<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    let doc = injectBaseIfNeeded(trimmed, baseHref);
    doc = injectAfterHeadOpen(doc, headExtras);
    return doc;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="${baseHref}" />
  ${headExtras}
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    body { box-sizing: border-box; }
  </style>
</head>
<body>${trimmed}</body>
</html>`;
}

function htmlNeedsNetworkIdle(html: string): boolean {
  return /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(\s*["']?https?:/i.test(html);
}

async function waitForImagesLoaded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          })
      )
    );
  });
}

async function waitForFontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
}

/** Two rAFs so layout + fonts paint before screenshot. */
async function waitNextPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
  );
}

/**
 * Renders each HTML string to a PNG via headless Chromium (Playwright).
 * Intended for local dev or a Node server with `npx playwright install chromium` run once.
 */
export async function renderHtmlSlidesToPng(
  opts: RenderHtmlSlidesOptions
): Promise<HtmlSlideRenderResult> {
  const jobId = opts.jobId ?? crypto.randomUUID();
  const relBase = path.join("html-renders", jobId);
  const absDir = path.join(opts.publicDir, relBase);
  fs.mkdirSync(absDir, { recursive: true });

  const browser = await launchChromiumForCapture();
  const page = await browser.newPage();
  await page.setViewportSize({ width: opts.width, height: opts.height });

  // Temp HTML files are written into the output dir (inside public/) so that
  // file:// navigation resolves relative asset paths (e.g. uploads/abc.jpg)
  // correctly. page.setContent() from about:blank cannot load file:// assets
  // due to Chromium's null-origin security policy.
  const tempFiles: string[] = [];

  const paths: string[] = [];
  try {
    for (let i = 0; i < opts.slides.length; i++) {
      const raw = opts.slides[i] ?? "";
      // Base href points to public/ so all relative asset paths resolve correctly.
      const baseHref = assetBaseHref(opts.publicDir);
      const html = wrapHtml(raw, opts.publicDir);

      const tmpName = `_tmp-${jobId}-${i}.html`;
      const tmpAbs = path.join(opts.publicDir, tmpName);
      fs.writeFileSync(tmpAbs, html, "utf-8");
      tempFiles.push(tmpAbs);

      const fileUrl = `${baseHref}${tmpName}`;
      const needsIdle = htmlNeedsNetworkIdle(html);
      await page.goto(fileUrl, {
        waitUntil: needsIdle ? "networkidle" : "load",
        timeout: 120_000,
      });
      await waitForImagesLoaded(page);
      await waitForFontsReady(page);
      await waitNextPaint(page);

      const fileName = `${i}.png`;
      const absPath = path.join(absDir, fileName);
      await page.screenshot({
        path: absPath,
        type: "png",
        fullPage: false,
        animations: "disabled",
      });
      paths.push(path.join(relBase, fileName).split(path.sep).join("/"));
    }
    return { jobId, paths };
  } finally {
    await browser.close();
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* best-effort cleanup */ }
    }
  }
}
