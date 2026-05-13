// ============================================================
// FLOWER GAME — CARD DRAG HOOK
// Manages drag state, hover feedback, ActionZone flow, and
// Wind ×2 multi-select. Designed for integration with FlowerBoard.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, FlowerCard, GardenSet, Player } from '../../types/gameTypes';
import { isFlower, isPower } from '../../cards/cardUtils';

// ── Types ───────────────────────────────────────────────────

export interface DragPreview {
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DragBroadcastData {
  playerId: string;
  cardId: string;
  cardName: string;
}

export interface HoverBroadcastData {
  playerId: string;
  targetPlayerId: string;
  targetSetId: string;
  targetFlowerId?: string;
}

export interface UseCardDragOptions {
  myPlayerId: string | null;
  players: Player[];
  myHand: Card[];
  isMyTurn: boolean;
  phase: string;
  gardenRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  gardenSetRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  flowerRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onBroadcastDragStart?: (data: DragBroadcastData) => void;
  onBroadcastHover?: (data: HoverBroadcastData | null) => void;
  onBroadcastDrop?: () => void;
  onPlayCard: (cardId: string, targetPlayerId: string, targetSetId: string) => void;
  onPlayWindMulti?: (cardId: string, targetPlayerId: string, targetFlowerIds: string[]) => void;
}

export interface UseCardDragReturn {
  // Drag state
  isDragging: boolean;
  draggingCardId: string | null;
  dragPreview: DragPreview | null;
  pointerDragActive: boolean;

  // Hover feedback
  hoveredPlayerId: string | null;
  hoveredSetId: string | null;
  hoveredFlowerId: string | null;
  scaledFlowerIds: string[];
  pushedFlowerIds: string[];
  expandedGardenId: string | null;
  shiftedGardenIds: string[];
  isValidHover: boolean;

  // ActionZone
  actionZoneVisible: boolean;
  actionZoneCanDouble: boolean;

  // Multi-select (Wind ×2)
  multiSelectMode: boolean;
  selectedFlowerIds: string[];

  // Remote drag (from other players)
  remoteDrag: DragBroadcastData | null;
  remoteHover: HoverBroadcastData | null;

  // Event handlers
  onPointerDown: (cardId: string, event: React.PointerEvent<HTMLElement>) => void;
  onToggleFlowerSelection: (flowerId: string) => void;
  onActionCancel: () => void;
  onActionDouble: () => void;
  onActionConfirm: () => void;
  clearDrag: () => void;
  setRemoteDrag: (data: DragBroadcastData | null) => void;
  setRemoteHover: (data: HoverBroadcastData | null) => void;
}

// ── Constants ───────────────────────────────────────────────

const DEADZONE_PX = 10;
const PLAY_LIFT_PX = 24;
const RAF_THROTTLE_MS = 16;

// ── Helpers ─────────────────────────────────────────────────

function getFlowerIdFromEl(el: Element | null): string | null {
  if (!el) return null;
  const id = el.getAttribute('data-flower-id');
  if (id) return id;
  return getFlowerIdFromEl(el.parentElement);
}

function findClosestFlowerInSet(
  setEl: HTMLDivElement,
  clientX: number,
  clientY: number
): { flowerId: string | null; index: number } {
  const flowers = setEl.querySelectorAll('[data-flower-id]');
  let closestId: string | null = null;
  let closestIndex = -1;
  let closestDist = Infinity;

  flowers.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = el.getAttribute('data-flower-id');
      closestIndex = i;
    }
  });

  return { flowerId: closestId, index: closestIndex };
}

function getFlowerIdsInSet(sets: GardenSet[], playerId: string, setId: string): string[] {
  const set = sets.find(s => s.id === setId);
  if (!set) return [];
  return set.flowers.map(f => f.id);
}

function canTargetSet(card: Card, set: GardenSet, targetIsOpponent: boolean): boolean {
  if (card.kind === 'flower') return true;
  if (card.kind === 'power') {
    switch (card.name) {
      case 'wind':
        return targetIsOpponent && !set.isDivine && !set.isSolid;
      case 'bug':
        return targetIsOpponent && !set.isDivine;
      case 'bee':
        return true;
      default:
        return false;
    }
  }
  return false;
}

// ── Hook ────────────────────────────────────────────────────

export function useCardDrag(opts: UseCardDragOptions): UseCardDragReturn {
  const {
    myPlayerId,
    players,
    myHand,
    isMyTurn,
    phase,
    gardenRefs,
    gardenSetRefs,
    flowerRefs,
    onBroadcastDragStart,
    onBroadcastHover,
    onBroadcastDrop,
    onPlayCard,
    onPlayWindMulti,
  } = opts;

  // ── State ─────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [pointerDragActive, setPointerDragActive] = useState(false);

  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [hoveredSetId, setHoveredSetId] = useState<string | null>(null);
  const [hoveredFlowerId, setHoveredFlowerId] = useState<string | null>(null);
  const [scaledFlowerIds, setScaledFlowerIds] = useState<string[]>([]);
  const [pushedFlowerIds, setPushedFlowerIds] = useState<string[]>([]);
  const [expandedGardenId, setExpandedGardenId] = useState<string | null>(null);
  const [shiftedGardenIds, setShiftedGardenIds] = useState<string[]>([]);
  const [isValidHover, setIsValidHover] = useState(false);

  const [actionZoneVisible, setActionZoneVisible] = useState(false);
  const [actionZoneCanDouble, setActionZoneCanDouble] = useState(false);

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedFlowerIds, setSelectedFlowerIds] = useState<string[]>([]);

  const [remoteDrag, setRemoteDragState] = useState<DragBroadcastData | null>(null);
  const [remoteHover, setRemoteHoverState] = useState<HoverBroadcastData | null>(null);

  // ── Refs ──────────────────────────────────────────────────
  const sessionRef = useRef<{
    cardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    dragging: boolean;
  } | null>(null);

  const rafRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<DragPreview | null>(null);
  const lastHoverRef = useRef<{ playerId: string; setId: string; flowerId: string | null } | null>(null);
  const dropTargetRef = useRef<{ playerId: string; setId: string } | null>(null);

  // ── Derived ───────────────────────────────────────────────
  const draggingCard = draggingCardId ? myHand.find(c => c.id === draggingCardId) ?? null : null;
  const isWindCard = draggingCard && isPower(draggingCard, 'wind');
  const windCountInHand = myHand.filter(c => isPower(c, 'wind')).length;

  // ── Broadcast helpers ─────────────────────────────────────
  const broadcastDragStart = useCallback((cardId: string) => {
    const card = myHand.find(c => c.id === cardId);
    if (!card || !myPlayerId || !onBroadcastDragStart) return;
    onBroadcastDragStart({
      playerId: myPlayerId,
      cardId,
      cardName: card.kind === 'power' ? card.name : (card as FlowerCard).color,
    });
  }, [myHand, myPlayerId, onBroadcastDragStart]);

  const broadcastHover = useCallback((playerId: string | null, setId: string | null, flowerId: string | null) => {
    if (!myPlayerId || !onBroadcastHover) return;
    if (!playerId || !setId) {
      onBroadcastHover(null);
      return;
    }
    onBroadcastHover({
      playerId: myPlayerId,
      targetPlayerId: playerId,
      targetSetId: setId,
      targetFlowerId: flowerId ?? undefined,
    });
  }, [myPlayerId, onBroadcastHover]);

  // ── Hit testing ───────────────────────────────────────────
  const hitTestGarden = useCallback((clientX: number, clientY: number): { playerId: string; setId: string } | null => {
    // Check set elements first (more specific)
    for (const [key, el] of Object.entries(gardenSetRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const [playerId, setId] = key.split('::');
        if (playerId && setId) return { playerId, setId };
      }
    }
    // Fall back to garden-level hit test
    for (const [playerId, el] of Object.entries(gardenRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { playerId, setId: '' };
      }
    }
    return null;
  }, [gardenRefs, gardenSetRefs]);

  // ── Hover feedback computation ────────────────────────────
  const computeHoverFeedback = useCallback((
    hit: { playerId: string; setId: string } | null,
    clientX: number,
    clientY: number
  ) => {
    if (!hit || !hit.setId) {
      setHoveredPlayerId(null);
      setHoveredSetId(null);
      setHoveredFlowerId(null);
      setScaledFlowerIds([]);
      setPushedFlowerIds([]);
      setExpandedGardenId(null);
      setShiftedGardenIds([]);
      setIsValidHover(false);
      return;
    }

    const { playerId, setId } = hit;
    const targetPlayer = players.find(p => p.id === playerId);
    const targetSet = targetPlayer?.garden.sets.find(s => s.id === setId);
    if (!targetSet) return;

    // Determine validity
    const targetIsOpponent = playerId !== myPlayerId;
    const valid = draggingCard ? canTargetSet(draggingCard, targetSet, targetIsOpponent) : false;
    setIsValidHover(valid);

    // Find closest flower in set
    const setEl = gardenSetRefs.current[`${playerId}::${setId}`];
    let closestFlowerId: string | null = null;
    if (setEl) {
      const result = findClosestFlowerInSet(setEl, clientX, clientY);
      closestFlowerId = result.flowerId;
    }

    // Compute scaled and pushed flowers
    const allFlowerIds = targetSet.flowers.map(f => f.id);
    const scaled = valid && closestFlowerId ? [closestFlowerId] : [];
    const pushed = valid && closestFlowerId
      ? allFlowerIds.filter(id => id !== closestFlowerId)
      : [];

    // Compute garden shifts
    const expanded = playerId;
    const shifted = players.map(p => p.id).filter(id => id !== playerId);

    setHoveredPlayerId(playerId);
    setHoveredSetId(setId);
    setHoveredFlowerId(closestFlowerId);
    setScaledFlowerIds(scaled);
    setPushedFlowerIds(pushed);
    setExpandedGardenId(expanded);
    setShiftedGardenIds(shifted);

    // Broadcast if changed
    const last = lastHoverRef.current;
    if (!last || last.playerId !== playerId || last.setId !== setId || last.flowerId !== closestFlowerId) {
      lastHoverRef.current = { playerId, setId, flowerId: closestFlowerId };
      broadcastHover(playerId, setId, closestFlowerId);
    }
  }, [draggingCard, players, myPlayerId, gardenSetRefs, broadcastHover]);

  // ── Drag preview scheduling ───────────────────────────────
  const schedulePreview = useCallback((preview: DragPreview) => {
    pendingPreviewRef.current = preview;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingPreviewRef.current) {
        setDragPreview(pendingPreviewRef.current);
        pendingPreviewRef.current = null;
      }
    });
  }, []);

  // ── Clear drag ────────────────────────────────────────────
  const clearDrag = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sessionRef.current = null;
    pendingPreviewRef.current = null;
    setIsDragging(false);
    setDraggingCardId(null);
    setDragPreview(null);
    setPointerDragActive(false);
    setHoveredPlayerId(null);
    setHoveredSetId(null);
    setHoveredFlowerId(null);
    setScaledFlowerIds([]);
    setPushedFlowerIds([]);
    setExpandedGardenId(null);
    setShiftedGardenIds([]);
    setIsValidHover(false);
    setActionZoneVisible(false);
    setActionZoneCanDouble(false);
    setMultiSelectMode(false);
    setSelectedFlowerIds([]);
    lastHoverRef.current = null;
    dropTargetRef.current = null;
    broadcastHover(null, null, null);
  }, [broadcastHover]);

  // ── Pointer down ──────────────────────────────────────────
  const onPointerDown = useCallback((cardId: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!isMyTurn || phase !== 'action') return;

    const sourceEl = event.currentTarget;
    const rect = sourceEl.getBoundingClientRect();

    sessionRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPointerDragActive(true);

    // Check if this is a Wind card and we have 2+
    const card = myHand.find(c => c.id === cardId);
    const canDouble = !!(card && isPower(card, 'wind') && windCountInHand >= 2);
    setActionZoneCanDouble(canDouble);
  }, [isMyTurn, phase, myHand, windCountInHand]);

  // ── Global pointer listeners ──────────────────────────────
  useEffect(() => {
    if (!pointerDragActive) return;

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;

      if (!session.dragging) {
        if (Math.hypot(dx, dy) < DEADZONE_PX) return;
        const pulledUp = dy <= -PLAY_LIFT_PX;
        if (!pulledUp) return;
        session.dragging = true;
        setIsDragging(true);
        setDraggingCardId(session.cardId);
        broadcastDragStart(session.cardId);
      }

      event.preventDefault();
      schedulePreview({
        cardId: session.cardId,
        x: event.clientX - session.offsetX,
        y: event.clientY - session.offsetY,
        width: session.width,
        height: session.height,
      });

      const hit = hitTestGarden(event.clientX, event.clientY);
      computeHoverFeedback(hit, event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const wasDragging = session.dragging;
      const hit = wasDragging ? hitTestGarden(event.clientX, event.clientY) : null;

      // Store drop target for confirm flow
      if (hit && hit.setId) {
        dropTargetRef.current = hit;
      }

      if (wasDragging && hit && hit.setId) {
        // Show ActionZone instead of immediately resolving
        setActionZoneVisible(true);
      } else {
        clearDrag();
      }

      sessionRef.current = null;
      setPointerDragActive(false);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [pointerDragActive, hitTestGarden, computeHoverFeedback, schedulePreview, broadcastDragStart, clearDrag]);

  // ── ActionZone handlers ───────────────────────────────────
  const onActionCancel = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const onActionDouble = useCallback(() => {
    if (!isWindCard || !dropTargetRef.current) return;
    setMultiSelectMode(true);
    setActionZoneVisible(false);
  }, [isWindCard]);

  const onActionConfirm = useCallback(() => {
    const target = dropTargetRef.current;
    const cardId = draggingCardId;
    if (!target || !cardId) {
      clearDrag();
      return;
    }

    if (multiSelectMode && selectedFlowerIds.length > 0) {
      // Wind multi-select flow
      onPlayWindMulti?.(cardId, target.playerId, selectedFlowerIds);
    } else {
      // Standard play flow
      onPlayCard(cardId, target.playerId, target.setId);
    }

    onBroadcastDrop?.();
    clearDrag();
  }, [draggingCardId, multiSelectMode, selectedFlowerIds, onPlayCard, onPlayWindMulti, onBroadcastDrop, clearDrag]);

  // ── Multi-select flower toggle ────────────────────────────
  const onToggleFlowerSelection = useCallback((flowerId: string) => {
    if (!multiSelectMode) return;
    setSelectedFlowerIds(prev => {
      if (prev.includes(flowerId)) {
        return prev.filter(id => id !== flowerId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, flowerId];
    });
  }, [multiSelectMode]);

  // ── Remote state setters ──────────────────────────────────
  const setRemoteDrag = useCallback((data: DragBroadcastData | null) => {
    setRemoteDragState(data);
  }, []);

  const setRemoteHover = useCallback((data: HoverBroadcastData | null) => {
    setRemoteHoverState(data);
  }, []);

  return {
    isDragging,
    draggingCardId,
    dragPreview,
    pointerDragActive,

    hoveredPlayerId,
    hoveredSetId,
    hoveredFlowerId,
    scaledFlowerIds,
    pushedFlowerIds,
    expandedGardenId,
    shiftedGardenIds,
    isValidHover,

    actionZoneVisible,
    actionZoneCanDouble,

    multiSelectMode,
    selectedFlowerIds,

    remoteDrag,
    remoteHover,

    onPointerDown,
    onToggleFlowerSelection,
    onActionCancel,
    onActionDouble,
    onActionConfirm,
    clearDrag,
    setRemoteDrag,
    setRemoteHover,
  };
}
