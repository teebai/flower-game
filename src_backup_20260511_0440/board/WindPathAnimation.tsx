import React, { useRef, useEffect, useState } from 'react';
import { flowerArt } from '../utils/flowerArt';
import type { FlowerColor } from '../types/gameTypes';

// ============================================================
// WIND PATH ANIMATION — Flowers flying between gardens
// Curved path with wind particles trailing behind
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

interface WindPathAnimationProps {
  flights: WindFlight[];
  onComplete?: (flightId: string) => void;
}

export function WindPathAnimation({ flights, onComplete }: WindPathAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlights, setActiveFlights] = useState<WindFlight[]>(flights);

  useEffect(() => {
    setActiveFlights(flights);
  }, [flights]);

  useEffect(() => {
    if (activeFlights.length === 0) return;
    let raf: number;
    const tick = () => {
      const now = performance.now();
      const remaining = activeFlights.filter((f) => {
        const elapsed = now - f.startTime;
        if (elapsed >= f.duration) {
          onComplete?.(f.id);
          return false;
        }
        return true;
      });
      if (remaining.length !== activeFlights.length) {
        setActiveFlights(remaining);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeFlights, onComplete]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {activeFlights.map((f) => {
        const elapsed = performance.now() - f.startTime;

        // Graceful flowing path — gentle S-curve, not aggressive
        const duration = 3600; // 3.6s — slower, more elegant
        const t = Math.min(1, elapsed / duration);
        // Ease in-out with slight overshoot for organic feel
        const ease = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Gentle S-curve: flowers sweep in a soft arc
        const dx = f.toX - f.fromX;
        const dy = f.toY - f.fromY;
        const dist = Math.hypot(dx, dy) || 1;
        const midX = (f.fromX + f.toX) / 2;
        const midY = (f.fromY + f.toY) / 2;

        // Soft perpendicular offset — graceful, not dramatic
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const maxCurve = Math.min(window.innerWidth, window.innerHeight) * 0.12;
        const curveAmount = Math.min(dist * 0.25, maxCurve);
        const sideSwirl = Math.sin(ease * Math.PI * 0.8) * curveAmount * 0.15;
        const mainCurve = Math.sin(ease * Math.PI) * curveAmount;

        const ctrl1X = midX + perpX * mainCurve * 0.4 + perpX * sideSwirl;
        const ctrl1Y = midY + perpY * mainCurve * 0.4 + perpY * sideSwirl;
        const ctrl2X = midX + perpX * mainCurve * 0.7 - perpX * sideSwirl;
        const ctrl2Y = midY + perpY * mainCurve * 0.7 - perpY * sideSwirl;

        // Cubic bezier
        const x = Math.pow(1 - ease, 3) * f.fromX
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1X
          + 3 * (1 - ease) * ease * ease * ctrl2X
          + Math.pow(ease, 3) * f.toX;
        const y = Math.pow(1 - ease, 3) * f.fromY
          + 3 * Math.pow(1 - ease, 2) * ease * ctrl1Y
          + 3 * (1 - ease) * ease * ease * ctrl2Y
          + Math.pow(ease, 3) * f.toY;

        // Rotation follows path tangent
        const dt = 0.01;
        const tNext = Math.min(1, t + dt);
        const easeNext = tNext < 0.5 ? 4 * tNext * tNext * tNext : 1 - Math.pow(-2 * tNext + 2, 3) / 2;
        const sideSwirlNext = Math.sin(easeNext * Math.PI * 1.5) * curveAmount * 0.2;
        const mainCurveNext = Math.sin(easeNext * Math.PI) * curveAmount;
        const ctrl1XNext = midX + perpX * mainCurveNext * 0.4 + perpX * sideSwirlNext;
        const ctrl1YNext = midY + perpY * mainCurveNext * 0.4 + perpY * sideSwirlNext;
        const ctrl2XNext = midX + perpX * mainCurveNext * 0.7 - perpX * sideSwirlNext;
        const ctrl2YNext = midY + perpY * mainCurveNext * 0.7 - perpY * sideSwirlNext;
        const xNext = Math.pow(1 - easeNext, 3) * f.fromX
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * ctrl1XNext
          + 3 * (1 - easeNext) * easeNext * easeNext * ctrl2XNext
          + Math.pow(easeNext, 3) * f.toX;
        const yNext = Math.pow(1 - easeNext, 3) * f.fromY
          + 3 * Math.pow(1 - easeNext, 2) * easeNext * ctrl1YNext
          + 3 * (1 - easeNext) * easeNext * easeNext * ctrl2YNext
          + Math.pow(easeNext, 3) * f.toY;
        const angle = Math.atan2(yNext - y, xNext - x) * (180 / Math.PI) + 90;

        // Scale: gentle bloom in middle, soft start/end
        const scale = 0.6 + Math.sin(t * Math.PI) * 0.5;

        // Fade in/out
        const fadeIn = Math.min(1, t / 0.08);
        const fadeOut = t > 0.92 ? (1 - t) / 0.08 : 1;
        const opacity = fadeIn * fadeOut;

        return (
          <React.Fragment key={f.id}>
            {/* Wind trail — elongated streaks following the curve */}
            {Array.from({ length: 5 }).map((_, i) => {
              const trailT = Math.max(0, t - (i + 1) * 0.025);
              const trailEase = trailT < 0.5 ? 4 * trailT * trailT * trailT : 1 - Math.pow(-2 * trailT + 2, 3) / 2;
              const trailSideSwirl = Math.sin(trailEase * Math.PI * 1.5) * curveAmount * 0.2;
              const trailMainCurve = Math.sin(trailEase * Math.PI) * curveAmount;
              const tCtrl1X = midX + perpX * trailMainCurve * 0.4 + perpX * trailSideSwirl;
              const tCtrl1Y = midY + perpY * trailMainCurve * 0.4 + perpY * trailSideSwirl;
              const tCtrl2X = midX + perpX * trailMainCurve * 0.7 - perpX * trailSideSwirl;
              const tCtrl2Y = midY + perpY * trailMainCurve * 0.7 - perpY * trailSideSwirl;
              const tx = Math.pow(1 - trailEase, 3) * f.fromX
                + 3 * Math.pow(1 - trailEase, 2) * trailEase * tCtrl1X
                + 3 * (1 - trailEase) * trailEase * trailEase * tCtrl2X
                + Math.pow(trailEase, 3) * f.toX;
              const ty = Math.pow(1 - trailEase, 3) * f.fromY
                + 3 * Math.pow(1 - trailEase, 2) * trailEase * tCtrl1Y
                + 3 * (1 - trailEase) * trailEase * trailEase * tCtrl2Y
                + Math.pow(trailEase, 3) * f.toY;
              const trailOpacity = (1 - i / 5) * 0.3 * (1 - trailT);
              if (trailOpacity <= 0.01) return null;
              return (
                <div
                  key={`trail-${i}`}
                  style={{
                    position: 'absolute',
                    left: tx,
                    top: ty,
                    width: 14,
                    height: 3,
                    borderRadius: '40%',
                    background: `rgba(220, 240, 255, ${trailOpacity})`,
                    transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`,
                    filter: 'blur(0.5px)',
                  }}
                />
              );
            })}
            {/* Flying flower */}
            <img
              src={flowerArt(f.color)}
              alt=""
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: f.size * scale,
                height: f.size * scale,
                transform: `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`,
                filter: 'brightness(1.3) saturate(1.4) drop-shadow(0 0 8px rgba(200,230,255,0.4))',
                opacity,
                zIndex: 1000,
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
