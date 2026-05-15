import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';
import {
  getIllusionSwapChance,
  getNumCupsForRound,
  getSwapCountForRound,
  getSwapDurationMsForRound,
} from '../gameplay/roundParams';

/**
 * Registry: which **cup identity** (0…n-1) hides the gem for the current shuffle.
 * Slots are permuted separately; this stays on the physical cup the player must follow.
 */
export const REGISTRY_BALL_CUP_INDEX = 'ballCupId';

type Phase = 'reveal' | 'shuffle' | 'guess' | 'gameover';

function sleep(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => {
    scene.time.delayedCall(ms, resolve);
  });
}

export class GameScene extends Phaser.Scene {
  private layout = {
    w: 720,
    h: 1280,
    cx: 360,
    cy: 640,
    cupFootY: 0,
    slotX: [] as number[],
    /** Matched closed/open art to the same on-screen height. */
    cupTargetDisplayHeight: 1,
    tableTop: 0,
    tableDisplayHeight: 1,
    tableDisplayWidth: 1,
  };

  private table!: Phaser.GameObjects.Image;
  private readonly tabletopBand = 0.60;

  private numCups = 3;
  private ballCupId = 0;
  /** `cupAtSlot[slotIndex]` = cup identity sitting in that slot. */
  private cupAtSlot: number[] = [0, 1, 2];
  private cupSprites: Phaser.GameObjects.Image[] = [];
  private gem!: Phaser.GameObjects.Image;

  private round = 1;
  private score = 0;
  private phase: Phase = 'reveal';

  private hudRound!: Phaser.GameObjects.Text;
  private hudScore!: Phaser.GameObjects.Text;
  private phaseHint!: Phaser.GameObjects.Text;
  private gameOverRoot?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private isPaused = false;
  private audioBtn!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.table, ASSET_URL.table);
    this.load.image(TEXTURE_KEYS.closedGoblet, ASSET_URL.closedGoblet);
    this.load.image(TEXTURE_KEYS.openGoblet, ASSET_URL.openGoblet);
    this.load.image(TEXTURE_KEYS.diamond, ASSET_URL.diamond);
    this.load.image(TEXTURE_KEYS.pauseButton, ASSET_URL.pauseButton);
    this.load.image(TEXTURE_KEYS.audioOn, ASSET_URL.audioOn);
    this.load.image(TEXTURE_KEYS.audioOff, ASSET_URL.audioOff);
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    this.layout.w = w;
    this.layout.h = h;
    this.layout.cx = cx;
    this.layout.cy = cy;

    if (!this.sound.get(TEXTURE_KEYS.backgroundTone)) {
      this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
    } else if (!this.sound.get(TEXTURE_KEYS.backgroundTone).isPlaying) {
      this.sound.play(TEXTURE_KEYS.backgroundTone, { loop: true, volume: 0.45 });
    }

    const bg = this.add.image(cx, cy, TEXTURE_KEYS.background).setOrigin(0.5);
    const cover = Math.max(w / bg.width, h / bg.height) * 1.02;
    bg.setScale(cover);
    bg.setDepth(0);

    const vignette = this.add.graphics();
    vignette.fillGradientStyle(0x1a0510, 0x1a0510, 0x0a0208, 0x0a0208, 0.45, 0.45, 0.65, 0.65);
    vignette.fillRect(0, 0, w, h);
    vignette.setDepth(1);

    this.table = this.add.image(cx, h * 0.58, TEXTURE_KEYS.table).setOrigin(0.5, 0.5);
    const tableScale = Math.min((w * 1.00) / this.table.width, (h * 0.62) / this.table.height);
    this.table.setScale(tableScale);
    this.table.setDepth(10);

    this.layout.tableDisplayWidth = this.table.displayWidth;
    this.layout.tableDisplayHeight = this.table.displayHeight;
    this.layout.tableTop = this.table.y - this.table.displayHeight * 0.5;
    this.layout.cupFootY = this.layout.tableTop + this.table.displayHeight * this.tabletopBand;

    this.gem = this.add
      .image(0, 0, TEXTURE_KEYS.diamond)
      .setVisible(false)
      .setDepth(45);

    const uiDepth = 100;
    this.hudRound = this.add
      .text(20, 18, '', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(28 * (w / 720))}px`,
        color: '#f4e4bc',
        stroke: '#1a0510',
        strokeThickness: 3,
      })
      .setDepth(uiDepth);

    this.hudScore = this.add
      .text(w - 20, 18, '', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(28 * (w / 720))}px`,
        color: '#f4e4bc',
        stroke: '#1a0510',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(uiDepth);

    const pauseBtn = this.add
      .image(w, 50, TEXTURE_KEYS.pauseButton)
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(uiDepth);

    pauseBtn.setScale(0.17 * (w / 720));
    pauseBtn.on('pointerup', () => this.togglePause());

    this.audioBtn = this.add
      .image(20, 50, TEXTURE_KEYS.audioOn)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(uiDepth);
    this.audioBtn.setScale(0.17 * (w / 720));
    this.audioBtn.on('pointerup', () => this.toggleAudio());
    this.updateAudioIcon();

    this.phaseHint = this.add
      .text(cx, h * 0.19, '', {
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: `${Math.round(32 * (w / 720))}px`,
        color: '#f4e4bc',
        align: 'center',
        wordWrap: { width: w * 0.92 },
        stroke: '#1a0510',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(uiDepth);

    this.round = 1;
    this.score = 0;
    void this.startRound();
  }

  private updateHud(): void {
    this.hudRound.setText(`Round ${this.round}`);
    this.hudScore.setText(`Streak ${this.score}`);
  }

  /**
   * Goblets were laid out with **90% of screen width**, wider than the **table art**, so outer cups
   * crossed the gold rim. Here span and height come from the **table sprite width**: outer cup
   * center offset + half-width stay inside a horizontal "wood" limit derived from `displayWidth`.
   */
  private computeSlotsAndScale(): void {
    const { cx, h } = this.layout;
    const tw = this.table.displayWidth;
    const th = this.table.displayHeight;

    const probe = this.add.image(0, 0, TEXTURE_KEYS.closedGoblet).setVisible(false);
    const fw = Math.max(probe.frame.width, 1);
    const fh = Math.max(probe.frame.height, 1);
    const aspect = fw / fh;
    probe.destroy();

    /** From table center, max X for outer **rim** of a goblet (inside the round wood / gold ring). */
    const rimInset = tw * 0.028;
    const maxOuterXFromCenter = tw * 0.44 - rimInset;

    const displayW = (cupH: number) => aspect * cupH;
    const halfW = (cupH: number) => displayW(cupH) / 2;

    /** Outer slots at ±spanChord/2: need spanChord/2 + halfW ≤ maxOuterXFromCenter */
    const maxSpanChordForHeight = (cupH: number) =>
      2 * Math.max(0, maxOuterXFromCenter - halfW(cupH));

    const gap = 0.88;
    const minSpanChordForHeight = (cupH: number) =>
      this.numCups <= 1 ? 0 : (this.numCups - 1) * displayW(cupH) * gap;

    const fits = (cupH: number) =>
      maxSpanChordForHeight(cupH) >= minSpanChordForHeight(cupH) - 0.25;

    let low = 48;
    let high = Math.min(th * 0.65, h * 0.82);
    for (let step = 0; step < 24; step++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }

    this.layout.cupTargetDisplayHeight = low * 1.75;

    const spanChord = maxSpanChordForHeight(low);

    const actualStep = this.numCups > 1 ? spanChord / (this.numCups - 1) : 0;
    this.layout.slotX = [];
    for (let i = 0; i < this.numCups; i++) {
      this.layout.slotX.push(cx - spanChord / 2 + i * actualStep);
    }
  }

  /** Same on-screen height for closed + open art (different source frames). */
  private applyUniformCupDisplaySize(cup: Phaser.GameObjects.Image): void {
    const targetH = this.layout.cupTargetDisplayHeight;
    const f = cup.frame;
    const fh = Math.max(f.height, 1);
    const fw = f.width;
    const displayW = (fw / fh) * targetH;
    cup.setDisplaySize(displayW, targetH);
  }

  private destroyCups(): void {
    for (const c of this.cupSprites) {
      c.destroy();
    }
    this.cupSprites = [];
  }

  private buildCups(): void {
    this.destroyCups();
    const y = this.layout.cupFootY;
    for (let id = 0; id < this.numCups; id++) {
      const img = this.add
        .image(0, y, TEXTURE_KEYS.closedGoblet)
        .setOrigin(0.5, 1)
        .setDepth(30);
      this.applyUniformCupDisplaySize(img);
      this.cupSprites.push(img);
    }
    this.syncCupPositionsFromSlots();
  }

  private slotOfCup(cupId: number): number {
    return this.cupAtSlot.indexOf(cupId);
  }

  private syncCupPositionsFromSlots(): void {
    for (let id = 0; id < this.numCups; id++) {
      const s = this.slotOfCup(id);
      const x = this.layout.slotX[s] ?? this.layout.cx;
      this.cupSprites[id].setPosition(x, this.layout.cupFootY);
    }
  }

  private setCupsInteractive(active: boolean): void {
    for (const c of this.cupSprites) {
      c.removeInteractive();
      if (active) {
        c.setInteractive({ useHandCursor: true });
      }
    }
  }

  private hideGem(): void {
    this.gem.setVisible(false);
    this.gem.setDepth(45);
  }

  private layoutGemForOpenCup(cupId: number): void {
    const cup = this.cupSprites[cupId];
    const gem = this.gem;
    const slotDist =
      this.numCups > 1
        ? Math.abs(this.layout.slotX[1]! - this.layout.slotX[0]!)
        : this.table.displayWidth * 0.22;
    const targetGemH = Math.min(cup.displayHeight * 0.48, slotDist * 0.85);
    const gf = gem.frame;
    const gfh = Math.max(gf.height, 1);
    const gfw = gf.width;
    gem.setDisplaySize((gfw / gfh) * targetGemH, targetGemH);

    // cup.x is the goblet's horizontal centre (origin 0.5, 1).
    // The gem sprite has slight left-side padding so its visual centre sits right of the
    // sprite centre — a 3% cup-width nudge left corrects it without overcorrecting.
    gem.setPosition(cup.x - cup.displayWidth * 0.03, cup.y - cup.displayHeight * 0.63);
    gem.setDepth(48);
    gem.setVisible(true);
  }

  private async startRound(): Promise<void> {
    this.gameOverRoot?.destroy(true);
    this.gameOverRoot = undefined;
    this.hideGem();

    this.numCups = getNumCupsForRound(this.round);
    this.ballCupId = Phaser.Math.Between(0, this.numCups - 1);
    this.registry.set(REGISTRY_BALL_CUP_INDEX, this.ballCupId);

    this.cupAtSlot = Array.from({ length: this.numCups }, (_, i) => i);
    this.computeSlotsAndScale();
    this.buildCups();
    this.updateHud();

    this.phase = 'reveal';
    this.setCupsInteractive(false);
    this.phaseHint.setText(
      this.numCups === 4
        ? 'Four thrones — the gem is revealed under one goblet. Memorize it.'
        : 'The gem is revealed under one goblet. Memorize it before the shuffle.',
    );

    for (let id = 0; id < this.numCups; id++) {
      const cup = this.cupSprites[id];
      if (id === this.ballCupId) {
        cup.setTexture(TEXTURE_KEYS.openGoblet);
        cup.setDepth(36);
      } else {
        cup.setTexture(TEXTURE_KEYS.closedGoblet);
        cup.setDepth(30);
      }
      this.applyUniformCupDisplaySize(cup);
    }
    this.layoutGemForOpenCup(this.ballCupId);

    // Reveal window shrinks each round down to a 900 ms floor (was frozen at round 8).
    const revealMs = Math.max(900, 2200 - Math.min(this.round, 16) * 80);
    await sleep(this, revealMs);

    for (const cup of this.cupSprites) {
      cup.setTexture(TEXTURE_KEYS.closedGoblet);
      this.applyUniformCupDisplaySize(cup);
      cup.setDepth(30);
    }
    this.hideGem();

    await sleep(this, 350);
    await this.runShufflePhase();

    this.phase = 'guess';
    this.phaseHint.setText('Tap the goblet that hides the royal gem.');
    this.setCupsInteractive(true);

    for (let id = 0; id < this.numCups; id++) {
      const cupId = id;
      this.cupSprites[id].once('pointerup', () => {
        if (this.phase !== 'guess') return;
        this.onCupGuess(cupId);
      });
    }
  }

  private onCupGuess(cupId: number): void {
    if (this.phase !== 'guess') return;
    this.phase = 'reveal'; // lock out further taps immediately
    this.setCupsInteractive(false);

    if (cupId === this.ballCupId) {
      this.score += 1;
      if (this.score === 5 || this.score === 10 || this.score === 20) {
        this.showStreakToast(this.score);
      }
      this.round += 1;
      this.updateHud();

      // Show correct-guess feedback before starting the next round.
      this.showCorrectGuessMessage(() => {
        void this.startRound();
      });
    } else {
      // Bug 1 fix: briefly open the correct cup so the player sees where the gem was
      // before the game over screen appears.
      const correctCup = this.cupSprites[this.ballCupId];
      correctCup.setTexture(TEXTURE_KEYS.openGoblet);
      this.applyUniformCupDisplaySize(correctCup);
      correctCup.setDepth(36);
      this.layoutGemForOpenCup(this.ballCupId);
      this.phaseHint.setText('The gem was here…');
      this.time.delayedCall(900, () => {
        this.showGameOver();
      });
    }
  }

  private showCorrectGuessMessage(onDone: () => void): void {
    const { cx, cy, w } = this.layout;

    const messages = [
      'Well done!',
      'Correct!',
      'Sharp eyes!',
      'You found it!',
      'Magnificent!',
      'Nicely done!',
      'Flawless!',
    ];
    const msg = messages[Phaser.Math.Between(0, messages.length - 1)]!;

    // Dim flash on the correct cup
    const correctCup = this.cupSprites[this.ballCupId];
    this.tweens.add({
      targets: correctCup,
      alpha: 0.4,
      duration: 120,
      yoyo: true,
      repeat: 1,
    });

    // Floating text
    const t = this.add
      .text(cx, cy * 0.52, msg, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(32 * (w / 720))}px`,
        color: '#ffe29a',
        stroke: '#4a320f',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(160)
      .setAlpha(0);

    this.tweens.add({
      targets: t,
      alpha: 1,
      y: cy * 0.46,
      duration: 180,
      ease: 'Quad.Out',
      hold: 520,
      yoyo: true,
      onComplete: () => {
        t.destroy();
        onDone();
      },
    });
  }

  private showStreakToast(streak: number): void {
    const { cx, cy, w } = this.layout;
    const msg =
      streak === 5
        ? 'Royal streak — 5 correct!'
        : streak === 10
          ? 'Magnificent — 10 in a row!'
          : 'Legendary — 20 correct!';
    const t = this.add
      .text(cx, cy * 0.42, msg, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(24 * (w / 720))}px`,
        color: '#ffe29a',
        stroke: '#4a320f',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(150)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: cy * 0.4,
      duration: 220,
      yoyo: true,
      hold: 500,
      onComplete: () => t.destroy(),
    });
  }

  private showGameOver(): void {
    this.phase = 'gameover';
    this.phaseHint.setText('');

    const { w, h, cx, cy } = this.layout;
    const root = this.add.container(0, 0).setDepth(200);

    const dim = this.add.rectangle(cx, cy, w, h, 0x12081c, 0.82).setInteractive();
    root.add(dim);

    const panel = this.add.text(
      cx,
      cy - 40,
      `The gem slipped away.\n\nFinal streak: ${this.score}`,
      {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(28 * (w / 720))}px`,
        color: '#f4e4bc',
        align: 'center',
      },
    );
    panel.setOrigin(0.5);
    root.add(panel);

    const again = this.add
      .text(cx, cy + 120, 'Play again', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(26 * (w / 720))}px`,
        color: '#ffd873',
        backgroundColor: '#3d2914aa',
        padding: { x: 28, y: 14 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    again.on('pointerup', () => {
      this.round = 1;
      this.score = 0;
      root.destroy(true);
      this.gameOverRoot = undefined;
      void this.startRound();
    });
    root.add(again);

    this.gameOverRoot = root;
  }

  private tweenCupPair(
    cupA: number,
    cupB: number,
    xA: number,
    xB: number,
    duration: number,
  ): Promise<void> {
    const spriteA = this.cupSprites[cupA];
    const spriteB = this.cupSprites[cupB];
    return new Promise((resolve) => {
      let done = 0;
      const check = () => {
        done += 1;
        if (done >= 2) resolve();
      };
      this.tweens.add({
        targets: spriteA,
        x: xA,
        duration,
        ease: 'Quad.inOut',
        onComplete: check,
      });
      this.tweens.add({
        targets: spriteB,
        x: xB,
        duration,
        ease: 'Quad.inOut',
        onComplete: check,
      });
    });
  }

  private async illusionSwap(slotI: number, slotJ: number, fastMs: number): Promise<void> {
    const cupA = this.cupAtSlot[slotI]!;
    const cupB = this.cupAtSlot[slotJ]!;
    const xi = this.layout.slotX[slotI]!;
    const xj = this.layout.slotX[slotJ]!;
    await this.tweenCupPair(cupA, cupB, xj, xi, fastMs);
    await this.tweenCupPair(cupA, cupB, xi, xj, fastMs);
  }

  private async commitSwap(slotI: number, slotJ: number, duration: number): Promise<void> {
    const cupA = this.cupAtSlot[slotI]!;
    const cupB = this.cupAtSlot[slotJ]!;
    const xi = this.layout.slotX[slotI]!;
    const xj = this.layout.slotX[slotJ]!;
    await this.tweenCupPair(cupA, cupB, xj, xi, duration);
    [this.cupAtSlot[slotI], this.cupAtSlot[slotJ]] = [this.cupAtSlot[slotJ]!, this.cupAtSlot[slotI]!];
    this.syncCupPositionsFromSlots();
  }

  private pickTwoDistinctSlots(): [number, number] {
    const n = this.numCups;
    const i = Phaser.Math.Between(0, n - 1);
    let j = Phaser.Math.Between(0, n - 1);
    while (j === i) {
      j = Phaser.Math.Between(0, n - 1);
    }
    return i < j ? [i, j] : [j, i];
  }

  private async runShufflePhase(): Promise<void> {
    this.phase = 'shuffle';
    this.phaseHint.setText('The spirits shuffle the goblets…');

    const swapCount = getSwapCountForRound(this.round);
    const duration = getSwapDurationMsForRound(this.round);
    const illusionChance = getIllusionSwapChance(this.round);

    let lastPair: [number, number] | null = null;

    for (let s = 0; s < swapCount; s++) {
      if (Math.random() < illusionChance) {
        const [i1, j1] = this.pickTwoDistinctSlots();
        await this.illusionSwap(i1, j1, Math.max(90, Math.floor(duration * 0.28)));
      }

      // Bug 3 fix: avoid picking the same slot pair twice in a row, which would
      // silently undo the previous swap and make the shuffle trivially easy.
      let si: number, sj: number;
      let attempts = 0;
      do {
        [si, sj] = this.pickTwoDistinctSlots();
        attempts++;
      } while (
        lastPair !== null &&
        si === lastPair[0] &&
        sj === lastPair[1] &&
        attempts < 6
      );
      lastPair = [si, sj];

      await this.commitSwap(si, sj, duration);
    }
  }

  private togglePause(): void {
    if (this.phase === 'gameover') return;

    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.tweens.pauseAll();
      this.time.paused = true;
      this.showPauseOverlay();
    } else {
      this.tweens.resumeAll();
      this.time.paused = false;
      this.pauseOverlay?.destroy();
      this.pauseOverlay = undefined;
    }
  }

  private showPauseOverlay(): void {
    const { w, h, cx, cy } = this.layout;
    this.pauseOverlay = this.add.container(0, 0).setDepth(300);

    const dim = this.add.rectangle(cx, cy, w, h, 0x000000, 0.6).setInteractive();
    this.pauseOverlay.add(dim);

    const title = this.add.text(cx, cy - 40, 'PAUSED', {
      fontFamily: '"Cinzel", Georgia, serif',
      fontSize: `${Math.round(48 * (w / 720))}px`,
      color: '#f4e4bc',
    });
    title.setOrigin(0.5);
    this.pauseOverlay.add(title);

    const resume = this.add
      .text(cx, cy + 80, 'Resume', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(28 * (w / 720))}px`,
        color: '#ffd873',
        backgroundColor: '#3d2914aa',
        padding: { x: 30, y: 15 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    resume.on('pointerup', () => this.togglePause());
    this.pauseOverlay.add(resume);
  }

  private toggleAudio(): void {
    this.sound.mute = !this.sound.mute;
    this.updateAudioIcon();
  }

  private updateAudioIcon(): void {
    // When audio is ON (not muted), show the "audio off" spirit (the mute action icon)
    // When audio is OFF (muted), show the "audio on" spirit (the unmute action icon)
    if (this.sound.mute) {
      this.audioBtn.setTexture(TEXTURE_KEYS.audioOn);
    } else {
      this.audioBtn.setTexture(TEXTURE_KEYS.audioOff);
    }
  }
}
