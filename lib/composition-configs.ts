export interface CompositionConfig {
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export const COMPOSITION_CONFIGS: Record<string, CompositionConfig> = {
  HtmlVideo: { durationInFrames: 300, fps: 30, width: 1080, height: 1920 },
};
