/** Duration for TransitionSeries: scenes overlap at transitions. Pure math — safe for client + server. */
export function computeHtmlSlideVideoDuration(
  sceneCount: number,
  sceneLen = 90,
  transLen = 12
): number {
  if (sceneCount <= 0) return 30;
  return sceneCount * sceneLen - Math.max(0, sceneCount - 1) * transLen;
}
