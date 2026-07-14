/**
 * GrassFieldCSS.tsx — CSS-only animated grass field.
 *
 * Renders swaying grass blades + sparkle particles using pure CSS
 * keyframe animations — no Canvas, no WebGL, no Pixi. Designed as a
 * drop-in replacement for the Pixi GrassField when the lobby is shown
 * as a popup over the MMORPG world (where two WebGL contexts would
 * fight each other).
 *
 * The visual style matches the original: spring-green meadow with
 * gently swaying blades, soft sparkles, and a warm radial gradient sky.
 */

import { useMemo } from 'react';

interface Blade {
  id: number;
  x: number;        // 0–100 (%)
  h: number;        // blade height (px)
  w: number;        // blade width (px)
  delay: number;    // animation delay (s)
  dur: number;      // animation duration (s)
  hue: number;      // green hue shift
  sway: number;     // max rotation (deg)
  z: number;        // z-index layer
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  delay: number;
  dur: number;
  size: number;
}

function generateBlades(count: number): Blade[] {
  const blades: Blade[] = [];
  for (let i = 0; i < count; i++) {
    blades.push({
      id: i,
      x: Math.random() * 100,
      h: 28 + Math.random() * 44,      // 28–72 px
      w: 2 + Math.random() * 3,        // 2–5 px
      delay: Math.random() * -4,       // stagger start
      dur: 2.2 + Math.random() * 1.6,  // 2.2–3.8 s
      hue: 100 + Math.random() * 40,   // yellow-green to green
      sway: 4 + Math.random() * 8,     // 4–12 deg sway
      z: Math.random() > 0.5 ? 1 : 2,
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
      size: 2 + Math.random() * 4,
    });
  }
  return sparkles;
}

export function GrassFieldCSS() {
  const blades = useMemo(() => generateBlades(90), []);
  const sparkles = useMemo(() => generateSparkles(18), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #FFF0F5 0%, #F9B7FF 40%, #7FFFD4 100%)',
      }}
    >
      {/* Ground strip at the bottom — darker green meadow */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '35%',
          background: 'linear-gradient(to top, #4ecca3 0%, #C3FDB8 40%, transparent 100%)',
          opacity: 0.55,
        }}
      />

      {/* Grass blades */}
      {blades.map((b) => (
        <div
          key={b.id}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            bottom: `${Math.random() * 15 + 2}%`,
            width: b.w,
            height: b.h,
            borderRadius: '50% 50% 0 0',
            background: `linear-gradient(to top, hsl(${b.hue}, 55%, 38%), hsl(${b.hue}, 60%, 52%))`,
            transformOrigin: 'bottom center',
            animation: `grassSway ${b.dur}s ease-in-out infinite alternate`,
            animationDelay: `${b.delay}s`,
            opacity: 0.75,
            zIndex: b.z,
            pointerEvents: 'none',
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
            boxShadow: '0 0 6px 2px rgba(255,255,255,0.6)',
            animation: `sparkleFloat ${s.dur}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* CSS keyframes injected via style tag */}
      <style>{`
        @keyframes grassSway {
          0% { transform: rotate(-6deg) scaleY(1); }
          100% { transform: rotate(6deg) scaleY(1.05); }
        }
        @keyframes sparkleFloat {
          0%, 100% { opacity: 0; transform: translateY(0) scale(0.5); }
          30% { opacity: 0.9; transform: translateY(-12px) scale(1); }
          70% { opacity: 0.4; transform: translateY(-24px) scale(0.7); }
        }
      `}</style>
    </div>
  );
}
