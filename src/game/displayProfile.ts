/** Design resolution for Cup Conjurer (9:16 playable). */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/** Cap DPR for YouTube Playables (used if we add DPR scaling later). */
export const MAX_PIXEL_RATIO = 2;

export function getPlayablePixelRatio(): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}
