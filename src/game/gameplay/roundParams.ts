/** How many swaps run in one shuffle (escalates with round, capped). */
export function getSwapCountForRound(round: number): number {
  return Math.min(Math.max(1, round), 14);
}

/** Milliseconds per swap; speeds up every 5 rounds. */
export function getSwapDurationMsForRound(round: number): number {
  const speedTier = Math.floor((round - 1) / 5);
  return Math.max(130, 580 - speedTier * 85);
}

/** From round 5 onward, use four goblets 50% of the time (otherwise three). */
export function getNumCupsForRound(round: number): number {
  if (round < 5) return 3;
  return Math.random() < 0.5 ? 4 : 3;
}

/** Chance to insert a fake double-swap (out-and-back) before a real swap. */
export function getIllusionSwapChance(round: number): number {
  return round > 20 ? 0.34 : 0;
}
