import { hasYtGame } from './playablesPlatform';

/** SHOULD: sendScore with an integer (streak = primary progress dimension). */
export function sendPlayablesScore(streak: number): void {
  const value = Math.floor(streak);
  if (!Number.isFinite(value) || value < 0) return;

  if (hasYtGame() && ytgame.engagement?.sendScore) {
    void ytgame.engagement.sendScore({ value }).catch(() => {
      // Best-effort for leaderboard sync.
    });
  }
}
