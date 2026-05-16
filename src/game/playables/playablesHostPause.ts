import Phaser from 'phaser';
import {
  pauseAllGameplay,
  refreshPlayablesDisplay,
  resumeAllGameplay,
} from './playablesGameplay';

let platformPaused = false;

export function isPlatformPaused(): boolean {
  return platformPaused;
}

export function beginPlatformPause(game: Phaser.Game): void {
  if (platformPaused) return;
  platformPaused = true;
  pauseAllGameplay(game);
}

/**
 * End a YouTube host pause. Call from onResume and when the suite unmutes
 * without firing onResume.
 */
export function completePlatformResume(game: Phaser.Game): void {
  if (!platformPaused) return;

  platformPaused = false;
  refreshPlayablesDisplay(game);
  resumeAllGameplay(game);
}
