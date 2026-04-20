# VisioReels — Project Intelligence File

> Living document for Claude Code sessions. Captures architecture, working features,
> pending work, data flows, and all key design decisions so context is never lost.

---

## 1 · What This Is

**VisioReels** is a personal CapCut/video editor replacement built on:
- **Gemma 4** (local Ollama) as the AI brain — writes scripts, plans scenes, generates copy
- **Remotion** as the renderer — React-based video composition at 30 fps
- **Next.js 16** as the app shell + API layer
- **Voicebox** (local Python server) for TTS narration

The user describes a video brief, optionally attaches photos, picks creative settings, and the AI generates a fully rendered short-form video (9:16 Reels, 1:1, 4:5, 16:9).

No cloud AI. No subscriptions. Fully local inference.

---

## 2 · Local Services (must be running)

| Service | URL | Start command |
|---------|-----|---------------|
| **Ollama** | http://localhost:11434 | `ollama serve` (auto-starts) |
| **Voicebox TTS** | http://localhost:17493 | `scripts/start-voicebox.sh` |
| **Next.js dev** | http://localhost:3000 | `npm run dev` |

### Ollama models
```
visio-gemma          ← primary (custom Modelfile fine-tuned for social video)
gemma4:e4b           ← fallback if visio-gemma unreachable
```

### Voicebox
- Python 3.12 env: `~/miniforge3/envs/voicebox` (NOT base — Python 3.13 breaks kokoro)
- Default voice: `af_alloy` (kokoro engine, American female)
- 50 preset voices: American/British/Spanish/French/Hindi × Male/Female
- Auto-creates "VisioReels · Auto narration" profile if no voices configured
- WAV files saved to `public/tts/` (gitignored)

---

## 3 · Tech Stack

```
Framework:    Next.js 16.2.3 (App Router, Turbopack)
Language:     TypeScript (strict)
Styling:      Tailwind v4 (CSS-first)
Animations:   Framer Motion 12
State:        Zustand 5 + Immer (persist middleware)
Video:        Remotion 4 + @remotion/transitions + @remotion/player
AI:           Ollama (local) → visio-gemma (Gemma 4 E4B)
TTS:          Voicebox (local Python) → kokoro engine
Screenshots:  Playwright (Chromium/Brave) for HyperFrames pipeline
Image:        Sharp (analysis + thumbnails)
DnD:          @dnd-kit
Undo:         Zundo
```

### Environment variables (`.env.local`)
```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=visio-gemma
OLLAMA_FALLBACK_MODEL=gemma4:e4b
OLLAMA_KV_CACHE_TYPE=q8_0        # halves VRAM, enables larger context
VOICEBOX_URL=http://localhost:17493
BRAVE_SEARCH_API_KEY=            # optional — enables live Brave Search in brain pass
REDDIT_USER_AGENT=               # optional — custom Reddit UA for context fetches
PLAYWRIGHT_HTML_BROWSER_EXECUTABLE=  # optional — override Brave/Chrome path
```

---

## 4 · The Two Pipelines

### Pipeline A — REMOTION (default, structured)
```
User brief + images
       ↓
  Vision Pre-Pass   ← Sharp (dominant colour, brightness) + Gemma (subject/mood/palette/text_zone)
       ↓
  Brain Pass        ← Gemma writes DirectorBrief JSON (scene-by-scene plan, layouts, headlines)
       ↓
  Reel Prompt       ← Injects brief + vision notes + director brief → Gemma outputs ReelSpec JSON
       ↓
  validateReelSpec  ← Checks paths, char limits, roast jargon, image order
  repairReelJsonForRoast ← Auto-repair pass if jargon detected
       ↓
  renderReelComponent ← Generates a .tsx wrapper around <CinematicReel scenes={...} />
       ↓
  registerInRoot    ← Injects import + <Composition> into remotion/Root.tsx
       ↓
  TTS narration     ← Per-scene WAV via Voicebox → saved to public/tts/
       ↓
  @remotion/player  ← Streams live preview in browser
       ↓
  /api/render-video ← @remotion/renderer → MP4 download
```

### Pipeline B — HYPERFRAMES (HTML slides)
```
User brief + optional images
       ↓
  Vision Pre-Pass   ← Same as above (chunked, handles all images)
       ↓
  Brain Pass        ← Same DirectorBrief JSON
       ↓
  buildHtmlSlidesPrompt ← Gemma writes N full HTML slides (self-contained, inline CSS)
  repairHtmlSlidesTechBro ← Auto-repair if devops/jargon detected in slide copy
       ↓
  Playwright        ← Screenshots each slide to PNG (Brave Browser / Chromium)
  → saved to public/html-renders/<jobId>/*.png
       ↓
  TTS narration     ← Per-slide WAV via Voicebox (uses director brief headlines)
       ↓
  HtmlSlideVideo    ← Remotion composition: PNGs + Audio + TransitionSeries
       ↓
  @remotion/player  ← Preview
       ↓
  /api/render-video ← MP4 download
```

### Pipeline C — FREEFORM TSX (legacy, no attachments)
```
Text prompt only
       ↓
  resolveFile()     ← Keyword match → existing composition (UrbanDrift, GlitchProtocol, etc.)
  OR
  buildPrompt()     ← Gemma writes a full new .tsx Remotion composition
       ↓
  TypeScript compile check → autofix → registerInRoot
       ↓
  Preview + Render
```

---

## 5 · File Map

### App Routes
```
app/
  page.tsx                  ← Landing page (redirects to /editor)
  editor/page.tsx           ← Main editor app
  editor/layout.tsx         ← Editor layout (no metadata export — Next.js rule)
  slides/page.tsx           ← HTML slides editor (/slides)
  html-slides/page.tsx      ← HyperFrames preview page
  globals.css               ← Global styles, CSS variables, font faces

app/api/
  agent/route.ts            ← PRIMARY AI endpoint (2,881 lines). ALL generation logic.
  upload/route.ts           ← Multipart image upload → public/uploads/
  render-video/route.ts     ← Remotion server-side render → MP4 blob
  download/route.ts         ← Zip download
  tts/route.ts              ← Voicebox status + preset voice list
  html-slides/render/       ← Playwright render trigger (internal)
  slides/
    caption/route.ts        ← Re-caption a single slide
    rewrite/route.ts        ← Rewrite slide body text
    regenerate/route.ts     ← Regenerate a slide with new image
    generate/route.ts       ← Generate full slide deck (slides editor)
    export/route.ts         ← Export slides as PDF/zip
```

### Components
```
components/editor/
  LeftSidebar.tsx           ← Panel switcher (AI / Media / History tabs)
  panels/AIPanel.tsx        ← Main AI control panel (1,300+ lines):
                              ENGINE, LENGTH, CANVAS, PACE, TYPOGRAPHY, OVERLAY,
                              CREATIVE, DIRECTION, VOICE, VIBE, prompt textarea,
                              image attachments, generate button, live stream output
  PreviewPanel.tsx          ← @remotion/player + composition switcher
  RightInspector.tsx        ← Selected clip properties
  Timeline.tsx              ← Clip timeline (dnd-kit drag-to-reorder)
  Topbar.tsx                ← Project name, export controls

components/slides/
  SlideFrame.tsx            ← Individual slide renderer (iframe / preview)
  ThumbStrip.tsx            ← Slide thumbnail filmstrip
  PresentMode.tsx           ← Full-screen presentation mode
  TweaksPanel.tsx           ← Per-slide caption tweaks
```

### Remotion
```
remotion/
  Root.tsx                  ← Composition registry (auto-updated by agent)
  index.ts                  ← Remotion entry point
  remotion.config.ts        ← Remotion CLI config

  components/
    CinematicReel.tsx       ← PRIMARY reusable composition (948 lines):
                              Ken Burns zoom, TransitionSeries, caption animation,
                              kicker text, accent colour, film grain, grade presets,
                              TTS audio per scene

  components/primitives/    ← SVG/animation primitives used by freeform compositions:
                              HUDCorners, StarField, GridOverlay, KineticTitle,
                              TelemetryCounter, StatusBar, DataReadout, ScanLines,
                              LightLeak, NoiseLayer

  compositions/
    Reel.tsx                ← Data-driven wrapper around CinematicReel (uses DEFAULT_SCENES)
    HtmlSlideVideo.tsx      ← HyperFrames player: PNG slides + Audio + TransitionSeries
    [40+ others]            ← Static pre-built compositions (exported videos, legacy)
```

### Lib (Business Logic)
```
lib/
  agent-creative-directives.ts  ← Creative guidelines injected into all Gemma prompts
                                   (BRAIN_, FREEFORM_CODE_, GEMMA_JSON_, HTML_SLIDES_)
  composition-configs.ts        ← Static composition metadata (dimensions, fps)
  concept-brief.ts              ← ConceptBrief type (high-level idea from brain pass)
  cultural-context.ts           ← 661-line cultural intelligence DB:
                                   platform vocab (TikTok/Instagram/LinkedIn/X/Pinterest),
                                   industry vocab, meme formats 2025,
                                   banned AI phrases, detectIndustry(), buildCulturalContext()
  director-brief.ts             ← DirectorBrief type + parseDirectorBrief() + layouts:
                                   hud|editorial|typographic|split|orbital|data-grid|full-bleed|glitch|magazine
  html-slide-duration.ts        ← computeHtmlSlideVideoDuration(n, sceneLen, transLen)
  html-slide-render.ts          ← renderHtmlSlidesToPng() via Playwright (274 lines)
  hyperframes-prompt.ts         ← buildHyperframesCreativeBlock(), buildReelRemixDirective()
                                   HyperFrames-style creative vocabulary
  platforms.ts                  ← Platform configs (TikTok/Reels/Shorts/Pinterest/X)
  preset-auto.ts                ← Auto-resolution of voice profiles
  reel-typography.ts            ← Typography presets (headline + mono font pairs)
                                   + decor: none|minimal|film
  slide-presets.ts              ← HTML slide preset templates (645 lines)
  voice-director.ts             ← buildVoiceDirection() + buildNarrationText()
                                   Maps captionTone × motionFeel → Voicebox instruct/seed/crossfade
  voicebox.ts                   ← Full Voicebox client:
                                   listVoiceProfiles(), listPresetVoices(), generateSpeech(),
                                   ensurePresetProfile(), resolveProfileForNarration(),
                                   isVoiceboxRunning(), createPresetVoiceProfile()
  web-context.ts                ← Cultural vocabulary + web search:
                                   Static: ROAST_VOCABULARY, MEME_FORMATS_2025, PLATFORM_COPY_STYLES
                                   Live: Brave Search (BRAVE_SEARCH_API_KEY env)
                                   + Wikipedia (no key, used for named subjects)
                                   + Reddit public JSON (no key)
```

### Stores (Zustand)
```
stores/
  editor-store.ts    ← Main UI state (persisted):
    prompt, attachments, aspect (9:16/1:1/4:5/16:9), pace, maxScenes,
    motionFeel, captionTone, transitionEnergy, targetDurationSec,
    reelTypography, reelDecor, pipelineMode (remotion|hyperframes),
    useVision, visionNotes, concept, directorBrief,
    useTTS, ttsVoice, ttsVoiceId, ttsGender, ttsAccent, ttsPresetVoices,
    ttsStatus, generationPhase, streamingTokens, elapsed,
    activeComposition, compositionInputProps

  project-store.ts   ← Active composition + project identity
  timeline-store.ts  ← Clip list (dnd-kit sortable)
```

---

## 6 · AI Panel Controls (AIPanel.tsx sections)

| Section | What it controls |
|---------|-----------------|
| **ENGINE** | REMOTION vs HYPERFRAMES pipeline toggle |
| **LENGTH** | Target video duration (10s → 5m). Drives frame count + copy depth |
| **CANVAS** | Aspect ratio: 9:16 Story · 1:1 Feed · 4:5 Portrait · 16:9 Landscape |
| **PACE** | Chill (3.7s holds) · Balanced (2.5s) · Fast (1.8s) · Hype (1.2s) |
| **TYPOGRAPHY** | Headline + mono font pair (Google Fonts) |
| **OVERLAY** | Corner decoration: none · minimal · film strip |
| **CREATIVE** | motionFeel × captionTone × transitionEnergy (9 creative axes) |
| **DIRECTION** | Max scenes slider (2–24) + Vision pre-pass toggle |
| **VOICE** | Voicebox TTS: enable, gender (♀/♂), accent chips, 50 voice name chips |
| **VIBE** | Style chips: RAW · BRUTALIST · CINEMATIC · BEAT_SYNC · GLITCH · NEON · MINIMAL · CODE · VECTOR |
| **Prompt** | Free-text brief. Works alone (freeform) or alongside images |
| **Attachments** | Image upload (drag-drop or picker). Up to any count (processed in chunks of 6) |

---

## 7 · The Brain / Director System

### Three-pass generation (structured mode with images):

**Pass 1 — Vision**
- Sharp: dominant colour, brightness, dimensions per image
- Gemma: subject, mood, palette[3], composition, text_zone, content_type, copy_style
- Chunked: VISION_CHUNK_SIZE=6 per Gemma call → all images covered regardless of count

**Pass 2 — Brain / Director Brief**
- `buildDirectorPrompt()` + `detectCreativeIntent()` → intent-aware
- Gemma outputs: title, logline, hook, palette, typography, motion_language, overall_energy, scenes[]
- Each scene: layout, bg, headline, kicker, body, accent, primitives[], transition, motion_note
- Injects: cultural vocabulary block, web context (Brave/Reddit/Wikipedia if available), intent-specific guidance
- `parseDirectorBrief()` validates + normalises the JSON

**Pass 3 — Reel JSON / HTML Slides**
- `buildReelPrompt()`: injects director brief (APPROVED copy), vision notes, narrative arc, colour guide, cultural block
- Gemma outputs scene list with src, caption, kicker, accent, transition, narration
- `validateReelSpec()` + `repairReelJsonForRoast()` (auto-repair pass for jargon)

### Intent detection (`detectCreativeIntent()`)
Automatically identifies: **roast · comedy · motivation · tutorial · hype**
- Roast mode: injects specific savage copy guidance, bans startup jargon, forces specific visual observations
- Arc override per intent (roast → SETUP → ESCALATE → DEEPEST ROAST → CALLBACK → SAVE)

### Jargon repair
- `findRoastJargonInText()`: detects startup/DevOps words in generated copy
- `repairReelJsonForRoast()`: re-runs Gemma with strict "no LinkedIn voice" instructions
- `repairHtmlSlidesTechBro()`: same for HTML slides with devops-cosplay mono labels
- `findHyperframesBannedCopy()`: checks visible text in rendered HTML

---

## 8 · CinematicReel Composition

The core Remotion component used by all structured reel output.

### Props (`CinematicReelProps`)
```typescript
scenes: ReelScene[]             // image + caption + kicker + accent + transition + narration
brandName?: string              // watermark text
sceneLengthInFrames?: number    // default 75 (2.5s @ 30fps)
transitionLengthInFrames?: number // default 18
gradePreset?: GradePreset       // visual grade filter (see below)
typography?: ReelTypographyId   // font pair
decor?: ReelDecorStyle          // corner ornament
sceneTTSPaths?: string[]        // per-scene WAV paths for narration audio
```

### Grade presets (from video-use)
| Preset | Look |
|--------|------|
| `warm_cinematic` | +12% contrast, crushed blacks, -12% sat, warm shadows |
| `neutral_punch` | +6% contrast, subtle s-curve. Safe all-purpose |
| `cool_editorial` | Desaturated, cool/blue shift. Architecture, tech, minimal |
| `matte_film` | Lifted blacks, +15% contrast, -25% sat. Film poster |
| `subtle` | Barely perceptible cleanup |
| `none` | Raw image |

Auto-selected from `motionFeel`: dramatic/bouncy → warm_cinematic, dreamy → matte_film.

### ReelScene type
```typescript
{
  src: string           // "uploads/abc123.jpg" or https URL
  caption: string       // headline (ALL CAPS for hype)
  kicker?: string       // supporting line
  accent?: string       // hex colour matched to image palette
  transition?: TransitionKind  // 11 options
  narration?: string    // TTS script (spoken, not shown)
}
```

### Transitions available
`slide-right · slide-left · slide-top · slide-bottom · flip · fade · wipe · wipe-right · wipe-bottom · clock-wipe · iris`

---

## 9 · Voicebox TTS Integration

### Flow
1. Agent generates `narration` field per scene (natural spoken text, no hashtags)
2. `resolveVoiceProfile(ttsVoice)`:
   - If `ttsVoice` matches preset pattern (`af_bella`, `bm_george`): `ensurePresetProfile()`
   - Otherwise: `resolveProfileForNarration()` (matches by name/id in profile list)
3. `generateSceneTTS()` → `buildVoiceDirection()` → per-scene WAV
4. WAVs saved to `public/tts/<ComponentName>-scene-<i>.wav`
5. Passed as `sceneTTSPaths` prop to CinematicReel (REMOTION) or `narrationPaths` (HyperFrames)

### Voice picker (AIPanel VOICE section)
- Gender toggle: ♀ FEMALE / ♂ MALE
- Accent chips: 🇺🇸 American · 🇬🇧 British · 🇪🇸 Spanish · 🇫🇷 French · 🇮🇳 Hindi
- Voice name grid: Alloy · Bella · Nova · Heart · Sarah · Adam · Echo · Eric etc.
- Summary: `🎙 Nova · American Female · kokoro`
- Falls back to FALLBACK_VOICE_GROUPS (hardcoded 50 voices) when Voicebox offline
- When offline: checkbox visible, picker hidden, `● OFFLINE` indicator shown

### Voice direction (`voice-director.ts`)
Maps `captionTone × motionFeel → Voicebox instruct`:
- hype + dramatic → "Speak with high energy and urgency..."
- storytelling + dreamy → "Speak cinematically. Slower pace with deliberate pauses..."
- roastDelivery → "Dry, deadpan, side-eye energy. Measured pace..."

---

## 10 · HyperFrames Pipeline Detail

### What it generates
Each HTML slide is a fully self-contained `<html>` document with:
- Inline CSS (no external dependencies except Google Fonts)
- Background: gradient or `<img src="uploads/...">` reference
- Typography matching the chosen font pair
- Animated elements (CSS keyframes)
- Per-slide mood/palette tuned to vision notes

### Playwright render (`lib/html-slide-render.ts`)
- Uses Brave Browser (auto-detected) or Playwright's Chromium
- Screenshots each slide at composition dimensions
- PNGs saved to `public/html-renders/<jobId>/<i>.png`
- Passed as `slidePaths` to HtmlSlideVideo composition

### HtmlSlideVideo (`remotion/compositions/HtmlSlideVideo.tsx`)
- `<TransitionSeries>` with varied presentation types (slide/iris/wipe/clockWipe/flip/fade)
- Per-slide `<Audio src={narrationPaths[i]}>` for TTS
- Spring timing: `{ damping: 180, stiffness: 200 }`

### Slide repair
`repairHtmlSlidesTechBro()` — triggered when `findHyperframesBannedCopy()` detects jargon.
Bans: `// CORE DIRECTIVE`, `STATUS:`, `PROTOCOL:`, `DEPLOYMENT`, severity/incident role-play, deploy/sprint metaphors.

---

## 11 · Composition Library (40+ pre-built)

Static compositions in `remotion/compositions/` — registered in `remotion/Root.tsx`.

### Categories
**Architectural / Landscape** (16:9)
`ConcreteHorizon · SummitView · AlpineArchitects · MountainEscape · AlpineDream · AlpineSanctuary · TheArchitectureofSere · TheArtoftheView · TheGeometryofScale · TheBlueprintDesigning · ArchitecturalNarrative · ArchitecturalDreamscape`

**Night / Neon / Drive** (9:16 or 1:1)
`MidnightCruise · MidnightDriveMood · MidnightReflections · MidnightRun · NeonRebel · NeonSwagger · NeonNoirDrive · MidnightManifesto · NIGHTDRIVEGLITCH`

**Glitch / Raw** (9:16)
`GLITCHRAW · GLITCHREEL · GlitchProtocol · StaticSignal · SystemOverload · THEPLASTICMANIFESTO · PlasticDecay`

**Roast / Comedy** (9:16)
`TheRoastReel · TheRoastSession · RoastingElvis · RoastTheIcon · AttitudeCheck · UNBOTHERED · DollhouseDread`

**Motion / Hype** (9:16)
`Momentum · UrbanDrift · NeoFuturism · NewVideo · MidnightRun`

**Dynamic (data-driven)** — used by AI agent
`Reel.tsx` — wraps CinematicReel, accepts `scenes[]` prop, `calculateMetadata` for dynamic duration
`HtmlSlideVideo.tsx` — HyperFrames output player

---

## 12 · Agent Route Architecture (`app/api/agent/route.ts`)

2,881 lines. Key sections:

### Ollama helpers
- `streamOllama()` — streaming with 120s timeout + AbortController
- `callOllamaChat(messages, jsonMode, overrides?)` — non-streaming JSON calls
  - Default timeout: 60s (`CHAT_TIMEOUT_MS`). Vision calls use `VISION_TIMEOUT_MS` (150s).
  - `overrides: { temperature?, num_predict?, num_ctx?, timeoutMs? }` — pass per-call overrides
  - Vision calls pass `{ num_predict: m*800, num_ctx: 8192, timeoutMs: VISION_TIMEOUT_MS }` to avoid truncation
  - **IMPORTANT**: Never pass `think: false` AND `format: "json"` simultaneously (Ollama bug #15260 — JSON format is silently ignored). Use `format: "json"` alone.
- `safeJson()` — strips `<think>…</think>` blocks and ` ```json ``` ` fences before parsing

### Generation flow (request body)
```typescript
{
  prompt: string              // user brief
  attachments: Attachment[]   // uploaded images
  aspect: ReelAspect          // canvas
  pace: ReelPace
  maxScenes: number
  targetDurationSec: number
  motionFeel, captionTone, transitionEnergy  // creative axes
  pipelineMode: 'remotion' | 'hyperframes'
  useVision: boolean          // vision pre-pass toggle
  useTTS: boolean             // narration toggle
  ttsVoice: string            // voice ID (e.g. "af_bella")
  reelTypography, reelDecor   // font + decor
}
```

### SSE stream events
The agent streams Server-Sent Events back to the client:
```
{ type: "status", text: string }
{ type: "token", tok: string }
{ type: "vision_note", note: VisionNote }
{ type: "brain_concept", concept: ConceptBrief }
{ type: "director_brief", brief: DirectorBrief }
{ type: "tts_note", text: string }
{ type: "reel_spec", scenes[], width, height, durationInFrames }  ← REMOTION
{ type: "html_slide_video", inputProps, width, height, durationInFrames }  ← HYPERFRAMES
{ type: "validation", success: bool, output: string }
{ type: "error", content: string }
{ type: "done" }
```

### Auto-registration
`registerInRoot(componentName, outPath, durationInFrames, w, h)`:
- Writes import + `<Composition>` into `remotion/Root.tsx`
- Called after every successful freeform TSX generation
- Idempotent (checks if id already exists)

---

## 13 · What Is Working ✅

- [x] Full REMOTION pipeline (vision → brain → reel → preview → render)
- [x] Full HYPERFRAMES pipeline (vision → brain → HTML slides → Playwright → Remotion → render)
- [x] Freeform TSX generation (no images, open-ended composition generation)
- [x] Vision pre-pass (all images, chunked in groups of 6 to handle any count)
- [x] Brain / Director pass (DirectorBrief JSON with per-scene headlines)
- [x] Voicebox TTS integration (REMOTION + HYPERFRAMES, per-scene WAV narration)
- [x] Voice picker UI (gender · accent · name grid · 50 preset voices)
- [x] Grade presets (warm_cinematic, neutral_punch, cool_editorial, matte_film)
- [x] Narrative arc system (HOOK → BUILD → PAYOFF per tone)
- [x] Cultural intelligence (platform vocab, meme formats, industry vocab)
- [x] Intent detection (roast · comedy · motivation · tutorial · hype)
- [x] Roast jargon auto-repair (reel + HTML slides)
- [x] TransitionSeries in CinematicReel (11 transition types)
- [x] Colour intelligence (palette-matched accent hex per scene)
- [x] Typography presets (6 font pairs, 3 decor styles)
- [x] All 40+ legacy compositions registered in Root.tsx
- [x] MP4 download via /api/render-video
- [x] Image upload to public/uploads/
- [x] HTML slides editor (/slides route)
- [x] Live token stream in AI panel
- [x] Zustand persistence (settings survive refresh)
- [x] Timeline (dnd-kit sortable clips)
- [x] Build: TypeScript clean, Next.js Turbopack passes

---

## 14 · Pending Work ⏳

### High priority
- [ ] **Web search quality**: Add `BRAVE_SEARCH_API_KEY` to `.env.local` for live cultural context (Reddit public JSON already wired, Brave optional)
- [ ] **HyperFrames audio**: Verify Voicebox narration paths reach Remotion player in preview (audio exists in render, needs player check)

### Medium priority
- [ ] **Generation quality for roast**: Test with 8-image roast brief post-fix — `detectCreativeIntent` + repair pass should now handle it
- [ ] **Slides route stability**: `caption/rewrite/regenerate` routes now have `think:false` bug fixed — test round-trip
- [ ] **Freeform TSX**: Code generation quality is inconsistent — occasional TS errors in generated compositions
- [ ] **Remotion Lambda**: Not set up — all rendering is local (slow for long videos)
- [ ] **Preview scrubbing**: @remotion/player controls sometimes get out of sync on composition switch

### Low priority / Future
- [ ] Auto-post to social (webhooks to n8n/Make)
- [ ] A/B hook testing (generate 3 caption variants)
- [ ] Batch render (queue multiple compositions)
- [ ] Thumbnail export (still frame at scene 1)
- [ ] Remotion Studio integration (`npx remotion studio`)
- [ ] Gemma 26B upgrade (when more RAM available — currently using 4B)
- [ ] Real-time trend injection (Brave Search key → inject trending audio/hashtags)
- [ ] Multi-track timeline (music layer + narration layer separate)

---

## 15 · Known Bugs & Gotchas

| Bug | Status | Notes |
|-----|--------|-------|
| Ollama `think:false` + `format:json` | ✅ Fixed in agent route | Never combine — format:json alone |
| Vision pass image cap (was 6) | ✅ Fixed | Now chunked, processes all images |
| Vision pass returning empty subjects | ✅ Fixed | `num_predict` was 900 — too low for multi-image JSON. Now `m*800` (min 600). Timeout raised to 150s via `VISION_TIMEOUT_MS`. Added console.warn/error logs. |
| `WEAK_PATTERNS` blocking valid CTAs | ✅ Fixed | Removed "save this", "stop scrolling", "did you know", "the truth about", "this is why" from WEAK_PATTERNS — these are all valid social copy. Only truly weak patterns remain. |
| `slides/caption`, `slides/rewrite`, `slides/regenerate` `think:false` bug | ✅ Fixed | Removed `think:false` from all 3 |
| AIPanel.tsx build error (em dash in hint attr) | ✅ Not actually broken — build passes | Was a Turbopack hot-reload glitch |
| Timeline clips not showing | ✅ Fixed | Timeline now derives clips from persisted `activeComposition` via `useEffect` in Timeline.tsx. Also belt-and-suspenders `addClip` in SSE handler. Survives page refresh. |
| HyperFrames audio in preview | ⏳ Investigate | WAVs generated, narrationPaths in inputProps |
| `Gemma's` smart apostrophe in hint | N/A | em dash `—` at col 49 line 751 is valid UTF-8 in JSX |
| Modelfile wrong output schema | ✅ Fixed | Rebuilt with 6 role blocks matching actual pipeline schemas. Rebuild: `ollama create visio-gemma -f Modelfile` |
| Generation 310s+ for 45s video | ✅ Fixed | `reelJsonNumPredict` formula reduced (3600→2190 for 45s). `WorkflowCriticPass` disabled. TTS parallel. Web+Vision parallel. |
| TTS sequential bottleneck | ✅ Fixed | `generateSceneTTS()` now uses `Promise.allSettled` — all scenes TTS in parallel. |
| Vision + Web context sequential | ✅ Fixed | Both pipelines now await `Promise.allSettled([describeImagesBatch, fetchWebContext])` in parallel. |
| AIPanel CSS dark olive text | ✅ Fixed | 5 color values brightened: `#334400→#7a9900`, `#445500→#88aa22`, `#557700→#99bb33`, `#667700→#aabb44`, `#555→#888` |

---

## 16 · External Repos Integrated

### video-use (heygen-com/video-use)
Source for:
- **Grade presets**: CSS filter chains (`warm_cinematic`, `cool_editorial`, `matte_film` etc.) translated from their Python grade.py to CSS `filter:` strings
- **Narrative arc methodology**: HOOK → TENSION → REVEAL → PAYOFF → CTA pattern
- **Prompt engineering patterns**: Motion language vocabulary, scene beat structure

### HyperFrames (heygen-com/hyperframes)
Source for:
- **Creative vocabulary**: `motionFeel × captionTone × transitionEnergy` axes
- **HTML slide prompt patterns**: Self-contained slides with inline CSS
- `lib/hyperframes-prompt.ts` — direct adaptation of their prompt building approach
- `buildHyperframesCreativeBlock()` — their creative directive format

### Voicebox
Local Python TTS server at `~/Desktop/voicebox`. kokoro engine (50 voices). Started via `scripts/start-voicebox.sh`.

---

## 17 · Development Commands

```bash
# Start everything
ollama serve                    # AI (usually auto-starts)
scripts/start-voicebox.sh       # TTS server
npm run dev                     # Next.js at :3000

# Remotion
npx remotion studio             # Visual composition browser
npx remotion render Reel out/Reel.mp4  # CLI render

# Model management
ollama create visio-gemma -f Modelfile  # Rebuild custom model
ollama run visio-gemma          # Test model directly

# Build check
npx tsc --noEmit                # TypeScript check
npx next build                  # Full production build

# Voicebox manual start
cd ~/Desktop/voicebox && ~/miniforge3/envs/voicebox/bin/uvicorn backend.main:app --host 127.0.0.1 --port 17493 &>/tmp/voicebox.log &
```

---

## 18 · Modelfile (`./Modelfile`)

Custom system prompt baked into `visio-gemma` model with 6 role blocks:
- `[ROLE: vision]` → `{"notes":[{subject,mood,palette,composition,text_zone,content_type,copy_style}]}`
- `[ROLE: director]` → DirectorBrief JSON (title, logline, hook, palette, typography, scenes[])
- `[ROLE: reel]` → `{"scenes":[{src,caption,kicker,accent,transition,narration}]}`
- `[ROLE: slides]` → N self-contained HTML documents separated by `---SLIDE---`
- `[ROLE: copy]` → `{"title":"...","body":"..."}`
- `[ROLE: caption]` → `{"hook":"...","caption":"...","hashtags":[],"cta":"..."}`
- Params: temperature 0.85, top_p 0.92, top_k 40, num_ctx 32768, repeat_penalty 1.15
- JSON-only output: no markdown, no prose, no code fences ever

Rebuild after editing: `ollama create visio-gemma -f Modelfile`

---

## 19 · Audio Assets (`public/audio/`)

Pre-loaded background music tracks for Remotion compositions:
```
music-cinematic.wav    music-dark-moody.wav    music-minimal.wav
music-neon.wav         music-raw.wav           music-vibrant.wav
glitch.wav             impact.wav              whoosh.wav    zoom.wav
```
Used by static legacy compositions. Not yet wired to AI-generated reels (future work).

---

## 20 · Session Rules for Claude

1. **Never break the build** — run `npx tsc --noEmit` before claiming done
2. **Ollama bug #15260** — never pass `think:false` AND `format:"json"` together in any Ollama call
3. **Smart quotes** — never write curly quotes (`'`) in TSX/TS — only straight quotes (`'` / `"`)
4. **CinematicReel is the source of truth** — all structured reel output goes through this component, never write a new composition from scratch for image reels
5. **Voicebox is optional** — all TTS code must fail gracefully when Voicebox is offline
6. **Vision chunking** — VISION_CHUNK_SIZE=6, always use `describeImagesBatch()`, never slice attachments before passing
7. **Root.tsx auto-registration** — freeform TSX compositions must be registered via `registerInRoot()` — never manually edit Root.tsx
8. **ttsVoiceId vs ttsVoice** — `ttsVoiceId` is the canonical state (e.g. `"af_bella"`); `ttsVoice` is legacy string for backwards compat; `setTTSVoiceId` updates both
9. **No DuckDuckGo** — DDG is removed; web context uses Reddit (public) + Brave (optional key) + Wikipedia
10. **Director brief is APPROVED copy** — when a DirectorBrief exists, the reel prompt uses its headlines verbatim; Gemma only picks image paths and transitions
11. **Timeline derives from editor store** — Timeline.tsx has a `useEffect` that calls `addClip` when `activeComposition` changes. The editor store is persisted; the timeline store is in-memory. Don't try to persist the timeline store — derive it from the editor store instead.
12. **TTS is always parallel** — `generateSceneTTS()` uses `Promise.allSettled`. Never make it sequential.
13. **Vision + Web are parallel** — both REMOTION and HYPERFRAMES pipelines run `describeImagesBatch` and `fetchWebContext` via `Promise.allSettled`. Keep them parallel.
14. **WorkflowCriticPass is disabled** — `CRITIC_ENABLED = false`. Do not re-enable unless explicitly asked.
15. **VISION_CHUNK_SIZE = 2** — Reduced from 3 to prevent JSON truncation. Do not increase above 2 unless `num_predict` budget is also raised proportionally.
