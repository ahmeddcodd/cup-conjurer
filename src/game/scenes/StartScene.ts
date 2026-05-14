import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';

export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  preload(): void {
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.playButton, ASSET_URL.playButton);
    this.load.image(TEXTURE_KEYS.sparkle, ASSET_URL.sparkle);
    this.load.image(TEXTURE_KEYS.swipeTrail, ASSET_URL.swipeTrail);
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
    this.load.audio(TEXTURE_KEYS.playSound, ASSET_URL.playSound);
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    const startMusic = () => {
      if (!this.sound.get(TEXTURE_KEYS.backgroundTone)) {
        this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
      } else if (!this.sound.get(TEXTURE_KEYS.backgroundTone).isPlaying) {
        this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
      }
    };

    // Try to play immediately (might be blocked by browser)
    startMusic();

    // Also trigger on first interaction to unlock audio context reliably
    this.input.once('pointerdown', () => {
      startMusic();
    });

    const bg = this.add.image(cx, cy, TEXTURE_KEYS.background).setOrigin(0.5);
    const cover = Math.max(w / bg.width, h / bg.height) * 1.02;
    bg.setScale(cover);

    const vignette = this.add.graphics();
    vignette.fillGradientStyle(0x1a0510, 0x1a0510, 0x0a0208, 0x0a0208, 0.55, 0.55, 0.75, 0.75);
    vignette.fillRect(0, 0, w, h);

    const sparkleLeft = this.add
      .image(w * 0.12, h * 0.18, TEXTURE_KEYS.sparkle)
      .setOrigin(0.5)
      .setAlpha(0.55)
      .setScale(0.35 * (w / 720));
    const sparkleRight = this.add
      .image(w * 0.88, h * 0.22, TEXTURE_KEYS.sparkle)
      .setOrigin(0.5)
      .setAlpha(0.45)
      .setScale(0.28 * (w / 720))
      .setAngle(22);

    this.tweens.add({
      targets: [sparkleLeft, sparkleRight],
      angle: '+=8',
      alpha: { from: 0.35, to: 0.75 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const swipe = this.add
      .image(cx, h * 0.28, TEXTURE_KEYS.swipeTrail)
      .setOrigin(0.5, 0.5)
      .setAlpha(0.25);
    swipe.setScale(Math.min((w * 0.85) / swipe.width, 0.4));
    this.tweens.add({
      targets: swipe,
      alpha: { from: 0.12, to: 0.38 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const title = this.add
      .text(cx, h * 0.07, 'CUP CONJURER', {
        fontFamily: '"Cinzel", "Palatino Linotype", Georgia, serif',
        fontSize: `${Math.round(44 * (w / 720))}px`,
        color: '#f4e4bc',
        stroke: '#3d2914',
        strokeThickness: 6,
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, title.y + title.height * 0.55, 'Kingdom — Throne of the Hidden Gem', {
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: `${Math.round(22 * (w / 720))}px`,
        fontStyle: 'italic',
        color: '#d4b896',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, h * 0.2, 'Track the royal goblet. Endless rounds. One wrong tap ends the run.', {
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: `${Math.round(18 * (w / 720))}px`,
        color: '#c9b59a',
        align: 'center',
        wordWrap: { width: w * 0.82 },
      })
      .setOrigin(0.5);

    const play = this.add
      .image(cx, cy, TEXTURE_KEYS.playButton)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const playScale = Math.min((w * 0.92) / play.width, (h * 0.38) / play.height);
    play.setScale(playScale);

    this.tweens.add({
      targets: play,
      scale: playScale * 1.06,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    play.on('pointerover', () => {
      play.setTint(0xfff2d0);
    });
    play.on('pointerout', () => {
      play.clearTint();
    });
    play.on('pointerup', () => {
      this.sound.play(TEXTURE_KEYS.playSound, { volume: 0.8 });
      this.scene.start('GameScene');
    });
  }
}
