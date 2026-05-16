import Phaser from 'phaser';
import { pausePlayablesSounds, resumePlayablesSounds } from './playablesAudio';

export const PLAYABLES_LAYOUT_EVENT = 'playables-layout';

const GAMEPLAY_SCENE_KEYS = ['GameScene', 'StartScene'] as const;

/** Scenes that participate in YouTube host pause/resume. */
export interface PlayablesGameplayHost {
  handlePlatformPause(): void;
  handlePlatformResume(): void;
}

function isGameplayHost(scene: Phaser.Scene): scene is Phaser.Scene & PlayablesGameplayHost {
  const host = scene as unknown as PlayablesGameplayHost;
  return (
    typeof host.handlePlatformPause === 'function' &&
    typeof host.handlePlatformResume === 'function'
  );
}

function isSceneRunning(scene: Phaser.Scene): boolean {
  return scene.scene.isActive() || scene.sys.isActive();
}

/** Prefer known gameplay scenes; fall back to Scene Manager active list. */
function forEachRunningScene(game: Phaser.Game, fn: (scene: Phaser.Scene) => void): void {
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

function pauseSceneSystems(scene: Phaser.Scene): void {
  scene.input.enabled = false;
  scene.tweens.pauseAll();
  scene.time.paused = true;
}

function resumeSceneSystems(scene: Phaser.Scene): void {
  scene.input.enabled = true;
  scene.time.paused = false;
  scene.tweens.resumeAll();
}

function setGameInputEnabled(game: Phaser.Game, enabled: boolean): void {
  if (game.input) {
    game.input.enabled = enabled;
  }
}

export function pauseAllGameplay(game: Phaser.Game): void {
  setGameInputEnabled(game, false);
  pausePlayablesSounds(game);

  forEachRunningScene(game, (scene) => {
    if (isGameplayHost(scene)) {
      scene.handlePlatformPause();
      return;
    }
    pauseSceneSystems(scene);
  });
}

export function resumeAllGameplay(game: Phaser.Game): void {
  setGameInputEnabled(game, true);

  forEachRunningScene(game, (scene) => {
    if (isGameplayHost(scene)) {
      scene.handlePlatformResume();
      return;
    }
    resumeSceneSystems(scene);
  });

  resumePlayablesSounds(game);
}

export function refreshPlayablesDisplay(game: Phaser.Game): void {
  if (game.scale.width < 1 || game.scale.height < 1) return;
  game.scale.refresh();
  game.events.emit(PLAYABLES_LAYOUT_EVENT);
}
