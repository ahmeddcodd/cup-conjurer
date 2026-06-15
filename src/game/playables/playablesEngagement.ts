import { isInPlayablesEnv } from './playablesPlatform';

/** SHOULD: sendScore with an integer (streak = primary progress dimension). */
export function sendPlayablesScore(streak: number): void {
  const value = Math.floor(streak);
  if (!Number.isFinite(value) || value < 0) return;

  // Gate on the real Playables host (the SDK also loads on plain hosted pages,
  // where sendScore no-ops) — consistent with save/audio routing.
  if (isInPlayablesEnv() && ytgame.engagement?.sendScore) {
    void ytgame.engagement.sendScore({ value }).catch(() => {
      // Best-effort for leaderboard sync.
    });
  }
}
