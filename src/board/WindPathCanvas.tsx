import React, { useRef, useEffect, useCallback } from 'react';
import { flowerArt } from '../utils/flowerArt';
import type { FlowerColor } from '../types/gameTypes';

// ============================================================
// WIND PATH — Canvas-based flower flight (60fps, no React DOM lag)
// Flowers follow graceful S-curves between gardens
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

export const WindPathCanvas = React.memo(function WindPathCanvas({ flights, onComplete }: WindPathCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flightsRef = useRef<WindFlight[]>([]);
  const rafRef = useRef<number>(0);

  // Sync flights ref
  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  // Preload flower images
  const imgCache = useRef<Record<string, HTMLImageElement>>({});

  const getFlowerImg = useCallback((color: FlowerColor): HTMLImageElement | null => {
    const src = flowerArt(color);
    if (imgCache.current[src]) return imgCache.current[src];
    const img = new Image();
    img.src = src;
    imgCache.current[src] = img;
    return null; // not ready yet
  }, []);

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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = (time: number) => {
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);

      const active = flightsRef.current.filter(f => {
        const elapsed = now - f.startTime;
        if (elapsed >= f.duration) {
          onComplete?.(f.id);
          return false;
        }
        return true;
      });

      for (const f of active) {
        const elapsed = now - f.startTime;
        const t = Math.min(1, elapsed / f.duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Gentle S-curve
        const dx = f.toX - f.fromX;
        const dy = f.toY - f.fromY;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (f.fromX + f.toX) / 2;
        const midY = (f.fromY + f.toY) / 2;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const curveAmount = dist * 0.30;
        const sideSwirl = Math.sin(ease * Math.PI * 1.5) * curveAmount * 0.2;
        const mainCurve = Math.sin(ease * Math.PI) * curveAmount;

        const ctrl1X = midX + perpX * mainCurve * 0.4 + perpX * sideSwirl;
        const ctrl1Y = midY + perpY * mainCurve * 0.4 + perpY * sideSwirl;
        const ctrl2X = midX + perpX * mainCurve * 0.7 - perpX * sideSwirl;
        const ctrl2Y = midY + perpY * mainCurve * 0.7 - perpY * sideSwirl;

        const x = Math.pow(1 - ease, 3) * f.fromX
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1X
          + 3 * (1 - ease) * ease * ease * ctrl2X
          + Math.pow(ease, 3) * f.toX;
        const y = Math.pow(1 - ease, 3) * f.fromY
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1Y
          + 3 * (1 - ease) * ease * ease * ctrl2Y
          + Math.pow(ease, 3) * f.toY;

        // Rotation
        const dt = 0.01;
        const tNext = Math.min(1, t + dt);
        const easeNext = tNext < 0.5 ? 4 * tNext * tNext * tNext : 1 - Math.pow(-2 * tNext + 2, 3) / 2;
        const sn = Math.sin(easeNext * Math.PI * 1.5) * curveAmount * 0.2;
        const mc = Math.sin(easeNext * Math.PI) * curveAmount;
        const c1x = midX + perpX * mc * 0.4 + perpX * sn;
        const c1y = midY + perpY * mc * 0.4 + perpY * sn;
        const c2x = midX + perpX * mc * 0.7 - perpX * sn;
        const c2y = midY + perpY * mc * 0.7 - perpY * sn;
        const xn = Math.pow(1 - easeNext, 3) * f.fromX
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * c1x
          + 3 * (1 - easeNext) * easeNext * easeNext * c2x
          + Math.pow(easeNext, 3) * f.toX;
        const yn = Math.pow(1 - easeNext, 3) * f.fromY
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * c1y
          + 3 * (1 - easeNext) * easeNext * easeNext * c2y
          + Math.pow(easeNext, 3) * f.toY;
        const angle = Math.atan2(yn - y, xn - x);

        // Scale
        const scale = 0.6 + Math.sin(t * Math.PI) * 0.5;
        const size = f.size * scale;

        // Fade
        const fadeIn = Math.min(1, t / 0.08);
        const fadeOut = t > 0.92 ? (1 - t) / 0.08 : 1;
        const alpha = fadeIn * fadeOut;

        // Draw wind trail streaks
        for (let i = 0; i < 4; i++) {
          const trailT = Math.max(0, t - (i + 1) * 0.025);
          const trailEase = trailT < 0.5 ? 4 * trailT * trailT * trailT : 1 - Math.pow(-2 * trailT + 2, 3) / 2;
          const tsn = Math.sin(trailEase * Math.PI * 1.5) * curveAmount * 0.2;
          const tmc = Math.sin(trailEase * Math.PI) * curveAmount;
          const tc1x = midX + perpX * tmc * 0.4 + perpX * tsn;
          const tc1y = midY + perpY * tmc * 0.4 + perpY * tsn;
          const tc2x = midX + perpX * tmc * 0.7 - perpX * tsn;
          const tc2y = midY + perpY * tmc * 0.7 - perpY * tsn;
          const tx = Math.pow(1 - trailEase, 3) * f.fromX
            + 3 * Math.pow(1 - trailEase, 2) * trailEase * tc1x
            + 3 * (1 - trailEase) * trailEase * trailEase * tc2x
            + Math.pow(trailEase, 3) * f.toX;
          const ty = Math.pow(1 - trailEase, 3) * f.fromY
            + 3 * Math.pow(1 - trailEase, 2) * trailEase * tc1y
            + 3 * (1 - trailEase) * trailEase * trailEase * tc2y
            + Math.pow(trailEase, 3) * f.toY;
          const trailAlpha = (1 - i / 4) * 0.3 * (1 - trailT);
          if (trailAlpha > 0.01) {
            ctx.save();
            ctx.translate(tx, ty);
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillStyle = `rgba(220, 240, 255, ${trailAlpha})`;
            ctx.fillRect(-7, -1.5, 14, 3);
            ctx.restore();
          }
        }

        // Draw flower
        const img = getFlowerImg(f.color);
        if (img && img.complete) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle + Math.PI / 2);
          ctx.globalAlpha = alpha;
          ctx.filter = 'brightness(1.3) saturate(1.4)';
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          ctx.globalAlpha = alpha * 0.4;
          ctx.shadowColor = 'rgba(200,230,255,0.5)';
          ctx.shadowBlur = 10;
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
  }, [onComplete, getFlowerImg]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />
  );
});

export default WindPathCanvas;
