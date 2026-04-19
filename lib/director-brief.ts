/**
 * DirectorBrief — the creative director's full pre-production specification.
 *
 * The Brain pass produces this JSON before any code is generated.
 * Every field is an instruction to Gemma, not a suggestion. Gemma reads it
 * and executes — no creative decisions on its end.
 */

export type SceneLayout =
  | "hud"          // mission-control data overlay: HUDCorners + TelemetryCounter + DataReadout
  | "editorial"    // large typographic contrast — big headline, small kicker, lots of space
  | "typographic"  // kinetic type dominates — KineticTitle, big bold stagger
  | "split"        // image left / type right or top / bottom divide
  | "orbital"      // curved SVG path element, trajectory/arc motif
  | "data-grid"    // GridOverlay + DataReadout array — metrics, counters, stats
  | "full-bleed"   // image or gradient fills canvas, text floats over
  | "glitch"       // broken scanlines, chromatic aberration shift, offset layers
  | "magazine"     // editorial grid: thin rules, small caps labels, serif headline

export type PrimitiveId =
  | "HUDCorners"
  | "StarField"
  | "GridOverlay"
  | "KineticTitle"
  | "TelemetryCounter"
  | "StatusBar"
  | "DataReadout"
  | "ScanLines"
  | "LightLeak"
  | "NoiseLayer"

export interface DataPoint {
  label: string   // e.g. "ALTITUDE"
  value: string   // e.g. "183"  (formatted as shown on screen)
  unit?: string   // e.g. "km"
}

export interface SceneSpec {
  index: number
  layout: SceneLayout
  /** e.g. "linear-gradient(135deg,#05070D,#0B1426)" or "full-bleed image" or "#0a0a0a" */
  bg: string
  /** Exact headline text — rendered as the dominant type element */
  headline: string
  /** Mono kicker / label above or below headline — e.g. "PHASE 01 · LAUNCH" */
  kicker: string
  /** Optional supporting body copy */
  body?: string
  /** Primary accent hex for this scene */
  accent: string
  /** Secondary color used for labels, borders, data readout tints */
  secondary?: string
  /** HUD / telemetry data blocks to show — used with DataReadout + TelemetryCounter */
  data_points?: DataPoint[]
  /** Remotion primitive IDs to layer in this scene */
  primitives: PrimitiveId[]
  /** Transition INTO this scene (from previous) */
  transition: string
  /** How text animates — e.g. "stagger 4fr per word, slide-up" */
  motion_note: string
  /** Optional: CSS image filter for full-bleed image scenes */
  image_filter?: string
}

export interface DirectorBrief {
  title: string
  logline: string
  /** First 3 seconds — the exact hook line and visual approach */
  hook: string
  palette: {
    bg: string        // primary background hex
    text: string      // primary text hex
    accent: string    // signature accent hex
    secondary: string // secondary accent hex
  }
  typography: {
    headline_font: string  // e.g. "Space Grotesk" or "Fraunces"
    mono_font: string      // e.g. "JetBrains Mono" or "DM Mono"
    style_note: string     // e.g. "bold display + light mono contrast"
  }
  /** Overall motion language — e.g. "weighted deceleration, expo.out, no bounce" */
  motion_language: string
  overall_energy: "low" | "medium" | "high"
  scenes: SceneSpec[]
}

// ── Type guard ────────────────────────────────────────────────────────────────

const VALID_LAYOUTS: SceneLayout[] = [
  "hud", "editorial", "typographic", "split", "orbital",
  "data-grid", "full-bleed", "glitch", "magazine",
]

const VALID_PRIMITIVES: PrimitiveId[] = [
  "HUDCorners", "StarField", "GridOverlay", "KineticTitle",
  "TelemetryCounter", "StatusBar", "DataReadout", "ScanLines", "LightLeak", "NoiseLayer",
]

function sanitizeScene(raw: Record<string, unknown>, index: number): SceneSpec {
  const layout = VALID_LAYOUTS.includes(raw.layout as SceneLayout)
    ? (raw.layout as SceneLayout)
    : "typographic"

  const primitives = Array.isArray(raw.primitives)
    ? (raw.primitives as unknown[])
        .filter((p): p is PrimitiveId => VALID_PRIMITIVES.includes(p as PrimitiveId))
    : []

  const data_points = Array.isArray(raw.data_points)
    ? (raw.data_points as Record<string, unknown>[])
        .filter((d) => d && typeof d.label === "string" && typeof d.value === "string")
        .map((d) => ({
          label: String(d.label).toUpperCase().slice(0, 24),
          value: String(d.value).slice(0, 20),
          unit: typeof d.unit === "string" ? d.unit.slice(0, 8) : undefined,
        }))
        .slice(0, 6)
    : undefined

  return {
    index,
    layout,
    bg: typeof raw.bg === "string" ? raw.bg : "#0a0a0a",
    headline: typeof raw.headline === "string" ? raw.headline.slice(0, 120) : "UNTITLED",
    kicker: typeof raw.kicker === "string" ? raw.kicker.slice(0, 80) : "",
    body: typeof raw.body === "string" && raw.body.trim() ? raw.body.slice(0, 200) : undefined,
    accent: typeof raw.accent === "string" && /^#/.test(raw.accent) ? raw.accent : "#4FC3F7",
    secondary: typeof raw.secondary === "string" && /^#/.test(raw.secondary) ? raw.secondary : undefined,
    data_points: data_points?.length ? data_points : undefined,
    primitives,
    transition: typeof raw.transition === "string" ? raw.transition : "fade",
    motion_note: typeof raw.motion_note === "string" ? raw.motion_note : "slide-up stagger",
    image_filter: typeof raw.image_filter === "string" ? raw.image_filter : undefined,
  }
}

export function parseDirectorBrief(raw: unknown, maxScenes: number): DirectorBrief | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (!obj.title || !obj.logline) return null

  const palette = (obj.palette && typeof obj.palette === "object")
    ? obj.palette as Record<string, string>
    : {}

  const typography = (obj.typography && typeof obj.typography === "object")
    ? obj.typography as Record<string, string>
    : {}

  const rawScenes = Array.isArray(obj.scenes) ? obj.scenes : []
  const scenes: SceneSpec[] = rawScenes
    .slice(0, maxScenes)
    .map((s, i) =>
      sanitizeScene(
        s && typeof s === "object" ? (s as Record<string, unknown>) : {},
        i
      )
    )

  if (scenes.length === 0) return null

  return {
    title: String(obj.title).slice(0, 60),
    logline: String(obj.logline).slice(0, 200),
    hook: typeof obj.hook === "string" ? obj.hook.slice(0, 200) : "",
    palette: {
      bg: typeof palette.bg === "string" ? palette.bg : "#0a0a0a",
      text: typeof palette.text === "string" ? palette.text : "#ffffff",
      accent: typeof palette.accent === "string" ? palette.accent : "#4FC3F7",
      secondary: typeof palette.secondary === "string" ? palette.secondary : "#FF6B35",
    },
    typography: {
      headline_font: typeof typography.headline_font === "string" ? typography.headline_font : "Space Grotesk",
      mono_font: typeof typography.mono_font === "string" ? typography.mono_font : "JetBrains Mono",
      style_note: typeof typography.style_note === "string" ? typography.style_note : "",
    },
    motion_language: typeof obj.motion_language === "string" ? obj.motion_language : "smooth weighted deceleration",
    overall_energy: obj.overall_energy === "low" || obj.overall_energy === "high" ? obj.overall_energy : "medium",
    scenes,
  }
}

/** Flatten the director brief back to a ConceptBrief-compatible shape for the SSE event */
export function briefToConceptCompat(brief: DirectorBrief) {
  return {
    title: brief.title,
    logline: brief.logline,
    hook: brief.hook,
    color_story: `${brief.palette.accent} on ${brief.palette.bg}`,
    typography_mood: brief.typography.style_note || brief.typography.headline_font,
    motion_energy: brief.motion_language,
    scene_beats: brief.scenes.map((s) => `[${s.layout}] ${s.kicker} — "${s.headline}"`),
  }
}
