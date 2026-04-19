import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { ASPECT_RATIOS, getPreset, type SlideAspect, type SlidePreset } from "@/lib/slide-presets";

export const runtime = "nodejs";

const PROJECT_DIR = process.cwd();

interface SlideTweaksIn {
  typeScale?: number;
  padding?: number;
  grain?: number;
  imgBrightness?: number;
  imgContrast?: number;
}

interface SlideInput {
  path: string;          // uploads/abc.jpg
  title: string;
  body?: string;
  kicker?: string;
  accent?: string;
  textAlign?: "start" | "center" | "end";
  tweaks?: SlideTweaksIn;
  /** 0..1 — vision-derived brightness of the source image. */
  imageBrightness?: number;
  /** 'auto' | 'light' | 'dark' | hex — matches the browser preview's ink rule. */
  inkMode?: string;
  /**
   * Optional text position override (normalised 0..1 relative to slide w/h).
   * x/y anchor the TOP-LEFT of the text block. When absent, the preset's
   * layout rule decides placement (bottom / center / top).
   */
  textOffset?: { x: number; y: number };
}

interface ExportBody {
  aspect: SlideAspect;
  preset: string;        // preset id
  slides: SlideInput[];
  brand?: string;        // optional brand name shown in footer
  format?: "png" | "pdf" | "zip";
}

// Map preset font-var → system font stack that librsvg will find via fontconfig.
// Not pixel-perfect to the browser preview, but close enough for export.
const FONT_FALLBACK: Record<string, string> = {
  "var(--font-playfair)": "'Playfair Display','Georgia','DejaVu Serif',serif",
  "var(--font-space-grotesk)": "'Space Grotesk','Helvetica Neue','Arial','DejaVu Sans',sans-serif",
  "var(--font-fraunces)": "'Fraunces','Georgia','DejaVu Serif',serif",
  "var(--font-archivo-black)": "'Archivo Black','Impact','DejaVu Sans',sans-serif",
  "var(--font-instrument-serif)": "'Instrument Serif','Georgia','DejaVu Serif',serif",
  "var(--font-bricolage)": "'Bricolage Grotesque','Helvetica','DejaVu Sans',sans-serif",
  "var(--font-syne)": "'Syne','Helvetica','DejaVu Sans',sans-serif",
  "var(--font-dm-sans)": "'DM Sans','Helvetica','DejaVu Sans',sans-serif",
  "var(--font-dm-mono)": "'DM Mono','Menlo','DejaVu Sans Mono',monospace",
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── Adaptive text colour — mirrors components/slides/SlideFrame.tsx ────────
// Keep this in lockstep with the browser preview so the PNG/PDF export never
// diverges from what the user sees.
function hexLuminance(hex: string): number {
  let h = hex.trim().toLowerCase();
  if (h === "white" || h === "#fff" || h === "#ffffff") return 1;
  if (h === "black" || h === "#000" || h === "#000000") return 0;
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || !/^[0-9a-f]{6}$/.test(h)) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const isLightHex = (h: string) => hexLuminance(h) >= 0.7;
const isDarkHex = (h: string) => hexLuminance(h) <= 0.35;
function stripLinearGradient(surface: string): string {
  if (!surface) return "#000000";
  if (!surface.startsWith("linear-gradient")) return surface;
  const m = surface.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g);
  return m && m.length ? m[m.length - 1] : "#000000";
}
function resolveInk(
  preset: SlidePreset,
  slide: { inkMode?: string; imageBrightness?: number }
): { ink: string; scrim: boolean } {
  const mode = slide.inkMode;
  if (mode === "light") return { ink: "#ffffff", scrim: true };
  if (mode === "dark") return { ink: "#0a0a0a", scrim: false };
  if (typeof mode === "string" && mode.startsWith("#")) {
    return { ink: mode, scrim: isLightHex(mode) };
  }
  const overlay = preset.overlay;
  const solid = overlay === "split" || overlay === "solid-bottom" || overlay === "framed" || overlay === "marquee";
  if (solid) return { ink: preset.ink, scrim: false };
  const b = typeof slide.imageBrightness === "number" ? slide.imageBrightness : 0.5;
  const inkLight = isLightHex(preset.ink);
  const inkDark = isDarkHex(preset.ink);
  if (overlay === "gradient") {
    const sl = hexLuminance(stripLinearGradient(preset.surface));
    if (sl <= 0.35 && inkLight) return { ink: preset.ink, scrim: false };
    if (sl >= 0.7 && inkDark) return { ink: preset.ink, scrim: false };
  }
  if (b >= 0.62 && inkLight) return { ink: "#0a0a0a", scrim: false };
  if (b <= 0.28 && inkDark) return { ink: "#ffffff", scrim: true };
  return { ink: preset.ink, scrim: true };
}
// Emits an SVG <filter> that gives text on busy images a soft legibility halo.
// Referenced via filter="url(#scrim-light|dark)" on each text node.
function scrimFilterDefs(): string {
  return `<defs>
    <filter id="scrim-dark" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <filter id="scrim-light" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#fff" flood-opacity="0.55"/>
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#fff" flood-opacity="0.3"/>
    </filter>
  </defs>`;
}

// Rough word-wrap given a max px width. librsvg doesn't wrap — we emit tspans.
function wrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (probe.length > maxCharsPerLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function alignToAnchor(a: "start" | "center" | "end"): { anchor: string; x: number; w: number } {
  // returns text-anchor and relative x within the text block
  switch (a) {
    case "center": return { anchor: "middle", x: 0.5, w: 0.84 };
    case "end":    return { anchor: "end", x: 0.92, w: 0.84 };
    default:       return { anchor: "start", x: 0.08, w: 0.84 };
  }
}

function renderOverlaySvg(
  W: number,
  H: number,
  preset: SlidePreset,
  slide: SlideInput,
  brand: string | undefined,
  slideIndex: number,
  slideTotal: number
): string {
  const accent = slide.accent && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(slide.accent)
    ? slide.accent
    : preset.accent;

  const align = slide.textAlign ?? preset.align;
  const a = alignToAnchor(align);
  const blockW = Math.floor(W * a.w);
  const xAnchor = Math.floor(W * a.x);

  // Adaptive ink — same rule as the browser preview.
  const { ink: effectiveInk, scrim } = resolveInk(preset, slide);
  const scrimAttr = scrim ? ` filter="url(#${isLightHex(effectiveInk) ? 'scrim-dark' : 'scrim-light'})"` : "";

  // Scale preset sizes.  The preset values (titleSize / bodySize / leading) are
  // authored as pixels that live INSIDE the W×H canvas — exactly how the
  // browser preview renders them.  The browser does NOT multiply by W/1080; it
  // lays out at the authored size on whatever W×H canvas the aspect selected
  // and then uniformly CSS-transforms the whole frame to fit the viewport.
  // Early iterations of this route scaled the text by W/1080, which made 16:9
  // and 9:16 exports ~1.7× larger than the browser preview and clipped long
  // titles off the edges.  Keep the text authored-size to stay in lockstep.
  const titleSize = preset.titleSize;
  const bodySize = preset.bodySize;
  const kickerSize = Math.max(14, bodySize * 0.65);

  const titleFont = FONT_FALLBACK[preset.titleFontVar] ?? "sans-serif";
  const bodyFont = FONT_FALLBACK[preset.bodyFontVar] ?? "sans-serif";

  // Per-char advance heuristics.  librsvg has no layout engine, so we guess
  // how many characters fit on a line before forcing a wrap.  Display serifs
  // and caps-black weights run wider than regular sans — widen accordingly or
  // Playfair / Archivo Black / all-caps titles spill past the slide.
  const fv = preset.titleFontVar;
  const isBlackDisplay = fv.includes("archivo-black") || fv.includes("fraunces") || fv.includes("syne");
  const isSerifDisplay = fv.includes("playfair") || fv.includes("instrument") || fv.includes("bricolage");
  const isMono = fv.includes("mono");
  const isUpperTitle = preset.titleCase === "upper";
  const baseAdvance = isMono
    ? 0.60
    : isBlackDisplay
    ? 0.62
    : isSerifDisplay
    ? 0.58
    : 0.54;
  // Caps occupy ~10% more advance than mixed case on proportional fonts.
  const capsBump = isUpperTitle && !isMono ? 1.08 : 1;
  const titleCharPx = titleSize * baseAdvance * capsBump;
  const bodyCharPx = bodySize * 0.56;

  const maxTitleChars = Math.max(8, Math.floor(blockW / titleCharPx));
  const maxBodyChars = Math.max(16, Math.floor(blockW / bodyCharPx));

  const titleText = preset.titleCase === "upper" ? slide.title.toUpperCase() : preset.titleCase === "lower" ? slide.title.toLowerCase() : slide.title;
  const bodyText = slide.body ?? "";
  const kickerText = slide.kicker ?? `${String(slideIndex + 1).padStart(2, "0")} / ${String(slideTotal).padStart(2, "0")}`;

  // If the rendered title is already all-caps (either forced by the preset OR
  // written that way by the user / model), treat it as caps for the wrap
  // heuristic.  Caps take ~8% more advance than mixed-case on proportional
  // fonts — without this the longest word in a user-capped title spills past
  // the right edge of the slide.
  const letters = titleText.replace(/[^A-Za-z]/g, "");
  const looksAllCaps = letters.length >= 4 && letters === letters.toUpperCase();
  const effectiveMaxTitleChars = looksAllCaps && !isMono
    ? Math.max(8, Math.floor(blockW / (titleCharPx * 1.08)))
    : maxTitleChars;

  const titleLines = wrap(titleText, effectiveMaxTitleChars);
  const bodyLines = bodyText ? wrap(bodyText, maxBodyChars) : [];

  // Auto-fit: if the longest line still overflows the block (common with a
  // single long word like "ARCHITECTURE"), shrink the title proportionally
  // until the widest line fits.  Floor at 60% of the authored size so the
  // layout hierarchy (title > body > kicker) is preserved.
  const longestLineChars = titleLines.reduce((m, l) => Math.max(m, l.length), 0);
  const capsAdvanceMul = looksAllCaps && !isMono ? 1.08 : 1;
  const estWidestPx = longestLineChars * titleSize * baseAdvance * capsAdvanceMul;
  const fitRatio = estWidestPx > blockW ? blockW / estWidestPx : 1;
  const autoFit = Math.max(0.6, Math.min(1, fitRatio));
  const titleSizeFinal = titleSize * autoFit;

  const blockHeight =
    titleLines.length * titleSizeFinal * preset.leadingTitle +
    (bodyLines.length ? bodyLines.length * bodySize * preset.leadingBody + bodySize : 0) +
    (kickerText ? kickerSize * 2.2 : 0);

  // Overlay positioning by mode.
  let overlayRect = "";
  let textY: number;

  // Derived text-legibility scrim — matches the browser preview.  Only
  // emitted for full-bleed / vignette / light-gradient cases where the text
  // sits directly on the photo.
  const inkIsLightNow = isLightHex(effectiveInk);
  const scrimColor = inkIsLightNow ? "0,0,0" : "255,255,255";
  const heavyStop = inkIsLightNow ? 0.55 : 0.48;
  const midStop = inkIsLightNow ? 0.18 : 0.12;
  let textScrimRect = "";
  const wantsTextScrim =
    preset.overlay === "full-bleed" ||
    preset.overlay === "vignette" ||
    (preset.overlay === "gradient" && (() => {
      const sl = hexLuminance(stripLinearGradient(preset.surface));
      if (sl <= 0.35 && inkIsLightNow) return false;
      if (sl >= 0.7 && !inkIsLightNow) return false;
      return true;
    })());
  if (wantsTextScrim) {
    const sid = `textscrim-${slideIndex}`;
    textScrimRect = `<defs><linearGradient id="${sid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgb(${scrimColor})" stop-opacity="0"/><stop offset="45%" stop-color="rgb(${scrimColor})" stop-opacity="${midStop}"/><stop offset="100%" stop-color="rgb(${scrimColor})" stop-opacity="${heavyStop}"/></linearGradient></defs><rect x="0" y="${Math.floor(H * 0.38)}" width="${W}" height="${Math.ceil(H * 0.62)}" fill="url(#${sid})"/>`;
  }

  switch (preset.overlay) {
    case "solid-bottom": {
      const h = Math.max(blockHeight + 140, H * 0.34);
      overlayRect = `<rect x="0" y="${H - h}" width="${W}" height="${h}" fill="${preset.surface}"/>`;
      textY = H - h + 70;
      break;
    }
    case "framed": {
      const margin = Math.floor(W * 0.06);
      const rectW = W - margin * 2;
      const rectH = Math.max(blockHeight + 120, H * 0.36);
      const rectY = H - margin - rectH;
      overlayRect = `<rect x="${margin}" y="${rectY}" width="${rectW}" height="${rectH}" fill="${preset.surface}" stroke="${accent}" stroke-width="2"/>`;
      textY = rectY + 60;
      break;
    }
    case "gradient": {
      overlayRect = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${preset.surface.startsWith('linear-gradient') ? '#000' : preset.surface}" stop-opacity="0"/><stop offset="60%" stop-color="${preset.surface.startsWith('linear-gradient') ? '#000' : preset.surface}" stop-opacity="0.55"/><stop offset="100%" stop-color="${preset.surface.startsWith('linear-gradient') ? '#000' : preset.surface}" stop-opacity="0.92"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;
      textY = H - blockHeight - 80;
      break;
    }
    case "vignette": {
      overlayRect = `<defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.75"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/>`;
      textY = H - blockHeight - 100;
      break;
    }
    case "marquee": {
      const stripeH = Math.max(blockHeight + 80, H * 0.22);
      const stripeY = Math.floor(H / 2 - stripeH / 2);
      overlayRect = `<rect x="0" y="${stripeY}" width="${W}" height="${stripeH}" fill="${preset.surface}"/>`;
      textY = stripeY + 50;
      break;
    }
    case "split": {
      // Portrait: top image / bottom text panel. Landscape: left image / right panel.
      if (H >= W) {
        const panelH = Math.floor(H * 0.42);
        overlayRect = `<rect x="0" y="${H - panelH}" width="${W}" height="${panelH}" fill="${preset.surface}"/>`;
        textY = H - panelH + 70;
      } else {
        const panelW = Math.floor(W * 0.42);
        overlayRect = `<rect x="${W - panelW}" y="0" width="${panelW}" height="${H}" fill="${preset.surface}"/>`;
        textY = Math.floor(H * 0.2);
      }
      break;
    }
    default: {
      textY = H - blockHeight - 80;
    }
  }

  // Apply user-authored text nudge, if any.  Mirrors the CSS translate we
  // apply in SlideFrame so browser preview and PNG/PDF stay in lockstep.
  let xAnchorFinal = xAnchor;
  if (slide.textOffset && preset.overlay !== "split") {
    const dx = Math.max(-0.45, Math.min(0.45, slide.textOffset.x));
    const dy = Math.max(-0.45, Math.min(0.45, slide.textOffset.y));
    xAnchorFinal = xAnchor + W * dx;
    textY = textY + H * dy;
  }

  // Compose tspans
  let cursor = textY;
  const parts: string[] = [];

  if (kickerText) {
    parts.push(
      `<text x="${xAnchorFinal}" y="${cursor}" text-anchor="${a.anchor}" font-family="${FONT_FALLBACK["var(--font-dm-mono)"]}" font-size="${kickerSize}" fill="${accent}" letter-spacing="0.15em" font-weight="600">${xmlEscape(kickerText.toUpperCase())}</text>`
    );
    cursor += kickerSize * 2.2;
  }

  const titleTransform = preset.titleTracking ? `letter-spacing="${preset.titleTracking}"` : "";
  for (const line of titleLines) {
    parts.push(
      `<text x="${xAnchorFinal}" y="${cursor}" text-anchor="${a.anchor}" font-family="${titleFont}" font-size="${titleSizeFinal}" fill="${effectiveInk}" font-weight="${preset.titleWeight}" ${titleTransform}${scrimAttr}>${xmlEscape(line)}</text>`
    );
    cursor += titleSizeFinal * preset.leadingTitle;
  }

  if (bodyLines.length) {
    cursor += bodySize * 0.6;
    for (const line of bodyLines) {
      parts.push(
        `<text x="${xAnchorFinal}" y="${cursor}" text-anchor="${a.anchor}" font-family="${bodyFont}" font-size="${bodySize}" fill="${effectiveInk}" font-weight="${preset.bodyWeight}" letter-spacing="${preset.bodyTracking}"${scrimAttr}>${xmlEscape(line)}</text>`
      );
      cursor += bodySize * preset.leadingBody;
    }
  }

  // Footer brand chip
  const brandText = brand?.trim();
  const footerSize = 16;
  const brandBlock = brandText
    ? `<text x="${Math.floor(W * 0.08)}" y="${H - 48}" font-family="${FONT_FALLBACK["var(--font-dm-mono)"]}" font-size="${footerSize}" fill="${effectiveInk}" opacity="0.6" letter-spacing="0.2em" font-weight="600"${scrimAttr}>${xmlEscape(brandText.toUpperCase())}</text>`
    : "";

  const pagination = `<text x="${W - Math.floor(W * 0.08)}" y="${H - 48}" text-anchor="end" font-family="${FONT_FALLBACK["var(--font-dm-mono)"]}" font-size="${footerSize}" fill="${effectiveInk}" opacity="0.6" letter-spacing="0.2em" font-weight="600"${scrimAttr}>${String(slideIndex + 1).padStart(2, "0")} / ${String(slideTotal).padStart(2, "0")}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${scrim ? scrimFilterDefs() : ""}
  ${overlayRect}
  ${textScrimRect}
  ${parts.join("\n  ")}
  ${brandBlock}
  ${pagination}
</svg>`;
}

async function renderSlide(
  slide: SlideInput,
  aspect: SlideAspect,
  preset: SlidePreset,
  brand: string | undefined,
  index: number,
  total: number
): Promise<{ buf: Buffer; width: number; height: number }> {
  const imgPath = path.join(PROJECT_DIR, "public", slide.path);
  if (!fs.existsSync(imgPath)) throw new Error(`image missing: ${slide.path}`);

  const tw = slide.tweaks ?? {};
  const bright = typeof tw.imgBrightness === "number" ? Math.max(0.4, Math.min(1.6, tw.imgBrightness)) : 1;
  const contrast = typeof tw.imgContrast === "number" ? Math.max(0.4, Math.min(1.6, tw.imgContrast)) : 1;

  let W: number;
  let H: number;
  let bg: Buffer;

  if (aspect === "original") {
    // Preserve native resolution. No resize. No re-encoding beyond what sharp needs
    // to composite the SVG overlay. No imageFilter applied — user asked for raw.
    const meta = await sharp(imgPath).metadata();
    W = meta.width ?? 1080;
    H = meta.height ?? 1080;
    let pipe = sharp(imgPath).rotate();
    if (bright !== 1 || contrast !== 1) {
      // linear() applies a * input + b ; contrast = a, brightness is done via modulate.
      pipe = pipe.modulate({ brightness: bright });
      pipe = pipe.linear(contrast, -(128 * (contrast - 1)));
    }
    bg = await pipe.toBuffer();
  } else {
    const spec = ASPECT_RATIOS[aspect];
    W = spec.w;
    H = spec.h;
    let pipe = sharp(imgPath)
      .rotate()
      .resize(W, H, { fit: "cover", position: "attention" });
    // Preset imageFilter hint — coarse mapping to sharp's modulation
    const f = preset.imageFilter ?? "";
    const presetMod: { brightness?: number; saturation?: number; hue?: number } = {};
    if (f.includes("grayscale")) presetMod.saturation = 0.25;
    else if (f.includes("saturate")) presetMod.saturation = 1.25;
    if (f.includes("brightness(0.")) presetMod.brightness = 0.85;
    if (Object.keys(presetMod).length) pipe = pipe.modulate(presetMod);
    // Per-slide tweaks on top
    if (bright !== 1) pipe = pipe.modulate({ brightness: bright });
    if (contrast !== 1) pipe = pipe.linear(contrast, -(128 * (contrast - 1)));
    bg = await pipe.toBuffer();
  }

  const overlaySvg = renderOverlaySvg(W, H, preset, slide, brand, index, total);

  const composed = await sharp(bg)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  return { buf: composed, width: W, height: H };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportBody;
    if (!body?.slides?.length) {
      return NextResponse.json({ error: "no slides" }, { status: 400 });
    }
    const aspect: SlideAspect = ASPECT_RATIOS[body.aspect] ? body.aspect : "1:1";
    const preset = getPreset(body.preset);
    const slides = body.slides.slice(0, 10);

    // Validate slide paths
    for (const s of slides) {
      if (!/^uploads\/[A-Za-z0-9._-]+$/.test(s.path)) {
        return NextResponse.json({ error: `invalid path: ${s.path}` }, { status: 400 });
      }
    }

    const pngs = await Promise.all(
      slides.map((s, i) => renderSlide(s, aspect, preset, body.brand, i, slides.length))
    );

    if (body.format === "pdf") {
      const pdf = await PDFDocument.create();
      for (const p of pngs) {
        const img = await pdf.embedPng(p.buf);
        // Points = pixels at 72 dpi. Keep 1:1 so dimensions match the PNG.
        const page = pdf.addPage([p.width, p.height]);
        page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
      }
      const pdfBytes = await pdf.save();
      const pdfBuf = Buffer.from(pdfBytes);
      return NextResponse.json({
        aspect,
        format: "pdf",
        mime: "application/pdf",
        base64: pdfBuf.toString("base64"),
        pages: pngs.length,
      });
    }

    if (body.format === "zip") {
      const zip = new JSZip();
      pngs.forEach((p, i) => {
        zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, p.buf);
      });
      const zipBuf = await zip.generateAsync({
        type: "nodebuffer",
        compression: "STORE", // PNGs are already compressed; STORE is fast
      });
      return NextResponse.json({
        aspect,
        format: "zip",
        mime: "application/zip",
        base64: zipBuf.toString("base64"),
        files: pngs.length,
      });
    }

    return NextResponse.json({
      aspect,
      width: aspect === "original" ? null : ASPECT_RATIOS[aspect].w,
      height: aspect === "original" ? null : ASPECT_RATIOS[aspect].h,
      slides: pngs.map((p, i) => ({
        index: i,
        mime: "image/png",
        width: p.width,
        height: p.height,
        base64: p.buf.toString("base64"),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "export failed" },
      { status: 500 }
    );
  }
}
