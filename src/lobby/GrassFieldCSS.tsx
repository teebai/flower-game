/**
 * GrassFieldCSS.tsx — CSS-only animated grass field.
 *
 * Renders swaying grass blades + sparkle particles using pure CSS
 * keyframe animations — no Canvas, no WebGL, no Pixi. Designed as a
 * drop-in replacement for the Pixi GrassField when the lobby is shown
 * as a popup over the MMORPG world (where two WebGL contexts would
 * fight each other).
 */

import { useMemo } from 'react';

interface Blade {
  id: number;
  x: number;        // 0–100 (%)
  y: number;        // 2–22 (%) bottom position — CACHED in useMemo
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

const BLADE_COLORS = ['#DBF9DB', '#C3FDB8', '#B8E6B8'];

function generateBlades(count: number): Blade[] {
  const blades: Blade[] = [];
  for (let i = 0; i < count; i++) {
    blades.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 20 + 2,       // 2–22% from bottom — CACHED
      h: 24 + Math.random() * 32,      // 24–56 px
      w: 4 + Math.random() * 5,        // 4–9 px thick
      delay: Math.random() * -4,       // stagger start
      dur: 2.2 + Math.random() * 1.6,  // 2.2–3.8 s
      color: BLADE_COLORS[i % BLADE_COLORS.length],
      sway: 3 + Math.random() * 5,     // 3–8 deg gentle sway
      opacity: 0.45 + Math.random() * 0.20, // 0.45–0.65 — visible on light bg
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
  const blades = useMemo(() => generateBlades(100), []);
  const sparkles = useMemo(() => generateSparkles(15), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #FFF0F5 0%, #F9B7FF 40%, #7FFFD4 100%)',
      }}
    >
      {/* Ground strip */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '45%',
          background: 'linear-gradient(to top, #C3FDB8 0%, #DBF9DB 35%, transparent 100%)',
          opacity: 0.5,
        }}
      />

      {/* Grass blades */}
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

      {/* Per-blade keyframes */}
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
