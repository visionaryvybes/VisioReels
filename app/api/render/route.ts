import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface VideoScript {
  hook: string;
  script: string;
  captions: string[];
  hashtags: string[];
  cta?: string;
  style: { transition: string; textStyle: string; colorGrade: string };
}

interface RenderRequest {
  script: VideoScript;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  platform: string;
  mood: string;
  customWidth?: number;
  customHeight?: number;
  bgMusicVolume?: number;
  sfxVolume?: number;
}

const PLATFORM_DIMENSIONS: Record<
  string,
  { width: number; height: number; fps: number; durationInFrames: number }
> = {
  tiktok:    { width: 1080, height: 1920, fps: 30, durationInFrames: 450 },
  reels:     { width: 1080, height: 1920, fps: 30, durationInFrames: 900 },
  shorts:    { width: 1080, height: 1920, fps: 30, durationInFrames: 600 },
  pinterest: { width: 1000, height: 1500, fps: 30, durationInFrames: 300 },
  x:         { width: 1920, height: 1080, fps: 30, durationInFrames: 450 },
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<RenderRequest>;
    const { script, platform, mood } = body;

    const allImages: string[] = body.imageDataUrls?.length
      ? body.imageDataUrls
      : body.imageDataUrl ? [body.imageDataUrl] : [];

    if (!script || allImages.length === 0 || !platform || !mood) {
      return NextResponse.json(
        { error: "Missing required fields: script, imageDataUrl(s), platform, mood" },
        { status: 400 }
      );
    }

    const baseDims = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.tiktok;
    const dims = {
      ...baseDims,
      ...(body.customWidth && body.customHeight
        ? { width: body.customWidth, height: body.customHeight }
        : {}),
    };

    const outputPath = `/tmp/visio-reels-${Date.now()}.mp4`;

    // ── Load modules ───────────────────────────────────────────────────────────
    let bundleFn: (opts: { entryPoint: string; webpackOverride?: (c: unknown) => unknown }) => Promise<string>;
    try {
      const m = await import("@remotion/bundler" as string);
      bundleFn = (m as { bundle: typeof bundleFn }).bundle;
    } catch {
      return NextResponse.json({ error: "@remotion/bundler not installed" }, { status: 501 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rendererMod: Record<string, any>;
    try {
      rendererMod = await import("@remotion/renderer" as string) as Record<string, any>;
    } catch {
      return NextResponse.json({ error: "@remotion/renderer failed to load" }, { status: 501 });
    }

    // ── Ensure the correct Chrome (Google Chrome for Testing) is available ─────
    // This downloads a Remotion-compatible Chrome if needed (~300MB, one-time)
    try {
      await rendererMod.ensureBrowser({ logLevel: "warn" });
      console.log("[render] Chrome for Testing ready");
    } catch (e) {
      console.warn("[render] ensureBrowser warning:", e);
    }

    // ── Bundle ─────────────────────────────────────────────────────────────────
    const remotionRoot = path.resolve(process.cwd(), "remotion/index.ts");
    let bundled: string;
    try {
      bundled = await bundleFn({ entryPoint: remotionRoot, webpackOverride: (c) => c });
    } catch (err) {
      return NextResponse.json({ error: `Bundle failed: ${err instanceof Error ? err.message : err}` }, { status: 500 });
    }

    const inputProps: Record<string, unknown> = {
      script: script.script,
      captions: script.captions,
      imageSrc: allImages[0],
      imageSrcs: allImages,
      platform, mood,
      hook: script.hook,
      cta: script.cta ?? "",
      style: script.style,
      bgMusicVolume: body.bgMusicVolume ?? 0.35,
      sfxVolume: body.sfxVolume ?? 0.7,
    };

    // ── Select composition ─────────────────────────────────────────────────────
    let composition: unknown;
    try {
      composition = await rendererMod.selectComposition({
        serveUrl: bundled,
        id: `SocialReel-${platform}`,
        inputProps,
        timeoutInMilliseconds: 90000,
        chromiumOptions: {
          disableWebSecurity: true,
          ignoreCertificateErrors: true,
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Select composition failed: ${err instanceof Error ? err.message : err}` },
        { status: 500 }
      );
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    try {
      await rendererMod.renderMedia({
        composition,
        serveUrl: bundled,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        imageFormat: "jpeg",
        jpegQuality: 85,
        concurrency: 1,
        timeoutInMilliseconds: 240000,
        chromiumOptions: {
          disableWebSecurity: true,
          ignoreCertificateErrors: true,
        },
        ...dims,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Render failed: ${err instanceof Error ? err.message : err}` },
        { status: 500 }
      );
    }

    if (!fs.existsSync(outputPath)) {
      return NextResponse.json({ error: "Output file not found after render" }, { status: 500 });
    }

    const fileBuffer = fs.readFileSync(outputPath);
    try { fs.unlinkSync(outputPath); } catch { /* non-critical */ }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="visio-reels-${platform}-${Date.now()}.mp4"`,
        "Content-Length": fileBuffer.byteLength.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[render] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
