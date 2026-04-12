import type { ComponentType } from 'react';

export interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export const COMPOSITION_CONFIGS: Record<string, CompositionConfig> = {
  DubaiHistoryVideo:       { durationInFrames: 920, fps: 30, width: 1080, height: 1920 },
  AIVideo:                 { durationInFrames: 300, fps: 30, width: 1080, height: 1080 },
  LogoReveal:              { durationInFrames: 90,  fps: 30, width: 1080, height: 1080 },
  'SocialReel-tiktok':    { durationInFrames: 450, fps: 30, width: 1080, height: 1920 },
  'SocialReel-reels':     { durationInFrames: 900, fps: 30, width: 1080, height: 1920 },
  'SocialReel-shorts':    { durationInFrames: 600, fps: 30, width: 1080, height: 1920 },
  'SocialReel-pinterest': { durationInFrames: 300, fps: 30, width: 1000, height: 1500 },
  'SocialReel-x':         { durationInFrames: 450, fps: 30, width: 1920, height: 1080 },
};

/** Map a composition ID to the file that exports the React component */
function compIdToFilename(compId: string): string {
  if (compId.startsWith('SocialReel-')) return 'SocialReel';
  return compId;
}

/** Dynamically import a composition component by its ID */
export async function loadCompositionComponent(
  compId: string
): Promise<ComponentType> {
  const filename = compIdToFilename(compId);
  // Dynamic imports must have a static-enough prefix for bundlers
  switch (filename) {
    case 'AIVideo':
      return (await import('../remotion/compositions/AIVideo')).AIVideo as ComponentType;
    case 'DubaiHistoryVideo':
      return (await import('../remotion/compositions/DubaiHistoryVideo')).DubaiHistoryVideo as ComponentType;
    case 'LogoReveal':
      return (await import('../remotion/compositions/LogoReveal')).LogoReveal as ComponentType;
    case 'SocialReel':
      return (await import('../remotion/compositions/SocialReel')).SocialReel as ComponentType;
    default:
      throw new Error(`Unknown composition: ${compId}`);
  }
}
