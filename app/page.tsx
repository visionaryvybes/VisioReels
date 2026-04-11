"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus, LayoutGrid, Palette, Wand2, ScrollText,
  Clapperboard, Download, CheckCircle2, AlertCircle,
  Loader2, X, WifiOff, Music2, Smartphone,
  PlaySquare, Pin, Sparkles, ChevronRight,
  Play, RefreshCw, Film, Moon, Zap, Minimize2,
  Radio, Cpu, ArrowRight, RotateCcw, Settings,
  Plus, Volume2,
} from "lucide-react";
import { PLATFORMS, MOODS, type Platform, type Mood } from "@/lib/platforms";
import type { VideoScript } from "@/lib/gemma";

// ─── Custom icons ─────────────────────────────────────────────────────────────

const XBrandIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// ─── Constants ────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_META = [
  { step: 1 as Step, label: "Upload",   icon: ImagePlus,    hint: "Midjourney images" },
  { step: 2 as Step, label: "Platform", icon: LayoutGrid,   hint: "Distribution channel" },
  { step: 3 as Step, label: "Mood",     icon: Palette,      hint: "Visual preset" },
  { step: 4 as Step, label: "Generate", icon: Wand2,        hint: "AI writes the script" },
  { step: 5 as Step, label: "Script",   icon: ScrollText,   hint: "Review & edit" },
  { step: 6 as Step, label: "Render",   icon: Clapperboard, hint: "Export to MP4" },
  { step: 7 as Step, label: "Export",   icon: Download,     hint: "Ready to post" },
] as const;

const PLATFORM_META: Record<string, {
  color: string; bg: string; border: string;
  icon: React.ElementType; specs: string;
}> = {
  tiktok:    { color: "#ff2d54", bg: "rgba(255,45,84,0.06)",    border: "rgba(255,45,84,0.25)",   icon: Music2,     specs: "9:16 · 15s" },
  reels:     { color: "#e1306c", bg: "rgba(225,48,108,0.06)",   border: "rgba(225,48,108,0.25)",  icon: Smartphone, specs: "9:16 · 30s" },
  shorts:    { color: "#ff0000", bg: "rgba(255,0,0,0.06)",      border: "rgba(255,0,0,0.22)",     icon: PlaySquare, specs: "9:16 · 20s" },
  pinterest: { color: "#e60023", bg: "rgba(230,0,35,0.06)",     border: "rgba(230,0,35,0.22)",    icon: Pin,        specs: "2:3 · 10s" },
  x:         { color: "#e7e9ea", bg: "rgba(255,255,255,0.04)",  border: "rgba(255,255,255,0.18)", icon: XBrandIcon, specs: "16:9 · 15s" },
};

const MOOD_PRESETS: Record<string, {
  icon: React.ElementType;
  label: string;
  emoji: string;
  bg: string;
  accentColor: string;
  tags: string[];
  description: string;
}> = {
  cinematic:    { icon: Film,     emoji: "🎬", label: "Cinematic",   bg: "linear-gradient(150deg,#1a1200 0%,#0d1a1a 60%,#010101 100%)",      accentColor: "#d4a017", tags: ["Ken Burns","Film Grain","Light Leaks","Letterbox"], description: "Teal-orange LUT · slow drama · epic scale" },
  "dark-moody": { icon: Moon,     emoji: "🌑", label: "Dark Moody",  bg: "linear-gradient(150deg,#0a0010 0%,#050018 60%,#010101 100%)",      accentColor: "#a855f7", tags: ["Deep Vignette","Glitch","Chroma Split"],           description: "Brooding · high contrast · atmospheric" },
  vibrant:      { icon: Zap,      emoji: "⚡", label: "Vibrant",     bg: "linear-gradient(150deg,#1a0800 0%,#1a0d00 60%,#010101 100%)",      accentColor: "#f97316", tags: ["Speed Lines","Zoom Burst","Color Boost"],          description: "Hyper-saturated · explosive · velocity" },
  minimal:      { icon: Minimize2,emoji: "◻️", label: "Minimal",     bg: "linear-gradient(150deg,#141414 0%,#0e0e0e 60%,#010101 100%)",     accentColor: "#d4d4d8", tags: ["Slow Ken Burns","Clean Captions","Quiet Luxury"],  description: "Editorial calm · clean lines · refined" },
  raw:          { icon: Radio,    emoji: "📸", label: "Raw",         bg: "linear-gradient(150deg,#111008 0%,#0d0d08 60%,#010101 100%)",      accentColor: "#fbbf24", tags: ["Authentic Grain","Handheld Feel","No Filter"],    description: "Unpolished authenticity · real · relatable" },
  neon:         { icon: Cpu,      emoji: "🌐", label: "Neon",        bg: "linear-gradient(150deg,#000d1a 0%,#001508 40%,#0a0020 100%)",     accentColor: "#00e5ff", tags: ["RGB Split","Scan Lines","Neon Glow","Glitch"],     description: "Cyberpunk electric · futuristic · bold" },
};

const RESOLUTION_PRESETS = [
  { label: "720p",   w: 720,  h: 1280, note: "Fast" },
  { label: "1080p",  w: 1080, h: 1920, note: "Default" },
  { label: "4K",     w: 2160, h: 3840, note: "Max quality" },
  { label: "Square", w: 1080, h: 1080, note: "Feed" },
];

const FU = {
  initial:    { opacity: 0, y: 16 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -8 },
  transition: { type: "spring", stiffness: 280, damping: 26 },
} as const;

// ─── Dynamic background ───────────────────────────────────────────────────────

function Background({ moodAccent }: { moodAccent?: string }) {
  return (
    <>
      <div className="bg-canvas" aria-hidden />
      <div className="noise-overlay" aria-hidden />
      {/* Mood-reactive glow blob */}
      {moodAccent && (
        <div
          className="fixed pointer-events-none z-0"
          style={{
            width: 600, height: 600,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${moodAccent}12 0%, transparent 65%)`,
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            transition: "background 1.2s ease",
          }}
          aria-hidden
        />
      )}
    </>
  );
}

// ─── Hero section ─────────────────────────────────────────────────────────────

function Hero() {
  const features = [
    { icon: "🎬", label: "CapCut effects" },
    { icon: "🤖", label: "Gemma 4 AI" },
    { icon: "⚡", label: "Remotion render" },
    { icon: "🎵", label: "Mood music" },
    { icon: "📐", label: "Multi-platform" },
  ];
  return (
    <div className="mb-8 text-center">
      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
        style={{
          background: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.2)",
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "#3b82f6" }} />
        <span className="text-[11px] font-bold" style={{ color: "#60a5fa" }}>Personal Creative Workstation · 2026</span>
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="text-[36px] sm:text-[44px] font-black tracking-tighter leading-none mb-3"
        style={{ color: "#f0f0f0" }}
      >
        AI-Powered
        <br />
        <span className="text-gradient-blue">Social Reels</span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.16 }}
        className="text-[14px] sm:text-[15px] font-medium leading-relaxed mb-6 max-w-[420px] mx-auto"
        style={{ color: "#666" }}
      >
        Drop a Midjourney image → Gemma 4 writes the script → Remotion renders the video
      </motion.p>

      {/* Feature pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.24 }}
        className="flex items-center justify-center flex-wrap gap-2"
      >
        {features.map((f, i) => (
          <span
            key={i}
            className="feat-tag"
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Config summary bar ───────────────────────────────────────────────────────

function ConfigBar({
  imageCount,
  platform,
  mood,
  onEditPlatform,
  onEditMood,
}: {
  imageCount: number;
  platform: string;
  mood: string;
  onEditPlatform: () => void;
  onEditMood: () => void;
}) {
  const pm = PLATFORM_META[platform];
  const mp = MOOD_PRESETS[mood];
  return (
    <motion.div
      {...FU}
      className="flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-2xl"
      style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Images */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold"
        style={{ background: "#161616", color: "#888", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <ImagePlus size={10} style={{ color: "#555" }} />
        {imageCount} image{imageCount !== 1 ? "s" : ""}
      </div>

      {/* Platform */}
      {pm && (
        <button
          onClick={onEditPlatform}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-opacity hover:opacity-70"
          style={{ background: `${pm.color}14`, color: pm.color, border: `1px solid ${pm.color}28` }}
        >
          {platform}
          <ChevronRight size={9} />
        </button>
      )}

      {/* Mood */}
      {mp && (
        <button
          onClick={onEditMood}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-opacity hover:opacity-70"
          style={{ background: `${mp.accentColor}14`, color: mp.accentColor, border: `1px solid ${mp.accentColor}28` }}
        >
          {mp.emoji} {mp.label}
          <ChevronRight size={9} />
        </button>
      )}
    </motion.div>
  );
}

// ─── Step progress pill row ───────────────────────────────────────────────────

function StepPills({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {STEP_META.map(({ step }, idx) => {
        const done   = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            {idx > 0 && (
              <div
                className="h-px w-4 sm:w-5 flex-shrink-0 transition-colors duration-500"
                style={{ background: done ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)" }}
              />
            )}
            <motion.div
              animate={{ scale: active ? 1.15 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: done
                  ? "rgba(34,197,94,0.18)"
                  : active
                    ? "rgba(59,130,246,0.18)"
                    : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${done ? "#22c55e" : active ? "#3b82f6" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {done
                ? <CheckCircle2 size={10} style={{ color: "#22c55e" }} />
                : <span className="text-[9px] font-bold" style={{ color: active ? "#60a5fa" : "rgba(255,255,255,0.25)" }}>{step}</span>
              }
            </motion.div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function AppHeader({
  ollamaConnected,
  currentStep,
}: {
  ollamaConnected: boolean | null;
  currentStep: Step;
}) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 h-14"
      style={{
        background: "rgba(8,8,8,0.88)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-black"
          style={{
            background: "linear-gradient(135deg,#fff 0%,#d0d0d0 100%)",
            color: "#000",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          V
        </div>
        <span className="font-bold text-[15px] tracking-tight" style={{ color: "#f0f0f0" }}>
          VisioReels
        </span>
        <span
          className="hidden sm:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{
            background: "rgba(59,130,246,0.12)",
            color: "#60a5fa",
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          2026
        </span>
      </div>

      {/* Step progress — center */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <StepPills current={currentStep} />
      </div>

      {/* Status — right */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0 text-[11px] font-medium"
        style={{
          background: "#141414",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {ollamaConnected === null ? (
          <><Loader2 size={10} className="animate-spin" style={{ color: "#555" }} /><span style={{ color: "#555" }}>…</span></>
        ) : ollamaConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "#22c55e" }} />
            <span style={{ color: "#22c55e" }}>Gemma 4</span>
          </>
        ) : (
          <>
            <WifiOff size={10} style={{ color: "#ef4444" }} />
            <span style={{ color: "#ef4444" }}>Offline</span>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({
  children,
  accent,
  glow,
}: {
  children: React.ReactNode;
  accent?: string;
  glow?: string;
}) {
  return (
    <motion.div
      {...FU}
      className="rounded-2xl relative overflow-hidden"
      style={{
        background: "#0f0f0f",
        border: `1px solid ${accent ? `${accent}30` : "rgba(255,255,255,0.08)"}`,
        boxShadow: glow ? `0 0 48px ${glow}` : "none",
      }}
    >
      {/* Top accent shimmer */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: accent
            ? `linear-gradient(90deg, transparent 5%, ${accent}88 50%, transparent 95%)`
            : "linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.1) 50%, transparent 95%)",
        }}
      />
      {children}
    </motion.div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({
  step,
  title,
  subtitle,
  action,
}: {
  step: number;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5"
          style={{
            background: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.2)",
            color: "#60a5fa",
          }}
        >
          {step}
        </div>
        <div>
          <h2 className="text-[22px] font-black tracking-tight leading-tight" style={{ color: "#f0f0f0" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-[13px] mt-0.5 font-medium" style={{ color: "#666" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0 ml-3">{action}</div>}
    </div>
  );
}

// ─── Platform card ────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  selected,
  onClick,
}: {
  platform: Platform;
  selected: boolean;
  onClick: () => void;
}) {
  const m = PLATFORM_META[platform.id] ?? PLATFORM_META.tiktok;
  const Icon = m.icon;
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative w-full text-left rounded-xl overflow-hidden transition-all duration-150"
      style={{
        background: selected ? m.bg : "#141414",
        border: `1px solid ${selected ? m.border : "rgba(255,255,255,0.08)"}`,
        boxShadow: selected ? `0 0 28px ${m.color}22` : "none",
      }}
    >
      {/* Color bar top */}
      <div
        className="h-0.5 w-full transition-all duration-300"
        style={{ background: selected ? m.color : "transparent" }}
      />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: `${m.color}18`,
              border: `1px solid ${m.color}30`,
            }}
          >
            <Icon size={20} style={{ color: m.color }} />
          </div>
          {selected && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: `${m.color}22`, border: `1px solid ${m.color}` }}
            >
              <CheckCircle2 size={10} style={{ color: m.color }} />
            </div>
          )}
        </div>
        <div className="font-bold text-[15px]" style={{ color: selected ? "#fff" : "#bbb" }}>
          {platform.name}
        </div>
        <div className="text-[11px] mt-0.5 font-semibold" style={{ color: selected ? m.color : "#555" }}>
          {m.specs}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Mood preset card ─────────────────────────────────────────────────────────

function MoodCard({
  mood,
  selected,
  onClick,
}: {
  mood: Mood;
  selected: boolean;
  onClick: () => void;
}) {
  const p = MOOD_PRESETS[mood.id];
  if (!p) return null;
  return (
    <motion.button
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative w-full text-left rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${selected ? p.accentColor + "60" : "rgba(255,255,255,0.07)"}`,
        boxShadow: selected ? `0 0 32px ${p.accentColor}22` : "none",
        outline: "none",
      }}
    >
      {/* Gradient swatch — full bleed */}
      <div className="relative h-[110px] w-full" style={{ background: p.bg }}>
        {/* Big emoji */}
        <span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl leading-none select-none"
          style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.6))" }}
        >
          {p.emoji}
        </span>
        {/* Selected ring */}
        {selected && (
          <div
            className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: `${p.accentColor}30`, border: `1.5px solid ${p.accentColor}` }}
          >
            <CheckCircle2 size={10} style={{ color: p.accentColor }} />
          </div>
        )}
        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-12"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.75))" }}
        />
        {/* Mood name on gradient */}
        <div
          className="absolute bottom-2.5 left-3 font-black text-[15px] tracking-tight"
          style={{
            color: selected ? p.accentColor : "#f0f0f0",
            textShadow: "0 1px 12px rgba(0,0,0,0.9)",
          }}
        >
          {p.label}
        </div>
      </div>

      {/* Info section */}
      <div
        className="px-3 pt-2.5 pb-3"
        style={{ background: selected ? "rgba(255,255,255,0.025)" : "#111" }}
      >
        <p className="text-[10px] leading-relaxed mb-2" style={{ color: "#555" }}>
          {p.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {p.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: selected ? `${p.accentColor}18` : "#1e1e1e",
                color: selected ? p.accentColor : "#555",
                border: `1px solid ${selected ? `${p.accentColor}30` : "rgba(255,255,255,0.06)"}`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Image strip ──────────────────────────────────────────────────────────────

function ImageStrip({
  urls,
  onRemove,
}: {
  files: File[];
  urls: string[];
  onRemove: (i: number) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <motion.div
      {...FU}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {urls.map((url, i) => (
          <div key={i} className="relative flex-shrink-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-12 h-12 rounded-xl object-cover"
              style={{ border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <div
              className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black"
              style={{ background: "var(--blue)", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
            >
              {i + 1}
            </div>
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center hidden group-hover:flex"
              style={{ background: "#ef4444", color: "#fff" }}
            >
              <X size={8} />
            </button>
          </div>
        ))}
        {urls.length < 5 && (
          <label
            className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors"
            style={{ background: "#1a1a1a", border: "1px dashed rgba(255,255,255,0.15)" }}
          >
            <Plus size={14} style={{ color: "#555" }} />
            <input
              type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
              onChange={(e) => {
                const ev = new CustomEvent("visio-add-images", { detail: e.target.files });
                window.dispatchEvent(ev);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[12px] font-bold" style={{ color: "#ccc" }}>{urls.length} image{urls.length > 1 ? "s" : ""}</div>
        {urls.length > 1 && <div className="text-[10px]" style={{ color: "#555" }}>multi-cut</div>}
      </div>
    </motion.div>
  );
}

// ─── Error alert ──────────────────────────────────────────────────────────────

function ErrAlert({ msg }: { msg: string }) {
  return (
    <motion.div
      {...FU}
      className="flex items-start gap-2.5 rounded-xl p-3.5 text-[12px] mb-4"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#fca5a5" }}
    >
      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
      <span className="leading-relaxed">{msg}</span>
    </motion.div>
  );
}

// ─── Script display ───────────────────────────────────────────────────────────

function ScriptDisplay({
  script,
  onEdit,
}: {
  script: VideoScript;
  onEdit: (s: VideoScript) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Hook */}
      <div
        className="rounded-xl p-4 relative"
        style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="absolute left-0 top-4 bottom-4 w-0.5 ml-0 rounded-full" style={{ background: "var(--blue)", left: "0px", borderRadius: "0 2px 2px 0" }} />
        <div className="pl-3">
          <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "#3b82f6" }}>
            HOOK · 0.8s
          </div>
          <textarea
            value={script.hook}
            onChange={e => onEdit({ ...script, hook: e.target.value })}
            rows={2}
            className="w-full bg-transparent resize-none text-[20px] font-black leading-snug tracking-tight focus:outline-none"
            style={{ color: "#f0f0f0", fontFamily: "inherit" }}
          />
        </div>
      </div>

      {/* Voiceover */}
      <div className="rounded-xl p-4" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "#444" }}>VOICEOVER</div>
        <textarea
          value={script.script}
          onChange={e => onEdit({ ...script, script: e.target.value })}
          rows={4}
          className="w-full bg-transparent resize-none text-[13px] leading-relaxed focus:outline-none"
          style={{ color: "#888", fontFamily: "inherit" }}
        />
      </div>

      {/* CTA */}
      <div className="rounded-xl p-3.5" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-1.5" style={{ color: "#444" }}>CALL TO ACTION</div>
        <input
          value={script.cta ?? ""}
          onChange={e => onEdit({ ...script, cta: e.target.value })}
          className="w-full bg-transparent text-[14px] font-bold focus:outline-none"
          style={{ color: "#f0f0f0", fontFamily: "inherit" }}
          placeholder='e.g. "Save this before it&apos;s gone 🔥"'
        />
      </div>

      {/* Captions */}
      <div className="rounded-xl p-4" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-3" style={{ color: "#444" }}>
          CAPTIONS · {script.captions.length} beats
        </div>
        <div className="flex flex-wrap gap-1.5">
          {script.captions.map((cap, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
              style={{ background: "#1e1e1e", color: "#999", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Hashtags + style */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl p-3.5" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "#444" }}>HASHTAGS</div>
          <div className="flex flex-wrap gap-1">
            {script.hashtags.map((h, i) => (
              <span key={i} className="text-[12px] font-medium" style={{ color: "#3b82f6" }}>
                #{h.replace(/^#/, "")}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-3.5" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "#444" }}>STYLE</div>
          <div className="space-y-1 text-[11px] font-medium" style={{ color: "#666" }}>
            <div>↗ {script.style?.transition ?? "—"}</div>
            <div>◈ {script.style?.colorGrade ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Resolution picker ────────────────────────────────────────────────────────

function ResPicker({
  platform,
  value,
  onChange,
}: {
  platform: string;
  value: { w: number; h: number } | null;
  onChange: (v: { w: number; h: number } | null) => void;
}) {
  const isLandscape = platform === "x";
  const presets = isLandscape
    ? [{ label: "720p", w: 1280, h: 720, note: "Fast" }, { label: "1080p", w: 1920, h: 1080, note: "Default" }, { label: "4K", w: 3840, h: 2160, note: "Max" }]
    : RESOLUTION_PRESETS;
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-2.5" style={{ color: "#444" }}>RESOLUTION</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChange(null)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
          style={{
            background: value === null ? "#1e1e1e" : "#141414",
            border: `1px solid ${value === null ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}`,
            color: value === null ? "#ddd" : "#555",
          }}
        >
          Platform default
        </button>
        {presets.map((p) => {
          const active = value?.w === p.w && value?.h === p.h;
          return (
            <button
              key={p.label}
              onClick={() => onChange({ w: p.w, h: p.h })}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
              style={{
                background: active ? "rgba(59,130,246,0.12)" : "#141414",
                border: `1px solid ${active ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: active ? "#60a5fa" : "#555",
              }}
            >
              {p.label}
              <span className="ml-1 opacity-50 text-[9px]">{p.note}</span>
            </button>
          );
        })}
      </div>
      {value && (
        <p className="mt-1.5 text-[10px]" style={{ color: "#444" }}>{value.w} × {value.h}px</p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VisioReelsPage() {
  const [currentStep, setCurrentStep] = useState<Step>(1);

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedMood, setSelectedMood] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [script, setScript] = useState<VideoScript | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState("");

  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  const downloadUrlRef = useRef("");

  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [customResolution, setCustomResolution] = useState<{ w: number; h: number } | null>(null);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.35);
  const [sfxVolume, setSfxVolume] = useState(0.7);

  // Ollama health check
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
        setOllamaConnected(r.ok);
      } catch { setOllamaConnected(false); }
    };
    check();
    const iv = setInterval(check, 15000);
    return () => clearInterval(iv);
  }, []);

  // Cycling status messages during generation
  useEffect(() => {
    if (!isGenerating) return;
    const msgs = ["Reading your image…", "Identifying composition…", "Crafting the hook…", "Writing voiceover…", "Generating captions…", "Optimizing for virality…"];
    let i = 0;
    setGeneratingMsg(msgs[0]);
    const iv = setInterval(() => { i = Math.min(i + 1, msgs.length - 1); setGeneratingMsg(msgs[i]); }, 2000);
    return () => clearInterval(iv);
  }, [isGenerating]);

  // Listen for "add more images" event
  useEffect(() => {
    const handler = (e: Event) => {
      const files = (e as CustomEvent<FileList | null>).detail;
      if (files) addImageFiles(Array.from(files));
    };
    window.addEventListener("visio-add-images", handler);
    return () => window.removeEventListener("visio-add-images", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFiles, imageDataUrls]);

  const addImageFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(f => f.type.match(/^image\/(jpeg|png|webp)$/));
    const combined = [...imageFiles, ...valid].slice(0, 5);
    setImageFiles(combined);
    const existing = [...imageDataUrls];
    const readers = valid.slice(0, 5 - imageDataUrls.length).map(
      f => new Promise<string>(res => {
        const r = new FileReader();
        r.onload = e => res(e.target?.result as string ?? "");
        r.readAsDataURL(f);
      })
    );
    Promise.all(readers).then(newUrls => {
      const all = [...existing, ...newUrls].slice(0, 5);
      setImageDataUrls(all);
      if (currentStep === 1) setCurrentStep(2);
    });
  }, [imageFiles, imageDataUrls, currentStep]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addImageFiles(files);
  }, [addImageFiles]);

  const removeImage = useCallback((idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImageDataUrls(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleGenerate = async () => {
    if (imageDataUrls.length === 0 || !selectedPlatform || !selectedMood) return;
    setIsGenerating(true);
    setGenerateError("");
    setScript(null);
    setDownloadUrl("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: imageDataUrls, platform: selectedPlatform, mood: selectedMood }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as VideoScript;
      setScript(data);
      setCurrentStep(5);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRender = async () => {
    if (!script || imageDataUrls.length === 0 || !selectedPlatform || !selectedMood) return;
    setIsRendering(true);
    setRenderError("");
    setRenderProgress(0);
    setCurrentStep(6);
    const iv = setInterval(() => setRenderProgress(p => p >= 88 ? p : p + Math.random() * 6), 900);
    try {
      const body: Record<string, unknown> = {
        script, imageDataUrls, platform: selectedPlatform, mood: selectedMood,
        bgMusicVolume, sfxVolume,
      };
      if (customResolution) { body.customWidth = customResolution.w; body.customHeight = customResolution.h; }
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      clearInterval(iv);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Render failed" })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setRenderProgress(100);
      setCurrentStep(7);
    } catch (err) {
      clearInterval(iv);
      setRenderError(err instanceof Error ? err.message : "Render failed");
      setCurrentStep(5);
    } finally {
      setIsRendering(false);
    }
  };

  const handleReset = () => {
    setImageFiles([]); setImageDataUrls([]);
    setSelectedPlatform(""); setSelectedMood("");
    setScript(null); setGenerateError(""); setRenderError("");
    setDownloadUrl(""); setRenderProgress(0); setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const platformObj = PLATFORMS.find(p => p.id === selectedPlatform);
  const moodObj = MOODS.find(m => m.id === selectedMood);
  const canGenerate = imageDataUrls.length > 0 && !!selectedPlatform && !!selectedMood && !isGenerating;
  const moodAccent = selectedMood ? MOOD_PRESETS[selectedMood]?.accentColor : undefined;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Background moodAccent={moodAccent} />
      <AppHeader ollamaConnected={ollamaConnected} currentStep={currentStep} />

      <main className="relative z-10 pt-14 pb-28">
        <div className="max-w-[620px] mx-auto px-4 sm:px-6 py-8 space-y-4">

          {/* ── Hero (shown only on step 1) ───────────────────────── */}
          <AnimatePresence>
            {currentStep === 1 && <Hero key="hero" />}
          </AnimatePresence>

          {/* ── Config bar (shown after step 1) ──────────────────── */}
          <AnimatePresence>
            {currentStep > 1 && imageDataUrls.length > 0 && (
              <ConfigBar
                key="configbar"
                imageCount={imageDataUrls.length}
                platform={selectedPlatform}
                mood={selectedMood}
                onEditPlatform={() => setCurrentStep(2)}
                onEditMood={() => setCurrentStep(3)}
              />
            )}
          </AnimatePresence>

          {/* ── Step 1: Upload ────────────────────────────────────── */}
          <AnimatePresence>
            {currentStep === 1 && (
              <Card key="upload">
                <div className="p-6 sm:p-8">
                  <SectionHead step={1} title="Upload your images" subtitle="Drop 1–5 Midjourney images · Multiple = multi-cut video" />

                  <motion.div
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    animate={{
                      borderColor: isDragOver ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.1)",
                    }}
                    className="cursor-pointer rounded-2xl overflow-hidden relative"
                    style={{ border: `2px dashed ${isDragOver ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.1)"}` }}
                  >
                    {/* Animated grid background */}
                    <div
                      className="absolute inset-0 upload-grid"
                      style={{ opacity: isDragOver ? 0.5 : 0.4 }}
                    />
                    {/* Blue glow on drag */}
                    {isDragOver && (
                      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
                    )}
                    <div className="relative flex flex-col items-center justify-center py-20 px-8 text-center">
                      <motion.div
                        animate={{ scale: isDragOver ? 1.12 : 1, rotate: isDragOver ? 6 : 0, y: isDragOver ? -4 : 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
                        style={{
                          background: isDragOver ? "rgba(59,130,246,0.15)" : "#191919",
                          border: `1.5px solid ${isDragOver ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                          boxShadow: isDragOver ? "0 0 40px rgba(59,130,246,0.25)" : "0 0 0 rgba(0,0,0,0)",
                        }}
                      >
                        <ImagePlus size={32} style={{ color: isDragOver ? "#60a5fa" : "#555" }} />
                      </motion.div>
                      <p className="font-black text-[20px] tracking-tight mb-2" style={{ color: isDragOver ? "#60a5fa" : "#ccc" }}>
                        {isDragOver ? "Drop it!" : "Drag & drop or click to browse"}
                      </p>
                      <p className="text-[13px] font-medium mb-5" style={{ color: "#555" }}>
                        JPG · PNG · WebP · Up to 5 images
                      </p>
                      {/* Format chips */}
                      <div className="flex items-center gap-2">
                        {["Midjourney", "DALL-E", "Stable Diffusion", "Any image"].map(f => (
                          <span key={f} className="feat-tag">{f}</span>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={e => { if (e.target.files) addImageFiles(Array.from(e.target.files)); }}
                    className="hidden"
                  />
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* Image strip — persistent after upload */}
          <AnimatePresence>
            {imageDataUrls.length > 0 && currentStep > 1 && (
              <ImageStrip key="strip" files={imageFiles} urls={imageDataUrls} onRemove={removeImage} />
            )}
          </AnimatePresence>

          {/* ── Step 2: Platform ──────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 2 && !script && (
              <Card key="platform">
                <div className="p-6 sm:p-8">
                  <SectionHead step={2} title="Choose platform" subtitle="Where is this video going?" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {PLATFORMS.map(p => (
                      <PlatformCard
                        key={p.id}
                        platform={p}
                        selected={selectedPlatform === p.id}
                        onClick={() => {
                          setSelectedPlatform(p.id);
                          if (currentStep === 2) setCurrentStep(3);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 3: Mood ──────────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 3 && !script && (
              <Card key="mood">
                <div className="p-6 sm:p-8">
                  <SectionHead step={3} title="Effect preset" subtitle="Each preset applies cinematic effects to your video" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {MOODS.map(m => (
                      <MoodCard
                        key={m.id}
                        mood={m}
                        selected={selectedMood === m.id}
                        onClick={() => {
                          setSelectedMood(m.id);
                          if (currentStep === 3) setCurrentStep(4);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 4: Generate ──────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 4 && !script && (
              <Card key="generate" accent="#3b82f6" glow="rgba(59,130,246,0.06)">
                <div className="p-6 sm:p-8">
                  <SectionHead step={4} title="Generate script" subtitle="Gemma 4 writes your hook, voiceover & captions" />

                  {/* Selection summary */}
                  {platformObj && moodObj && (
                    <div
                      className="flex items-center gap-3 p-3.5 rounded-xl mb-5"
                      style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {imageDataUrls[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageDataUrls[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" style={{ border: "1px solid rgba(255,255,255,0.1)" }} />
                      )}
                      {imageDataUrls.length > 1 && (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: "#1e1e1e", color: "#aaa", border: "1px solid rgba(255,255,255,0.09)" }}>
                          +{imageDataUrls.length - 1}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: `${PLATFORM_META[platformObj.id]?.color ?? "#fff"}18`, color: PLATFORM_META[platformObj.id]?.color ?? "#fff", border: `1px solid ${PLATFORM_META[platformObj.id]?.color ?? "#fff"}28` }}>
                          {platformObj.name}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: `${MOOD_PRESETS[moodObj.id]?.accentColor ?? "#fff"}18`, color: MOOD_PRESETS[moodObj.id]?.accentColor ?? "#fff", border: `1px solid ${MOOD_PRESETS[moodObj.id]?.accentColor ?? "#fff"}28` }}>
                          {moodObj.emoji} {moodObj.name}
                        </span>
                        {imageDataUrls.length > 1 && (
                          <span className="text-[10px] font-semibold" style={{ color: "#555" }}>{imageDataUrls.length}-cut sequence</span>
                        )}
                      </div>
                    </div>
                  )}

                  {generateError && <ErrAlert msg={generateError} />}

                  {!ollamaConnected && ollamaConnected !== null && (
                    <div
                      className="flex items-start gap-2.5 p-3.5 rounded-xl mb-4 text-[12px]"
                      style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", color: "#fcd34d" }}
                    >
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      <span>Ollama is offline — run <code className="font-mono bg-amber-500/10 px-1 rounded">ollama serve</code> in Terminal</span>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: canGenerate ? 1.015 : 1 }}
                    whileTap={{ scale: canGenerate ? 0.985 : 1 }}
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-[15px] relative overflow-hidden transition-all duration-200"
                    style={{
                      background: canGenerate ? "linear-gradient(135deg, #1d4ed8, #1e40af)" : "#141414",
                      color: canGenerate ? "#fff" : "#444",
                      cursor: canGenerate ? "pointer" : "not-allowed",
                      boxShadow: canGenerate ? "0 0 40px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
                    }}
                  >
                    {canGenerate && !isGenerating && (
                      <div
                        className="absolute inset-0 animate-shimmer pointer-events-none"
                        style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
                      />
                    )}
                    {isGenerating
                      ? <><Loader2 size={17} className="animate-spin" /><span>{generatingMsg}</span></>
                      : <><Sparkles size={17} /><span>Generate with Gemma 4</span><ArrowRight size={15} /></>
                    }
                  </motion.button>

                  {isGenerating && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 flex items-center justify-center gap-2 text-[11px]" style={{ color: "#555" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-dot" />
                      visio-gemma · localhost:11434
                    </motion.div>
                  )}
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 5: Script ────────────────────────────────────── */}
          <AnimatePresence>
            {script && (
              <Card key="script">
                <div className="p-6 sm:p-8">
                  <SectionHead
                    step={5}
                    title="Your script"
                    subtitle="Generated by visio-gemma · Gemma 4 E4B · Edit any field"
                    action={
                      <button
                        onClick={() => { setScript(null); setCurrentStep(4); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                        style={{ background: "#1a1a1a", color: "#888", border: "1px solid rgba(255,255,255,0.09)" }}
                      >
                        <RefreshCw size={11} /><span>Regen</span>
                      </button>
                    }
                  />

                  <ScriptDisplay script={script} onEdit={setScript} />

                  <div className="mt-5">
                    <button
                      onClick={() => setCurrentStep(6)}
                      className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-[15px] transition-all"
                      style={{
                        background: "linear-gradient(135deg, #15803d, #166534)",
                        color: "#fff",
                        boxShadow: "0 0 40px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
                      }}
                    >
                      <Play size={16} />
                      Render to MP4
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 6: Render ────────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 6 && script && (
              <Card key="render" accent="rgba(34,197,94,0.6)">
                <div className="p-6 sm:p-8">
                  <SectionHead step={6} title="Render" subtitle="Export to MP4 with Remotion" />

                  {renderError && <ErrAlert msg={renderError} />}

                  {/* Platform info bar */}
                  {platformObj && (
                    <div
                      className="flex items-center gap-2.5 p-3 rounded-xl mb-5"
                      style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <Clapperboard size={13} style={{ color: "#555" }} />
                      <span className="text-[12px] font-semibold" style={{ color: "#777" }}>
                        {platformObj.name} · {customResolution ? `${customResolution.w}×${customResolution.h}` : `${platformObj.width}×${platformObj.height}`} · {platformObj.fps}fps · {Math.round(platformObj.durationInFrames / platformObj.fps)}s · H.264
                      </span>
                    </div>
                  )}

                  {/* Export settings toggle */}
                  <button
                    onClick={() => setShowExportSettings(v => !v)}
                    className="flex items-center gap-2 text-[12px] font-bold mb-3 transition-colors"
                    style={{ color: showExportSettings ? "#60a5fa" : "#555" }}
                  >
                    <Settings size={12} />
                    Export settings
                    <ChevronRight size={12} style={{ transform: showExportSettings ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                  </button>

                  <AnimatePresence>
                    {showExportSettings && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-5 overflow-hidden"
                      >
                        <div className="p-4 rounded-xl space-y-4" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <ResPicker platform={selectedPlatform} value={customResolution} onChange={setCustomResolution} />

                          {/* Audio controls */}
                          <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-3" style={{ color: "#444" }}>AUDIO</div>
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <Volume2 size={12} style={{ color: "#555", flexShrink: 0 }} />
                                <span className="text-[12px] font-semibold w-20 flex-shrink-0" style={{ color: "#777" }}>Music</span>
                                <input
                                  type="range" min={0} max={1} step={0.05}
                                  value={bgMusicVolume}
                                  onChange={e => setBgMusicVolume(parseFloat(e.target.value))}
                                  className="flex-1 cursor-pointer h-1 rounded-full"
                                  style={{ accentColor: "#3b82f6" }}
                                />
                                <span className="text-[10px] font-mono w-8 text-right" style={{ color: "#555" }}>{Math.round(bgMusicVolume * 100)}%</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <Zap size={12} style={{ color: "#555", flexShrink: 0 }} />
                                <span className="text-[12px] font-semibold w-20 flex-shrink-0" style={{ color: "#777" }}>SFX</span>
                                <input
                                  type="range" min={0} max={1} step={0.05}
                                  value={sfxVolume}
                                  onChange={e => setSfxVolume(parseFloat(e.target.value))}
                                  className="flex-1 cursor-pointer h-1 rounded-full"
                                  style={{ accentColor: "#3b82f6" }}
                                />
                                <span className="text-[10px] font-mono w-8 text-right" style={{ color: "#555" }}>{Math.round(sfxVolume * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Render progress */}
                  {isRendering && (
                    <div className="mb-5">
                      <div className="flex justify-between text-[11px] mb-2 font-semibold" style={{ color: "#666" }}>
                        <span className="flex items-center gap-1.5">
                          <Loader2 size={11} className="animate-spin" />
                          Rendering with Remotion…
                        </span>
                        <span className="font-mono tabular-nums">{Math.round(renderProgress)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1e1e1e" }}>
                        <motion.div
                          animate={{ width: `${renderProgress}%` }}
                          transition={{ duration: 0.5, ease: "linear" }}
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #15803d, #22c55e)", boxShadow: "0 0 10px rgba(34,197,94,0.4)" }}
                        />
                      </div>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: !isRendering ? 1.012 : 1 }}
                    whileTap={{ scale: !isRendering ? 0.985 : 1 }}
                    onClick={handleRender}
                    disabled={isRendering}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-[15px] transition-all"
                    style={{
                      background: isRendering ? "#141414" : "linear-gradient(135deg, #15803d, #166534)",
                      color: isRendering ? "#444" : "#fff",
                      cursor: isRendering ? "not-allowed" : "pointer",
                      boxShadow: !isRendering ? "0 0 40px rgba(34,197,94,0.25), inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
                    }}
                  >
                    {isRendering
                      ? <><Loader2 size={17} className="animate-spin" /><span>Rendering…</span></>
                      : <><Film size={17} /><span>Start Render</span><ArrowRight size={15} /></>
                    }
                  </motion.button>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 7: Export ────────────────────────────────────── */}
          <AnimatePresence>
            {downloadUrl && (
              <motion.div
                key="export"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="rounded-2xl relative overflow-hidden"
                style={{ background: "#0f0f0f", border: "1px solid rgba(34,197,94,0.3)", boxShadow: "0 0 48px rgba(34,197,94,0.08)" }}
              >
                {/* Top accent */}
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.6), transparent)" }} />

                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
                    >
                      <CheckCircle2 size={20} style={{ color: "#22c55e" }} />
                    </div>
                    <div>
                      <h2 className="text-[20px] font-black tracking-tight" style={{ color: "#f0f0f0" }}>Video ready</h2>
                      <p className="text-[12px] font-medium mt-0.5" style={{ color: "#666" }}>
                        {platformObj?.name} · {customResolution ? `${customResolution.w}×${customResolution.h}` : `${platformObj?.width}×${platformObj?.height}`} · MP4
                      </p>
                    </div>
                  </div>

                  {/* Video preview */}
                  <div className="mb-5 rounded-xl overflow-hidden" style={{ background: "#000", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <video
                      src={downloadUrl}
                      controls
                      playsInline
                      className="w-full block"
                      style={{ maxHeight: "420px", objectFit: "contain" }}
                    />
                  </div>

                  <a
                    href={downloadUrl}
                    download={`visio-reels-${selectedPlatform}-${Date.now()}.mp4`}
                    className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl font-black text-[15px] mb-3 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #1d4ed8, #1e40af)",
                      color: "#fff",
                      boxShadow: "0 0 40px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={17} />
                    Download MP4
                  </a>

                  <button
                    onClick={handleReset}
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-[13px] font-bold transition-all"
                    style={{ background: "#141414", color: "#777", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <RotateCcw size={13} />
                    New video
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* Offline toast */}
      <AnimatePresence>
        {ollamaConnected === false && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] z-50 font-semibold whitespace-nowrap"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              backdropFilter: "blur(16px)",
              color: "#fca5a5",
            }}
          >
            <WifiOff size={13} />
            <span>Ollama offline — run <code className="font-mono bg-red-500/10 px-1 rounded">ollama serve</code></span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
