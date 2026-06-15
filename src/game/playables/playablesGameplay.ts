import Phaser from 'phaser';

export const PLAYABLES_LAYOUT_EVENT = 'playables-layout';

const GAMEPLAY_SCENE_KEYS = ['GameScene', 'StartScene'] as const;

/**
 * Scenes that participate in YouTube host pause/resume. Pause/resume is driven
 * solely by the host (no in-game pause UI). The reconciler in playablesHostPause
 * owns input/time/tween state; scenes only react with their own scene-local UI.
 */
export interface PlayablesGameplayHost {
  /** Host pause began — scene-local freeze hook (e.g. pause decorative tweens). */
  applyPausedUi(): void;
  /** Host resume — scene-local thaw hook (e.g. restore gameplay interactivity). */
  applyRunningUi(): void;
}

export function isGameplayHost(
  scene: Phaser.Scene,
): scene is Phaser.Scene & PlayablesGameplayHost {
  const host = scene as unknown as PlayablesGameplayHost;
  return (
    typeof host.applyPausedUi === 'function' &&
    typeof host.applyRunningUi === 'function'
  );
}

function isSceneRunning(scene: Phaser.Scene): boolean {
  return scene.scene.isActive() || scene.sys.isActive();
}

/** Prefer known gameplay scenes; fall back to Scene Manager active list. */
export function forEachGameplayScene(
  game: Phaser.Game,
  fn: (scene: Phaser.Scene) => void,
): void {
  let hit = false;

  for (const key of GAMEPLAY_SCENE_KEYS) {
    const scene = game.scene.getScene(key);
    if (scene && isSceneRunning(scene)) {
      hit = true;
      fn(scene);
    }
  }

  if (hit) return;

  for (const scene of game.scene.getScenes(true)) {
    fn(scene);
  }
}

export function refreshPlayablesDisplay(game: Phaser.Game): void {
  if (game.scale.width < 1 || game.scale.height < 1) return;
  game.scale.refresh();
  game.events.emit(PLAYABLES_LAYOUT_EVENT);
}
