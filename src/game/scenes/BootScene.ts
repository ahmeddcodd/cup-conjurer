import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';
import { notifyFirstFrameReady } from '../playables/playablesPlatform';

/**
 * BootScene — paints a gold progress bar on the black canvas immediately (the very
 * first rendered frame), loads ALL game assets behind it, then hands off to
 * StartScene. This removes the initial "purple lag": there is never a dead colour
 * fill, only an intentional loading bar, and StartScene/GameScene need no preload
 * because everything is already cached.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createLoadingBar();

    // Tell YouTube the moment the loading screen actually renders. firstFrameReady
    // MUST precede gameReady (StartScene sends gameReady once it is interactive).
    this.events.once(Phaser.Scenes.Events.RENDER, () => notifyFirstFrameReady());

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Error loading asset: ${file.key}`, file.src);
    });

    // Every asset the game uses — one place, loaded up front behind the bar.
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.gameLogo, ASSET_URL.gameLogo);
    this.load.image(TEXTURE_KEYS.playButton, ASSET_URL.playButton);
    this.load.image(TEXTURE_KEYS.diamond, ASSET_URL.diamond);
    this.load.image(TEXTURE_KEYS.swipeTrail, ASSET_URL.swipeTrail);
    this.load.image(TEXTURE_KEYS.table, ASSET_URL.table);
    this.load.image(TEXTURE_KEYS.closedGoblet, ASSET_URL.closedGoblet);
    this.load.image(TEXTURE_KEYS.openGoblet, ASSET_URL.openGoblet);
    this.load.image(TEXTURE_KEYS.audioOn, ASSET_URL.audioOn);
    this.load.image(TEXTURE_KEYS.audioOff, ASSET_URL.audioOff);
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
    this.load.audio(TEXTURE_KEYS.playSound, ASSET_URL.playSound);
    this.load.audio(TEXTURE_KEYS.correctSound, ASSET_URL.correctSound);
  }

  create(): void {
    this.scene.start('StartScene');
  }

  /** Centered gold progress bar on black (asset-free → paints on the first frame). */
  private createLoadingBar(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const barWidth = w * 0.56;
    const barHeight = Math.round(20 * (w / 720));
    const x = (w - barWidth) / 2;
    const y = h / 2 - barHeight / 2;
    const pad = 4;

    // "LOADING" label above the bar.
    const label = this.add
      .text(w / 2, y - barHeight - 18 * (w / 720), 'LOADING', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(26 * (w / 720))}px`,
        color: '#ffd873',
      })
      .setOrigin(0.5);

    // Dark track + bright gold frame so it's clearly visible on black.
    const frame = this.add.graphics();
    frame.fillStyle(0x1a1206, 1);
    frame.fillRect(x - pad, y - pad, barWidth + pad * 2, barHeight + pad * 2);
    frame.lineStyle(2, 0xffd873, 1);
    frame.strokeRect(x - pad, y - pad, barWidth + pad * 2, barHeight + pad * 2);

    const bar = this.add.graphics();
    const draw = (value: number) => {
      bar.clear();
      bar.fillStyle(0xffd873, 1);
      bar.fillRect(x, y, Math.max(0, barWidth * value), barHeight);
    };
    draw(0);
    this.load.on('progress', draw);

    this.load.once('complete', () => {
      bar.destroy();
      frame.destroy();
      label.destroy();
    });
  }
}
