import type { ComponentType } from 'react';

export interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export const COMPOSITION_CONFIGS: Record<string, CompositionConfig> = {
  // Dynamic reel — duration computed server-side via calculateMetadata.
  Reel: { durationInFrames: 229, fps: 30, width: 1080, height: 1920 },
  HtmlSlideVideo: { durationInFrames: 300, fps: 30, width: 1080, height: 1920 },
};

/** Dynamically import a composition component by its ID */
export async function loadCompositionComponent(
  compId: string
): Promise<ComponentType> {
  if (compId === 'Reel') {
    return (await import('../remotion/compositions/Reel')).Reel as unknown as ComponentType;
  }

  if (compId === 'HtmlSlideVideo') {
    return (await import('../remotion/compositions/HtmlSlideVideo')).HtmlSlideVideo as unknown as ComponentType;
  }

  // Unknown id → Gemma-generated file.
  if (!/^[A-Za-z0-9_-]+$/.test(compId)) {
    throw new Error(`Unsafe composition id: ${compId}`);
  }

  // Retry up to 4 times with increasing delays.
  // The agent writes the TSX file right before sending the reel_spec SSE event.
  // Turbopack may need a moment to compile the new file before the dynamic import works.
  const RETRY_DELAYS = [0, 400, 1000, 2500];
  let lastErr: Error | null = null;

  for (const delay of RETRY_DELAYS) {
    if (delay > 0) {
      await new Promise<void>((res) => setTimeout(res, delay));
    }
    try {
      const mod: Record<string, unknown> = await import(
        /* webpackInclude: /\.tsx$/ */
        /* webpackMode: "lazy" */
        `../remotion/compositions/${compId}.tsx`
      );
      const comp = (mod[compId] ?? mod.default) as ComponentType | undefined;
      if (!comp) throw new Error(`Module loaded but missing export '${compId}'`);
      return comp;
    } catch (e) {
      lastErr = e as Error;
    }
  }

  throw new Error(`Could not load composition '${compId}' after retries: ${lastErr?.message ?? "unknown error"}`);
}
