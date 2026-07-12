// ============================================================
// NATURAL DISASTER ANIMATION OVERLAY
//
// 4-phase animation targeting a garden set:
//   1. landing  — animation1 scales up onto target set (~600ms)
//   2. idle     — animation1 loops on set waiting for opponent response
//   3. blocked  — flowers glow (brightness/invert exactly like bug card),
//                 anim1 fades over 2.2s
//   4. success  — animation2.gif plays once (0.7s) then hard-hides,
//                 cloned flower images flash brightness(100→1) + fade out
//
// Portal-rendered to document.body to escape ancestor transforms.
// ============================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import naturalDisasterAnim1 from '../assets/animations/natural_disaster-animation1.gif';
import naturalDisasterAnim2 from '../assets/animations/natural_disaster-animation2.gif';

export interface NaturalDisasterAnimation {
  id: string;
  phase: 'landing' | 'idle' | 'blocked' | 'success' | 'complete';
  targetX: number;
  targetY: number;
  targetSetId: string;
  targetPlayerId: string;
  phaseStartTime: number;
  startTime: number;
}

interface NaturalDisasterOverlayProps {
  animations: NaturalDisasterAnimation[];
  onComplete: (id: string) => void;
}

interface FlashFlower {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const LANDING_DURATION = 600;
const BLOCKED_DURATION = 2200;
const SUCCESS_GIF_DURATION = 700; // one loop of animation2 = 10 frames × 70ms
const IDLE_MAX = 30000;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Get center position of a set by averaging its flower positions */
function getSetCenter(setId: string): { x: number; y: number } | null {
  const flowers = document.querySelectorAll(`[data-set-id="${setId}"][data-flower-id]`);
  if (flowers.length === 0) {
    const setEl = document.querySelector(`[data-set-id="${setId}"]`) as HTMLElement | null;
    if (!setEl) return null;
    const r = setEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 - 100 };
  }
  let sumX = 0, sumY = 0;
  for (const f of flowers) {
    const r = f.getBoundingClientRect();
    sumX += r.left + r.width / 2;
    sumY += r.top + r.height / 2;
  }
  return { x: sumX / flowers.length, y: sumY / flowers.length - 100 };
}

/** Compute visual style for the disaster GIF DOM element */
function computeDisasterStyle(a: NaturalDisasterAnimation, now: number) {
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;

  const duration =
    a.phase === 'landing' ? LANDING_DURATION :
    a.phase === 'blocked' ? BLOCKED_DURATION :
    a.phase === 'success' ? SUCCESS_GIF_DURATION :
    a.phase === 'idle' ? IDLE_MAX : 500;

  if ((a.phase === 'blocked' || a.phase === 'success') && elapsed >= duration) {
    return { x: a.targetX, y: a.targetY, scale: 0, rotation: 0, opacity: 0, done: true };
  }

  const t = Math.min(1, elapsed / duration);

  // ── Landing: scale up onto target set ──
  if (a.phase === 'landing') {
    const scale = easeOutBack(t) * 0.85;
    return {
      x: a.targetX,
      y: a.targetY,
      scale,
      rotation: Math.sin(t * Math.PI * 2) * 2,
      opacity: 1,
      done: false,
    };
  }

  // ── Idle: subtle pulse while waiting ──
  if (a.phase === 'idle') {
    const pulse = Math.sin(elapsed * 0.003) * 0.03;
    return {
      x: a.targetX,
      y: a.targetY + Math.sin(elapsed * 0.002) * 3,
      scale: 0.85 + pulse,
      rotation: Math.sin(elapsed * 0.0015) * 1.5,
      opacity: 1,
      done: false,
    };
  }

  // ── Blocked: fade out over 2.2s ──
  if (a.phase === 'blocked') {
    const fadeT = easeOutQuad(t);
    return {
      x: a.targetX,
      y: a.targetY,
      scale: 0.85 * (1 - fadeT * 0.15),
      rotation: Math.sin(t * Math.PI) * 4,
      opacity: 1 - fadeT,
      done: false,
    };
  }

  // ── Success: animation2 plays once, no fade ──
  return {
    x: a.targetX,
    y: a.targetY,
    scale: 0.85,
    rotation: 0,
    opacity: 1,
    done: false,
  };
}

/** Which GIF to show for current phase */
function getAnimSrc(phase: NaturalDisasterAnimation['phase']) {
  if (phase === 'success') return naturalDisasterAnim2;
  return naturalDisasterAnim1;
}

export const NaturalDisasterOverlay = React.memo(function NaturalDisasterOverlay({
  animations,
  onComplete,
}: NaturalDisasterOverlayProps) {
  const animsRef = useRef<NaturalDisasterAnimation[]>([]);
  const onCompleteRef = useRef(onComplete);
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<number>(0);
  const completedIdsRef = useRef(new Set<string>());
  const brightenedFlowerIdsRef = useRef(new Set<string>());

  // React-safe flash flower data: captured during landing, rendered as React <img> in portal
  const flashFlowerDataRef = useRef<Map<string, FlashFlower[]>>(new Map());
  const flashStylesRef = useRef<Map<string, { brightness: number; opacity: number }>>(new Map());

  onCompleteRef.current = onComplete;

  useLayoutEffect(() => {
    animsRef.current = animations;
  }, [animations]);

  // Track positions of running animations
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const a of animations) {
      const c = getSetCenter(a.targetSetId);
      if (c) pos[a.id] = c;
    }
    setPositions(pos);
  }, [animations.map(a => a.targetSetId).join(',')]);

  useEffect(() => {
    // Prune completed IDs
    const currentIds = new Set(animations.map(a => a.id));
    for (const id of Array.from(completedIdsRef.current)) {
      if (!currentIds.has(id)) {
        completedIdsRef.current.delete(id);
      }
    }

    if (animations.length === 0) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = 0;
      }
      // Reset all flower filters
      for (const fid of brightenedFlowerIdsRef.current) {
        const el = document.querySelector(`[data-flower-id="${fid}"]`) as HTMLElement | null;
        if (el) {
          el.style.filter = '';
          el.style.opacity = '';
          el.style.transition = '';
        }
      }
      brightenedFlowerIdsRef.current.clear();
      flashFlowerDataRef.current.clear();
      flashStylesRef.current.clear();
      return;
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    const tick = () => {
      const currentNow = Date.now();
      setNow(currentNow);

      for (const a of animsRef.current) {
        if (completedIdsRef.current.has(a.id)) continue;

        let elapsed = currentNow - a.phaseStartTime;
        if (a.phaseStartTime === 0) {
          a.phaseStartTime = currentNow;
          elapsed = 0;
        }

        if (a.phase === 'complete') {
          completedIdsRef.current.add(a.id);
          flashFlowerDataRef.current.delete(a.id);
          flashStylesRef.current.delete(a.id);
          onCompleteRef.current?.(a.id);
          continue;
        }

        const duration =
          a.phase === 'landing' ? LANDING_DURATION :
          a.phase === 'blocked' ? BLOCKED_DURATION :
          a.phase === 'success' ? SUCCESS_GIF_DURATION :
          a.phase === 'idle' ? IDLE_MAX : 500;

        if ((a.phase === 'blocked' || a.phase === 'success') && elapsed >= duration) {
          completedIdsRef.current.add(a.id);
          flashFlowerDataRef.current.delete(a.id);
          flashStylesRef.current.delete(a.id);
          onCompleteRef.current?.(a.id);
          continue;
        }
        if (a.phase === 'idle' && elapsed >= IDLE_MAX) {
          completedIdsRef.current.add(a.id);
          flashFlowerDataRef.current.delete(a.id);
          flashStylesRef.current.delete(a.id);
          onCompleteRef.current?.(a.id);
          continue;
        }

        // ── Landing: capture flower image data for success flash ──
        if (a.phase === 'landing' && !flashFlowerDataRef.current.has(a.id)) {
          const flowerEls = document.querySelectorAll(`[data-set-id="${a.targetSetId}"][data-flower-id]`);
          const data: FlashFlower[] = [];
          for (const fEl of flowerEls) {
            const img = fEl.querySelector('img') as HTMLImageElement | null;
            if (!img) continue;
            const rect = fEl.getBoundingClientRect();
            data.push({
              src: img.src,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            });
          }
          if (data.length > 0) flashFlowerDataRef.current.set(a.id, data);
        }

        // ── Blocked: flash original flowers exactly like bug card ──
        if (a.phase === 'blocked') {
          const progress = Math.min(1, elapsed / 1500);

          const flowerEls = document.querySelectorAll(`[data-set-id="${a.targetSetId}"][data-flower-id]`);
          for (const fEl of flowerEls) {
            const el = fEl as HTMLElement;
            const flowerColor = el.getAttribute('data-flower-color') || '';
            if (flowerColor === 'black') {
              const invertAmount = Math.max(0, 1 - progress);
              el.style.filter = `invert(${invertAmount})`;
            } else {
              const brightness = Math.max(1, 3 - progress * 2);
              el.style.filter = `brightness(${brightness})`;
            }
            el.style.transition = 'none';
            const fid = el.getAttribute('data-flower-id') || '';
            if (fid) brightenedFlowerIdsRef.current.add(fid);
          }
        }

        // ── Success: update flash styles (rendered as React <img> in portal) ──
        if (a.phase === 'success') {
          const progress = Math.min(1, elapsed / SUCCESS_GIF_DURATION);
          const brightness = Math.max(1, 100 - progress * 99);
          const opacity = Math.max(0, 1 - progress);
          flashStylesRef.current.set(a.id, { brightness, opacity });
        }
      }
      intervalRef.current = requestAnimationFrame(tick);
    };
    intervalRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(intervalRef.current);
      intervalRef.current = 0;
      for (const fid of brightenedFlowerIdsRef.current) {
        const el = document.querySelector(`[data-flower-id="${fid}"]`) as HTMLElement | null;
        if (el) {
          el.style.filter = '';
          el.style.opacity = '';
          el.style.transition = '';
        }
      }
      brightenedFlowerIdsRef.current.clear();
      flashFlowerDataRef.current.clear();
      flashStylesRef.current.clear();
    };
  }, [animations.length]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9998,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Disaster GIF element */}
      {animations.map(a => {
        const pos = positions[a.id];
        const style = computeDisasterStyle(a, now);
        if (style.done) return null;

        return (
          <div
            key={a.id}
            id={`nd-anim-${a.id}`}
            style={{
              position: 'absolute',
              left: pos?.x ?? style.x,
              top: pos?.y ?? style.y,
              transform: `translate(-50%, -50%) scale(${style.scale}) rotate(${style.rotation}deg)`,
              opacity: style.opacity,
              transition: 'none',
              willChange: 'transform, opacity',
              width: 200,
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={getAnimSrc(a.phase)}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                imageRendering: 'auto',
              }}
            />
          </div>
        );
      })}

      {/* Success flash: cloned flower images rendered as React elements */}
      {animations.map(a => {
        if (a.phase !== 'success') return null;
        const data = flashFlowerDataRef.current.get(a.id);
        const s = flashStylesRef.current.get(a.id);
        if (!data) return null;
        return data.map((f, i) => (
          <img
            key={`nd-flash-${a.id}-${i}`}
            src={f.src}
            draggable={false}
            style={{
              position: 'fixed',
              left: f.left,
              top: f.top,
              width: f.width,
              height: f.height,
              objectFit: 'contain',
              pointerEvents: 'none',
              zIndex: 9999,
              filter: `brightness(${s?.brightness ?? 100})`,
              opacity: s?.opacity ?? 1,
              transition: 'none',
            }}
          />
        ));
      })}
    </div>,
    document.body
  );
});
