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

/**
 * Phaser pauses/blurs its own main loop when the iframe loses focus or visibility
 * (Game.onBlur -> TimeStep.blur sets inFocus=false, which makes step() skip all
 * updates and rendering). The YouTube host's resume does NOT restore browser focus
 * to the iframe, so the loop stays frozen until a page refresh. Force the loop back
 * to a running, focused state on every resume. All calls are safe no-ops when the
 * loop is already awake/focused.
 */
export function wakePhaserLoop(game: Phaser.Game): void {
  const loop = game.loop as Phaser.Core.TimeStep | undefined;
  if (!loop) return;
  if (typeof loop.wake === 'function') loop.wake();
  if (typeof loop.focus === 'function') loop.focus();
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
  // Restart Phaser's main loop before anything else so the game can never stay
  // frozen, then resume gameplay state and finally re-layout for the new size.
  wakePhaserLoop(game);
  resumeAllGameplay(game);
  refreshPlayablesDisplay(game);
}
