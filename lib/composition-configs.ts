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

/** Map a composition ID to the file that exports the React component */
function compIdToFilename(compId: string): string {
  return compId;
}

/** Dynamically import a composition component by its ID */
export async function loadCompositionComponent(
  compId: string
): Promise<ComponentType> {
  const filename = compIdToFilename(compId);
  
  if (filename === 'Reel') {
    return (await import('../remotion/compositions/Reel')).Reel as unknown as ComponentType;
  }

  if (filename === 'HtmlSlideVideo') {
    return (await import('../remotion/compositions/HtmlSlideVideo')).HtmlSlideVideo as unknown as ComponentType;
  }

  // Unknown id → Gemma-generated file.
  if (!/^[A-Za-z0-9_-]+$/.test(filename)) {
    throw new Error(`Unsafe composition id: ${compId}`);
  }
  try {
    const mod: Record<string, unknown> = await import(
      /* webpackInclude: /\.tsx$/ */
      /* webpackMode: "lazy" */
      `../remotion/compositions/${filename}.tsx`
    );
    const comp = (mod[filename] ?? mod.default) as ComponentType | undefined;
    if (!comp) throw new Error(`Module loaded but missing export '${filename}'`);
    return comp;
  } catch (e) {
    throw new Error(`Could not load composition '${compId}': ${(e as Error).message}`);
  }
}
