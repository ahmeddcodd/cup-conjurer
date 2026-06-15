import Phaser from 'phaser';
import { ASSET_URL, TEXTURE_KEYS } from '../assets';
import {
  getIllusionSwapChance,
  getNumCupsForRound,
  getSwapCountForRound,
  getSwapDurationMsForRound,
} from '../gameplay/roundParams';
import {
  canUserToggleAudio,
  ensureBackgroundMusic,
  isEffectivelyMuted,
  onPlayablesAudioUiChange,
  playSound,
  toggleUserAudio,
} from '../playables/playablesAudio';
import { sendPlayablesScore } from '../playables/playablesEngagement';
import type { PlayablesGameplayHost } from '../playables/playablesGameplay';
import { PLAYABLES_LAYOUT_EVENT } from '../playables/playablesGameplay';
import { applyEffectivePause } from '../playables/playablesHostPause';
import { isPlatformPaused } from '../playables/playablesPlatform';
import {
  buildSaveFromGame,
  getLoadedSave,
  savePlayablesProgress,
} from '../playables/playablesSave';

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

/** Time to read the reveal instruction before the gem is shown. */
const REVEAL_INSTRUCTION_READ_MS = 2000;

export class GameScene extends Phaser.Scene implements PlayablesGameplayHost {
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

  private bg!: Phaser.GameObjects.Image;
  private vignette!: Phaser.GameObjects.Graphics;
  private table!: Phaser.GameObjects.Image;
  private readonly tabletopBand = 0.60;

  private numCups = 3;
  private ballCupId = 0;
  /** `cupAtSlot[slotIndex]` = cup identity sitting in that slot. */
  private cupAtSlot: number[] = [0, 1, 2];
  private cupSprites: Phaser.GameObjects.Image[] = [];
  private idleCupTweens: Phaser.Tweens.Tween[] = [];
  private gem!: Phaser.GameObjects.Image;

  private round = 1;
  private score = 0;
  private bestStreak = 0;
  /** False until the gem is first placed this run (new game or resumed save). */
  private gemPlaced = false;
  private phase: Phase = 'reveal';

  private hudRound!: Phaser.GameObjects.Text;
  private hudScore!: Phaser.GameObjects.Text;
  private phaseHint!: Phaser.GameObjects.Text;
  private gameOverRoot?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private audioBtn!: Phaser.GameObjects.Image;
  private unsubscribeAudio?: () => void;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    // Re-declare assets here. Phaser is smart: if they are already in the cache 
    // or currently being loaded by StartScene, it won't duplicate the request.
    // This ensures create() ONLY runs when assets are 100% ready.
    this.load.image(TEXTURE_KEYS.background, ASSET_URL.background);
    this.load.image(TEXTURE_KEYS.table, ASSET_URL.table);
    this.load.image(TEXTURE_KEYS.closedGoblet, ASSET_URL.closedGoblet);
    this.load.image(TEXTURE_KEYS.openGoblet, ASSET_URL.openGoblet);
    this.load.image(TEXTURE_KEYS.diamond, ASSET_URL.diamond);
    this.load.image(TEXTURE_KEYS.audioOn, ASSET_URL.audioOn);
    this.load.image(TEXTURE_KEYS.audioOff, ASSET_URL.audioOff);
    this.load.audio(TEXTURE_KEYS.backgroundTone, ASSET_URL.backgroundTone);
    this.load.audio(TEXTURE_KEYS.correctSound, ASSET_URL.correctSound);
  }

  create(): void {
    const startMusic = () => {
      ensureBackgroundMusic(this);
    };
    this.unsubscribeAudio = onPlayablesAudioUiChange(() => {
      this.updateAudioIcon();
    });
    startMusic();

    // Initialize objects
    this.bg = this.add.image(0, 0, TEXTURE_KEYS.background).setOrigin(0.5).setDepth(0);
    this.vignette = this.add.graphics().setDepth(1);
    this.table = this.add.image(0, 0, TEXTURE_KEYS.table).setOrigin(0.5, 0.5).setDepth(10);
    this.gem = this.add.image(0, 0, TEXTURE_KEYS.diamond).setVisible(false).setDepth(45);

    const uiDepth = 100;
    this.hudRound = this.add.text(0, 0, '', {
        fontFamily: '"Cinzel", Georgia, serif',
        color: '#f4e4bc',
        stroke: '#1a0510',
        strokeThickness: 3,
        padding: { x: 4, y: 4 },
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 3, stroke: true, fill: true }
      }).setDepth(uiDepth);

    this.hudScore = this.add.text(0, 0, '', {
        fontFamily: '"Cinzel", Georgia, serif',
        color: '#f4e4bc',
        stroke: '#1a0510',
        strokeThickness: 3,
        padding: { x: 4, y: 4 },
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 3, stroke: true, fill: true }
      }).setOrigin(1, 0).setDepth(uiDepth);

    this.audioBtn = this.add.image(0, 0, TEXTURE_KEYS.audioOn)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(uiDepth);
    this.audioBtn.on('pointerup', () => this.toggleAudio());
    this.updateAudioIcon();

    this.phaseHint = this.add.text(0, 0, '', {
        fontFamily: '"Crimson Text", Georgia, serif',
        color: '#f4e4bc',
        align: 'center',
        stroke: '#1a0510',
        strokeThickness: 4,
        padding: { x: 10, y: 4 },
        shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 4, stroke: true, fill: true }
      }).setOrigin(0.5, 0).setDepth(uiDepth);

    // RS_06: resume the saved run — reloading must not lose round/streak progress.
    const save = getLoadedSave();
    this.bestStreak = save?.bestStreak ?? 0;
    this.round = save?.round ?? 1;
    this.score = save?.score ?? 0;

    this.refreshLayout();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshLayout, this);

    this.game.events.on(PLAYABLES_LAYOUT_EVENT, this.refreshLayout, this);

    // Phaser does not auto-call shutdown(); bind it so listeners detach on scene stop.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    void this.startRound();
  }

  // --- PlayablesGameplayHost: the reconciler owns input/time/tweens; the scene
  // owns only its own pause overlay and cup interactivity. ---

  // --- PlayablesGameplayHost: pause/resume is driven solely by the YouTube host.
  // The scene only freezes/thaws its own gameplay input; the reconciler owns the
  // Phaser loop/time/tween state. There is no in-game pause UI. ---

  /** Host pause: show a non-interactive PAUSED overlay so the player knows the
   *  game is paused (not frozen). Resume is driven only by the YouTube host. */
  applyPausedUi(): void {
    if (this.phase === 'gameover') return;
    this.showPauseOverlay();
  }

  /** Host resume: just clear the overlay. Cup interactivity is owned by the game
   *  flow (set in the guess phase) and is NOT removed on pause, so re-registering
   *  it here would churn Phaser's deferred input list on the freshly-woken frame
   *  and leave the goblets un-clickable until the next pause/resume. */
  applyRunningUi(): void {
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
  }

  shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshLayout, this);
    this.game.events.off(PLAYABLES_LAYOUT_EVENT, this.refreshLayout, this);
    this.unsubscribeAudio?.();
    this.unsubscribeAudio = undefined;
  }

  private refreshLayout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    this.layout.w = w;
    this.layout.h = h;
    this.layout.cx = cx;
    this.layout.cy = cy;

    this.bg.setPosition(cx, cy);
    const cover = Math.max(w / this.bg.width, h / this.bg.height) * 1.02;
    this.bg.setScale(cover);

    this.vignette.clear();
    this.vignette.fillGradientStyle(0x1a0510, 0x1a0510, 0x0a0208, 0x0a0208, 0.45, 0.45, 0.65, 0.65);
    this.vignette.fillRect(0, 0, w, h);

    this.table.setPosition(cx, h * 0.58);
    const tableScale = Math.min((w * 1.00) / this.table.width, (h * 0.62) / this.table.height);
    this.table.setScale(tableScale);

    this.layout.tableDisplayWidth = this.table.displayWidth;
    this.layout.tableDisplayHeight = this.table.displayHeight;
    this.layout.tableTop = this.table.y - this.table.displayHeight * 0.5;
    this.layout.cupFootY = this.layout.tableTop + this.table.displayHeight * this.tabletopBand;

    this.hudRound.setPosition(20, 18);
    this.hudRound.setStyle({ fontSize: `${Math.round(28 * (w / 720))}px` });

    this.hudScore.setPosition(w - 20, 18);
    this.hudScore.setStyle({ fontSize: `${Math.round(28 * (w / 720))}px` });

    this.audioBtn.setPosition(20, 50);
    this.audioBtn.setScale(0.17 * (w / 720));

    this.phaseHint.setPosition(cx, h * 0.19);
    this.phaseHint.setStyle({ 
        fontSize: `${Math.round(32 * (w / 720))}px`,
        wordWrap: { width: w * 0.92 }
    });

    this.computeSlotsAndScale();
    this.updateAudioIcon();

    if (this.phase !== 'shuffle') {
      this.syncCupPositionsFromSlots();
      if (this.phase === 'reveal' && this.gem.visible) {
        this.layoutGemForOpenCup(this.ballCupId);
      }
    }

    if (this.gameOverRoot) this.renderGameOverUi();
    if (this.pauseOverlay) this.showPauseOverlay();

    // A layout pass can fire from a resize that lands mid host-pause/resume.
    // Re-assert the correct paused/running state so layout never re-enables a
    // paused game nor leaves a resumed one frozen.
    applyEffectivePause(this.game);
  }

  private updateHud(): void {
    this.hudRound.setText(`Round ${this.round}`);
    this.hudScore.setText(`Streak ${this.score}`);
  }

  private persistProgress(): void {
    this.bestStreak = Math.max(this.bestStreak, this.score);
    const payload = buildSaveFromGame(this.round, this.score, this.bestStreak);
    void savePlayablesProgress(payload);
  }

  private computeSlotsAndScale(): void {
    const { cx, h } = this.layout;
    const tw = this.table.displayWidth;
    const th = this.table.displayHeight;

    const probe = this.add.image(0, 0, TEXTURE_KEYS.closedGoblet).setVisible(false);
    const fw = Math.max(probe.frame.width, 1);
    const fh = Math.max(probe.frame.height, 1);
    const aspect = fw / fh;
    probe.destroy();

    const rimInset = tw * 0.028;
    const maxOuterXFromCenter = tw * 0.44 - rimInset;

    const displayW = (cupH: number) => aspect * cupH;
    const halfW = (cupH: number) => displayW(cupH) / 2;

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
    
    for (const cup of this.cupSprites) {
        this.applyUniformCupDisplaySize(cup);
    }
  }

  private applyUniformCupDisplaySize(cup: Phaser.GameObjects.Image): void {
    const targetH = this.layout.cupTargetDisplayHeight;
    const f = cup.frame;
    const fh = Math.max(f.height, 1);
    const fw = f.width;
    const displayW = (fw / fh) * targetH;
    cup.setDisplaySize(displayW, targetH);
  }

  private destroyCups(): void {
    for (const c of this.cupSprites) c.destroy();
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
      if (this.cupSprites[id]) {
        this.cupSprites[id].setPosition(x, this.layout.cupFootY);
      }
    }
  }

  /** Gentle floating bob on the closed goblets so the "memorize" wait feels alive. */
  private startIdleCupAnimation(): void {
    this.stopIdleCupAnimation();
    const lift = this.layout.cupTargetDisplayHeight * 0.05;
    this.cupSprites.forEach((cup, i) => {
      const tween = this.tweens.add({
        targets: cup,
        y: this.layout.cupFootY - lift,
        duration: 720,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
        delay: i * 130,
      });
      this.idleCupTweens.push(tween);
    });
  }

  private stopIdleCupAnimation(): void {
    for (const tween of this.idleCupTweens) tween.stop();
    this.idleCupTweens = [];
    // Restore exact resting positions so the reveal/shuffle start from a clean state.
    this.syncCupPositionsFromSlots();
  }

  private setCupsInteractive(active: boolean): void {
    for (const c of this.cupSprites) {
      c.removeAllListeners('pointerup');
      c.removeInteractive();
      if (!active) continue;

      // Use the texture-frame hit box (Phaser coordinates are frame-space, not display-space).
      c.setInteractive({ useHandCursor: true });
      c.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (this.phase !== 'guess') return;
        const slot = this.resolveTappedSlot(pointer);
        if (slot < 0) return;
        this.onCupGuess(this.cupAtSlot[slot]!);
      });
    }
  }

  /** Pick the table slot closest to the tap (shell-game position, not topmost sprite). */
  private resolveTappedSlot(pointer: Phaser.Input.Pointer): number {
    const x = pointer.worldX;
    let bestSlot = 0;
    let bestDist = Infinity;
    for (let slot = 0; slot < this.numCups; slot++) {
      const slotX = this.layout.slotX[slot];
      if (slotX === undefined) continue;
      const dist = Math.abs(x - slotX);
      if (dist < bestDist) {
        bestDist = dist;
        bestSlot = slot;
      }
    }
    const slotSpan =
      this.numCups > 1
        ? Math.abs(this.layout.slotX[1]! - this.layout.slotX[0]!)
        : this.cupSprites[0]?.displayWidth ?? 120;
    if (bestDist > slotSpan * 0.5) return -1;
    return bestSlot;
  }

  private hideGem(): void {
    this.gem.setVisible(false);
  }

  private layoutGemForOpenCup(cupId: number): void {
    const cup = this.cupSprites[cupId];
    if (!cup) return;
    const gem = this.gem;
    const slotDist = this.numCups > 1 ? Math.abs(this.layout.slotX[1]! - this.layout.slotX[0]!) : this.table.displayWidth * 0.22;
    const targetGemH = Math.min(cup.displayHeight * 0.48, slotDist * 0.85);
    const gf = gem.frame;
    const gfh = Math.max(gf.height, 1);
    const gfw = gf.width;
    gem.setDisplaySize((gfw / gfh) * targetGemH, targetGemH);
    gem.setPosition(cup.x - cup.displayWidth * 0.03, cup.y - cup.displayHeight * 0.63);
    gem.setDepth(48);
    gem.setVisible(true);
  }

  private async startRound(): Promise<void> {
    this.gameOverRoot?.destroy(true);
    this.gameOverRoot = undefined;
    this.hideGem();

    this.numCups = getNumCupsForRound(this.round);
    // Keep the gem under the same goblet across rounds; only pick a fresh goblet
    // at the start of a run (new game or resumed save, which can begin at any
    // round). Clamp in case the cup count shrank (4 -> 3).
    const freshPlacement = !this.gemPlaced;
    this.ballCupId = freshPlacement
      ? Phaser.Math.Between(0, this.numCups - 1)
      : Math.min(this.ballCupId, this.numCups - 1);
    this.gemPlaced = true;
    this.registry.set(REGISTRY_BALL_CUP_INDEX, this.ballCupId);

    // Preserve the previous round's arrangement so the gem starts the next round
    // in the same goblet (and screen position) it was just revealed in, then
    // shuffles from there. Reset only at run start or if the cup count changed.
    if (freshPlacement || this.cupAtSlot.length !== this.numCups) {
      this.cupAtSlot = Array.from({ length: this.numCups }, (_, i) => i);
    }
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

    this.startIdleCupAnimation();
    await sleep(this, REVEAL_INSTRUCTION_READ_MS);
    this.stopIdleCupAnimation();

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
  }

  private onCupGuess(cupId: number): void {
    if (this.phase !== 'guess' || isPlatformPaused()) return;
    this.phase = 'reveal';
    this.setCupsInteractive(false);

    if (cupId === this.ballCupId) {
      this.score += 1;
      this.bestStreak = Math.max(this.bestStreak, this.score);
      playSound(this, TEXTURE_KEYS.correctSound, { volume: 0.8 });
      sendPlayablesScore(this.score);
      if (this.score === 5 || this.score === 10 || this.score === 20) this.showStreakToast(this.score);

      // Reveal the gem under the chosen goblet to confirm the correct pick.
      const correctCup = this.cupSprites[this.ballCupId];
      correctCup.setTexture(TEXTURE_KEYS.openGoblet);
      this.applyUniformCupDisplaySize(correctCup);
      correctCup.setDepth(36);
      this.layoutGemForOpenCup(this.ballCupId);

      this.round += 1;
      // Persist after advancing so a reload resumes at the next round with this streak.
      this.persistProgress();
      this.updateHud();
      this.showCorrectGuessMessage(() => { void this.startRound(); });
    } else {
      const correctCup = this.cupSprites[this.ballCupId];
      correctCup.setTexture(TEXTURE_KEYS.openGoblet);
      this.applyUniformCupDisplaySize(correctCup);
      correctCup.setDepth(36);
      this.layoutGemForOpenCup(this.ballCupId);
      this.phaseHint.setText('The gem was here…');
      this.time.delayedCall(900, () => { this.showGameOver(); });
    }
  }

  private showCorrectGuessMessage(onDone: () => void): void {
    const { cx, cy, w } = this.layout;
    const messages = ['Well done!', 'Correct!', 'Sharp eyes!', 'You found it!', 'Magnificent!', 'Nicely done!', 'Flawless!'];
    const msg = messages[Phaser.Math.Between(0, messages.length - 1)]!;
    const correctCup = this.cupSprites[this.ballCupId];
    this.tweens.add({ targets: correctCup, alpha: 0.4, duration: 120, yoyo: true, repeat: 1 });

    const t = this.add.text(cx, cy * 0.52, msg, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(32 * (w / 720))}px`,
        color: '#ffe29a',
        stroke: '#4a320f',
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(160).setAlpha(0);

    this.tweens.add({
      targets: t,
      alpha: 1,
      y: cy * 0.46,
      duration: 180,
      ease: 'Quad.Out',
      hold: 360,
      yoyo: true,
      onComplete: () => { t.destroy(); onDone(); },
    });
  }

  private showStreakToast(streak: number): void {
    const { cx, cy, w } = this.layout;
    const msg = streak === 5 ? 'Royal streak — 5 correct!' : streak === 10 ? 'Magnificent — 10 in a row!' : 'Legendary — 20 correct!';
    const t = this.add.text(cx, cy * 0.42, msg, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(24 * (w / 720))}px`,
        color: '#ffe29a',
        stroke: '#4a320f',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(150).setAlpha(0);
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

  /** One-shot game-over entry: report/persist the run, then build the overlay. */
  private showGameOver(): void {
    this.phase = 'gameover';
    this.phaseHint.setText('');
    this.bestStreak = Math.max(this.bestStreak, this.score);
    sendPlayablesScore(this.score);
    // The run is over — persist a fresh run so a reload doesn't resurrect it.
    void savePlayablesProgress(buildSaveFromGame(1, 0, this.bestStreak));
    this.renderGameOverUi();
  }

  /** Pure UI build/position — safe to re-run on resize without side effects. */
  private renderGameOverUi(): void {
    const { w, h, cx, cy } = this.layout;
    if (this.gameOverRoot) this.gameOverRoot.destroy(true);
    this.gameOverRoot = this.add.container(0, 0).setDepth(200);
    const dim = this.add.rectangle(cx, cy, w, h, 0x12081c, 0.82).setInteractive();
    this.gameOverRoot.add(dim);
    const panel = this.add.text(cx, cy - 40, `The gem slipped away.\n\nFinal streak: ${this.score}\nBest streak: ${this.bestStreak}`, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(28 * (w / 720))}px`,
        color: '#f4e4bc',
        align: 'center',
      }).setOrigin(0.5);
    this.gameOverRoot.add(panel);
    const again = this.add.text(cx, cy + 120, 'Play again', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: `${Math.round(26 * (w / 720))}px`,
        color: '#ffd873',
        backgroundColor: '#3d2914aa',
        padding: { x: 28, y: 14 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    again.on('pointerup', () => {
      this.round = 1;
      this.score = 0;
      this.gemPlaced = false;
      sendPlayablesScore(0);
      void savePlayablesProgress(buildSaveFromGame(1, 0, this.bestStreak));
      this.gameOverRoot?.destroy(true);
      this.gameOverRoot = undefined;
      void this.startRound();
    });
    this.gameOverRoot.add(again);
  }

  private tweenCupPair(cupA: number, cupB: number, xA: number, xB: number, duration: number): Promise<void> {
    const spriteA = this.cupSprites[cupA];
    const spriteB = this.cupSprites[cupB];
    if (!spriteA || !spriteB) return Promise.resolve();
    return new Promise((resolve) => {
      let done = 0;
      const check = () => { done += 1; if (done >= 2) resolve(); };
      this.tweens.add({ targets: spriteA, x: xA, duration, ease: 'Quad.inOut', onComplete: check });
      this.tweens.add({ targets: spriteB, x: xB, duration, ease: 'Quad.inOut', onComplete: check });
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
    while (j === i) j = Phaser.Math.Between(0, n - 1);
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
      let si: number, sj: number;
      let attempts = 0;
      do { [si, sj] = this.pickTwoDistinctSlots(); attempts++; } while (lastPair !== null && si === lastPair[0] && sj === lastPair[1] && attempts < 6);
      lastPair = [si, sj];
      await this.commitSwap(si, sj, duration);
    }
  }

  /** Non-interactive PAUSED overlay (no Resume button — the host owns resume). */
  private showPauseOverlay(): void {
    const { w, h, cx, cy } = this.layout;
    if (this.pauseOverlay) this.pauseOverlay.destroy();
    this.pauseOverlay = this.add.container(0, 0).setDepth(300);
    const dim = this.add.rectangle(cx, cy, w, h, 0x000000, 0.6);
    this.pauseOverlay.add(dim);
    const title = this.add.text(cx, cy, 'PAUSED', {
      fontFamily: '"Cinzel", Georgia, serif',
      fontSize: `${Math.round(48 * (w / 720))}px`,
      color: '#f4e4bc',
      stroke: '#1a0510',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.pauseOverlay.add(title);
  }

  private toggleAudio(): void {
    if (!canUserToggleAudio()) return;
    toggleUserAudio();
  }

  private updateAudioIcon(): void {
    const muted = isEffectivelyMuted();
    this.audioBtn.setTexture(muted ? TEXTURE_KEYS.audioOff : TEXTURE_KEYS.audioOn);

    const platformAllowsToggle = canUserToggleAudio();
    this.audioBtn.setAlpha(platformAllowsToggle ? 1 : 0.45);
    if (platformAllowsToggle) {
      this.audioBtn.setInteractive({ useHandCursor: true });
    } else {
      this.audioBtn.disableInteractive();
    }
  }
}
