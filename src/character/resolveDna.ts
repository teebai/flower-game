/**
 * resolveDna.ts — Character DNA resolution with the body-size override.
 *
 * The base DNA is deterministic from the identity seed (same identity → same
 * character, always). The ONLY player-controllable variation is body size,
 * re-rolled by the landing page dice button and persisted per seed at
 * `flower-game:body-scale:<seed>`.
 *
 * resolveCharacterDNA() must be used by BOTH the landing preview and the
 * world spawn (MmorpgApp) so the preview and the spawned character always
 * match exactly.
 */

import { generateCharacterDNA, type CharacterDNA } from '../mmorpg/game/CharacterGenerator';

export const BODY_SCALE_MIN = 0.85;
export const BODY_SCALE_MAX = 1.15;

const BODY_SCALE_KEY_PREFIX = 'flower-game:body-scale:';

function bodyScaleKey(seed: string): string {
  return `${BODY_SCALE_KEY_PREFIX}${seed}`;
}

export function clampBodyScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(BODY_SCALE_MAX, Math.max(BODY_SCALE_MIN, value));
}

/** Load the persisted body-size override for a seed (null when none). */
export function loadBodyScaleOverride(seed: string): number | null {
  try {
    const raw = window.localStorage.getItem(bodyScaleKey(seed));
    if (!raw) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return null;
    return clampBodyScale(value);
  } catch {
    return null;
  }
}

/** Persist a body-size override for a seed. */
export function saveBodyScaleOverride(seed: string, scale: number): void {
  try {
    window.localStorage.setItem(bodyScaleKey(seed), String(clampBodyScale(scale)));
  } catch {
    // ignore persistence failures (private mode etc.)
  }
}

/** Roll a new random body size within the allowed range. */
export function rollBodyScale(): number {
  return BODY_SCALE_MIN + Math.random() * (BODY_SCALE_MAX - BODY_SCALE_MIN);
}

/**
 * Resolve the effective character DNA for an identity seed:
 * deterministic base DNA + the persisted body-size override (if any).
 * Colors, petals and features NEVER change — only bodyScale can be overridden.
 */
export function resolveCharacterDNA(seed: string): CharacterDNA {
  const dna = generateCharacterDNA(seed);
  const override = loadBodyScaleOverride(seed);
  if (override !== null) {
    dna.bodyScale = override;
  }
  return dna;
}
