// ============================================================
// FLOWER GAME — FORMATTERS
// Shared formatting helpers.
// ============================================================

import type { GameState } from '../types/gameTypes';

export function formatElapsedClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSeasonLabel(season: GameState['season']): string {
  if (!season) return 'None';
  return season.charAt(0).toUpperCase() + season.slice(1);
}
