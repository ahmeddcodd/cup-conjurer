import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../assets';
import { completePlatformResume } from './playablesHostPause';

function hasYtGame(): boolean {
  return typeof ytgame !== 'undefined';
}

/**
 * Local copy (importing playablesPlatform here would create a require cycle).
 * The SDK script also loads on plain hosted pages (e.g. Vercel), where it
 * reports audio as disabled — only trust host audio state inside the env.
 */
function isInPlayablesEnv(): boolean {
  return hasYtGame() && ytgame.IN_PLAYABLES_ENV;
}

let phaserGame: Phaser.Game | null = null;
/** YouTube host mute (RS_03). */
let platformAudioEnabled = true;
/** In-game speaker button; ignored while platformAudioEnabled is false. */
let userAudioEnabled = true;
let musicSyncPromise: Promise<void> | null = null;
/** True while YouTube onPause has suspended sound instances (not the same as mute). */
let platformSoundsSuspended = false;

const uiListeners = new Set<() => void>();

type PausableSound = Phaser.Sound.BaseSound & {
  pause?: () => PausableSound;
  resume?: () => PausableSound;
  isPaused?: boolean;
};

const BACKGROUND_MUSIC_CONFIG: Phaser.Types.Sound.SoundConfig = {
  loop: true,
  volume: 0.45,
};

const MUSIC_KEY = TEXTURE_KEYS.backgroundTone;

function readPlatformAudioEnabled(): boolean {
  if (isInPlayablesEnv() && ytgame.system?.isAudioEnabled) {
    return ytgame.system.isAudioEnabled();
  }
  return true;
}

function getActiveScene(game: Phaser.Game): Phaser.Scene | undefined {
  return game.scene.getScenes(true)[0];
}

function notifyUiListeners(): void {
  for (const listener of uiListeners) {
    listener();
  }
}

/** True when nothing should be heard. */
export function isEffectivelyMuted(): boolean {
  return !platformAudioEnabled || !userAudioEnabled;
}

/** In-game mute is only allowed when YouTube audio is on (RS_03). */
export function canUserToggleAudio(): boolean {
  return platformAudioEnabled;
}

export function onPlayablesAudioUiChange(listener: () => void): () => void {
  uiListeners.add(listener);
  return () => uiListeners.delete(listener);
}

export function applyPlayablesAudio(): void {
  if (!phaserGame) return;
  phaserGame.sound.mute = isEffectivelyMuted();
}

function forEachPlayingSound(
  game: Phaser.Game,
  fn: (sound: PausableSound) => void,
): void {
  const mgr = game.sound as Phaser.Sound.BaseSoundManager & {
    sounds?: PausableSound[];
  };
  for (const sound of mgr.sounds ?? []) {
    if (sound.isPlaying || sound.isPaused) {
      fn(sound);
    }
  }
}

/** RS pause: freeze sound playback (resume continues from same position). */
export function pausePlayablesSounds(game: Phaser.Game): void {
  if (platformSoundsSuspended) return;
  platformSoundsSuspended = true;

  forEachPlayingSound(game, (sound) => {
    if (sound.isPlaying && typeof sound.pause === 'function') {
      sound.pause();
    }
  });
}

/** RS resume: restore sound playback; volume still follows mute flags. */
export function resumePlayablesSounds(game: Phaser.Game): void {
  if (!platformSoundsSuspended) return;
  platformSoundsSuspended = false;

  forEachPlayingSound(game, (sound) => {
    if (sound.isPaused && typeof sound.resume === 'function') {
      sound.resume();
    }
  });

  applyPlayablesAudio();
}

async function unlockGameAudio(game: Phaser.Game): Promise<void> {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager & {
    context?: AudioContext;
  };
  if (mgr.context?.state === 'suspended') {
    try {
      await mgr.context.resume();
    } catch {
      // Best-effort — required when YouTube unmutes without a user gesture.
    }
  }
}

/**
 * Call this synchronously inside a user-gesture handler (pointerdown, pointerup, etc.)
 * to lift the browser's autoplay suspension before entering any async chain.
 * Safe no-op when the AudioContext is already running (e.g. inside YouTube Playables).
 */
export function unlockAudioContextOnGesture(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager & {
    context?: AudioContext;
  };
  if (mgr.context?.state === 'suspended') {
    void mgr.context.resume();
  }
}

/** Stop every instance of the background loop (guards against stacked plays). */
function stopAllBackgroundMusic(game: Phaser.Game): void {
  const mgr = game.sound as Phaser.Sound.BaseSoundManager & {
    stopByKey?: (key: string) => void;
    sounds?: Phaser.Sound.BaseSound[];
  };

  if (typeof mgr.stopByKey === 'function') {
    mgr.stopByKey(MUSIC_KEY);
    return;
  }

  mgr.get(MUSIC_KEY)?.stop();

  if (Array.isArray(mgr.sounds)) {
    for (const sound of mgr.sounds) {
      if (sound.key === MUSIC_KEY) {
        sound.stop();
      }
    }
  }
}

function isBackgroundMusicPlaying(game: Phaser.Game): boolean {
  const mgr = game.sound as Phaser.Sound.BaseSoundManager & {
    getAll?: (key: string) => Phaser.Sound.BaseSound[];
    sounds?: Phaser.Sound.BaseSound[];
  };

  if (typeof mgr.getAll === 'function') {
    return mgr.getAll(MUSIC_KEY).some((s) => s.isPlaying);
  }

  if (Array.isArray(mgr.sounds)) {
    return mgr.sounds.some((s) => s.key === MUSIC_KEY && s.isPlaying);
  }

  return mgr.get(MUSIC_KEY)?.isPlaying ?? false;
}

/**
 * WebAudioSound.play() schedules a buffer source even while the context is
 * suspended/locked, which creates a phantom "isPlaying" instance that produces
 * no sound and then blocks the real start. Only play once the context is truly
 * running. On YouTube Playables the context is already running, so this is a
 * no-op gate; the deferral path only matters for browser autoplay locks (localhost).
 */
function isAudioContextRunning(game: Phaser.Game): boolean {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager & {
    context?: AudioContext;
    locked?: boolean;
  };
  if (mgr.locked) return false;
  // No context (e.g. NoAudioSoundManager) — nothing to gate on.
  if (!mgr.context) return true;
  return mgr.context.state === 'running';
}

async function startBackgroundMusicOnActiveScene(game: Phaser.Game): Promise<void> {
  const scene = getActiveScene(game);
  if (!scene?.cache.audio.exists(MUSIC_KEY)) return;

  if (!isAudioContextRunning(game)) return;

  if (isBackgroundMusicPlaying(game)) return;

  stopAllBackgroundMusic(game);
  scene.sound.play(MUSIC_KEY, BACKGROUND_MUSIC_CONFIG);
}

/**
 * Start or maintain background music.
 * - Platform mute: keep instance, use sound.mute (no stop — seamless unmute).
 * - User mute: stop playback.
 */
export async function ensureBackgroundMusicOnce(game: Phaser.Game): Promise<void> {
  applyPlayablesAudio();

  if (!userAudioEnabled) {
    stopAllBackgroundMusic(game);
    return;
  }

  if (!platformAudioEnabled) {
    // YouTube muted: do not start new music; existing track stays silent via sound.mute.
    return;
  }

  await unlockGameAudio(game);
  applyPlayablesAudio();

  if (!userAudioEnabled || !platformAudioEnabled) return;

  await startBackgroundMusicOnActiveScene(game);
}

function queueBackgroundMusicSync(): void {
  if (!phaserGame) return;
  musicSyncPromise = (musicSyncPromise ?? Promise.resolve())
    .then(() => ensureBackgroundMusicOnce(phaserGame!))
    .catch(() => undefined);
}

/**
 * RS_03: react to ytgame.system.onAudioEnabledChange and suite pause/unmute pairs.
 */
export function syncPlayablesAudioAfterPlatformChange(): void {
  if (!phaserGame) {
    applyPlayablesAudio();
    notifyUiListeners();
    return;
  }

  if (!platformAudioEnabled) {
    applyPlayablesAudio();
    notifyUiListeners();
    return;
  }

  void unlockGameAudio(phaserGame).then(() => {
    applyPlayablesAudio();
    if (userAudioEnabled && !isBackgroundMusicPlaying(phaserGame!)) {
      queueBackgroundMusicSync();
    }
    notifyUiListeners();
  });
}

export function initPlayablesAudio(game: Phaser.Game): void {
  phaserGame = game;
  platformAudioEnabled = readPlatformAudioEnabled();
  userAudioEnabled = true;
  applyPlayablesAudio();

  if (isInPlayablesEnv() && ytgame.system?.onAudioEnabledChange) {
    ytgame.system.onAudioEnabledChange((enabled) => {
      platformAudioEnabled = enabled;
      // Suite "Resume" often unmutes without onResume — restore gameplay too.
      if (enabled) {
        completePlatformResume(game);
      }
      syncPlayablesAudioAfterPlatformChange();
    });
  }

  if (!platformAudioEnabled) {
    notifyUiListeners();
  }
}

export function toggleUserAudio(): void {
  if (!platformAudioEnabled) return;

  userAudioEnabled = !userAudioEnabled;
  applyPlayablesAudio();

  if (!phaserGame) {
    notifyUiListeners();
    return;
  }

  if (!userAudioEnabled) {
    stopAllBackgroundMusic(phaserGame);
  } else {
    queueBackgroundMusicSync();
  }

  notifyUiListeners();
}

export function playSound(
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): void {
  if (isEffectivelyMuted()) return;

  void unlockGameAudio(scene.game).then(() => {
    if (isEffectivelyMuted()) return;
    applyPlayablesAudio();
    scene.sound.play(key, config);
  });
}

let unlockedMusicListenerBound = false;

/**
 * When the browser blocks autoplay (localhost / non-YouTube), Phaser starts with
 * a locked sound manager and emits UNLOCKED on the first user gesture (after the
 * AudioContext is confirmed running). Defer the real music start to that moment.
 * On YouTube Playables the manager is not locked, so this binds nothing.
 */
function bindUnlockedMusicStart(game: Phaser.Game): void {
  const manager = game.sound as Phaser.Sound.BaseSoundManager & { locked?: boolean };
  if (!manager.locked || unlockedMusicListenerBound) return;

  unlockedMusicListenerBound = true;
  manager.once(Phaser.Sound.Events.UNLOCKED, () => {
    unlockedMusicListenerBound = false;
    queueBackgroundMusicSync();
  });
}

export function ensureBackgroundMusic(scene: Phaser.Scene): void {
  if (!scene.game) return;
  bindUnlockedMusicStart(scene.game);
  queueBackgroundMusicSync();
}
