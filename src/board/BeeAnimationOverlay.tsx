// ============================================================
// BEE ANIMATION OVERLAY
//
// 4-phase animation:
//   1. emerge   — bee scales up from discard pile carrying flower (~400ms)
//   2. spiral   — bee flies in a spiral from discard to target garden (~1600ms)
//   3. plant    — bee hovers, flower plants with pop + dust puff (~600ms)
//   4. flyOff   — bee flies upward and fades out (~700ms)
//
// Portal-rendered to document.body to escape ancestor transforms.
// ============================================================

import React, { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import beeAnim from '../assets/animations/bee-animation.gif';
import { flowerArt } from '../utils/flowerArt';

export interface BeeAnimation {
  id: string;
  phase: 'emerge' | 'spiral' | 'plant' | 'flyOff' | 'complete';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  flowerColor: string;
  phaseStartTime: number;
  startTime: number;
}

interface BeeAnimationOverlayProps {
  animations: BeeAnimation[];
  onComplete: (id: string) => void;
}

const EMERGE_DURATION = 400;
const SPIRAL_DURATION = 1600;
const PLANT_DURATION = 600;
const FLYOFF_DURATION = 700;
const SPIRAL_ROTATIONS = 2.5;
const SPIRAL_MAX_RADIUS = 80;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** Compute spiral offset at progress t (0→1) */
function spiralOffset(t: number) {
  const angle = t * SPIRAL_ROTATIONS * Math.PI * 2;
  const radius = SPIRAL_MAX_RADIUS * Math.sin(t * Math.PI);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Compute bee position and style for current phase */
function computeBeeStyle(a: BeeAnimation) {
  const now = Date.now();
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;

  const duration =
    a.phase === 'emerge' ? EMERGE_DURATION :
    a.phase === 'spiral' ? SPIRAL_DURATION :
    a.phase === 'plant' ? PLANT_DURATION :
    a.phase === 'flyOff' ? FLYOFF_DURATION : 500;

  if (elapsed >= duration) {
    return { x: a.toX, y: a.toY - 30, scale: 0, rotation: 0, opacity: 0, done: true };
  }

  const t = Math.min(1, elapsed / duration);

  // ── Emerge: scale up at discard pile ──
  if (a.phase === 'emerge') {
    const scale = easeOutBack(t) * 0.75;
    return {
      x: a.fromX,
      y: a.fromY - 20,
      scale,
      rotation: Math.sin(t * Math.PI * 2) * 8,
      opacity: 1,
      done: false,
    };
  }

  // ── Spiral: fly from discard to target with orbital wobble ──
  if (a.phase === 'spiral') {
    const flyT = easeInOutCubic(t);
    const cx = a.fromX + (a.toX - a.fromX) * flyT;
    const cy = a.fromY + (a.toY - a.fromY) * flyT;
    const off = spiralOffset(t);
    return {
      x: cx + off.x,
      y: cy + off.y - 30,
      scale: 0.75 * (1 - t * 0.15),
      rotation: Math.sin(t * Math.PI * SPIRAL_ROTATIONS * 2) * 15,
      opacity: 1,
      done: false,
    };
  }

  // ── Plant: bee is hidden while flower plants ──
  if (a.phase === 'plant') {
    return { x: a.toX, y: a.toY - 35, scale: 0, rotation: 0, opacity: 0, done: true };
  }

  // ── FlyOff: dart upward and outward, fading ──
  const offT = easeOutQuad(t);
  const screenCx = window.innerWidth / 2;
  const outwardDir = a.toX >= screenCx ? 1 : -1; // fly away from screen center
  return {
    x: a.toX + outwardDir * offT * 180 + Math.sin(offT * Math.PI * 3) * 25,
    y: a.toY - 30 - offT * 450,
    scale: 0.65 * (1 - offT * 0.4),
    rotation: offT * -20 + outwardDir * offT * 15,
    opacity: 1 - offT,
    done: false,
  };
}

/** Compute carried flower position during emerge + spiral phases */
function computeCarriedFlowerStyle(a: BeeAnimation) {
  const now = Date.now();
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;

  if (a.phase === 'emerge') {
    const t = Math.min(1, elapsed / EMERGE_DURATION);
    const scale = easeOutBack(t) * 0.55;
    return {
      x: a.fromX,
      y: a.fromY + 8,
      scale,
      opacity: t,
      rotation: Math.sin(t * Math.PI) * 5,
    };
  }

  if (a.phase === 'spiral') {
    const t = Math.min(1, elapsed / SPIRAL_DURATION);
    const flyT = easeInOutCubic(t);
    const cx = a.fromX + (a.toX - a.fromX) * flyT;
    const cy = a.fromY + (a.toY - a.fromY) * flyT;
    const off = spiralOffset(t);
    // Lag slightly behind the bee
    const lag = 0.06;
    const lagT = Math.max(0, Math.min(1, t - lag));
    const lagFlyT = easeInOutCubic(lagT);
    const lagCx = a.fromX + (a.toX - a.fromX) * lagFlyT;
    const lagCy = a.fromY + (a.toY - a.fromY) * lagFlyT;
    const lagOff = spiralOffset(lagT);
    // Fade out carried flower during last 20% of spiral (bee approaching target)
    const fadeStart = 0.8;
    const opacity = t >= fadeStart ? Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart)) : 1;
    return {
      x: lagCx + lagOff.x,
      y: lagCy + lagOff.y + 12,
      scale: 0.55 * (1 - t * 0.1),
      opacity,
      rotation: Math.sin(t * Math.PI * SPIRAL_ROTATIONS * 2) * 10,
    };
  }

  return null;
}

/** Compute planted flower style during plant phase */
function computePlantedFlowerStyle(a: BeeAnimation) {
  if (a.phase !== 'plant') return null;
  const now = Date.now();
  let elapsed = now - a.phaseStartTime;
  if (a.phaseStartTime === 0) elapsed = 0;
  const t = Math.min(1, elapsed / PLANT_DURATION);
  const scale = easeOutElastic(t) * 0.9;
  const dropY = (1 - t) * 25;
  return {
    x: a.toX,
    y: a.toY + dropY,
    scale,
    opacity: 1,
    rotation: Math.sin(t * Math.PI) * 8,
  };
}

export const BeeAnimationOverlay = React.memo(function BeeAnimationOverlay({
  animations,
  onComplete,
}: BeeAnimationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animsRef = useRef<BeeAnimation[]>([]);
  const intervalRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  const completedIdsRef = useRef(new Set<string>());
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  onCompleteRef.current = onComplete;

  useLayoutEffect(() => {
    animsRef.current = animations;
  }, [animations]);

  useEffect(() => {
    // Prune completed IDs that are no longer present
    const currentIds = new Set(animations.map(a => a.id));
    for (const id of Array.from(completedIdsRef.current)) {
      if (!currentIds.has(id)) {
        completedIdsRef.current.delete(id);
      }
    }

    if (animations.length === 0) {
      if (intervalRef.current) {
        cancelAnimationFrame(intervalRef.current);
        intervalRef.current = 0;
      }
      return;
    }

    // Always clear any existing RAF before starting a new one.
    // This is safe because React runs cleanup before the next effect.
    if (intervalRef.current) {
      cancelAnimationFrame(intervalRef.current);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      forceUpdate();
      ctx.clearRect(0, 0, w, h);

      for (const a of animsRef.current) {
        // Skip animations we've already completed this tick cycle
        if (completedIdsRef.current.has(a.id)) continue;

        let elapsed = currentNow - a.phaseStartTime;
        if (a.phaseStartTime === 0) {
          a.phaseStartTime = currentNow;
          elapsed = 0;
        }

        if (a.phase === 'complete') {
          completedIdsRef.current.add(a.id);
          onCompleteRef.current?.(a.id);
          continue;
        }

        const duration =
          a.phase === 'emerge' ? EMERGE_DURATION :
          a.phase === 'spiral' ? SPIRAL_DURATION :
          a.phase === 'plant' ? PLANT_DURATION :
          a.phase === 'flyOff' ? FLYOFF_DURATION : 500;

        if (elapsed >= duration) {
          // Plant phase is driven by parent (transitions to flyOff externally)
          if (a.phase === 'plant') {
            continue;
          }
          completedIdsRef.current.add(a.id);
          onCompleteRef.current?.(a.id);
          continue;
        }

        const t = Math.min(1, elapsed / duration);

        // ── Emerge: pollen burst from discard ──
        if (a.phase === 'emerge' && t < 0.6) {
          const burstT = t / 0.6;
          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2 + burstT * 0.5;
            const dist = 20 * burstT + 5 * Math.sin(angle * 3);
            const px = a.fromX + Math.cos(angle) * dist;
            const py = a.fromY + Math.sin(angle) * dist * 0.6;
            ctx.fillStyle = `rgba(255, 220, 80, ${0.5 * (1 - burstT)})`;
            ctx.beginPath();
            ctx.arc(px, py, 3 * (1 - burstT * 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // ── Spiral: pollen trail ──
        if (a.phase === 'spiral') {
          const flyT = easeInOutCubic(t);
          const cx = a.fromX + (a.toX - a.fromX) * flyT;
          const cy = a.fromY + (a.toY - a.fromY) * flyT;
          const off = spiralOffset(t);
          const bx = cx + off.x;
          const by = cy + off.y - 30;

          if (t > 0.05 && t < 0.95) {
            for (let i = 1; i <= 8; i++) {
              const trailT = Math.max(0, t - i * 0.03);
              const tt = easeInOutCubic(trailT);
              const tcx = a.fromX + (a.toX - a.fromX) * tt;
              const tcy = a.fromY + (a.toY - a.fromY) * tt;
              const toff = spiralOffset(trailT);
              const tx = tcx + toff.x;
              const ty = tcy + toff.y - 30;
              ctx.fillStyle = `rgba(255, 215, 60, ${0.4 * (1 - i / 8) * (1 - t * 0.3)})`;
              ctx.beginPath();
              ctx.arc(tx, ty + 8, 4 * (1 - i / 8), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // ── Plant: dust puff at target ──
        if (a.phase === 'plant' && t < 0.7) {
          const puffT = t / 0.7;
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 15 * puffT + 3 * Math.sin(angle * 4 + puffT * 3);
            const px = a.toX + Math.cos(angle) * dist;
            const py = a.toY + Math.sin(angle) * dist * 0.5;
            ctx.fillStyle = `rgba(140, 200, 80, ${0.4 * (1 - puffT)})`;
            ctx.beginPath();
            ctx.arc(px, py, 3.5 * (1 - puffT * 0.6), 0, Math.PI * 2);
            ctx.fill();
          }
          // Glow ring
          const ringOpacity = 0.3 * Math.sin(puffT * Math.PI);
          ctx.strokeStyle = `rgba(100, 220, 100, ${ringOpacity})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(a.toX, a.toY, 20 * puffT, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      intervalRef.current = requestAnimationFrame(tick);
    };
    intervalRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(intervalRef.current);
      intervalRef.current = 0;
      window.removeEventListener('resize', resize);
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

      {/* Bee element */}
      {animations.map(a => {
        const style = computeBeeStyle(a);
        if (style.done) return null;

        return (
          <div
            key={a.id}
            id={`bee-anim-${a.id}`}
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
              src={beeAnim}
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

      {/* Carried flower during emerge + spiral */}
      {animations.map(a => {
        if (a.phase !== 'emerge' && a.phase !== 'spiral') return null;
        const fStyle = computeCarriedFlowerStyle(a);
        if (!fStyle || fStyle.opacity <= 0) return null;

        return (
          <div
            key={`flower-carry-${a.id}`}
            style={{
              position: 'absolute',
              left: fStyle.x,
              top: fStyle.y,
              transform: `translate(-50%, -50%) scale(${fStyle.scale}) rotate(${fStyle.rotation}deg)`,
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
              src={flowerArt(a.flowerColor as any)}
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

      {/* Planted flower during plant phase */}
      {animations.map(a => {
        if (a.phase !== 'plant') return null;
        const pStyle = computePlantedFlowerStyle(a);
        if (!pStyle) return null;

        return (
          <div
            key={`flower-plant-${a.id}`}
            style={{
              position: 'absolute',
              left: pStyle.x,
              top: pStyle.y,
              transform: `translate(-50%, -50%) scale(${pStyle.scale}) rotate(${pStyle.rotation}deg)`,
              opacity: pStyle.opacity,
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
              src={flowerArt(a.flowerColor as any)}
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
    </div>,
    document.body
  );
});
