import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../assets';
import { ensureBackgroundMusic, playSound, unlockAudioContextOnGesture } from '../playables/playablesAudio';
import {
  PLAYABLES_LAYOUT_EVENT,
  type PlayablesGameplayHost,
} from '../playables/playablesGameplay';
import { isPlatformPaused, notifyGameReady } from '../playables/playablesPlatform';
import { getLoadedSave } from '../playables/playablesSave';

export class StartScene extends Phaser.Scene implements PlayablesGameplayHost {
  private bg!: Phaser.GameObjects.Image;
  private vignette!: Phaser.GameObjects.Graphics;
  private gemLeft!: Phaser.GameObjects.Image;
  private gemRight!: Phaser.GameObjects.Image;
  private swipe!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private instructionText!: Phaser.GameObjects.Text;
  private bestStreakText!: Phaser.GameObjects.Text;
  private playButton!: Phaser.GameObjects.Image;
  private playButtonPulse?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: 'StartScene' });
  }

  create(): void {
    // All assets were already loaded up front by BootScene, so there is no
    // preload()/deferred loading here — the start screen paints immediately.
    const startMusic = () => {
      ensureBackgroundMusic(this);
    };

    startMusic();
    this.input.once('pointerdown', () => {
      unlockAudioContextOnGesture(this.game);
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
      .setDepth(20);

    this.tweens.add({
      targets: this.instructionText,
      alpha: { from: 0.8, to: 1 },
      scale: 1.03,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const bestStreak = getLoadedSave()?.bestStreak ?? 0;
    this.bestStreakText = this.add
      .text(0, 0, bestStreak > 0 ? `Best streak: ${bestStreak}` : '', {
        fontFamily: '"Cinzel", Georgia, serif',
        color: '#ffe29a',
        align: 'center',
        stroke: '#1a0510',
        strokeThickness: 4,
        padding: { x: 8, y: 6 },
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, stroke: true, fill: true }
      })
      .setOrigin(0.5)
      .setDepth(20);

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
      // All assets are already loaded by BootScene — start instantly, no loading
      // text. RS_06: never reset the save here; GameScene resumes the stored run.
      unlockAudioContextOnGesture(this.game);
      playSound(this, TEXTURE_KEYS.playSound, { volume: 0.8 });
      this.scene.start('GameScene');
    };

    this.playButton.on('pointerup', startGame);

    // Initial layout
    this.refreshLayout();

    notifyGameReady();

    // Listen for resize
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshLayout, this);

    this.game.events.on(PLAYABLES_LAYOUT_EVENT, this.refreshLayout, this);

    // Phaser does not auto-call shutdown(); bind it so listeners detach on scene.start().
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  // --- PlayablesGameplayHost: host-driven pause/resume only. The reconciler
  // freezes input/time/tweens; the scene just pauses its decorative pulse. ---

  applyPausedUi(): void {
    this.playButtonPulse?.pause();
  }

  applyRunningUi(): void {
    this.playButtonPulse?.resume();
  }

  shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshLayout, this);
    this.game.events.off(PLAYABLES_LAYOUT_EVENT, this.refreshLayout, this);
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

    this.instructionText.setPosition(cx, h * 0.43);
    this.instructionText.setStyle({
      fontSize: `${Math.round(34 * (w / 720))}px`,
    });

    this.playButton.setPosition(cx, h * 0.72);
    const playScale = Math.min((w * 0.92) / this.playButton.width, (h * 0.38) / this.playButton.height);
    this.playButton.setScale(playScale);

    // Place the best-streak text in the gap between the instruction text and the
    // play button's *visible* top. The shield fills ~84% of its (square) sprite
    // vertically, so the visible top is ~0.42 * displayHeight above the center —
    // use that instead of the full half-height bounding box (lots of transparent
    // padding) to keep clear space and avoid overlapping the shield's top point.
    this.bestStreakText.setStyle({
      fontSize: `${Math.round(26 * (w / 720))}px`,
    });
    const instructionBottom = this.instructionText.y + this.instructionText.displayHeight / 2;
    const playButtonVisibleTop = this.playButton.y - this.playButton.displayHeight * 0.42;
    this.bestStreakText.setPosition(cx, (instructionBottom + playButtonVisibleTop) / 2);

    // The pulse tween targets 'scale', which conflicts with setScale above, so
    // rebuild it from the new base scale. Kill only the pulse (not every tween on
    // the button) and keep it paused while a host pause is active.
    this.playButtonPulse?.destroy();
    this.playButtonPulse = this.tweens.add({
      targets: this.playButton,
      scale: playScale * 1.06,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    if (isPlatformPaused()) {
      this.playButtonPulse.pause();
    }
  }
}
