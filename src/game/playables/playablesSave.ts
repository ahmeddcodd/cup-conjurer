import { isInPlayablesEnv } from './playablesPlatform';

const LOCAL_SAVE_KEY = 'cup_conjurer_save';
const MAX_SAVE_BYTES = 3 * 1024 * 1024;

export interface PlayablesSaveData {
  round: number;
  score: number;
  bestStreak: number;
}

const defaultSave = (): PlayablesSaveData => ({
  round: 1,
  score: 0,
  bestStreak: 0,
});

let loadedSave: PlayablesSaveData | null = null;

export function getLoadedSave(): PlayablesSaveData | null {
  return loadedSave;
}

function parseSave(raw: string): PlayablesSaveData | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PlayablesSaveData>;
    if (typeof parsed.round !== 'number' || typeof parsed.score !== 'number') {
      return null;
    }
    return {
      round: Math.max(1, Math.floor(parsed.round)),
      score: Math.max(0, Math.floor(parsed.score)),
      bestStreak: Math.max(0, Math.floor(parsed.bestStreak ?? 0)),
    };
  } catch {
    return null;
  }
}

/** RS: loadData on boot (Playables cloud or local fallback for dev). */
export async function initPlayablesSave(): Promise<void> {
  // Route on IN_PLAYABLES_ENV, not SDK presence: the SDK script also loads in a
  // plain browser, where loadData/saveData silently no-op — use localStorage there.
  if (isInPlayablesEnv() && ytgame.game?.loadData) {
    try {
      const raw = await ytgame.game.loadData();
      if (raw) {
        loadedSave = parseSave(raw) ?? defaultSave();
        return;
      }
    } catch {
      // Fall through to defaults.
    }
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (raw) {
        loadedSave = parseSave(raw) ?? defaultSave();
        return;
      }
    } catch {
      // Ignore quota / privacy errors.
    }
  }
  loadedSave = null;
}

/** RS: saveData on material progress (well under 3 MiB). */
export async function savePlayablesProgress(data: PlayablesSaveData): Promise<void> {
  const payload: PlayablesSaveData = {
    round: Math.max(1, Math.floor(data.round)),
    score: Math.max(0, Math.floor(data.score)),
    bestStreak: Math.max(0, Math.floor(data.bestStreak)),
  };
  loadedSave = payload;

  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_SAVE_BYTES) {
    console.warn('Playables save exceeds size limit; not saving.');
    return;
  }

  if (isInPlayablesEnv() && ytgame.game?.saveData) {
    try {
      await ytgame.game.saveData(serialized);
    } catch {
      // Best-effort; gameplay continues.
    }
    return;
  }

  try {
    localStorage.setItem(LOCAL_SAVE_KEY, serialized);
  } catch {
    // Ignore quota errors in dev.
  }
}

export function buildSaveFromGame(round: number, score: number, bestStreak: number): PlayablesSaveData {
  return {
    round: Math.max(1, Math.floor(round)),
    score: Math.max(0, Math.floor(score)),
    bestStreak: Math.max(bestStreak, score, 0),
  };
}
