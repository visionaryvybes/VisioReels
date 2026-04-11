# VisioReels — Changelog

## v0.1.0 (2026-04-11)
**Initial build — Gemma 4 E4B + Remotion pipeline**

### Features
- 5 platform presets: TikTok, Instagram Reels, YouTube Shorts, Pinterest, X
- 6 mood styles: Cinematic, Dark & Moody, Vibrant, Minimal, Raw/Authentic, Neon
- Drag & drop image upload with base64 preview
- Gemma 4 E4B (via Ollama) generates: hook, script, captions, hashtags, style params
- Remotion SocialReel composition with:
  - Ken Burns slow zoom (1.0 → 1.08 over full duration)
  - Word-by-word caption pop animation (spring physics)
  - Hook text slam-in at frame 0
  - Bottom gradient overlay for text readability
  - Platform watermark top-right
- MP4 render + download via `/api/render`
- Live Ollama connection status bar
- Full Framer Motion step transitions
- Dark mode only design system (zinc-950 / violet-400)

### Architecture
- Next.js 16 + TypeScript strict
- Tailwind v4 (CSS-first config)
- Remotion renderer (server-side only via dynamic import)
- Ollama local inference (no cloud dependency)
