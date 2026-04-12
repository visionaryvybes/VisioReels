import { Config } from "@remotion/cli/config";

// Output codec — H.264 is universally compatible (Instagram, TikTok, YouTube)
Config.setCodec("h264");

// CRF 18 = near-visually-lossless quality at reasonable file size
// Range: 0 (lossless) → 51 (worst). 17–20 is the "premium" sweet spot.
Config.setCrf(18);

// JPEG is faster for rendering video frames; PNG for stills
Config.setVideoImageFormat("jpeg");
Config.setStillImageFormat("png");

// Concurrency: use all CPU cores for rendering (default is half)
// On M3 Pro: 12 performance cores → rendering 2–3x faster
Config.setConcurrency("100%");

// Pixel format — yuv420p ensures compatibility with all video players
Config.setPixelFormat("yuv420p");

// Overwrite output without prompting
Config.setOverwriteOutput(true);
