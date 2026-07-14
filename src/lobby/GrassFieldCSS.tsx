/**
 * GrassFieldCSS.tsx — CSS-only animated grass field.
 *
 * Renders swaying grass blades + sparkle particles using pure CSS
 * keyframe animations — no Canvas, no WebGL, no Pixi. Designed as a
 * drop-in replacement for the Pixi GrassField when the lobby is shown
 * as a popup over the MMORPG world (where two WebGL contexts would
 * fight each other).
 *
 * Matches the original GrassField visual style:
 *   - Spring palette: pale greens (#DBF9DB, #C3FDB8)
 *   - Very low opacity (0.08-0.18) — blades are subtle atmosphere
 *   - Thick blades (4-8px) with rounded tops
 *   - Smooth swaying via GPU-composited CSS transforms
 */

import { useMemo } from 'react';

interface Blade {
  id: number;
  x: number;        // 0–100 (%)
  y: number;        // 2–17 (%) bottom position — CACHED, not random per render
  h: number;        // blade height (px)
  w: number;        // blade width (px)
  delay: number;    // animation delay (s)
  dur: number;      // animation duration (s)
  color: string;    // blade color
  sway: number;     // max rotation (deg)
  opacity: number;  // blade opacity
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  delay: number;
  dur: number;
  size: number;
}

/** Original spring blade colors from GrassField.tsx SEASON_BLADE_COLORS */
const BLADE_COLORS = ['#DBF9DB', '#C3FDB8'];

function generateBlades(count: number): Blade[] {
  const blades: Blade[] = [];
  for (let i = 0; i < count; i++) {
    blades.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 15 + 2,       // 2–17% from bottom — CACHED
      h: 20 + Math.random() * 26,      // 20–46 px (match original)
      w: 4 + Math.random() * 4,        // 4–8 px thick (match original)
      delay: Math.random() * -4,       // stagger start
      dur: 2.2 + Math.random() * 1.6,  // 2.2–3.8 s
      color: BLADE_COLORS[i % BLADE_COLORS.length],
      sway: 3 + Math.random() * 5,     // 3–8 deg gentle sway
      opacity: 0.08 + Math.random() * 0.10, // 0.08-0.18 (very subtle)
    });
  }
  return blades;
}

function generateSparkles(count: number): Sparkle[] {
  const sparkles: Sparkle[] = [];
  for (let i = 0; i < count; i++) {
    sparkles.push({
      id: i,
      x: Math.random() * 100,
      y: 20 + Math.random() * 60,
      delay: Math.random() * -5,
      dur: 2 + Math.random() * 3,
      size: 2 + Math.random() * 3,
    });
  }
  return sparkles;
}

export function GrassFieldCSS() {
  const blades = useMemo(() => generateBlades(60), []);
  const sparkles = useMemo(() => generateSparkles(12), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #FFF0F5 0%, #F9B7FF 40%, #7FFFD4 100%)',
      }}
    >
      {/* Ground strip — subtle meadow base */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(to top, #C3FDB8 0%, #DBF9DB 30%, transparent 100%)',
          opacity: 0.35,
        }}
      />

      {/* Grass blades — each gets a unique animation name for per-blade sway */}
      {blades.map((b) => (
        <div
          key={b.id}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            bottom: `${b.y}%`,
            width: b.w,
            height: b.h,
            borderRadius: '50% 50% 0 0',
            background: b.color,
            transformOrigin: 'bottom center',
            animation: `grassSway${b.id} ${b.dur}s ease-in-out infinite alternate`,
            animationDelay: `${b.delay}s`,
            opacity: b.opacity,
            zIndex: 1,
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
      ))}

      {/* Sparkle particles */}
      {sparkles.map((s) => (
        <div
          key={`s-${s.id}`}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 0 4px 1px rgba(255,255,255,0.4)',
            animation: `sparkleFloat ${s.dur}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
            opacity: 0,
            pointerEvents: 'none',
            willChange: 'opacity, transform',
          }}
        />
      ))}

      {/* Per-blade keyframes — each blade gets its own sway angle */}
      <style>{`
        ${blades.map((b) => `
          @keyframes grassSway${b.id} {
            0% { transform: rotate(-${b.sway}deg) scaleY(1); }
            100% { transform: rotate(${b.sway}deg) scaleY(1.03); }
          }
        `).join('')}
        @keyframes sparkleFloat {
          0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
          30% { opacity: 0.7; transform: translateY(-10px) scale(1); }
          70% { opacity: 0.3; transform: translateY(-20px) scale(0.7); }
        }
      `}</style>
    </div>
  );
}
