import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';

export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
  }

  preload(): void {
    // 1. Critical Assets (Must be loaded before create() is called)
    // These are small and essential for the Start Screen's first frame.
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.gameLogo, ASSET_URL.gameLogo);
    this.load.image(TEXTURE_KEYS.playButton, ASSET_URL.playButton);
    this.load.image(TEXTURE_KEYS.diamond, ASSET_URL.diamond);
    this.load.image(TEXTURE_KEYS.swipeTrail, ASSET_URL.swipeTrail);
    this.load.audio(TEXTURE_KEYS.playSound, ASSET_URL.playSound);

    // 2. Non-Critical Assets (Load in background)
    // We start these in preload, but we'll allow the scene to start 
    // even if they are still in flight, ensuring faster "gameReady".
    this.load.image(TEXTURE_KEYS.table, ASSET_URL.table);
    this.load.image(TEXTURE_KEYS.closedGoblet, ASSET_URL.closedGoblet);
    this.load.image(TEXTURE_KEYS.openGoblet, ASSET_URL.openGoblet);
    this.load.image(TEXTURE_KEYS.pauseButton, ASSET_URL.pauseButton);
    this.load.image(TEXTURE_KEYS.audioOn, ASSET_URL.audioOn);
    this.load.image(TEXTURE_KEYS.audioOff, ASSET_URL.audioOff);
    this.load.image(TEXTURE_KEYS.sparkle, ASSET_URL.sparkle);
    
    // Music is usually the largest file, so we load it last
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
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

    const gemLeft = this.add
      .image(w * 0.15, h * 0.12, TEXTURE_KEYS.diamond)
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setScale(0.55 * (w / 720));
    const gemRight = this.add
      .image(w * 0.85, h * 0.15, TEXTURE_KEYS.diamond)
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setScale(0.48 * (w / 720))
      .setAngle(15);

    this.tweens.add({
      targets: [gemLeft, gemRight],
      y: '+=20',
      angle: '+=15',
      alpha: { from: 0.6, to: 1.0 },
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const swipe = this.add
      .image(cx, h * 0.7, TEXTURE_KEYS.swipeTrail)
      .setOrigin(0.5, 0.5)
      .setAlpha(0.2);
    swipe.setScale(Math.min((w * 1.1) / swipe.width, 0.6));
    swipe.setDepth(5);
    this.tweens.add({
      targets: swipe,
      alpha: { from: 0.1, to: 0.3 },
      scaleX: '+=0.05',
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const logo = this.add
      .image(cx, h * 0.2, TEXTURE_KEYS.gameLogo)
      .setOrigin(0.5)
      .setDepth(20);

    const logoScale = Math.min((w * 1.1) / logo.width, (h * 0.4) / logo.height);
    logo.setScale(logoScale);

    const instructionText = this.add
      .text(cx, h * 0.45, 'Track the royal gem.\nDon\'t blink.', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(34 * (w / 720))}px`,
        color: '#f4e4bc',
        align: 'center',
        stroke: '#1a0510',
        strokeThickness: 4,
        lineSpacing: 10,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: instructionText,
      alpha: { from: 0.8, to: 1 },
      scale: 1.03,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const play = this.add
      .image(cx, h * 0.7, TEXTURE_KEYS.playButton)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);

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
