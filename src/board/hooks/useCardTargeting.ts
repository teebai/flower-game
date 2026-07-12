// ============================================================
// useCardTargeting — Garden hit-testing for drag-and-drop
//
// Uses document.elementsFromPoint for reliable hit detection.
// The drag preview MUST have pointer-events:none so it doesn't
// block the garden elements underneath.
//
// Set zones and flowers carry data attributes:
//   data-set-id      → set identifier
//   data-player-id   → player identifier
//   data-garden-id   → garden container identifier
// ============================================================

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Card } from '../../types/gameTypes';
import { isFlower, isPower } from '../../cards/cardUtils';

export interface GardenDropHit {
  playerId: string;
  setId: string;
}

export interface UseCardTargetingOptions {
  draggedCardId: string | null;
  players: { id: string; hand: Card[] }[];
  myPlayerId: string | null;
  pointerPosition: { x: number; y: number } | null;
}

export interface UseCardTargetingReturn {
  hoveredTarget: GardenDropHit | null;
  hoverMode: 'flower' | 'set' | 'garden' | 'none';
  clearHover: () => void;
}

function hitTestGardenDrop(clientX: number, clientY: number): GardenDropHit | null {
  const elements = document.elementsFromPoint(clientX, clientY);

  // Check set zones first (most specific)
  for (const el of elements) {
    const setId = el.getAttribute('data-set-id');
    const playerId = el.getAttribute('data-player-id');
    if (setId && playerId) {
      return { playerId, setId };
    }
  }

  // Fall back to garden-level hit test
  for (const el of elements) {
    const playerId = el.getAttribute('data-garden-id');
    if (playerId) {
      return { playerId, setId: '' };
    }
  }

  return null;
}

function computeHoverMode(card: Card | null | undefined): 'flower' | 'set' | 'garden' | 'none' {
  if (!card) return 'none';
  if (card.kind === 'flower') return 'set';
  if (card.kind !== 'power') return 'none';
  const name = card.name;
  if (['wind', 'bug'].includes(name)) return 'flower';
  if (['natural_disaster', 'double_happiness', 'bee'].includes(name)) return 'set';
  if (['trade_fate', 'trade_present'].includes(name)) return 'garden';
  return 'none';
}

export function useCardTargeting(options: UseCardTargetingOptions): UseCardTargetingReturn {
  const { draggedCardId, players, myPlayerId, pointerPosition } = options;

  const draggedCard = useMemo(() => {
    if (!draggedCardId || !myPlayerId) return undefined;
    const me = players.find((p) => p.id === myPlayerId);
    return me?.hand.find((c) => c.id === draggedCardId);
  }, [draggedCardId, players, myPlayerId]);

  const hoverMode = useMemo(() => computeHoverMode(draggedCard), [draggedCard]);

  // Cache last hit result so we return the SAME object reference when hovering
  // the same target. This prevents FlowerBoard from re-rendering when the
  // pointer wiggles within the same set.
  const lastHitRef = useRef<GardenDropHit | null>(null);

  const hoveredTarget = useMemo(() => {
    if (!pointerPosition) return null;
    const next = hitTestGardenDrop(pointerPosition.x, pointerPosition.y);
    const prev = lastHitRef.current;
    if (
      prev && next &&
      prev.playerId === next.playerId &&
      prev.setId === next.setId
    ) {
      return prev;
    }
    lastHitRef.current = next;
    return next;
  }, [pointerPosition]);

  const [hoverCleared, setHoverCleared] = useState(false);

  // Reset the cleared flag whenever a new drag starts (not on every pixel move)
  useEffect(() => {
    if (draggedCardId) setHoverCleared(false);
  }, [draggedCardId]);

  const clearHover = useCallback(() => {
    setHoverCleared(true);
  }, []);

  const effectiveHoveredTarget = hoverCleared ? null : hoveredTarget;

  return {
    hoveredTarget: effectiveHoveredTarget,
    hoverMode,
    clearHover,
  };
}
