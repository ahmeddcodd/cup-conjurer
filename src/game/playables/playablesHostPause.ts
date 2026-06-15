import Phaser from 'phaser';
import {
  forEachGameplayScene,
  isGameplayHost,
  refreshPlayablesDisplay,
} from './playablesGameplay';
import { pausePlayablesSounds, resumePlayablesSounds } from './playablesAudio';

let platformPaused = false;

export function isPlatformPaused(): boolean {
  return platformPaused;
}

/**
 * Phaser pauses/blurs its own main loop when the iframe loses focus or visibility
 * (Game.onBlur -> TimeStep.blur sets inFocus=false, which makes step() skip all
 * updates and rendering). The YouTube host's resume does NOT restore browser focus
 * to the iframe, so the loop stays frozen until a page refresh. Force the loop back
 * to a running, focused state. All calls are safe no-ops when already awake/focused.
 */
export function wakePhaserLoop(game: Phaser.Game): void {
  const loop = game.loop as Phaser.Core.TimeStep | undefined;
  if (!loop) return;
  if (typeof loop.wake === 'function') loop.wake();
  if (typeof loop.focus === 'function') loop.focus();
}

let reconciling = false;

/**
 * Single source of truth: reconcile Phaser input/loop/time/tween state to the
 * host pause flag. Pause/resume is driven solely by the YouTube host. Idempotent —
 * safe to call after any callback (pause, resume, unmute, resize) in any order.
 *
 * Does NOT emit a layout refresh itself: a scene's `refreshLayout` calls back into
 * this function, so emitting `PLAYABLES_LAYOUT_EVENT` here would recurse. Callers
 * that change size (resume, resize) own the `refreshPlayablesDisplay` call. The
 * `reconciling` guard also hard-stops any unexpected re-entrancy.
 */
export function applyEffectivePause(game: Phaser.Game): void {
  if (reconciling) return;
  reconciling = true;
  try {
    // input.enabled stays TRUE in both states so HUD controls (e.g. the audio
    // toggle) keep working; gameplay is frozen via time.paused + tween pause, and
    // gameplay taps (cup guesses) are separately gated by an isPlatformPaused check.
    if (game.input) game.input.enabled = true;

    if (platformPaused) {
      pausePlayablesSounds(game);
      forEachGameplayScene(game, (scene) => {
        scene.input.enabled = true;
        scene.time.paused = true;
        scene.tweens.pauseAll();
        if (isGameplayHost(scene)) scene.applyPausedUi();
      });
      return;
    }

    // Settling into running: wake the loop first so we can never stay frozen.
    wakePhaserLoop(game);
    forEachGameplayScene(game, (scene) => {
      scene.input.enabled = true;
      scene.time.paused = false;
      scene.tweens.resumeAll();
      if (isGameplayHost(scene)) scene.applyRunningUi();
    });
    resumePlayablesSounds(game);
  } finally {
    reconciling = false;
  }
}

export function beginPlatformPause(game: Phaser.Game): void {
  if (platformPaused) return;
  platformPaused = true;
  applyEffectivePause(game);
}

/**
 * End a YouTube host pause: resume gameplay directly. Always wakes the loop and
 * re-lays-out, even on a duplicate/late onResume, so the loop can never stay frozen.
 */
export function completePlatformResume(game: Phaser.Game): void {
  platformPaused = false;
  wakePhaserLoop(game);
  applyEffectivePause(game);
  refreshPlayablesDisplay(game);
}
