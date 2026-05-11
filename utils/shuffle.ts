// ============================================================
// FISHER-YATES SHUFFLE
// ============================================================

/**
 * Returns a new shuffled copy of the array.
 * Does not mutate the original.
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate a unique short ID for cards and sets.
 */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
