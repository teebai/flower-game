import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { flowerArt } from '../utils/flowerArt';
import type { FlowerColor } from '../types/gameTypes';

// ============================================================
// WIND PATH — Canvas-based flower flight (60fps, no React DOM lag)
// Flowers follow graceful leaf-like S-curves between gardens
// with flutter, drift, and tumbling for organic wind-blown feel
// ============================================================

export interface WindFlight {
  id: string;
  flowerId: string;
  color: FlowerColor;
  size: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
}

export interface WindPathCanvasProps {
  flights: WindFlight[];
  onComplete?: (id: string) => void;
}

// Preload all flower images once at module level
const ALL_COLORS: FlowerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black'];
const imgCache = new Map<string, HTMLImageElement>();

function preloadFlowerImages() {
  for (const color of ALL_COLORS) {
    const src = flowerArt(color);
    if (!imgCache.has(src)) {
      const img = new Image();
      img.src = src;
      imgCache.set(src, img);
    }
  }
}
preloadFlowerImages();

function getFlowerImg(color: FlowerColor): HTMLImageElement | null {
  const src = flowerArt(color);
  const img = imgCache.get(src);
  if (!img) return null;
  if (!img.complete) return null;
  return img;
}

export const WindPathCanvas = React.memo(function WindPathCanvas({ flights, onComplete }: WindPathCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flightsRef = useRef<WindFlight[]>([]);
  const rafRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Sync flights ref immediately using layout effect (runs before rAF/paint)
  // Preserve startTime from existing ref so animation progress isn't reset on re-render.
  // Also keep flights that are still in progress but not present in the new prop
  // (e.g. parent appended new flights instead of replacing the array).
  useLayoutEffect(() => {
    const existing = flightsRef.current;
    const now = Date.now();
    // Flights in the new prop: preserve their startTime if they were already running
    const updated = flights.map(f => {
      const prev = existing.find(p => p.id === f.id);
      return prev && prev.startTime !== 0 ? { ...f, startTime: prev.startTime } : f;
    });
    // Keep existing flights that are still active but NOT in the new prop
    const newIds = new Set(flights.map(f => f.id));
    const stillActive = existing.filter(p => {
      if (newIds.has(p.id)) return false;
      const elapsed = now - p.startTime;
      return elapsed < p.duration;
    });
    flightsRef.current = stillActive.length > 0 ? [...stillActive, ...updated] : updated;
  }, [flights]);

  useEffect(() => {
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
      const now = Date.now();
      ctx.clearRect(0, 0, w, h);

      // Filter out completed flights and update ref
      const active: WindFlight[] = [];
      for (const f of flightsRef.current) {
        // Initialize startTime on first sight so animation starts when tick loop sees it
        if (f.startTime === 0) {
          f.startTime = now;
        }
        const elapsed = now - f.startTime;
        if (elapsed >= f.duration) {
          onCompleteRef.current?.(f.id);
        } else {
          active.push(f);
        }
      }
      flightsRef.current = active;

      for (const f of active) {
        const elapsed = now - f.startTime;
        const t = Math.min(1, elapsed / f.duration);

        // Smooth ease-in-out with a slight "catch the wind" hold in the middle
        const ease = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // ── Base S-curve path ──
        const dx = f.toX - f.fromX;
        const dy = f.toY - f.fromY;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (f.fromX + f.toX) / 2;
        const midY = (f.fromY + f.toY) / 2;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const curveAmount = dist * 0.28;
        const sideSwirl = Math.sin(ease * Math.PI * 1.5) * curveAmount * 0.2;
        const mainCurve = Math.sin(ease * Math.PI) * curveAmount;

        const ctrl1X = midX + perpX * mainCurve * 0.4 + perpX * sideSwirl;
        const ctrl1Y = midY + perpY * mainCurve * 0.4 + perpY * sideSwirl;
        const ctrl2X = midX + perpX * mainCurve * 0.7 - perpX * sideSwirl;
        const ctrl2Y = midY + perpY * mainCurve * 0.7 - perpY * sideSwirl;

        let x = Math.pow(1 - ease, 3) * f.fromX
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1X
          + 3 * (1 - ease) * ease * ease * ctrl2X
          + Math.pow(ease, 3) * f.toX;
        let y = Math.pow(1 - ease, 3) * f.fromY
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1Y
          + 3 * (1 - ease) * ease * ease * ctrl2Y
          + Math.pow(ease, 3) * f.toY;

        // ── Leaf drift: perpendicular sine wave flutter ──
        const drift1 = Math.sin(ease * Math.PI * 3.5) * dist * 0.035;
        const drift2 = Math.sin(ease * Math.PI * 7.2 + 1.3) * dist * 0.018;
        const drift3 = Math.cos(ease * Math.PI * 11 + 2.7) * dist * 0.008;
        const totalDrift = drift1 + drift2 + drift3;
        x += perpX * totalDrift;
        y += perpY * totalDrift;

        // ── Rotation: tangent + leaf flutter ──
        const dt = 0.008;
        const tNext = Math.min(1, t + dt);
        const easeNext = tNext < 0.5
          ? 4 * tNext * tNext * tNext
          : 1 - Math.pow(-2 * tNext + 2, 3) / 2;
        const sn = Math.sin(easeNext * Math.PI * 1.5) * curveAmount * 0.2;
        const mc = Math.sin(easeNext * Math.PI) * curveAmount;
        const c1x = midX + perpX * mc * 0.4 + perpX * sn;
        const c1y = midY + perpY * mc * 0.4 + perpY * sn;
        const c2x = midX + perpX * mc * 0.7 - perpX * sn;
        const c2y = midY + perpY * mc * 0.7 - perpY * sn;
        let xn = Math.pow(1 - easeNext, 3) * f.fromX
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * c1x
          + 3 * (1 - easeNext) * easeNext * easeNext * c2x
          + Math.pow(easeNext, 3) * f.toX;
        let yn = Math.pow(1 - easeNext, 3) * f.fromY
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * c1y
          + 3 * (1 - easeNext) * easeNext * easeNext * c2y
          + Math.pow(easeNext, 3) * f.toY;
        const driftNext = Math.sin(easeNext * Math.PI * 3.5) * dist * 0.035
          + Math.sin(easeNext * Math.PI * 7.2 + 1.3) * dist * 0.018
          + Math.cos(easeNext * Math.PI * 11 + 2.7) * dist * 0.008;
        xn += perpX * driftNext;
        yn += perpY * driftNext;
        const tangentAngle = Math.atan2(yn - y, xn - x);

        const flutter = Math.sin(ease * Math.PI * 5.5) * 0.55
          + Math.sin(ease * Math.PI * 12 + 1.7) * 0.25;
        const angle = tangentAngle + flutter;

        // ── Scale: tumbling leaf effect ──
        const bloom = Math.sin(t * Math.PI);
        const tumble = 0.82 + 0.18 * Math.abs(Math.sin(ease * Math.PI * 9));
        const scale = (0.55 + bloom * 0.45) * tumble;
        const size = f.size * scale;

        // ── Fade ──
        const fadeIn = Math.min(1, t / 0.06);
        const fadeOut = t > 0.9 ? (1 - t) / 0.1 : 1;
        const alpha = fadeIn * fadeOut;

        // ── Draw wind trail streaks ──
        for (let i = 0; i < 5; i++) {
          const trailT = Math.max(0, t - (i + 1) * 0.02);
          const trailEase = trailT < 0.5
            ? 4 * trailT * trailT * trailT
            : 1 - Math.pow(-2 * trailT + 2, 3) / 2;
          const tsn = Math.sin(trailEase * Math.PI * 1.5) * curveAmount * 0.2;
          const tmc = Math.sin(trailEase * Math.PI) * curveAmount;
          const tc1x = midX + perpX * tmc * 0.4 + perpX * tsn;
          const tc1y = midY + perpY * tmc * 0.4 + perpY * tsn;
          const tc2x = midX + perpX * tmc * 0.7 - perpX * tsn;
          const tc2y = midY + perpY * tmc * 0.7 - perpY * tsn;
          let tx = Math.pow(1 - trailEase, 3) * f.fromX
            + 3 * Math.pow(1 - trailEase, 2) * trailEase * tc1x
            + 3 * (1 - trailEase) * trailEase * trailEase * tc2x
            + Math.pow(trailEase, 3) * f.toX;
          let ty = Math.pow(1 - trailEase, 3) * f.fromY
            + 3 * Math.pow(1 - trailEase, 2) * trailEase * tc1y
            + 3 * (1 - trailEase) * trailEase * trailEase * tc2y
            + Math.pow(trailEase, 3) * f.toY;
          const trailDrift = Math.sin(trailEase * Math.PI * 3.5) * dist * 0.035
            + Math.sin(trailEase * Math.PI * 7.2 + 1.3) * dist * 0.018;
          tx += perpX * trailDrift;
          ty += perpY * trailDrift;
          const trailAlpha = (1 - i / 5) * 0.25 * (1 - trailT * 0.5);
          if (trailAlpha > 0.01) {
            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate(angle + Math.PI / 2);
            const streakLen = 18 + i * 6;
            const streakW = 2.5 - i * 0.3;
            ctx.fillStyle = `rgba(230, 245, 255, ${trailAlpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, streakLen / 2, streakW / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // ── Wind gust particles flying past ──
        const gustSeed = f.id.charCodeAt(0) + f.id.charCodeAt(f.id.length - 1);
        for (let i = 0; i < 6; i++) {
          const gustOffset = (i * 0.17 + gustSeed * 0.03) % 1;
          const gt = ((t + gustOffset) % 1);
          const gustEase = gt < 0.5 ? 4 * gt * gt * gt : 1 - Math.pow(-2 * gt + 2, 3) / 2;
          const gx = f.fromX + (f.toX - f.fromX) * (gustEase * 1.3 - 0.15);
          const gy = f.fromY + (f.toY - f.fromY) * (gustEase * 1.3 - 0.15);
          const gPerpOff = Math.sin(gt * Math.PI * 4 + i * 1.7) * 40;
          const gPx = gx + perpX * gPerpOff;
          const gPy = gy + perpY * gPerpOff;
          const gAlpha = (1 - gt) * 0.15 * alpha;
          if (gAlpha > 0.01 && gt > 0 && gt < 1) {
            ctx.save();
            ctx.translate(gPx, gPy);
            ctx.rotate(angle + Math.PI / 2 + Math.sin(gt * Math.PI * 3) * 0.3);
            ctx.fillStyle = `rgba(255, 255, 255, ${gAlpha})`;
            ctx.fillRect(-12, -1, 24, 2);
            ctx.restore();
          }
        }

        // ── Draw flower ──
        const img = getFlowerImg(f.color);
        if (img && img.complete) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle + Math.PI / 2);
          ctx.globalAlpha = alpha;
          ctx.filter = 'brightness(1.5) saturate(1.6)';
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          // Soft wind glow around flower
          ctx.globalAlpha = alpha * 0.25;
          ctx.shadowColor = 'rgba(200, 240, 255, 0.8)';
          ctx.shadowBlur = 20;
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          ctx.restore();
        } else {
          // Fallback circle if image isn't ready
          ctx.save();
          ctx.translate(x, y);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = f.color === 'red' ? '#ff4444' : '#44ff44';
          ctx.beginPath();
          ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const canvas = (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );

  // Render via portal to document.body so the canvas escapes any ancestor
  // transforms / overflow:hidden that would clip a position:fixed element.
  return createPortal(canvas, document.body);
});

export default WindPathCanvas;
