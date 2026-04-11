"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus, LayoutGrid, Palette, Wand2, ScrollText,
  Clapperboard, Download, CheckCircle2, AlertCircle,
  Loader2, X, Wifi, WifiOff, Music2, Smartphone,
  PlaySquare, Pin, ChevronRight, Sparkles,
  Play, RefreshCw, Film, Moon, Zap, Minimize2,
  Radio, Cpu, ArrowRight, RotateCcw, Settings,
  GripVertical, Plus,
} from "lucide-react";
import { PLATFORMS, MOODS, type Platform, type Mood } from "@/lib/platforms";
import type { VideoScript } from "@/lib/gemma";

// Custom X brand icon
const XBrandIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ─── Meta ────────────────────────────────────────────────────────────────────

const STEP_META = [
  { step: 1, label: "Upload",   icon: ImagePlus,    hint: "Midjourney images" },
  { step: 2, label: "Platform", icon: LayoutGrid,   hint: "Distribution channel" },
  { step: 3, label: "Mood",     icon: Palette,      hint: "Visual preset" },
  { step: 4, label: "Generate", icon: Wand2,        hint: "AI writes the script" },
  { step: 5, label: "Script",   icon: ScrollText,   hint: "Review & edit" },
  { step: 6, label: "Render",   icon: Clapperboard, hint: "Export to MP4" },
  { step: 7, label: "Export",   icon: Download,     hint: "Ready to post" },
] as const;

const PLATFORM_META: Record<string, {
  color: string; bg: string; border: string;
  icon: React.ElementType; specs: string;
}> = {
  tiktok:    { color: "#ff2d54", bg: "rgba(255,45,84,0.06)",    border: "rgba(255,45,84,0.2)",    icon: Music2,     specs: "9:16 · 15s" },
  reels:     { color: "#e1306c", bg: "rgba(225,48,108,0.06)",   border: "rgba(225,48,108,0.2)",   icon: Smartphone, specs: "9:16 · 30s" },
  shorts:    { color: "#ff0000", bg: "rgba(255,0,0,0.05)",      border: "rgba(255,0,0,0.18)",     icon: PlaySquare, specs: "9:16 · 20s" },
  pinterest: { color: "#e60023", bg: "rgba(230,0,35,0.05)",     border: "rgba(230,0,35,0.18)",    icon: Pin,        specs: "2:3 · 10s" },
  x:         { color: "#e7e9ea", bg: "rgba(255,255,255,0.03)",  border: "rgba(255,255,255,0.12)", icon: XBrandIcon, specs: "16:9 · 15s" },
};

// Mood presets — each has a full visual identity
const MOOD_PRESETS: Record<string, {
  icon: React.ElementType;
  label: string;
  emoji: string;
  bg: string;            // full card background gradient
  accentColor: string;   // border + highlight color
  tags: string[];        // effect chips
  description: string;
}> = {
  cinematic:   {
    icon: Film, emoji: "🎬", label: "Cinematic",
    bg: "linear-gradient(135deg, #1a1200 0%, #0d1a1a 60%, #000 100%)",
    accentColor: "#d4a017",
    tags: ["Ken Burns", "Film Grain", "Light Leaks", "Letterbox"],
    description: "Teal-orange LUT, slow drama, epic scale",
  },
  "dark-moody": {
    icon: Moon, emoji: "🌑", label: "Dark Moody",
    bg: "linear-gradient(135deg, #0a0010 0%, #050018 60%, #000 100%)",
    accentColor: "#7c3aed",
    tags: ["Deep Vignette", "Glitch", "Chroma Split", "Desaturated"],
    description: "Atmospheric brooding, high contrast shadows",
  },
  vibrant:     {
    icon: Zap, emoji: "⚡", label: "Vibrant",
    bg: "linear-gradient(135deg, #1a0800 0%, #1a1200 60%, #000 100%)",
    accentColor: "#f97316",
    tags: ["Speed Lines", "Zoom Burst", "Color Boost", "Energy"],
    description: "Hyper-saturated, explosive energy, velocity",
  },
  minimal:     {
    icon: Minimize2, emoji: "◻️", label: "Minimal",
    bg: "linear-gradient(135deg, #141414 0%, #0f0f0f 60%, #000 100%)",
    accentColor: "#d4d4d8",
    tags: ["Slow Ken Burns", "Clean Captions", "Quiet Luxury"],
    description: "Editorial calm, clean lines, quiet luxury",
  },
  raw:         {
    icon: Radio, emoji: "📸", label: "Raw",
    bg: "linear-gradient(135deg, #111008 0%, #0d0d08 60%, #000 100%)",
    accentColor: "#fbbf24",
    tags: ["Authentic Grain", "Handheld Feel", "No Filter"],
    description: "Unpolished authenticity, real and relatable",
  },
  neon:        {
    icon: Cpu, emoji: "🌐", label: "Neon",
    bg: "linear-gradient(135deg, #000d1a 0%, #001508 40%, #0a0020 100%)",
    accentColor: "#00e5ff",
    tags: ["RGB Split", "Scan Lines", "Neon Glow", "Glitch"],
    description: "Cyberpunk electric, futuristic neon glow",
  },
};

const RESOLUTION_PRESETS = [
  { label: "720p", w: 720,  h: 1280, note: "Fast" },
  { label: "1080p", w: 1080, h: 1920, note: "Default" },
  { label: "4K", w: 2160, h: 3840, note: "Max quality" },
  { label: "Square", w: 1080, h: 1080, note: "Instagram feed" },
];

const SPRING = { type: "spring", stiffness: 300, damping: 28 } as const;
const FADE_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: SPRING,
};

// ─── Background ───────────────────────────────────────────────────────────────

function Background() {
  return (
    <>
      <div className="bg-canvas" aria-hidden />
      <div className="noise-overlay" aria-hidden />
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function AppHeader({ ollamaConnected, currentStep }: { ollamaConnected: boolean | null; currentStep: Step }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 h-12"
      style={{
        background: "rgba(8,8,8,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black"
          style={{ background: "#fff", color: "#000" }}
        >
          V
        </div>
        <span className="font-bold text-[14px] tracking-tight text-white">
          VisioReels
        </span>
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
        >
          2027
        </span>
      </div>

      {/* Step dots — mobile */}
      <div className="flex sm:hidden items-center gap-1">
        {STEP_META.map(({ step }) => (
          <div
            key={step}
            className="rounded-full transition-all duration-300"
            style={{
              width: step === currentStep ? 18 : 5,
              height: 5,
              background: step < currentStep
                ? "var(--green)"
                : step === currentStep
                  ? "var(--blue)"
                  : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>

      {/* Ollama status */}
      <div
        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md"
        style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}
      >
        {ollamaConnected === null ? (
          <><Loader2 size={10} className="animate-spin" style={{ color: "var(--t3)" }} /><span style={{ color: "var(--t3)" }}>…</span></>
        ) : ollamaConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "var(--green)" }} />
            <span style={{ color: "var(--green)" }}>Gemma 4 live</span>
          </>
        ) : (
          <>
            <WifiOff size={10} style={{ color: "var(--red)" }} />
            <span style={{ color: "var(--red)" }}>Offline</span>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function StepSidebar({ currentStep, onJump }: { currentStep: Step; onJump: (s: Step) => void }) {
  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-52 pt-12 z-40"
      style={{
        background: "#0c0c0c",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="px-4 pt-5 pb-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#555" }}>Workflow</p>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {STEP_META.map(({ step, label, icon: Icon, hint }, idx) => {
          const done   = step < currentStep;
          const active = step === currentStep;
          const locked = step > currentStep;
          return (
            <div key={step} className="relative">
              {idx < STEP_META.length - 1 && (
                <div
                  className="absolute left-[22px] top-[38px] w-px h-[8px] z-0"
                  style={{ background: done ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.07)" }}
                />
              )}
              <button
                onClick={() => !locked && onJump(step as Step)}
                disabled={locked}
                className="relative z-10 w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all duration-150"
                style={{
                  background: active ? "#1e1e1e" : "transparent",
                  border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                  cursor: locked ? "default" : "pointer",
                  opacity: locked ? 0.35 : 1,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: done
                      ? "rgba(34,197,94,0.18)"
                      : active
                        ? "#2a2a2a"
                        : "#161616",
                    border: done
                      ? "1px solid rgba(34,197,94,0.3)"
                      : active
                        ? "1px solid rgba(255,255,255,0.15)"
                        : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {done
                    ? <CheckCircle2 size={13} style={{ color: "var(--green)" }} />
                    : <Icon size={13} style={{ color: active ? "#fff" : "#666" }} />
                  }
                </div>
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: active ? "#fff" : done ? "#aaa" : "#666" }}
                  >
                    {label}
                  </div>
                  {active && (
                    <div className="text-[10px] truncate mt-0.5" style={{ color: "#555" }}>{hint}</div>
                  )}
                </div>
                {active && <ChevronRight size={12} style={{ color: "#555", marginLeft: "auto", flexShrink: 0 }} />}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Model badge */}
      <div
        className="mx-3 mb-4 p-3 rounded-xl"
        style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)" }}
          >
            <Cpu size={10} style={{ color: "#60a5fa" }} />
          </div>
          <span className="text-[12px] font-bold" style={{ color: "#60a5fa" }}>visio-gemma</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[["E4B","Model"],["9.6G","Size"],["32K","Context"]].map(([v, l]) => (
            <div key={l}>
              <div className="text-[12px] font-bold" style={{ color: "#ddd" }}>{v}</div>
              <div className="text-[9px] mt-0.5" style={{ color: "#555" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <motion.div
      {...FADE_UP}
      className="rounded-2xl relative overflow-hidden"
      style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: accent
            ? `linear-gradient(90deg, transparent, ${accent}66, transparent)`
            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
        }}
      />
      {children}
    </motion.div>
  );
}

// ─── Platform cards ───────────────────────────────────────────────────────────

function PlatformCard({ platform, selected, onClick }: { platform: Platform; selected: boolean; onClick: () => void }) {
  const m = PLATFORM_META[platform.id] ?? PLATFORM_META.tiktok;
  const Icon = m.icon;
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative w-full text-left rounded-xl overflow-hidden transition-all duration-150"
      style={{
        background: selected ? m.bg : "#181818",
        border: `1px solid ${selected ? m.border : "rgba(255,255,255,0.1)"}`,
        boxShadow: selected ? `0 0 24px ${m.color}20, inset 0 0 0 1px ${m.border}` : "none",
      }}
    >
      {/* Top color bar */}
      <div className="h-0.5 w-full" style={{ background: selected ? m.color : "transparent" }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: `${m.color}20`,
              border: `1px solid ${m.color}35`,
            }}
          >
            <Icon size={18} style={{ color: m.color }} />
          </div>
          {selected && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: `${m.color}22`, border: `1px solid ${m.color}` }}>
              <CheckCircle2 size={11} style={{ color: m.color }} />
            </div>
          )}
        </div>

        <div className="font-bold text-[14px] leading-tight" style={{ color: selected ? "#fff" : "#ccc" }}>
          {platform.name}
        </div>
        <div className="text-[11px] mt-1 font-medium" style={{ color: selected ? m.color : "#666" }}>
          {m.specs}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Mood presets ─────────────────────────────────────────────────────────────

function MoodPreset({ mood, selected, onClick }: { mood: Mood; selected: boolean; onClick: () => void }) {
  const p = MOOD_PRESETS[mood.id];
  if (!p) return null;

  return (
    <motion.button
      whileHover={{ scale: 1.015, y: -2 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className="relative w-full text-left rounded-xl overflow-hidden transition-all duration-200"
      style={{
        border: `1px solid ${selected ? p.accentColor + "55" : "var(--b1)"}`,
        boxShadow: selected ? `0 0 24px ${p.accentColor}22, inset 0 0 0 1px ${p.accentColor}18` : "none",
        outline: "none",
      }}
    >
      {/* Full-bleed gradient background */}
      <div className="h-28 w-full relative" style={{ background: p.bg }}>
        {/* Emoji + icon top-right */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <span className="text-2xl leading-none">{p.emoji}</span>
        </div>

        {/* Selected check */}
        {selected && (
          <div
            className="absolute top-3 left-3 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: p.accentColor + "28", border: `1.5px solid ${p.accentColor}` }}
          >
            <CheckCircle2 size={10} style={{ color: p.accentColor }} />
          </div>
        )}

        {/* Bottom fade into info section */}
        <div
          className="absolute bottom-0 left-0 right-0 h-10"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.7))" }}
        />

        {/* Mood name over gradient */}
        <div
          className="absolute bottom-2 left-3 font-bold text-[15px]"
          style={{ color: selected ? p.accentColor : "rgba(255,255,255,0.9)", textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}
        >
          {p.label}
        </div>
      </div>

      {/* Effect tags */}
      <div
        className="px-3 py-2.5"
        style={{ background: selected ? "rgba(255,255,255,0.03)" : "var(--s1)" }}
      >
        <p className="text-[10px] mb-2 leading-relaxed" style={{ color: "var(--t3)" }}>
          {p.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {p.tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: selected ? `${p.accentColor}14` : "var(--s3)",
                color: selected ? p.accentColor : "var(--t3)",
                border: `1px solid ${selected ? p.accentColor + "22" : "var(--b0)"}`,
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

// ─── Image thumbnail strip ────────────────────────────────────────────────────

function ImageStrip({
  files,
  urls,
  onRemove,
}: {
  files: File[];
  urls: string[];
  onRemove: (i: number) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <motion.div {...FADE_UP}
      className="flex items-center gap-2 p-2.5 rounded-xl"
      style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}
    >
      <div className="flex items-center gap-2 flex-1 overflow-x-auto pb-0.5 min-w-0">
        {urls.map((url, i) => (
          <div key={i} className="relative flex-shrink-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-11 h-11 rounded-lg object-cover"
              style={{ border: "1px solid var(--b2)" }}
            />
            {/* Order badge */}
            <div
              className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ background: "var(--blue)", color: "#fff" }}
            >
              {i + 1}
            </div>
            {/* Remove button */}
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full items-center justify-center hidden group-hover:flex transition-all"
              style={{ background: "var(--red)", color: "#fff" }}
            >
              <X size={8} />
            </button>
          </div>
        ))}
        {/* Add more (if < 5) */}
        {urls.length < 5 && (
          <label className="flex-shrink-0 w-11 h-11 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
            style={{ background: "var(--s2)", border: "1px dashed var(--b2)" }}>
            <Plus size={13} style={{ color: "var(--t3)" }} />
            <input
              type="file" accept="image/jpeg,image/png,image/webp"
              multiple className="hidden"
              onChange={(e) => {
                // handled via parent; this button triggers file dialog
                const ev = new CustomEvent("visio-add-images", { detail: e.target.files });
                window.dispatchEvent(ev);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className="text-[10px] flex-shrink-0 text-right" style={{ color: "var(--t3)" }}>
        <div className="font-semibold" style={{ color: "var(--t2)" }}>{urls.length} image{urls.length > 1 ? "s" : ""}</div>
        {urls.length > 1 && <div>Cut sequence</div>}
      </div>
    </motion.div>
  );
}

// ─── Error alert ──────────────────────────────────────────────────────────────

function ErrorAlert({ msg }: { msg: string }) {
  return (
    <motion.div {...FADE_UP}
      className="flex items-start gap-2 rounded-xl p-3 text-[12px] mb-3"
      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#fca5a5" }}
    >
      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
      <span>{msg}</span>
    </motion.div>
  );
}

// ─── Script display ───────────────────────────────────────────────────────────

function ScriptDisplay({ script }: { script: VideoScript }) {
  const selectedMoodId = "";
  return (
    <div className="space-y-3">
      {/* Hook */}
      <div
        className="rounded-xl p-4 relative"
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <div
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
          style={{ background: "var(--blue)" }}
        />
        <div className="pl-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "var(--blue-l)" }}>
            Hook · 0.8s
          </div>
          <p className="text-[18px] font-black leading-tight tracking-tight" style={{ color: "var(--t1)" }}>
            {script.hook}
          </p>
        </div>
      </div>

      {/* Script */}
      <div className="rounded-xl p-4" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
        <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: "var(--t3)" }}>Voiceover</div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--t2)" }}>{script.script}</p>
      </div>

      {/* CTA */}
      {script.cta && (
        <div className="rounded-xl p-3.5" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "var(--t3)" }}>CTA</div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{script.cta}</p>
        </div>
      )}

      {/* Captions */}
      <div className="rounded-xl p-4" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
        <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--t3)" }}>
          Captions · {script.captions.length} beats
        </div>
        <div className="flex flex-wrap gap-1.5">
          {script.captions.map((cap, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
              style={{ background: "#222", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Hashtags + style */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl p-3" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: "var(--t3)" }}>Hashtags</div>
          <div className="flex flex-wrap gap-1">
            {script.hashtags.map((h, i) => (
              <span key={i} className="text-[11px]" style={{ color: "var(--t2)" }}>
                #{h.replace(/^#/, "")}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: "var(--t3)" }}>Style</div>
          <div className="space-y-1 text-[11px]" style={{ color: "var(--t2)" }}>
            <div>↗ {script.style?.transition ?? "—"}</div>
            <div>◈ {script.style?.colorGrade ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Resolution picker ────────────────────────────────────────────────────────

function ResolutionPicker({
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
    ? [
        { label: "720p", w: 1280, h: 720,  note: "Fast" },
        { label: "1080p", w: 1920, h: 1080, note: "Default" },
        { label: "4K", w: 3840, h: 2160, note: "Max" },
      ]
    : RESOLUTION_PRESETS;

  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-2.5" style={{ color: "var(--t3)" }}>
        Resolution
      </div>
      <div className="flex flex-wrap gap-2">
        {/* "Platform default" option */}
        <button
          onClick={() => onChange(null)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
          style={{
            background: value === null ? "var(--s3)" : "var(--s2)",
            border: `1px solid ${value === null ? "var(--b3)" : "var(--b1)"}`,
            color: value === null ? "var(--t1)" : "var(--t3)",
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
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: active ? "var(--blue-dim)" : "var(--s2)",
                border: `1px solid ${active ? "rgba(59,130,246,0.3)" : "var(--b1)"}`,
                color: active ? "var(--blue-l)" : "var(--t3)",
              }}
            >
              {p.label}
              <span className="ml-1 text-[9px] opacity-60">{p.note}</span>
            </button>
          );
        })}
      </div>
      {value && (
        <p className="mt-1.5 text-[10px]" style={{ color: "var(--t3)" }}>
          {value.w} × {value.h}px
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VisioReelsPage() {
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Multi-image state
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [selectedMood, setSelectedMood] = useState<string>("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string>("");
  const [script, setScript] = useState<VideoScript | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState("");

  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string>("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const downloadUrlRef = useRef<string>("");

  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [customResolution, setCustomResolution] = useState<{ w: number; h: number } | null>(null);
  const [showExportSettings, setShowExportSettings] = useState(false);

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
    const msgs = [
      "Reading your image…",
      "Identifying composition…",
      "Crafting the hook…",
      "Writing voiceover…",
      "Generating captions…",
      "Optimizing for virality…",
    ];
    let i = 0;
    setGeneratingMsg(msgs[0]);
    const iv = setInterval(() => { i = Math.min(i + 1, msgs.length - 1); setGeneratingMsg(msgs[i]); }, 2000);
    return () => clearInterval(iv);
  }, [isGenerating]);

  // Listen for "add more images" event from the + button inside ImageStrip
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
      (f) => new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = (ev) => resolve(ev.target?.result as string ?? "");
        r.readAsDataURL(f);
      })
    );
    Promise.all(readers).then((newUrls) => {
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
        body: JSON.stringify({
          images: imageDataUrls,
          platform: selectedPlatform,
          mood: selectedMood,
        }),
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
        script,
        imageDataUrls,
        platform: selectedPlatform,
        mood: selectedMood,
      };
      if (customResolution) {
        body.customWidth = customResolution.w;
        body.customHeight = customResolution.h;
      }
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Background />
      <AppHeader ollamaConnected={ollamaConnected} currentStep={currentStep} />
      <StepSidebar currentStep={currentStep} onJump={s => s < currentStep && setCurrentStep(s)} />

      {/* Main content */}
      <div className="lg:pl-52 pt-12 relative z-10">
        <main className="max-w-2xl mx-auto lg:mx-0 lg:max-w-[760px] px-4 lg:px-10 py-7 pb-24 space-y-4">

          {/* ── Step 1: Upload ──────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <Card key="upload">
                <div className="p-6">
                  <div className="mb-5">
                    <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "#fff" }}>Upload your images</h2>
                    <p className="text-[13px] mt-1" style={{ color: "#888" }}>
                      Drop 1–5 Midjourney images · Multiple images = multi-cut video
                    </p>
                  </div>

                  <motion.div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-xl transition-all duration-200 overflow-hidden"
                    style={{
                      border: `2px dashed ${isDragOver ? "rgba(59,130,246,0.6)" : "rgba(255,255,255,0.12)"}`,
                      background: isDragOver ? "rgba(59,130,246,0.06)" : "#141414",
                    }}
                    whileHover={{ borderColor: "rgba(255,255,255,0.22)" }}
                  >
                    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                      <motion.div
                        animate={{ scale: isDragOver ? 1.1 : 1, rotate: isDragOver ? 5 : 0 }}
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{
                          background: isDragOver ? "rgba(59,130,246,0.18)" : "#222",
                          border: `1px solid ${isDragOver ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.1)"}`,
                        }}
                      >
                        <ImagePlus size={26} style={{ color: isDragOver ? "#60a5fa" : "#777" }} />
                      </motion.div>
                      <p className="font-bold text-[16px] mb-1.5" style={{ color: isDragOver ? "#60a5fa" : "#ccc" }}>
                        {isDragOver ? "Drop it!" : "Drag & drop or click to browse"}
                      </p>
                      <p className="text-[12px]" style={{ color: "#555" }}>JPG · PNG · WebP · Up to 5 images</p>
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

          {/* Image strip (persistent after upload) */}
          <AnimatePresence>
            {imageDataUrls.length > 0 && currentStep > 1 && (
              <ImageStrip
                key="strip"
                files={imageFiles}
                urls={imageDataUrls}
                onRemove={removeImage}
              />
            )}
          </AnimatePresence>

          {/* ── Step 2: Platform ────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 2 && !script && (
              <Card key="platform">
                <div className="p-6">
                  <div className="mb-5">
                    <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "#fff" }}>Choose platform</h2>
                    <p className="text-[13px] mt-1" style={{ color: "#888" }}>Where is this video going?</p>
                  </div>
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

          {/* ── Step 3: Mood ─────────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 3 && !script && (
              <Card key="mood">
                <div className="p-6">
                  <div className="mb-5">
                    <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "#fff" }}>Effect preset</h2>
                    <p className="text-[13px] mt-1" style={{ color: "#888" }}>
                      Each preset applies cinematic effects to your video
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {MOODS.map(m => (
                      <MoodPreset
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

          {/* ── Step 4: Generate ─────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 4 && !script && (
              <Card key="generate">
                <div className="p-6">
                  {/* Summary row */}
                  {platformObj && moodObj && (
                    <div
                      className="flex items-center gap-2 p-2.5 rounded-lg mb-4"
                      style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}
                    >
                      {imageDataUrls[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageDataUrls[0]} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" style={{ border: "1px solid var(--b1)" }} />
                      )}
                      {imageDataUrls.length > 1 && (
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: "#222", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          +{imageDataUrls.length - 1}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span
                          className="px-2 py-0.5 rounded font-medium"
                          style={{
                            background: `${PLATFORM_META[platformObj.id]?.color ?? "#fff"}14`,
                            color: PLATFORM_META[platformObj.id]?.color ?? "var(--t1)",
                            border: `1px solid ${PLATFORM_META[platformObj.id]?.color ?? "#fff"}22`,
                          }}
                        >
                          {platformObj.name}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded font-medium"
                          style={{
                            background: `${MOOD_PRESETS[moodObj.id]?.accentColor ?? "#fff"}14`,
                            color: MOOD_PRESETS[moodObj.id]?.accentColor ?? "var(--t1)",
                            border: `1px solid ${MOOD_PRESETS[moodObj.id]?.accentColor ?? "#fff"}22`,
                          }}
                        >
                          {moodObj.emoji} {moodObj.name}
                        </span>
                        {imageDataUrls.length > 1 && (
                          <span className="text-[10px]" style={{ color: "var(--t3)" }}>
                            {imageDataUrls.length}-cut sequence
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {generateError && <ErrorAlert msg={generateError} />}

                  {!ollamaConnected && ollamaConnected !== null && (
                    <div
                      className="flex items-start gap-2 p-3 rounded-lg mb-3 text-[11px]"
                      style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", color: "#fcd34d" }}
                    >
                      <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                      <span>Ollama is offline — run <code className="font-mono bg-amber-500/10 px-1 rounded">ollama serve</code> in Terminal</span>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: canGenerate ? 1.012 : 1 }}
                    whileTap={{ scale: canGenerate ? 0.988 : 1 }}
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-[14px] relative overflow-hidden transition-all duration-200"
                    style={{
                      background: canGenerate
                        ? "linear-gradient(135deg, #1d4ed8, #1e40af)"
                        : "var(--s2)",
                      color: canGenerate ? "#fff" : "var(--t3)",
                      cursor: canGenerate ? "pointer" : "not-allowed",
                      boxShadow: canGenerate ? "0 0 32px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
                    }}
                  >
                    {canGenerate && !isGenerating && (
                      <div
                        className="absolute inset-0 animate-shimmer pointer-events-none"
                        style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)" }}
                      />
                    )}
                    {isGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /><span>{generatingMsg}</span></>
                    ) : (
                      <><Sparkles size={16} /><span>Generate with Gemma 4</span><ArrowRight size={14} /></>
                    )}
                  </motion.button>

                  {isGenerating && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="mt-2.5 flex items-center justify-center gap-2 text-[10px]"
                      style={{ color: "var(--t3)" }}
                    >
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse-dot" />
                      visio-gemma · localhost:11434
                    </motion.div>
                  )}
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 5: Script ───────────────────────────────────── */}
          <AnimatePresence>
            {script && (
              <Card key="script">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "#fff" }}>Your Script</h2>
                      <p className="text-[12px] mt-0.5" style={{ color: "#888" }}>Generated by visio-gemma · Gemma 4 E4B</p>
                    </div>
                    <button
                      onClick={() => { setScript(null); setCurrentStep(4); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{ background: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }}
                    >
                      <RefreshCw size={11} /><span>Regenerate</span>
                    </button>
                  </div>

                  <ScriptDisplay script={script} />

                  <div className="mt-4">
                    <button
                      onClick={() => setCurrentStep(6)}
                      className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-[14px] transition-all"
                      style={{
                        background: "linear-gradient(135deg, #15803d, #166534)",
                        color: "#fff",
                        boxShadow: "0 0 28px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                      }}
                    >
                      <Play size={15} />
                      Render to MP4
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 6: Render ───────────────────────────────────── */}
          <AnimatePresence>
            {currentStep >= 6 && script && (
              <Card key="render" accent="rgba(34,197,94,0.5)">
                <div className="p-5">
                  {renderError && <ErrorAlert msg={renderError} />}

                  {/* Platform info */}
                  {platformObj && (
                    <div
                      className="flex items-center gap-2 p-2.5 rounded-lg mb-4"
                      style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}
                    >
                      <Clapperboard size={13} style={{ color: "var(--t3)" }} />
                      <span className="text-[11px]" style={{ color: "var(--t2)" }}>
                        {platformObj.name} · {customResolution
                          ? `${customResolution.w}×${customResolution.h}`
                          : `${platformObj.width}×${platformObj.height}`
                        } · {platformObj.fps}fps · {Math.round(platformObj.durationInFrames / platformObj.fps)}s · H.264
                      </span>
                    </div>
                  )}

                  {/* Export settings toggle */}
                  <button
                    onClick={() => setShowExportSettings(v => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-medium mb-3 transition-colors"
                    style={{ color: showExportSettings ? "var(--blue-l)" : "var(--t3)" }}
                  >
                    <Settings size={11} />
                    Export settings
                    <ChevronRight
                      size={11}
                      style={{ transform: showExportSettings ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                    />
                  </button>

                  <AnimatePresence>
                    {showExportSettings && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 overflow-hidden"
                      >
                        <div className="p-3 rounded-xl" style={{ background: "#181818", border: "1px solid rgba(255,255,255,0.09)" }}>
                          <ResolutionPicker
                            platform={selectedPlatform}
                            value={customResolution}
                            onChange={setCustomResolution}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Progress */}
                  {isRendering && (
                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] mb-1.5" style={{ color: "var(--t3)" }}>
                        <span className="flex items-center gap-1.5">
                          <Loader2 size={10} className="animate-spin" />
                          Rendering with Remotion…
                        </span>
                        <span className="font-mono">{Math.round(renderProgress)}%</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--s3)" }}>
                        <motion.div
                          animate={{ width: `${renderProgress}%` }}
                          transition={{ duration: 0.5, ease: "linear" }}
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #15803d, #22c55e)", boxShadow: "0 0 8px rgba(34,197,94,0.3)" }}
                        />
                      </div>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: !isRendering ? 1.012 : 1 }}
                    whileTap={{ scale: !isRendering ? 0.988 : 1 }}
                    onClick={handleRender}
                    disabled={isRendering}
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-[14px] transition-all"
                    style={{
                      background: isRendering ? "var(--s2)" : "linear-gradient(135deg, #15803d, #166534)",
                      color: isRendering ? "var(--t3)" : "#fff",
                      cursor: isRendering ? "not-allowed" : "pointer",
                      boxShadow: !isRendering ? "0 0 28px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
                    }}
                  >
                    {isRendering
                      ? <><Loader2 size={16} className="animate-spin" /><span>Rendering…</span></>
                      : <><Film size={16} /><span>Start Render</span><ArrowRight size={14} /></>
                    }
                  </motion.button>
                </div>
              </Card>
            )}
          </AnimatePresence>

          {/* ── Step 7: Export ───────────────────────────────────── */}
          <AnimatePresence>
            {downloadUrl && (
              <motion.div
                key="export"
                initial={{ opacity: 0, scale: 0.97, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="rounded-2xl relative overflow-hidden"
                style={{ background: "var(--s1)", border: "1px solid rgba(34,197,94,0.2)" }}
              >
                <div className="absolute top-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)" }} />
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" }}
                    >
                      <CheckCircle2 size={18} style={{ color: "var(--green)" }} />
                    </div>
                    <div>
                      <h2 className="text-[16px] font-bold" style={{ color: "var(--t1)" }}>Video ready</h2>
                      <p className="text-[11px]" style={{ color: "var(--t2)" }}>
                        {platformObj?.name} · {customResolution
                          ? `${customResolution.w}×${customResolution.h}`
                          : `${platformObj?.width}×${platformObj?.height}`
                        } · MP4
                      </p>
                    </div>
                  </div>

                  <a
                    href={downloadUrl}
                    download={`visio-reels-${selectedPlatform}-${Date.now()}.mp4`}
                    className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-bold text-[14px] mb-2.5 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #1d4ed8, #1e40af)",
                      color: "#fff",
                      boxShadow: "0 0 28px rgba(59,130,246,0.22), inset 0 1px 0 rgba(255,255,255,0.12)",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={16} />
                    Download MP4
                  </a>

                  <button
                    onClick={handleReset}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[13px] font-medium transition-all"
                    style={{ background: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }}
                  >
                    <RotateCcw size={12} />
                    New video
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </main>
      </div>

      {/* Ollama offline toast */}
      <AnimatePresence>
        {ollamaConnected === false && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] z-50 whitespace-nowrap"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              backdropFilter: "blur(16px)",
              color: "#fca5a5",
            }}
          >
            <WifiOff size={12} />
            <span>Ollama offline — run <code className="font-mono bg-red-500/10 px-1 rounded">ollama serve</code></span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
