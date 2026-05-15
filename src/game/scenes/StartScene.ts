import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';

export class StartScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;
  private vignette!: Phaser.GameObjects.Graphics;
  private gemLeft!: Phaser.GameObjects.Image;
  private gemRight!: Phaser.GameObjects.Image;
  private swipe!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;
  private playButton!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'StartScene' });
  }

  private isBackgroundLoadingComplete = false;

  preload(): void {
    // 1. Critical Assets (Must be loaded before create() is called)
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.gameLogo, ASSET_URL.gameLogo);
    this.load.image(TEXTURE_KEYS.playButton, ASSET_URL.playButton);
    this.load.image(TEXTURE_KEYS.diamond, ASSET_URL.diamond);
    this.load.image(TEXTURE_KEYS.swipeTrail, ASSET_URL.swipeTrail);
    this.load.audio(TEXTURE_KEYS.playSound, ASSET_URL.playSound);

    // Error handling for loader
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Error loading asset: ${file.key}`, file.src);
    });
  }

  create(): void {
    // 2. Start loading non-critical assets in the background
    this.load.image(TEXTURE_KEYS.table, ASSET_URL.table);
    this.load.image(TEXTURE_KEYS.closedGoblet, ASSET_URL.closedGoblet);
    this.load.image(TEXTURE_KEYS.openGoblet, ASSET_URL.openGoblet);
    this.load.image(TEXTURE_KEYS.pauseButton, ASSET_URL.pauseButton);
    this.load.image(TEXTURE_KEYS.audioOn, ASSET_URL.audioOn);
    this.load.image(TEXTURE_KEYS.audioOff, ASSET_URL.audioOff);
    this.load.image(TEXTURE_KEYS.sparkle, ASSET_URL.sparkle);
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
    
    this.load.once('complete', () => {
      this.isBackgroundLoadingComplete = true;
      console.log('Background loading complete');
    });
    this.load.start();

    // Signal to YouTube that the game is interactive
    if (typeof (window as any).gameReady === 'function') {
      (window as any).gameReady();
    }

    const startMusic = () => {
      if (this.cache.audio.exists(TEXTURE_KEYS.backgroundTone)) {
        if (!this.sound.get(TEXTURE_KEYS.backgroundTone)) {
          this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
        } else if (!this.sound.get(TEXTURE_KEYS.backgroundTone).isPlaying) {
          this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
        }
      }
    };

    startMusic();
    this.input.once('pointerdown', () => {
      startMusic();
    });

    // Initialize objects
    this.bg = this.add.image(0, 0, TEXTURE_KEYS.background).setOrigin(0.5);
    this.vignette = this.add.graphics();
    
    this.gemLeft = this.add.image(0, 0, TEXTURE_KEYS.diamond).setOrigin(0.5).setAlpha(0.85);
    this.gemRight = this.add.image(0, 0, TEXTURE_KEYS.diamond).setOrigin(0.5).setAlpha(0.75).setAngle(15);

    this.tweens.add({
      targets: [this.gemLeft, this.gemRight],
      y: '+=20',
      angle: '+=15',
      alpha: { from: 0.6, to: 1.0 },
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.swipe = this.add.image(0, 0, TEXTURE_KEYS.swipeTrail).setOrigin(0.5, 0.5).setAlpha(0.2).setDepth(5);
    this.tweens.add({
      targets: this.swipe,
      alpha: { from: 0.1, to: 0.3 },
      scaleX: '+=0.05',
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.logo = this.add.image(0, 0, TEXTURE_KEYS.gameLogo).setOrigin(0.5).setDepth(20);

    this.instructionText = this.add
      .text(0, 0, 'Track the royal gem.\nDon\'t blink.', {
        fontFamily: '"Cinzel", Georgia, serif',
        color: '#f4e4bc',
        align: 'center',
        stroke: '#1a0510',
        strokeThickness: 5,
        lineSpacing: 10,
        padding: { x: 10, y: 10 },
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 6, stroke: true, fill: true }
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setResolution(3);

    this.tweens.add({
      targets: this.instructionText,
      alpha: { from: 0.8, to: 1 },
      scale: 1.03,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.playButton = this.add
      .image(0, 0, TEXTURE_KEYS.playButton)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(15);

    this.playButton.on('pointerover', () => {
      this.playButton.setTint(0xfff2d0);
    });
    this.playButton.on('pointerout', () => {
      this.playButton.clearTint();
    });

    const startGame = () => {
      if (this.isBackgroundLoadingComplete) {
        this.sound.play(TEXTURE_KEYS.playSound, { volume: 0.8 });
        this.scene.start('GameScene');
      } else {
        // Change text to show we are waiting for assets
        this.instructionText.setText('Channelling spirits...\n(Loading assets)');
        this.playButton.setAlpha(0.5);
        this.playButton.disableInteractive();
        
        this.load.once('complete', () => {
          this.isBackgroundLoadingComplete = true;
          this.sound.play(TEXTURE_KEYS.playSound, { volume: 0.8 });
          this.scene.start('GameScene');
        });
      }
    };

    this.playButton.on('pointerup', startGame);

    // Initial layout
    this.refreshLayout();

    // Listen for resize
    this.scale.on('resize', () => {
      this.refreshLayout();
    });
  }

  private refreshLayout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    this.bg.setPosition(cx, cy);
    const cover = Math.max(w / this.bg.width, h / this.bg.height) * 1.02;
    this.bg.setScale(cover);

    this.vignette.clear();
    this.vignette.fillGradientStyle(0x1a0510, 0x1a0510, 0x0a0208, 0x0a0208, 0.55, 0.55, 0.75, 0.75);
    this.vignette.fillRect(0, 0, w, h);

    this.gemLeft.setPosition(w * 0.15, h * 0.12);
    this.gemLeft.setScale(0.55 * (w / 720));

    this.gemRight.setPosition(w * 0.85, h * 0.15);
    this.gemRight.setScale(0.48 * (w / 720));

    this.swipe.setPosition(cx, h * 0.7);
    this.swipe.setScale(Math.min((w * 1.1) / this.swipe.width, 0.6));

    this.logo.setPosition(cx, h * 0.2);
    const logoScale = Math.min((w * 1.1) / this.logo.width, (h * 0.4) / this.logo.height);
    this.logo.setScale(logoScale);

    this.instructionText.setPosition(cx, h * 0.45);
    this.instructionText.setStyle({
      fontSize: `${Math.round(34 * (w / 720))}px`,
    });

    this.playButton.setPosition(cx, h * 0.7);
    const playScale = Math.min((w * 0.92) / this.playButton.width, (h * 0.38) / this.playButton.height);
    this.playButton.setScale(playScale);

    // If there were any active tweens that modify scale, they might need adjustment,
    // but here the tweens are relative or alpha-based, so they should be fine.
    // The play button pulse tween targets 'scale', which might conflict with setScale here.
    // To be safe, we can restart the pulse tween or use a separate container.
    // For now, let's just update the base scale and let the tween continue.
    this.tweens.killTweensOf(this.playButton);
    this.tweens.add({
      targets: this.playButton,
      scale: playScale * 1.06,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
