"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Music,
  Smartphone,
  Clapperboard,
  Pin,
  Video,
  Sparkles,
  Play,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Wifi,
  WifiOff,
  ChevronRight,
  Film,
  Zap,
} from "lucide-react";
import { PLATFORMS, MOODS, type Platform, type Mood } from "@/lib/platforms";
import type { VideoScript } from "@/lib/gemma";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const PLATFORM_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  tiktok: Music,
  reels: Smartphone,
  shorts: Clapperboard,
  pinterest: Pin,
  x: Video,
};

function PlatformIcon({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = PLATFORM_ICONS[id] ?? Film;
  return <Icon size={size} />;
}

// Pill button component
function PillButton({
  selected,
  onClick,
  children,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium
        border transition-all duration-200 cursor-pointer
        ${
          selected
            ? "bg-violet-500/20 border-violet-400 text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.2)]"
            : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
        }
        ${disabled ? "opacity-40 cursor-not-allowed" : ""}
      `}
    >
      {children}
      {selected && (
        <motion.span
          layoutId="pill-selected"
          className="absolute inset-0 rounded-full bg-violet-500/10"
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

// Step header with number badge
function StepHeader({
  step,
  label,
  active,
  done,
}: {
  step: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className={`
          flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0
          transition-all duration-300
          ${done ? "bg-violet-500 text-white" : active ? "bg-violet-500/20 border border-violet-400 text-violet-400" : "bg-zinc-800 border border-zinc-700 text-zinc-500"}
        `}
      >
        {done ? <CheckCircle size={14} /> : step}
      </div>
      <h2
        className={`text-base font-semibold transition-colors duration-300 ${
          active ? "text-white" : done ? "text-zinc-400" : "text-zinc-600"
        }`}
      >
        {label}
      </h2>
    </div>
  );
}

// Section card wrapper
function StepCard({
  active,
  done,
  children,
  className = "",
}: {
  active: boolean;
  done?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      animate={{
        opacity: active || done ? 1 : 0.4,
        scale: active ? 1 : 0.99,
      }}
      transition={{ duration: 0.2 }}
      className={`
        rounded-2xl border p-5 transition-colors duration-300
        ${active ? "bg-zinc-900 border-zinc-700/80" : "bg-zinc-900/50 border-zinc-800"}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}

// Status bar component
function StatusBar({ ollamaConnected }: { ollamaConnected: boolean | null }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span className="font-mono">VisioReels v0.1.0</span>
          <span className="text-zinc-700">·</span>
          <span>Gemma 4 × Remotion</span>
        </div>
        <div className="flex items-center gap-1.5">
          {ollamaConnected === null ? (
            <>
              <Loader2 size={11} className="animate-spin text-zinc-500" />
              <span>Checking Ollama...</span>
            </>
          ) : ollamaConnected ? (
            <>
              <Wifi size={11} className="text-emerald-400" />
              <span className="text-emerald-400">Ollama connected</span>
              <span className="text-zinc-700 ml-1">localhost:11434</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-red-400" />
              <span className="text-red-400">Ollama offline</span>
              <span className="text-zinc-600 ml-1">— run: ollama serve</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VisioReelsPage() {
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Platform & mood
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [selectedMood, setSelectedMood] = useState<string>("");

  // Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string>("");
  const [script, setScript] = useState<VideoScript | null>(null);

  // Revoke old blob URL when a new one is set (prevents memory leak)
  const downloadUrlRef = useRef<string>("");

  // Render
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string>("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string>("");

  // Ollama status
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);

  // Check Ollama connection on mount and every 15 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("http://localhost:11434/api/tags", {
          signal: AbortSignal.timeout(3000),
        });
        setOllamaConnected(res.ok);
      } catch {
        setOllamaConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-advance steps
  useEffect(() => {
    if (imageDataUrl && currentStep === 1) setCurrentStep(2);
  }, [imageDataUrl, currentStep]);

  useEffect(() => {
    if (selectedPlatform && currentStep === 2) setCurrentStep(3);
  }, [selectedPlatform, currentStep]);

  useEffect(() => {
    if (selectedMood && currentStep === 3) setCurrentStep(4);
  }, [selectedMood, currentStep]);

  useEffect(() => {
    if (script && currentStep <= 5) setCurrentStep(5);
  }, [script, currentStep]);

  // Image upload handler
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageDataUrl((e.target?.result as string) ?? "");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImageFile(file);
    },
    [handleImageFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageFile(file);
    },
    [handleImageFile]
  );

  // Generate script
  const handleGenerate = async () => {
    if (!imageDataUrl || !selectedPlatform || !selectedMood) return;

    setIsGenerating(true);
    setGenerateError("");
    setScript(null);
    setDownloadUrl("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataUrl,
          platform: selectedPlatform,
          mood: selectedMood,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Generation failed" }))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as VideoScript;
      setScript(data);
      setCurrentStep(5);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setGenerateError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Render video
  const handleRender = async () => {
    if (!script || !imageDataUrl || !selectedPlatform || !selectedMood) return;

    setIsRendering(true);
    setRenderError("");
    setRenderProgress(0);
    setDownloadUrl("");
    setCurrentStep(6);

    // Simulate progress while rendering
    const progressInterval = setInterval(() => {
      setRenderProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 8;
      });
    }, 800);

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          imageDataUrl,
          platform: selectedPlatform,
          mood: selectedMood,
        }),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Render failed" }))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      // Revoke previous blob URL before creating new one
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
      setRenderProgress(100);
      setCurrentStep(7);
    } catch (err) {
      clearInterval(progressInterval);
      const msg = err instanceof Error ? err.message : "Render failed";
      setRenderError(msg);
      setCurrentStep(5);
    } finally {
      setIsRendering(false);
    }
  };

  // Clear everything
  const handleClear = () => {
    setImageFile(null);
    setImageDataUrl("");
    setSelectedPlatform("");
    setSelectedMood("");
    setScript(null);
    setGenerateError("");
    setRenderError("");
    setDownloadUrl("");
    setRenderProgress(0);
    setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedPlatformObj = PLATFORMS.find((p) => p.id === selectedPlatform);
  const selectedMoodObj = MOODS.find((m) => m.id === selectedMood);

  const canGenerate = !!imageDataUrl && !!selectedPlatform && !!selectedMood && !isGenerating;
  const canRender = !!script && !isRendering;

  return (
    <div className="min-h-screen bg-zinc-950 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="bg-gradient-to-r from-violet-400 to-violet-300 bg-clip-text text-transparent">
                VisioReels
              </span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">Gemma 4 × Remotion</p>
          </div>
          <div className="flex items-center gap-2">
            {imageDataUrl && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-colors"
              >
                <X size={12} />
                Start over
              </motion.button>
            )}
            <div className="text-xs text-zinc-600 px-2 py-1 rounded bg-zinc-900 border border-zinc-800">
              Step {currentStep} / 7
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* STEP 1: Image Upload */}
        <StepCard active={currentStep === 1} done={!!imageDataUrl}>
          <StepHeader step={1} label="Upload your image" active={currentStep === 1} done={!!imageDataUrl} />

          {imageDataUrl ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative rounded-xl overflow-hidden bg-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl}
                alt="Uploaded preview"
                className="w-full max-h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-white/80">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span>{imageFile?.name ?? "Image uploaded"}</span>
                </div>
                <button
                  onClick={() => {
                    setImageFile(null);
                    setImageDataUrl("");
                    setCurrentStep(1);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-white/60 hover:text-white p-1 rounded transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center gap-3
                rounded-xl border-2 border-dashed p-10 cursor-pointer
                transition-all duration-200
                ${isDragOver
                  ? "border-violet-400 bg-violet-500/5"
                  : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
                }
              `}
            >
              <div className={`p-3 rounded-full transition-colors ${isDragOver ? "bg-violet-500/20" : "bg-zinc-800"}`}>
                <Upload size={22} className={isDragOver ? "text-violet-400" : "text-zinc-400"} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300">
                  {isDragOver ? "Drop it!" : "Drag & drop or click to upload"}
                </p>
                <p className="text-xs text-zinc-500 mt-1">JPG, PNG, WebP · Any size</p>
              </div>
            </motion.div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </StepCard>

        {/* STEP 2: Platform Selector */}
        <StepCard active={currentStep === 2} done={!!selectedPlatform && currentStep > 2}>
          <StepHeader step={2} label="Choose platform" active={currentStep >= 2} done={!!selectedPlatform && currentStep > 2} />
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform: Platform) => (
              <PillButton
                key={platform.id}
                selected={selectedPlatform === platform.id}
                onClick={() => {
                  setSelectedPlatform(platform.id);
                  if (currentStep === 2) setCurrentStep(3);
                }}
                disabled={currentStep < 2}
              >
                <PlatformIcon id={platform.id} size={14} />
                <span>{platform.name}</span>
                <span className="text-zinc-600 text-xs hidden sm:block">{platform.description}</span>
              </PillButton>
            ))}
          </div>
          {selectedPlatformObj && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-zinc-500 mt-3 flex items-center gap-1"
            >
              <ChevronRight size={10} />
              {selectedPlatformObj.width}×{selectedPlatformObj.height} · {selectedPlatformObj.fps}fps · {Math.round(selectedPlatformObj.durationInFrames / selectedPlatformObj.fps)}s
            </motion.p>
          )}
        </StepCard>

        {/* STEP 3: Mood Selector */}
        <StepCard active={currentStep === 3} done={!!selectedMood && currentStep > 3}>
          <StepHeader step={3} label="Select mood" active={currentStep >= 3} done={!!selectedMood && currentStep > 3} />
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood: Mood) => (
              <PillButton
                key={mood.id}
                selected={selectedMood === mood.id}
                onClick={() => {
                  setSelectedMood(mood.id);
                  if (currentStep === 3) setCurrentStep(4);
                }}
                disabled={currentStep < 3}
              >
                <span>{mood.emoji}</span>
                <span>{mood.name}</span>
              </PillButton>
            ))}
          </div>
          {selectedMoodObj && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-zinc-500 mt-3 flex items-center gap-1"
            >
              <ChevronRight size={10} />
              {selectedMoodObj.description}
            </motion.p>
          )}
        </StepCard>

        {/* STEP 4: Generate */}
        <StepCard active={currentStep === 4} done={!!script}>
          <StepHeader step={4} label="Generate script with Gemma 4" active={currentStep >= 4} done={!!script} />

          {!ollamaConnected && ollamaConnected !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs"
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <div>
                <strong>Ollama not running.</strong> Start it with:{" "}
                <code className="font-mono bg-amber-500/10 px-1 rounded">ollama serve</code>
              </div>
            </motion.div>
          )}

          {generateError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{generateError}</span>
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: canGenerate ? 1.02 : 1 }}
            whileTap={{ scale: canGenerate ? 0.98 : 1 }}
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`
              w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl
              text-sm font-semibold transition-all duration-200
              ${canGenerate
                ? "bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shadow-[0_0_24px_rgba(167,139,250,0.3)] hover:shadow-[0_0_32px_rgba(167,139,250,0.4)]"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }
            `}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Gemma 4 thinking...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Video Script</span>
              </>
            )}
          </motion.button>

          {isGenerating && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-zinc-500 mt-2 text-center"
            >
              Analyzing image + crafting {selectedPlatformObj?.name ?? "social"} script...
            </motion.p>
          )}
        </StepCard>

        {/* STEP 5: Script Preview */}
        <AnimatePresence>
          {script && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <StepCard active={currentStep === 5} done={currentStep > 5}>
                <StepHeader step={5} label="Script preview" active={currentStep >= 5} done={currentStep > 5} />

                <div className="space-y-3">
                  {/* Hook */}
                  <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <p className="text-xs font-semibold text-violet-400 mb-1 uppercase tracking-wider">Hook (3s)</p>
                    <p className="text-white font-bold text-base leading-snug">{script.hook}</p>
                  </div>

                  {/* Script */}
                  <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Voiceover script</p>
                    <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{script.script}</p>
                  </div>

                  {/* Captions */}
                  <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                    <p className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                      Word-by-word captions ({script.captions.length} chunks)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {script.captions.map((cap, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-zinc-700 text-zinc-200 rounded text-xs font-medium"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hashtags */}
                  <div className="flex flex-wrap gap-1.5">
                    {script.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs text-violet-400/80 font-medium">
                        #{tag.replace(/^#/, "")}
                      </span>
                    ))}
                  </div>

                  {/* Style */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Transition", value: script.style.transition },
                      { label: "Text", value: script.style.textStyle },
                      { label: "Grade", value: script.style.colorGrade },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-800">
                        <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
                        <p className="text-xs text-zinc-300 font-medium truncate">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* STEP 6: Render */}
        <AnimatePresence>
          {script && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
            >
              <StepCard active={currentStep === 6} done={currentStep === 7}>
                <StepHeader step={6} label="Render MP4" active={currentStep >= 6} done={currentStep === 7} />

                {renderError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
                  >
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <span>{renderError}</span>
                  </motion.div>
                )}

                {isRendering && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" />
                        Rendering with Remotion...
                      </span>
                      <span className="font-mono">{Math.round(renderProgress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        animate={{ width: `${renderProgress}%` }}
                        transition={{ duration: 0.5, ease: "linear" }}
                        className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full"
                      />
                    </div>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: canRender ? 1.02 : 1 }}
                  whileTap={{ scale: canRender ? 0.98 : 1 }}
                  onClick={handleRender}
                  disabled={!canRender}
                  className={`
                    w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl
                    text-sm font-semibold transition-all duration-200
                    ${canRender && !isRendering
                      ? "bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white shadow-[0_0_24px_rgba(16,185,129,0.2)]"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    }
                  `}
                >
                  {isRendering ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Rendering...</span>
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      <span>Render to MP4</span>
                    </>
                  )}
                </motion.button>

                {!isRendering && (
                  <p className="text-xs text-zinc-600 mt-2 text-center">
                    {selectedPlatformObj
                      ? `${selectedPlatformObj.width}×${selectedPlatformObj.height} · ${Math.round(selectedPlatformObj.durationInFrames / selectedPlatformObj.fps)}s · H.264`
                      : "Select a platform first"}
                  </p>
                )}
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* STEP 7: Download */}
        <AnimatePresence>
          {downloadUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
            >
              <StepCard active={currentStep === 7}>
                <StepHeader step={7} label="Download your video" active={true} done={false} />

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-full bg-emerald-500/20">
                    <CheckCircle size={18} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Video rendered successfully!</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {selectedPlatformObj?.name ?? "Video"} ·{" "}
                      {selectedPlatformObj ? `${Math.round(selectedPlatformObj.durationInFrames / selectedPlatformObj.fps)}s` : ""} ·{" "}
                      H.264 MP4
                    </p>
                  </div>
                </div>

                <a
                  href={downloadUrl}
                  download={`visio-reels-${selectedPlatform}-${Date.now()}.mp4`}
                  className="flex items-center justify-center gap-2.5 w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-[0_0_24px_rgba(167,139,250,0.3)] hover:shadow-[0_0_32px_rgba(167,139,250,0.4)] transition-all duration-200"
                >
                  <Download size={16} />
                  <span>Download MP4</span>
                  <Zap size={12} className="text-violet-300" />
                </a>

                <button
                  onClick={handleClear}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-zinc-400 hover:text-white text-sm transition-colors hover:bg-zinc-800"
                >
                  <Sparkles size={13} />
                  Create another video
                </button>
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Status bar */}
      <StatusBar ollamaConnected={ollamaConnected} />
    </div>
  );
}
