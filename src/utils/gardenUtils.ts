// ============================================================
// FLOWER GAME — GARDEN UTILITIES
// Shared helpers for garden set color logic.
// ============================================================

import type { FlowerCard, GardenSet, FlowerColor } from '../types/gameTypes';

/** Determine the display color of a flower (handles wildcards) */
export function flowerDisplayColor(flower: FlowerCard): FlowerColor {
  return flower.representedColor ?? flower.color;
}

/** Get the representative color of a garden set */
export function gardenSetColor(set: GardenSet): FlowerColor | null {
  if (set.flowers.length === 0) return null;
  // Prefer the first non-wildcard, non-divine flower as the anchor
  const anchorFlower = set.flowers.find(f => {
    const displayColor = flowerDisplayColor(f);
    return displayColor !== 'rainbow' && displayColor !== 'triple_rainbow' && displayColor !== 'divine';
  }) ?? set.flowers.find(f => {
    const displayColor = flowerDisplayColor(f);
    return displayColor !== 'triple_rainbow' && displayColor !== 'divine';
  });
  return anchorFlower ? flowerDisplayColor(anchorFlower) : null;
}
