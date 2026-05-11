// ============================================================
// FLOWER GAME — GARDEN MANAGEMENT
// ============================================================

import { Garden, GardenSet, FlowerCard, FlowerColor } from '../types';
import { uid } from '../utils/shuffle';

// ── Set Classification ────────────────────────────────────────

/**
 * Recalculates isComplete, isSolid, containsTripleRainbow, isDivine
 * for a given set based on its current flowers.
 */
export function classifySet(set: GardenSet): GardenSet {
  const hasDivine         = set.flowers.some(f => f.color === 'divine');
  const hasTripleRainbow  = set.flowers.some(f => f.color === 'triple_rainbow');
  const flowerCount       = set.flowers.length;

  if (set.isToken) {
    return {
      ...set,
      flowers: [],
      isComplete: true,
      isSolid: false,
      containsTripleRainbow: false,
      isDivine: true,
      isToken: true,
    };
  }

  // Divine Flower: always complete, always invulnerable, always its own set
  if (hasDivine) {
    return {
      ...set,
      isComplete:          true,
      isSolid:             false, // divine is its own category
      containsTripleRainbow: false,
      isDivine:            true,
    };
  }

  // Any 7-flower set is promoted into a Divine set
  if (flowerCount >= 7) {
    return {
      ...set,
      isComplete: true,
      isSolid: false,
      containsTripleRainbow: false,
      isDivine: true,
    };
  }

  // Triple Rainbow standalone (no other flowers combined with it)
  if (hasTripleRainbow && flowerCount === 1) {
    return {
      ...set,
      isComplete:          true,  // counts as a normal set of 3
      isSolid:             false,
      containsTripleRainbow: true,
      isDivine:            false,
    };
  }

  // Triple Rainbow combined with other flowers → always Solid Set
  if (hasTripleRainbow && flowerCount > 1) {
    return {
      ...set,
      isComplete:          true,
      isSolid:             true,
      containsTripleRainbow: true,
      isDivine:            false,
    };
  }

  // Normal / Solid sets
  const isComplete = flowerCount >= 3;
  const isSolid    = flowerCount >= 5;

  return { ...set, isComplete, isSolid, containsTripleRainbow: false, isDivine: false };
}

// ── Garden Queries ────────────────────────────────────────────

export function completedSets(garden: Garden): GardenSet[] {
  return garden.sets.filter(s => s.isComplete);
}

export function hasWinningSetCount(garden: Garden): boolean {
  return completedSets(garden).length >= 3;
}

/**
 * Find the set a new flower should be added to, based on colour.
 * Returns null if no matching incomplete set exists.
 */
export function findTargetSet(
  garden: Garden,
  color: FlowerColor,
  isWildcard: boolean
): GardenSet | null {
  if (isWildcard) return null; // caller must specify a target set for wildcards

  // Look for an existing incomplete (or complete, to build Solid) set of this colour
  return garden.sets.find(
    s => !s.isDivine && resolveSetColor(s) === color
  ) ?? garden.sets.find(isUnanchoredWildcardSet) ?? null;
}

const NORMAL_FLOWER_COLORS: FlowerColor[] = [
  'blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black',
];

function getFlowerEffectiveColor(flower: FlowerCard): FlowerColor | null {
  const candidate = flower.representedColor ?? flower.color;
  return NORMAL_FLOWER_COLORS.includes(candidate) ? candidate : null;
}

function persistFlowerRepresentation(
  flower: FlowerCard,
  chosenColor?: FlowerColor,
): FlowerCard {
  if (!(flower.isWildcard || flower.color === 'triple_rainbow')) return flower;
  if (!chosenColor || !NORMAL_FLOWER_COLORS.includes(chosenColor)) {
    const { representedColor: _representedColor, ...rest } = flower;
    return rest;
  }
  return { ...flower, representedColor: chosenColor };
}

function isUnanchoredWildcardSet(set: GardenSet): boolean {
  if (set.isDivine || set.isToken || resolveSetColor(set) !== null) return false;
  return set.flowers.length > 0
    && set.flowers.every(flower => flower.isWildcard && flower.color !== 'triple_rainbow');
}

function anchorWildcardSet(set: GardenSet, chosenColor: FlowerColor): GardenSet {
  return {
    ...set,
    flowers: set.flowers.map(flower => persistFlowerRepresentation(flower, chosenColor)),
  };
}

/**
 * Returns the "effective colour" of a set (first flower with a usable colour).
 */
export function resolveSetColor(set: GardenSet): FlowerColor | null {
  for (const flower of set.flowers) {
    const color = getFlowerEffectiveColor(flower);
    if (color) return color;
  }
  return null;
}

type FlowerPick = {
  color: FlowerColor;
  setId: string;
  setIndex: number;
  flowerIndex: number;
  flower: FlowerCard;
  setIsComplete: boolean;
  setSize: number;
};

function isNormalTokenCandidate(flower: FlowerCard): boolean {
  if (flower.color === 'divine' || flower.color === 'triple_rainbow') {
    return false;
  }
  return getFlowerEffectiveColor(flower) !== null;
}

function chooseSevenColorPicks(sets: GardenSet[]): FlowerPick[] | null {
  const picks: FlowerPick[] = [];

  for (const color of NORMAL_FLOWER_COLORS) {
    const candidates: FlowerPick[] = [];

    sets.forEach((set, setIndex) => {
      if (set.isDivine || set.isToken) return;

      set.flowers.forEach((flower, flowerIndex) => {
        if (getFlowerEffectiveColor(flower) !== color || !isNormalTokenCandidate(flower)) return;
        candidates.push({
          color,
          setId: set.id,
          setIndex,
          flowerIndex,
          flower,
          setIsComplete: set.isComplete,
          setSize: set.flowers.length,
        });
      });
    });

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.setIsComplete !== b.setIsComplete) return Number(a.setIsComplete) - Number(b.setIsComplete);
      if (a.setSize !== b.setSize) return a.setSize - b.setSize;
      if (a.setIndex !== b.setIndex) return a.setIndex - b.setIndex;
      return a.flowerIndex - b.flowerIndex;
    });

    picks.push(candidates[0]);
  }

  return picks;
}

function mergeDifferentColorFlowers(sets: GardenSet[]): { sets: GardenSet[]; affectedSetId?: string; discardedFlowers?: FlowerCard[] } {
  let workingSets = sets.map(set => ({ ...set, flowers: [...set.flowers] }));
  const discardedFlowers: FlowerCard[] = [];
  let lastTokenId: string | undefined;

  while (true) {
    const picks = chooseSevenColorPicks(workingSets);
    if (!picks) break;

    const removalMap = new Map<string, Set<number>>();
    const insertionIndex = Math.max(
      0,
      Math.min(...picks.map(pick => pick.setIndex)),
    );

    for (const pick of picks) {
      if (!removalMap.has(pick.setId)) removalMap.set(pick.setId, new Set<number>());
      removalMap.get(pick.setId)!.add(pick.flowerIndex);
      discardedFlowers.push(pick.flower);
    }

    const nextSets: GardenSet[] = [];
    for (const set of workingSets) {
      const removals = removalMap.get(set.id);
      if (!removals || removals.size === 0) {
        nextSets.push(set);
        continue;
      }

      const remainingFlowers = set.flowers.filter((_, index) => !removals.has(index));
      if (remainingFlowers.length > 0) {
        nextSets.push(classifySet({ ...set, flowers: remainingFlowers }));
      }
    }

    const tokenSet: GardenSet = classifySet({
      id: uid(),
      flowers: [],
      isComplete: true,
      isSolid: false,
      containsTripleRainbow: false,
      isDivine: true,
      isToken: true,
    });

    nextSets.splice(Math.min(insertionIndex, nextSets.length), 0, tokenSet);
    workingSets = nextSets;
    lastTokenId = tokenSet.id;
  }

  if (!lastTokenId) return { sets };
  return { sets: workingSets, affectedSetId: lastTokenId, discardedFlowers };
}

export function normalizeGardenTokens(garden: Garden): {
  garden: Garden;
  affectedSetId?: string;
  discardedFlowers?: FlowerCard[];
} {
  const merged = mergeDifferentColorFlowers(garden.sets);
  return {
    garden: { sets: merged.sets },
    affectedSetId: merged.affectedSetId,
    discardedFlowers: merged.discardedFlowers,
  };
}

function finalizeTokenMerge(
  sets: GardenSet[],
  affectedSetId: string,
  triggersGodsFavourite: boolean,
): PlantResult {
  const merged = normalizeGardenTokens({ sets });
  return {
    garden: merged.garden,
    triggersGodsFavourite: triggersGodsFavourite || Boolean(merged.affectedSetId),
    affectedSetId: merged.affectedSetId ?? affectedSetId,
    discardedFlowers: merged.discardedFlowers,
  };
}

// ── Plant Operations ──────────────────────────────────────────

export interface PlantResult {
  garden: Garden;
  /** True if this plant completed or extended a set (triggers God's Favourite check) */
  triggersGodsFavourite: boolean;
  /** The set that was affected */
  affectedSetId: string;
  /** Flowers returned to discard when 7 different singletons turn into a token */
  discardedFlowers?: FlowerCard[];
}

/**
 * Plant a flower into the garden.
 *
 * @param garden     The target player's garden (immutable input)
 * @param flower     The flower card being planted
 * @param targetSetId  For wildcards/triple rainbow, the set ID to plant into.
 *                     For regular flowers, omit — auto-matched by colour.
 * @param chosenColor  For wildcards (rainbow/bee), the colour they represent.
 */
export function plantFlower(
  garden: Garden,
  flower: FlowerCard,
  targetSetId?: string,
  chosenColor?: FlowerColor,
  placementMode: 'auto' | 'explicit' = 'auto'
): PlantResult {
  const sets = garden.sets.map(s => ({ ...s, flowers: [...s.flowers] }));

  // ── Divine Flower ─────────────────────────────────────────
  if (flower.color === 'divine') {
    const newSet: GardenSet = classifySet({
      id: uid(),
      flowers: [flower],
      isComplete: false,
      isSolid: false,
      containsTripleRainbow: false,
      isDivine: true,
    });
    return {
      garden: { sets: [...sets, newSet] },
      triggersGodsFavourite: true,
      affectedSetId: newSet.id,
    };
  }

  // ── Triple Rainbow standalone ─────────────────────────────
  if (flower.color === 'triple_rainbow' && !targetSetId) {
    const newSet: GardenSet = classifySet({
      id: uid(),
      flowers: [flower],
      isComplete: false,
      isSolid: false,
      containsTripleRainbow: true,
      isDivine: false,
    });
    return {
      garden: { sets: [...sets, newSet] },
      triggersGodsFavourite: true, // completes a set on its own
      affectedSetId: newSet.id,
    };
  }


  const isRegularFlower = !flower.isWildcard && flower.color !== 'triple_rainbow';

  if (placementMode === 'auto' && !(flower.isWildcard || flower.color === 'triple_rainbow') && (targetSetId || chosenColor)) {
    throw new Error('Regular flowers are auto-matched by colour');
  }

  // ── Wildcard / Triple Rainbow combined into existing set ───
  if (targetSetId && !isRegularFlower) {
    const idx = sets.findIndex(s => s.id === targetSetId);
    if (idx === -1) throw new Error(`Set ${targetSetId} not found in garden`);
    let target = sets[idx];
    if (target.isDivine) throw new Error('Cannot plant into a Divine set');

    const wasComplete = target.isComplete;
    const anchoredColor = resolveSetColor(target) ?? chosenColor ?? undefined;
    if (anchoredColor && isUnanchoredWildcardSet(target)) {
      target = anchorWildcardSet(target, anchoredColor);
    }
    target.flowers.push(
      persistFlowerRepresentation(flower, anchoredColor),
    );
    const updated = classifySet(target);
    sets[idx] = updated;

    const triggersGodsFavourite = !wasComplete ? updated.isComplete : wasComplete;
    return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
  }

  // ── Regular flower — match by colour ──────────────────────
  const effectiveColor = chosenColor ?? getFlowerEffectiveColor(flower) ?? flower.color;
  const storedFlower = persistFlowerRepresentation(flower, chosenColor);
  if (flower.isWildcard && !getFlowerEffectiveColor(storedFlower)) {
    throw new Error('Rainbow flowers need a chosen color when starting a new set');
  }
  const existingIdx = sets.findIndex(
    s => !s.isDivine && resolveSetColor(s) === effectiveColor
  );

  if (existingIdx !== -1) {
    // Add to existing set
    const target    = sets[existingIdx];
    const wasComplete = target.isComplete;
    target.flowers.push(storedFlower);
    const updated = classifySet(target);
    sets[existingIdx] = updated;

    // God's Favourite triggers on: first completion OR adding to already-complete
    const triggersGodsFavourite = updated.isComplete; // true whether completing or extending
    return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
  } else {
    const anchorableIdx = sets.findIndex(isUnanchoredWildcardSet);
    if (anchorableIdx !== -1) {
      const target = anchorWildcardSet(sets[anchorableIdx], effectiveColor);
      const wasComplete = target.isComplete;
      target.flowers.push(storedFlower);
      const updated = classifySet(target);
      sets[anchorableIdx] = updated;

      const triggersGodsFavourite = updated.isComplete || wasComplete;
      return finalizeTokenMerge(sets, updated.id, triggersGodsFavourite);
    }

    // Start a new set
    const newSet: GardenSet = classifySet({
      id: uid(),
      flowers: [storedFlower],
      isComplete: false,
      isSolid: false,
      containsTripleRainbow: false,
      isDivine: false,
    });
    return finalizeTokenMerge([...sets, newSet], newSet.id, false);
  }
}

// ── Remove Operations ─────────────────────────────────────────

export interface RemoveResult {
  garden: Garden;
  removedFlowers: FlowerCard[];
}

/**
 * Remove flowers from a set (Wind steal, Bug, Natural Disaster).
 * Returns the updated garden and removed flowers.
 *
 * @param count  Number of flowers to remove from the set (-1 = destroy whole set)
 */
export function removeFromSet(
  garden: Garden,
  setId: string,
  count: number
): RemoveResult {
  const sets = garden.sets.map(s => ({
    ...s,
    flowers: [...s.flowers],
  }));

  const idx = sets.findIndex(s => s.id === setId);
  if (idx === -1) throw new Error(`Set ${setId} not found`);
  const target = sets[idx];

  if (target.isDivine) throw new Error('Divine sets are invulnerable');

  let removedFlowers: FlowerCard[];

  if (count === -1 || count >= target.flowers.length) {
    // Destroy entire set (Natural Disaster)
    removedFlowers = target.flowers;
    sets.splice(idx, 1);
  } else {
    // Remove specific number — prefer flowers that actually belong to the set's
    // visible colour, then other non-triple flowers, then triple rainbow.
    removedFlowers = [];
    let remaining = count;
    const sourceColor = resolveSetColor(target);
    const preferred = target.flowers.filter(
      f => f.color !== 'triple_rainbow' && sourceColor !== null && getFlowerEffectiveColor(f) === sourceColor,
    );
    const otherNonTR = target.flowers.filter(
      f => f.color !== 'triple_rainbow' && !(sourceColor !== null && getFlowerEffectiveColor(f) === sourceColor),
    );
    const tr    = target.flowers.filter(f => f.color === 'triple_rainbow');

    while (remaining > 0 && preferred.length > 0) {
      removedFlowers.push(preferred.pop()!);
      remaining--;
    }
    while (remaining > 0 && otherNonTR.length > 0) {
      removedFlowers.push(otherNonTR.pop()!);
      remaining--;
    }
    while (remaining > 0 && tr.length > 0) {
      removedFlowers.push(tr.pop()!);
      remaining--;
    }

    target.flowers = [...tr, ...otherNonTR, ...preferred];
    const updated = classifySet(target);
    if (updated.flowers.length === 0) {
      sets.splice(idx, 1);
    } else {
      sets[idx] = updated;
    }
  }

  return { garden: { sets }, removedFlowers };
}

/**
 * Checks if a set can be targeted by Bug (respects Solid Set immunity).
 */
export function canBugTarget(set: GardenSet, isAutumn: boolean): boolean {
  if (set.isDivine) return false;
  if (set.isSolid && !isAutumn) return false;
  // Bug cannot target the Triple Rainbow card directly (but can eat others in Autumn)
  return true;
}

/**
 * Checks if a set can be targeted by Wind steal.
 * Only Double Wind (2 cards) can steal Triple Rainbow.
 * Solid Sets are immune to Wind entirely.
 */
export function canWindTarget(
  set: GardenSet,
  isDoubleWind: boolean
): boolean {
  if (set.isDivine) return false;
  if (set.isSolid) return false;
  if (set.containsTripleRainbow && !isDoubleWind) return false;
  return true;
}
