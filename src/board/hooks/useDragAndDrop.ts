// ============================================================
// useDragAndDrop — Pure pointer mechanics for card drag & drop
//
// Mouse: pull upward to lift card, drag to target.
// Touch: long-press to lift, then drag anywhere.
//
// Responsibilities:
//   • Pointer capture, deadzone detection, lift / long-press detection
//   • Drag preview RAF scheduling
//   • Hand reorder zone detection + reorder event firing
//   • Pointer release, cleanup on unmount
//
// NOT responsibilities:
//   • Game rules (is it my turn? what phase?)
//   • Garden hit-testing or target validation
//   • Action confirmation or move dispatch
//   • Visual feedback (proximity, hover glow, etc.)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragPreview {
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type PointerDragMode = 'pending' | 'reorder' | 'play' | 'scroll';

type PointerType = 'mouse' | 'touch' | 'pen';

interface PointerDragSession {
  cardId: string;
  pointerId: number;
  captureTarget: Element | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  canPlay: boolean;
  canReorder: boolean;
  mode: PointerDragMode;
  dragging: boolean;
  pointerType: PointerType;
  longPressTimer: number | null;
}

export interface UseDragAndDropOptions {
  handRowRef: React.RefObject<HTMLDivElement | null>;
  onDragStart?: (cardId: string) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (cardId: string, pos: { x: number; y: number }, wasReorder: boolean) => void;
  onReorder?: (cardId: string, clientX: number) => void;
}

export interface UseDragAndDropReturn {
  mode: 'idle' | 'pending' | 'dragging' | 'reordering';
  draggedCardId: string | null;
  dragPreview: DragPreview | null;
  pointerPosition: { x: number; y: number } | null;
  onPointerDown: (
    cardId: string,
    event: React.PointerEvent<HTMLElement>,
    opts?: { canPlay?: boolean; canReorder?: boolean }
  ) => void;
  clearDrag: () => void;
}

const CARD_GESTURE_DEADZONE_PX = 9;
const CARD_PLAY_LIFT_PX = 14;
const CARD_SCROLL_INTENT_PX = 14;
const CARD_REORDER_INTENT_PX = 10;
const LONG_PRESS_MS = 350;

function pointInsideHandReorderZone(
  handRowRef: React.RefObject<HTMLDivElement | null>,
  clientX: number,
  clientY: number
): boolean {
  const handRow = handRowRef.current;
  if (!handRow) return false;
  const rect = handRow.getBoundingClientRect();
  return (
    clientX >= rect.left - 28
    && clientX <= rect.right + 28
    && clientY >= rect.top - 36
    && clientY <= rect.bottom + 36
  );
}

export function useDragAndDrop(options: UseDragAndDropOptions): UseDragAndDropReturn {
  const { handRowRef, onDragStart, onDragMove, onDragEnd, onReorder } = options;

  const [mode, setMode] = useState<'idle' | 'pending' | 'dragging' | 'reordering'>('idle');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);

  const sessionRef = useRef<PointerDragSession | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const pendingDragPreviewRef = useRef<DragPreview | null>(null);

  // Store latest callbacks in refs so the pointer listener effect
  // never re-attaches when callbacks change.
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  const onReorderRef = useRef(onReorder);

  useEffect(() => {
    onDragStartRef.current = onDragStart;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
    onReorderRef.current = onReorder;
  }, [onDragStart, onDragMove, onDragEnd, onReorder]);

  const scheduleDragPreview = useCallback((next: DragPreview | null) => {
    pendingDragPreviewRef.current = next;
    if (dragPreviewFrameRef.current !== null) return;
    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;
      const p = pendingDragPreviewRef.current;
      if (!p) return;
      setDragPreview(p);
    });
  }, []);

  const clearDrag = useCallback(() => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }
    pendingDragPreviewRef.current = null;
    setMode('idle');
    setDraggedCardId(null);
    setDragPreview(null);
    setPointerPosition(null);
    const session = sessionRef.current;
    if (session?.longPressTimer !== null) {
      window.clearTimeout(session.longPressTimer);
    }
    sessionRef.current = null;
  }, []);

  const onPointerDown = useCallback((
    cardId: string,
    event: React.PointerEvent<HTMLElement>,
    opts?: { canPlay?: boolean; canReorder?: boolean }
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const canPlay = opts?.canPlay ?? false;
    const canReorder = opts?.canReorder ?? false;
    if (!canPlay && !canReorder) return;

    const sourceEl = event.currentTarget;
    const rect = sourceEl.getBoundingClientRect();
    const pointerType = (event.pointerType || 'mouse') as PointerType;

    let longPressTimer: number | null = null;

    const session: PointerDragSession = {
      cardId,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      canPlay,
      canReorder,
      mode: 'pending',
      dragging: false,
      pointerType,
      longPressTimer: null,
    };

    // Touch: long-press to initiate drag
    if (pointerType === 'touch' && canPlay) {
      longPressTimer = window.setTimeout(() => {
        if (sessionRef.current !== session || session.mode !== 'pending') return;
        session.mode = 'play';
        session.dragging = true;
        setMode('dragging');
        onDragStartRef.current?.(session.cardId);
        scheduleDragPreview({
          cardId: session.cardId,
          x: session.startX - session.offsetX,
          y: session.startY - session.offsetY,
          width: session.width,
          height: session.height,
        });
      }, LONG_PRESS_MS);
      session.longPressTimer = longPressTimer;
    }

    sessionRef.current = session;

    (event.currentTarget as Element | undefined)?.setPointerCapture?.(event.pointerId);
    setMode('pending');
    setDraggedCardId(cardId);
  }, [scheduleDragPreview]);

  useEffect(() => {
    if (mode === 'idle') return undefined;

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;

      if (session.mode === 'pending') {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Touch: any movement beyond deadzone before long-press fires = abort
        if (session.pointerType === 'touch') {
          if (Math.hypot(dx, dy) >= CARD_GESTURE_DEADZONE_PX) {
            if (session.longPressTimer !== null) {
              window.clearTimeout(session.longPressTimer);
              session.longPressTimer = null;
            }
            sessionRef.current = null;
            setMode('idle');
            setDraggedCardId(null);
          }
          return;
        }

        if (Math.hypot(dx, dy) < CARD_GESTURE_DEADZONE_PX) return;

        if (session.canPlay) {
          const pulledUp = dy <= -CARD_PLAY_LIFT_PX && absY >= absX * 0.7;
          const scrollingSideways = absX >= CARD_SCROLL_INTENT_PX && absX > absY;
          session.mode = pulledUp ? 'play' : scrollingSideways ? 'scroll' : 'pending';
        } else if (session.canReorder) {
          const reorderingSideways = absX >= CARD_REORDER_INTENT_PX && absX >= absY * 0.8;
          session.mode = reorderingSideways && pointInsideHandReorderZone(handRowRef, event.clientX, event.clientY)
            ? 'reorder'
            : 'pending';
        }

        if (session.mode === 'pending') return;
        if (session.mode === 'scroll') {
          if (dragPreviewFrameRef.current !== null) {
            window.cancelAnimationFrame(dragPreviewFrameRef.current);
            dragPreviewFrameRef.current = null;
          }
          pendingDragPreviewRef.current = null;
          sessionRef.current = null;
          setMode('idle');
          setDraggedCardId(null);
          return;
        }

        session.dragging = true;
        if (session.mode === 'play') {
          setMode('dragging');
          onDragStartRef.current?.(session.cardId);
          // Prime the first preview immediately so there is no blank frame
          scheduleDragPreview({
            cardId: session.cardId,
            x: event.clientX - session.offsetX,
            y: event.clientY - session.offsetY,
            width: session.width,
            height: session.height,
          });
        } else {
          setMode('reordering');
        }
      }

      if (session.mode === 'reorder') {
        event.preventDefault();
        onReorderRef.current?.(session.cardId, event.clientX);
        return;
      }

      event.preventDefault();
      scheduleDragPreview({
        cardId: session.cardId,
        x: event.clientX - session.offsetX,
        y: event.clientY - session.offsetY,
        width: session.width,
        height: session.height,
      });
      setPointerPosition({ x: event.clientX, y: event.clientY });
      onDragMoveRef.current?.({ x: event.clientX, y: event.clientY });
    };

    const onPointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const wasDragging = session.dragging;

      if (session.longPressTimer !== null) {
        window.clearTimeout(session.longPressTimer);
        session.longPressTimer = null;
      }

      try {
        (session.captureTarget as Element | undefined)?.releasePointerCapture?.(session.pointerId);
      } catch {
        // Ignore release errors (pointer may already be released)
      }

      sessionRef.current = null;
      clearDrag();

      if (!wasDragging) return;

      if (session.mode === 'reorder' || session.mode === 'play') {
        onDragEndRef.current?.(session.cardId, { x: event.clientX, y: event.clientY }, session.mode === 'reorder');
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [mode, handRowRef, scheduleDragPreview, clearDrag]);

  // Unmount cleanup: release capture and cancel RAF
  useEffect(() => () => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
    }
    const session = sessionRef.current;
    if (session) {
      if (session.longPressTimer !== null) {
        window.clearTimeout(session.longPressTimer);
      }
      try {
        (session.captureTarget as Element | undefined)?.releasePointerCapture?.(session.pointerId);
      } catch { /* ignore */ }
    }
  }, []);

  return {
    mode,
    draggedCardId,
    dragPreview,
    pointerPosition,
    onPointerDown,
    clearDrag,
  };
}
