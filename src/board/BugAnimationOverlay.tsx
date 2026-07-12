// ============================================================
// BUG ANIMATION OVERLAY
//
// 3-phase animation:
//   1. landing  — bug drops from above onto the flower (~700ms)
//   2. idle     — bug sits on flower breathing until outcome known
//   3. blocked  — bug hops frustrated then leaps away (~1200ms)
//   3. success  — bug grabs flower and flies to discard (~1800ms)
//
// Portal-rendered to document.body to escape ancestor transforms.
// ============================================================

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import bugAnim from '../assets/animations/bug-animation.gif';
import { flowerArt } from '../utils/flowerArt';

export interface BugAnimation {
  id: string;
  phase: 'landing' | 'idle' | 'blocked' | 'success' | 'complete';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  flowerColor: string;
  flowerId?: string;
  secondFlowerColor?: string;
  secondFlowerId?: string;
  isAutumn?: boolean;
  phaseStartTime: number;
  startTime: number;
}

interface BugAnimationOverlayProps {
  animations: BugAnimation[];
  onComplete: (id: string) => void;
}

const LANDING_DURATION = 700;
const BLOCKED_DURATION = 1200;
const SUCCESS_DURATION = 1800;
const IDLE_MAX = 30000; // safety: auto-leap after 30s if stuck in idle

function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.9375; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.984375; }
  t -= 2.625 / 2.75;
  return 7.5625 * t * t + 0.99609375;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Compute visual style for the bug DOM element.
 *  The bug is positioned so it perches ON the flower (offset upward).
 */
function computeBugStyle(a: BugAnimation, now: number) {
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;

  const duration =
    a.phase === 'landing' ? LANDING_DURATION :
    a.phase === 'idle' ? IDLE_MAX :
    a.phase === 'blocked' ? BLOCKED_DURATION :
    a.phase === 'success' ? SUCCESS_DURATION : 500;

  // Auto-complete blocked / success (landing transitions to idle externally)
  if ((a.phase === 'blocked' || a.phase === 'success') && elapsed >= duration) {
    return { x: a.fromX, y: a.fromY - 30, scale: 0, rotation: 0, opacity: 0, done: true };
  }

  const t = Math.min(1, elapsed / duration);
  const sizeMult = a.isAutumn ? 2 : 1;

  // ── Landing: drop from above with bounce ──
  if (a.phase === 'landing') {
    const dropProgress = easeOutBounce(t);
    const startY = a.fromY - 140;
    const endY = a.fromY - 30;
    return {
      x: a.fromX,
      y: startY + (endY - startY) * dropProgress,
      scale: (0.5 + 0.5 * dropProgress) * sizeMult,
      rotation: Math.sin(t * Math.PI * 4) * 6,
      opacity: 1,
      done: false,
    };
  }

  // ── Idle: subtle breathing while waiting for outcome ──
  if (a.phase === 'idle') {
    const breath = Math.sin(elapsed * 0.004) * 0.04;
    return {
      x: a.fromX,
      y: a.fromY - 30 + breath * 20,
      scale: (1.0 + breath) * sizeMult,
      rotation: Math.sin(elapsed * 0.003) * 3,
      opacity: 1,
      done: false,
    };
  }

  // ── Blocked: 3 angry hops then leap off-screen ──
  if (a.phase === 'blocked') {
    const hopCount = 3;
    const hopFrac = 0.65;
    if (t < hopFrac) {
      const localT = (t / hopFrac * hopCount) % 1;
      const hopIdx = Math.floor(t / hopFrac * hopCount);
      const hopHeight = 28 * (1 - hopIdx / hopCount);
      const hopXOffset = (hopIdx % 2 === 0 ? 1 : -1) * 12 * localT;
      return {
        x: a.fromX + hopXOffset,
        y: a.fromY - 30 - Math.sin(localT * Math.PI) * hopHeight,
        scale: (1.0 + Math.sin(localT * Math.PI) * 0.10) * sizeMult,
        rotation: Math.sin(localT * Math.PI * 2) * 10,
        opacity: 1,
        done: false,
      };
    }
    const leapT = easeOutQuad((t - hopFrac) / (1 - hopFrac));
    const leapDirX = 400;
    const leapDirY = 120;
    return {
      x: a.fromX + leapT * leapDirX,
      y: a.fromY - 30 - Math.sin(leapT * Math.PI) * 100 + leapT * leapDirY,
      scale: (1.0 * (1 - leapT * 0.5)) * sizeMult,
      rotation: leapT * 60,
      opacity: 1 - leapT,
      done: false,
    };
  }

  // ── Success: fly to discard carrying the flower ──
  const flyT = easeInOutCubic(t);
  const arcHeight = Math.abs(a.toX - a.fromX) * 0.25;
  return {
    x: a.fromX + (a.toX - a.fromX) * flyT,
    y: a.fromY - 30 + (a.toY - (a.fromY - 30)) * flyT - Math.sin(flyT * Math.PI) * arcHeight,
    scale: (1.0 * (1 - flyT * 0.3)) * sizeMult,
    rotation: flyT * 30,
    opacity: 1 - flyT * flyT * 0.4,
    done: false,
  };
}

/** Compute carried flower position during success phase (lags slightly behind bug). */
function computeFlowerStyle(a: BugAnimation, now: number) {
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;

  const duration = SUCCESS_DURATION;
  if (elapsed >= duration) return null;

  const t = Math.min(1, elapsed / duration);
  const flyT = easeInOutCubic(t);
  const arcHeight = Math.abs(a.toX - a.fromX) * 0.25;

  const flowerLag = 0.10;
  const flowerT = Math.max(0, Math.min(1, t - flowerLag));
  const flowerFlyT = easeInOutCubic(flowerT);

  const x = a.fromX + (a.toX - a.fromX) * flowerFlyT;
  const y = a.fromY - 10 + (a.toY - (a.fromY - 10)) * flowerFlyT - Math.sin(flowerFlyT * Math.PI) * arcHeight;
  const scale = 0.85 * (1 - flyT * 0.2);
  const opacity = 1 - flyT * flyT * 0.35;
  const rotation = flyT * Math.PI * 0.6 * (180 / Math.PI); // rad → deg

  return { x, y: y + 8, scale, opacity, rotation };
}

export const BugAnimationOverlay = React.memo(function BugAnimationOverlay({
  animations,
  onComplete,
}: BugAnimationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animsRef = useRef<BugAnimation[]>([]);
  const rafRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  const [now, setNow] = useState(() => Date.now());
  const tickRunningRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const brightenedFlowersRef = useRef<Set<string>>(new Set());
  onCompleteRef.current = onComplete;

  // Reset brightness on any flowers we modified
  const resetFlowerBrightness = useCallback((flowerId?: string, secondFlowerId?: string) => {
    const resetOne = (id?: string) => {
      if (!id) return;
      const el = document.querySelector(`[data-flower-id="${id}"]`) as HTMLElement | null;
      if (el) {
        el.style.filter = '';
        el.style.transition = '';
      }
      brightenedFlowersRef.current.delete(id);
    };
    resetOne(flowerId);
    resetOne(secondFlowerId);
  }, []);

  // Reset all tracked brightened flowers
  const resetAllBrightened = useCallback(() => {
    for (const fid of brightenedFlowersRef.current) {
      const el = document.querySelector(`[data-flower-id="${fid}"]`) as HTMLElement | null;
      if (el) {
        el.style.filter = '';
        el.style.transition = '';
      }
    }
    brightenedFlowersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    animsRef.current = animations;
  }, [animations]);

  // Start / stop the canvas tick loop. We NEVER return a cleanup function here
  // because React would call it on every animations.length change (even 1→1),
  // which would kill the rAF. Instead we manage cleanup manually.
  useEffect(() => {
    if (animations.length === 0) {
      if (tickRunningRef.current) {
        cleanupRef.current?.();
        cleanupRef.current = null;
        tickRunningRef.current = false;
      }
      return;
    }

    if (tickRunningRef.current) return; // already running

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0, h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      const currentNow = Date.now();
      setNow(currentNow);
      ctx.clearRect(0, 0, w, h);

      for (const a of animsRef.current) {
        let elapsed = currentNow - a.phaseStartTime;
        if (a.phaseStartTime === 0) {
          a.phaseStartTime = currentNow;
          elapsed = 0;
        }

        if (a.phase === 'complete') {
          onCompleteRef.current?.(a.id);
          continue;
        }

        const duration =
          a.phase === 'landing' ? LANDING_DURATION :
          a.phase === 'idle' ? IDLE_MAX :
          a.phase === 'blocked' ? BLOCKED_DURATION :
          a.phase === 'success' ? SUCCESS_DURATION : 500;

        // Only auto-complete blocked / success / idle-timeout. Landing
        // transitions to idle externally (via useEffect in parent).
        if ((a.phase === 'blocked' || a.phase === 'success') && elapsed >= duration) {
          resetFlowerBrightness(a.flowerId, a.secondFlowerId);
          onCompleteRef.current?.(a.id);
          continue;
        }
        if (a.phase === 'idle' && elapsed >= IDLE_MAX) {
          onCompleteRef.current?.(a.id);
          continue;
        }

        const t = Math.min(1, elapsed / duration);

        // ── Blocked: flash victim flower brightness (invert for black flowers) ──
        if (a.phase === 'blocked') {
          const progress = Math.min(1, elapsed / 1500);
          const applyFlash = (flowerId: string | undefined, flowerColor: string | undefined) => {
            if (!flowerId || !flowerColor) return;
            const el = document.querySelector(`[data-flower-id="${flowerId}"]`) as HTMLElement | null;
            if (el) {
              if (flowerColor === 'black') {
                const invertAmount = Math.max(0, 1 - progress);
                el.style.filter = `invert(${invertAmount})`;
              } else {
                const brightness = Math.max(1, 2 - progress);
                el.style.filter = `brightness(${brightness})`;
              }
              el.style.transition = 'none';
              brightenedFlowersRef.current.add(flowerId);
            }
          };
          applyFlash(a.flowerId, a.flowerColor);
          applyFlash(a.secondFlowerId, a.secondFlowerColor);
        }

        // ── Landing dust puff ──
        if (a.phase === 'landing' && t > 0.65) {
          const dustT = (t - 0.65) / 0.35;
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const dist = 18 * dustT;
            ctx.fillStyle = `rgba(160, 130, 90, ${0.45 * (1 - dustT)})`;
            ctx.beginPath();
            ctx.arc(a.fromX + Math.cos(angle) * dist, a.fromY + Math.sin(angle) * dist * 0.5, 3.5 * (1 - dustT), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ── Success: trail only (flower is rendered as DOM <img>) ──
        if (a.phase === 'success') {
          const flyT = easeInOutCubic(t);
          const arcHeight = Math.abs(a.toX - a.fromX) * 0.25;

          if (t > 0.08 && t < 0.92) {
            for (let i = 1; i <= 6; i++) {
              const trailT = Math.max(0, t - i * 0.035);
              const tt = easeInOutCubic(trailT);
              const tx = a.fromX + (a.toX - a.fromX) * tt;
              const ty = a.fromY - 30 + (a.toY - (a.fromY - 30)) * tt - Math.sin(tt * Math.PI) * arcHeight;
              ctx.fillStyle = `rgba(120, 160, 50, ${0.35 * (1 - i / 6) * (1 - t)})`;
              ctx.beginPath();
              ctx.arc(tx, ty, 5 * (1 - i / 6), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tickRunningRef.current = true;
    rafRef.current = requestAnimationFrame(tick);

    cleanupRef.current = () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [animations.length]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      tickRunningRef.current = false;
      resetAllBrightened();
    };
  }, [resetAllBrightened]);

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
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: animations.length > 0 ? 1 : 0,
        }}
      />

      {/* Bug elements */}
      {animations.map(a => {
        const style = computeBugStyle(a, now);
        if (style.done) return null;

        return (
          <div
            key={a.id}
            id={`bug-anim-${a.id}`}
            style={{
              position: 'absolute',
              left: style.x,
              top: style.y,
              transform: `translate(-50%, -50%) scale(${style.scale}) rotate(${style.rotation}deg)`,
              opacity: style.opacity,
              transition: 'none',
              willChange: 'transform, opacity',
              width: 140,
              height: 140,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={bugAnim}
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

      {/* Carried flowers during success phase */}
      {animations.map(a => {
        if (a.phase !== 'success') return null;
        const fStyle = computeFlowerStyle(a, now);
        if (!fStyle) return null;

        const flowers: { src: string; offsetX: number; offsetY: number }[] = [
          { src: flowerArt(a.flowerColor as any), offsetX: a.isAutumn ? -22 : 0, offsetY: 0 },
        ];
        if (a.isAutumn && a.secondFlowerColor) {
          flowers.push({ src: flowerArt(a.secondFlowerColor as any), offsetX: 22, offsetY: 0 });
        }

        return (
          <React.Fragment key={`flower-${a.id}`}>
            {flowers.map((f, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: fStyle.x + f.offsetX,
                  top: fStyle.y + f.offsetY,
                  transform: `translate(-50%, -50%) scale(${fStyle.scale}) rotate(${fStyle.rotation + i * 15}deg)`,
                  opacity: fStyle.opacity,
                  transition: 'none',
                  willChange: 'transform, opacity',
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <img
                  src={f.src}
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
            ))}
          </React.Fragment>
        );
      })}
    </div>,
    document.body
  );
});
