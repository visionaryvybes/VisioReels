import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// NOTE: @remotion/bundler must be installed separately:
//   npm install @remotion/bundler
// It is excluded from this file's imports to avoid bundling at build time.
// Both @remotion/bundler and @remotion/renderer are dynamically imported at runtime.

interface VideoScript {
  hook: string;
  script: string;
  captions: string[];
  hashtags: string[];
  style: {
    transition: string;
    textStyle: string;
    colorGrade: string;
  };
}

interface RenderRequest {
  script: VideoScript;
  imageDataUrl: string;
  platform: string;
  mood: string;
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
    const { script, imageDataUrl, platform, mood } = body;

    if (!script || !imageDataUrl || !platform || !mood) {
      return NextResponse.json(
        { error: "Missing required fields: script, imageDataUrl, platform, mood" },
        { status: 400 }
      );
    }

    const dimensions = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.tiktok;
    const outputPath = `/tmp/visio-reels-output-${Date.now()}.mp4`;

    // Dynamically import Remotion packages — server-side only, never bundled client-side
    let bundleFn: (opts: {
      entryPoint: string;
      webpackOverride?: (config: unknown) => unknown;
    }) => Promise<string>;

    let renderMediaFn: (opts: {
      composition: unknown;
      serveUrl: string;
      codec: string;
      outputLocation: string;
      inputProps: Record<string, unknown>;
      imageFormat: string;
      jpegQuality: number;
      width: number;
      height: number;
      fps: number;
      durationInFrames: number;
    }) => Promise<void>;

    let selectCompositionFn: (opts: {
      serveUrl: string;
      id: string;
      inputProps: Record<string, unknown>;
    }) => Promise<unknown>;

    try {
      const bundlerMod = await import("@remotion/bundler" as string);
      bundleFn = (bundlerMod as { bundle: typeof bundleFn }).bundle;
    } catch {
      return NextResponse.json(
        {
          error:
            "@remotion/bundler is not installed. Run: npm install @remotion/bundler",
        },
        { status: 501 }
      );
    }

    try {
      const rendererMod = await import("@remotion/renderer" as string);
      const mod = rendererMod as {
        renderMedia: typeof renderMediaFn;
        selectComposition: typeof selectCompositionFn;
      };
      renderMediaFn = mod.renderMedia;
      selectCompositionFn = mod.selectComposition;
    } catch {
      return NextResponse.json(
        { error: "@remotion/renderer failed to load" },
        { status: 501 }
      );
    }

    // Bundle the Remotion composition entry point
    const remotionRoot = path.resolve(process.cwd(), "remotion/index.ts");

    let bundled: string;
    try {
      bundled = await bundleFn({
        entryPoint: remotionRoot,
        webpackOverride: (config) => config,
      });
    } catch (bundleErr) {
      const msg = bundleErr instanceof Error ? bundleErr.message : String(bundleErr);
      console.error("[render] Bundle error:", msg);
      return NextResponse.json(
        { error: `Remotion bundle failed: ${msg}` },
        { status: 500 }
      );
    }

    const compositionId = `SocialReel-${platform}`;
    const inputProps: Record<string, unknown> = {
      script: script.script,
      captions: script.captions,
      imageSrc: imageDataUrl,
      platform,
      mood,
      hook: script.hook,
      style: script.style,
    };

    // Select the composition
    const composition = await selectCompositionFn({
      serveUrl: bundled,
      id: compositionId,
      inputProps,
    });

    // Render to MP4
    await renderMediaFn({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      imageFormat: "jpeg",
      jpegQuality: 80,
      ...dimensions,
    });

    // Read the output file and stream back as downloadable MP4
    if (!fs.existsSync(outputPath)) {
      return NextResponse.json(
        { error: "Render completed but output file not found" },
        { status: 500 }
      );
    }

    const fileBuffer = fs.readFileSync(outputPath);

    // Clean up temp file
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Non-critical
    }

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
    console.error("[render] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
