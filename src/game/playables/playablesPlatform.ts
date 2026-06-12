import Phaser from 'phaser';
import { refreshPlayablesDisplay } from './playablesGameplay';
import {
  beginPlatformPause,
  completePlatformResume,
  isPlatformPaused,
  wakePhaserLoop,
} from './playablesHostPause';

export { completePlatformResume, isPlatformPaused } from './playablesHostPause';

export function hasYtGame(): boolean {
  return typeof ytgame !== 'undefined';
}

export function isInPlayablesEnv(): boolean {
  return hasYtGame() && ytgame.IN_PLAYABLES_ENV;
}

let firstFrameNotified = false;
let gameReadyNotified = false;

export function notifyFirstFrameReady(): void {
  if (firstFrameNotified) return;
  firstFrameNotified = true;

  if (hasYtGame() && ytgame.game?.firstFrameReady) {
    ytgame.game.firstFrameReady();
    return;
  }

  const legacy = (window as Window & { firstFrameReady?: () => void }).firstFrameReady;
  if (typeof legacy === 'function') {
    legacy();
  }
}

export function notifyGameReady(): void {
  if (gameReadyNotified) return;
  if (!firstFrameNotified) {
    notifyFirstFrameReady();
  }
  gameReadyNotified = true;

  if (hasYtGame() && ytgame.game?.gameReady) {
    ytgame.game.gameReady();
    return;
  }

  const legacy = (window as Window & { gameReady?: () => void }).gameReady;
  if (typeof legacy === 'function') {
    legacy();
  }
}

export function bindFirstFrameReady(game: Phaser.Game): void {
  game.events.once(Phaser.Core.Events.POST_RENDER, () => {
    notifyFirstFrameReady();
  });
}

export function bindPlayablesPauseResume(game: Phaser.Game): void {
  if (!hasYtGame() || !ytgame.system?.onPause || !ytgame.system?.onResume) {
    return;
  }

  ytgame.system.onPause(() => {
    beginPlatformPause(game);
  });

  ytgame.system.onResume(() => {
    completePlatformResume(game);
  });
}

export function bindPlayablesResize(game: Phaser.Game, parent: HTMLElement): void {
  const onLayout = () => {
    if (parent.clientWidth < 1 || parent.clientHeight < 1) return;
    refreshPlayablesDisplay(game);
  };

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(onLayout);
    ro.observe(parent);
  }

  window.addEventListener('resize', onLayout);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      requestAnimationFrame(onLayout);
      // Wake the render loop (Phaser's blur can leave it frozen), but never end a
      // host pause here — only ytgame onResume / the unmute workaround may do that.
      requestAnimationFrame(() => wakePhaserLoop(game));
    }
  });
}

export function bindWebGLContextRecovery(game: Phaser.Game): void {
  const canvas = game.canvas;
  if (!canvas) return;

  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
    },
    false,
  );

  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      requestAnimationFrame(() => {
        refreshPlayablesDisplay(game);
        if (isPlatformPaused()) {
          // Keep the host pause; just make sure the loop renders again.
          wakePhaserLoop(game);
        } else {
          completePlatformResume(game);
        }
      });
    },
    false,
  );
}

// Re-export layout event for scenes.
export { PLAYABLES_LAYOUT_EVENT } from './playablesGameplay';
