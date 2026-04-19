'use client';

import { useRef, useState } from 'react';
import type { SlideAspect, SlidePreset } from '@/lib/slide-presets';
import { ASPECT_RATIOS } from '@/lib/slide-presets';

export interface SlideTweaks {
  typeScale?: number;   // 0.6 .. 1.6 — multiplies title + body sizes
  padding?: number;     // 2 .. 14 — % padding of slide
  grain?: number;       // 0 .. 1 — noise overlay intensity
  imgBrightness?: number; // 0.4 .. 1.6 — multiplies the image brightness
  imgContrast?: number;   // 0.4 .. 1.6 — multiplies the image contrast
}

export interface SlideData {
  path: string;
  url: string;
  title: string;
  body?: string;
  kicker?: string;
  accent?: string;
  textAlign?: 'start' | 'center' | 'end';
  notes?: string;       // speaker notes
  tweaks?: SlideTweaks; // per-slide visual overrides
  /** Derived from vision analysis — 0 (pitch black) to 1 (pure white). */
  imageBrightness?: number;
  /**
   * How text colour is chosen for THIS slide:
   *  - 'auto' (default): swap preset.ink to its opposite when the image would
   *    swallow it (only matters for full-bleed / vignette / light-gradient).
   *  - 'light' | 'dark': force a specific ink colour regardless of image.
   *  - a hex string: exact override (set from the inspector).
   */
  inkMode?: 'auto' | 'light' | 'dark' | string;
  /**
   * Text block nudge, expressed as a fraction of slide width / height, relative
   * to the preset's default anchor position.  x > 0 pushes right, y > 0 pushes
   * down.  Clamped to [-0.45, 0.45] at the edit site.  Undefined = preset
   * default.
   */
  textOffset?: { x: number; y: number };
}

interface Props {
  slide: SlideData;
  preset: SlidePreset;
  aspect: SlideAspect;
  index: number;
  total: number;
  brand?: string;
  /** Rendered width in CSS px. Height derived from aspect. */
  width?: number;
  selected?: boolean;
  onSelect?: () => void;
  /**
   * Enables drag-to-reposition on the text block. When the user releases after
   * dragging, the new `textOffset` is reported here. `null` = reset to preset.
   */
  onTextMove?: (offset: { x: number; y: number } | null) => void;
}

// Renders one carousel slide using the preset's typography system.
// Authored at the native aspect (e.g. 1080×1080), then scaled via CSS transform
// so the typography never rebalances at smaller viewports.
export function SlideFrame({
  slide, preset, aspect, index, total, brand, width, selected, onSelect, onTextMove,
}: Props) {
  // For "original" aspect, show a 1:1 preview box at 1080×1080 — the actual
  // export will use the source image's real dimensions.
  const { w: specW, h: specH } = ASPECT_RATIOS[aspect];
  const W = specW || 1080;
  const H = specH || 1080;
  const renderW = width ?? W;
  const scale = renderW / W;
  const renderH = H * scale;
  const accent = slide.accent ?? preset.accent;
  const align = slide.textAlign ?? preset.align;
  const justify = align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
  const textAlignCss: React.CSSProperties['textAlign'] =
    align === 'center' ? 'center' : align === 'end' ? 'right' : 'left';

  // ── Per-slide tweaks (from TweaksPanel) ─────────────────────────────────
  const t = slide.tweaks ?? {};
  const typeScale = t.typeScale ?? 1;
  const paddingPct = t.padding ?? 8;
  const grain = t.grain ?? 0;
  const imgBrightness = t.imgBrightness ?? 1;
  const imgContrast = t.imgContrast ?? 1;
  const tunedTitleSize = preset.titleSize * typeScale;
  const tunedBodySize = preset.bodySize * typeScale;
  const kickerSize = Math.max(12, tunedBodySize * 0.6);
  const tunedImageFilter = `${preset.imageFilter ?? ''} brightness(${imgBrightness}) contrast(${imgContrast})`.trim();

  const titleText = preset.titleCase === 'upper'
    ? slide.title.toUpperCase()
    : preset.titleCase === 'lower'
    ? slide.title.toLowerCase()
    : slide.title;

  const kickerText = slide.kicker ?? `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  // ── Adaptive ink — pick a text colour that survives the image underneath ─
  // The preset ships with its intended ink (e.g. #fff for editorial, #000 for
  // swiss grid).  That works great when the composition has its own solid
  // surface between text and image (split / framed / solid-bottom / marquee).
  // For overlays where the text sits directly on the photo (full-bleed,
  // vignette, sometimes gradient) a white ink disappears into a light scene.
  // Here we flip it automatically based on image brightness and surface.
  const { effectiveInk, needsScrim } = resolveInk(preset, slide);

  const overlayLayer = renderOverlayLayer(preset, accent);
  const textBlock = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: '84%',
        textAlign: textAlignCss,
        alignItems: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
      }}
    >
      {kickerText && (
        <div
          style={{
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: kickerSize,
            color: accent,
            letterSpacing: '0.22em',
            fontWeight: 600,
            textTransform: 'uppercase',
            textShadow: needsScrim ? scrimShadow(effectiveInk) : undefined,
          }}
        >
          {kickerText}
        </div>
      )}
      <div
        style={{
          fontFamily: preset.titleFontVar,
          fontWeight: preset.titleWeight,
          fontSize: tunedTitleSize,
          color: effectiveInk,
          letterSpacing: preset.titleTracking,
          lineHeight: preset.leadingTitle,
          textTransform: preset.titleCase === 'upper' ? 'uppercase' : preset.titleCase === 'lower' ? 'lowercase' : 'none',
          textWrap: 'balance',
          textShadow: needsScrim ? scrimShadow(effectiveInk) : undefined,
        }}
      >
        {titleText}
      </div>
      {slide.body && (
        <div
          style={{
            fontFamily: preset.bodyFontVar,
            fontWeight: preset.bodyWeight,
            fontSize: tunedBodySize,
            color: effectiveInk,
            letterSpacing: preset.bodyTracking,
            lineHeight: preset.leadingBody,
            textTransform: preset.bodyCase === 'upper' ? 'uppercase' : preset.bodyCase === 'lower' ? 'lowercase' : 'none',
            opacity: 0.92,
            textWrap: 'pretty',
            textShadow: needsScrim ? scrimShadow(effectiveInk) : undefined,
          }}
        >
          {slide.body}
        </div>
      )}
    </div>
  );

  const footer = (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: 0,
        right: 0,
        padding: '0 8%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none',
        fontFamily: 'var(--font-dm-mono), monospace',
        fontSize: 16,
        color: effectiveInk,
        opacity: 0.55,
        letterSpacing: '0.22em',
        fontWeight: 600,
        textShadow: needsScrim ? scrimShadow(effectiveInk) : undefined,
      }}
    >
      <span>{(brand ?? '').toUpperCase()}</span>
      <span>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );

  const isSplit = preset.overlay === 'split';

  // ── Drag-to-reposition state ───────────────────────────────────────────
  // Live offset while the user is dragging; commits to `onTextMove` on release.
  // Measured as a fraction of slide W/H so it survives zoom & aspect changes.
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null);
  const offset = liveOffset ?? slide.textOffset ?? null;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    base: { x: number; y: number };
    pointerId: number;
    moved: boolean;
  } | null>(null);
  const slideElRef = useRef<HTMLDivElement | null>(null);

  const draggable = !!onTextMove;
  const onTextPointerDown = draggable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const el = slideElRef.current;
        if (!el) return;
        e.stopPropagation();
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          base: offset ?? { x: 0, y: 0 },
          pointerId: e.pointerId,
          moved: false,
        };
      }
    : undefined;
  const onTextPointerMove = draggable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const el = slideElRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dx = (e.clientX - drag.startX) / rect.width;
        const dy = (e.clientY - drag.startY) / rect.height;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 0.006) return;
        drag.moved = true;
        const nx = clamp(drag.base.x + dx, -0.45, 0.45);
        const ny = clamp(drag.base.y + dy, -0.45, 0.45);
        setLiveOffset({ x: nx, y: ny });
      }
    : undefined;
  const onTextPointerUp = draggable
    ? (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        dragRef.current = null;
        if (!drag.moved) {
          setLiveOffset(null);
          return;
        }
        const committed = liveOffset;
        setLiveOffset(null);
        if (committed && onTextMove) onTextMove(committed);
      }
    : undefined;
  const onTextDoubleClick = draggable
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        setLiveOffset(null);
        if (onTextMove) onTextMove(null);
      }
    : undefined;

  // Pre-compute the transform that shifts the text wrapper by the offset.
  const textTransform = offset ? `translate(${offset.x * 100}%, ${offset.y * 100}%)` : undefined;

  const handleKey: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!onSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : -1}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={onSelect ? `Slide ${index + 1} of ${total}: ${slide.title}` : undefined}
      onClick={onSelect}
      onKeyDown={handleKey}
      ref={slideElRef}
      style={{
        width: renderW,
        height: renderH,
        position: 'relative',
        flexShrink: 0,
        border: selected ? `2px solid ${accent}` : '2px solid transparent',
        padding: 0,
        background: 'transparent',
        cursor: onSelect ? 'pointer' : 'default',
        display: 'block',
        boxShadow: selected ? `0 12px 32px ${accent}22` : '0 6px 18px rgba(0,0,0,0.6)',
        outline: 'none',
      }}
    >
      <div
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
          background: '#0a0a0a',
        }}
      >
        {isSplit ? (
          <SplitLayout W={W} H={H} preset={preset} slide={slide} textBlock={textBlock} footer={footer} justify={justify} />
        ) : (
          <>
            {/* Local uploaded image — bypass next/image since we already know the pixel dims */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.url}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: tunedImageFilter,
              }}
            />
            {overlayLayer}
            {/* Text-legibility scrim — a soft gradient pinned to wherever the
               text block lives. Only shown when the text sits directly on the
               photo (full-bleed / vignette / light-gradient) and the image
               underneath isn't already "solved" by overlayLayer.  This is the
               magazine trick: transparent at the top, heavier at the bottom
               (or reversed/centered depending on preset.overlay placement). */}
            <div style={{ position: 'absolute', inset: 0, transform: textTransform, pointerEvents: 'none' }}>
              {textBackdrop(preset, effectiveInk, positionForOverlay(preset.overlay))}
            </div>
            {grain > 0 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  opacity: grain,
                  mixBlendMode: 'overlay',
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.9'/></svg>\")",
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                padding: `${paddingPct}%`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: positionForOverlay(preset.overlay),
                alignItems: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
                transform: textTransform,
                transition: draggable && !liveOffset ? 'transform 140ms ease-out' : undefined,
              }}
            >
              <div
                onPointerDown={onTextPointerDown}
                onPointerMove={onTextPointerMove}
                onPointerUp={onTextPointerUp}
                onPointerCancel={onTextPointerUp}
                onDoubleClick={onTextDoubleClick}
                onClick={(e) => { if (draggable) e.stopPropagation(); }}
                data-slide-text={draggable ? 'true' : undefined}
                style={{
                  cursor: draggable ? (liveOffset ? 'grabbing' : 'grab') : 'default',
                  touchAction: draggable ? 'none' : 'auto',
                  // Transparent hit pad around the text block for easier grabbing.
                  padding: draggable ? 8 : 0,
                  borderRadius: draggable ? 6 : 0,
                  outline: draggable && liveOffset
                    ? `1px dashed ${accent}`
                    : undefined,
                  outlineOffset: 2,
                }}
                aria-label={draggable ? 'Drag to reposition. Double-click to reset.' : undefined}
                title={draggable ? 'Drag to move · double-click to reset' : undefined}
              >
                {textBlock}
              </div>
            </div>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}

function positionForOverlay(mode: SlidePreset['overlay']): React.CSSProperties['justifyContent'] {
  switch (mode) {
    case 'solid-bottom':
    case 'gradient':
    case 'vignette':
      return 'flex-end';
    case 'framed':
      return 'flex-end';
    case 'marquee':
      return 'center';
    default:
      return 'flex-end';
  }
}

// ─── Adaptive text-colour helpers ───────────────────────────────────────────
// Reads the hex-luminance of a colour on a 0..1 scale.  Handles #rgb, #rrggbb
// and the few keyword colours we actually use.  Returns 1 for pure white.
function hexLuminance(hex: string): number {
  let h = hex.trim().toLowerCase();
  if (h === 'white' || h === '#fff' || h === '#ffffff') return 1;
  if (h === 'black' || h === '#000' || h === '#000000') return 0;
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-f]{6}$/.test(h)) return 0.5;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Perceptual luminance (Rec. 709)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightHex(hex: string): boolean {
  return hexLuminance(hex) >= 0.7;
}

function isDarkHex(hex: string): boolean {
  return hexLuminance(hex) <= 0.35;
}

// Returns the effective ink colour and whether we should paint a soft scrim
// (text-shadow) behind the text for legibility.  The logic:
//   1. If the slide explicitly overrides (light/dark/#hex), obey that.
//   2. If the overlay places text on a solid surface (split/solid/framed/marquee/
//      dark-gradient), trust the preset's ink — no adaptation.
//   3. If text sits on the image (full-bleed, vignette, light-gradient):
//       - when image is bright and preset ink is light → swap to dark.
//       - when image is very dark and preset ink is dark → swap to light.
//       - otherwise keep the preset ink but add a scrim for safety.
export function resolveInk(
  preset: SlidePreset,
  slide: { inkMode?: string; imageBrightness?: number }
): { effectiveInk: string; needsScrim: boolean } {
  const mode = slide.inkMode;
  if (mode === 'light') return { effectiveInk: '#ffffff', needsScrim: true };
  if (mode === 'dark') return { effectiveInk: '#0a0a0a', needsScrim: false };
  if (typeof mode === 'string' && mode.startsWith('#')) {
    return { effectiveInk: mode, needsScrim: isLightHex(mode) };
  }

  // Adapt ink to image brightness so text stays readable without overlays.
  const b = typeof slide.imageBrightness === 'number' ? slide.imageBrightness : 0.5;
  const inkIsLight = isLightHex(preset.ink);
  const inkIsDark = isDarkHex(preset.ink);

  if (b >= 0.50 && inkIsLight) return { effectiveInk: '#0a0a0a', needsScrim: false };
  if (b <= 0.35 && inkIsDark) return { effectiveInk: '#ffffff', needsScrim: true };
  return { effectiveInk: preset.ink, needsScrim: true };
}

// Pull the first colour stop out of "linear-gradient(...)" so we can judge
// whether the surface behind the text is light or dark.
function stripLinearGradient(surface: string): string {
  if (!surface) return '#000000';
  if (!surface.startsWith('linear-gradient')) return surface;
  const match = surface.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g);
  if (!match || match.length === 0) return '#000000';
  // last stop is usually what the text sits on
  return match[match.length - 1];
}

// A soft multi-step shadow so text on a busy image never dissolves.
// Dark shadow for light text, light shadow for dark text.
function scrimShadow(ink: string): string {
  if (isLightHex(ink)) {
    return '0 1px 2px rgba(0,0,0,0.45), 0 2px 10px rgba(0,0,0,0.35), 0 0 1px rgba(0,0,0,0.6)';
  }
  return '0 1px 2px rgba(255,255,255,0.55), 0 2px 8px rgba(255,255,255,0.35)';
}

// Gradient scrim pinned to the text zone — keeps text legible on photos
// without covering the image with a solid box.
function textBackdrop(
  _preset: SlidePreset,
  ink: string,
  justify: React.CSSProperties['justifyContent']
): React.ReactNode {
  if (!isLightHex(ink)) return null; // dark text on light image — no scrim needed
  const gradient =
    justify === 'flex-end'
      ? 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 40%, transparent 65%)'
      : justify === 'flex-start'
      ? 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 38%, transparent 60%)'
      : 'linear-gradient(to bottom, transparent 15%, rgba(0,0,0,0.52) 45%, rgba(0,0,0,0.52) 55%, transparent 85%)';
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        background: gradient,
        pointerEvents: 'none',
      }}
    />
  );
}

// Overlay rendering intentionally disabled — presets differ only in typography.
// Background boxes/blocks/gradients covered the source images and degraded quality.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderOverlayLayer(_preset: SlidePreset, _accent: string) {
  return null;
}

function SplitLayout({
  W, H, preset, slide, textBlock, footer, justify,
}: {
  W: number;
  H: number;
  preset: SlidePreset;
  slide: SlideData;
  textBlock: React.ReactNode;
  footer: React.ReactNode;
  justify: React.CSSProperties['justifyContent'];
}) {
  const isPortrait = H >= W;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: isPortrait ? '1fr' : '58% 42%',
        gridTemplateRows: isPortrait ? '58% 42%' : '1fr',
      }}
    >
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.url}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: preset.imageFilter }}
        />
      </div>
      <div
        style={{
          background: '#0a0a0a',
          padding: '8%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: justify,
        }}
      >
        {textBlock}
      </div>
      {footer}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
