/**
 * GrassFieldCSS.tsx — CSS-only interactive grass field.
 *
 * Replicates the original Pixi GrassField behaviour:
 *   - Full-viewport blade grid (not just bottom edge)
 *   - Cursor push interaction (blades within 120px lean away from mouse)
 *   - Swaying wind animation via per-blade CSS keyframes
 *   - Spring palette on radial-gradient sky
 *
 * Uses refs + requestAnimationFrame for cursor tracking to avoid
 * React re-renders. Transforms are applied directly to DOM nodes
 * for 60fps performance.
 */

import { useEffect, useMemo, useRef } from 'react';

interface Blade {
  id: number;
  x: number;        // viewport %
  y: number;        // viewport %
  h: number;        // length (px)
  w: number;        // thickness (px)
  delay: number;    // animation delay (s)
  dur: number;      // animation duration (s)
  color: string;    // stroke colour
  sway: number;     // max rotation (deg)
  opacity: number;  // stroke opacity
  phase: number;    // wind phase offset
}

const BLADE_COLORS = ['#DBF9DB', '#C3FDB8', '#B8E6B8'];

function generateBlades(count: number): Blade[] {
  const blades: Blade[] = [];
  const cols = Math.ceil(Math.sqrt(count * (window.innerWidth / window.innerHeight)));
  const rows = Math.ceil(count / cols);
  let id = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && id < count; c++) {
      const baseX = c / cols * 100;
      const baseY = r / rows * 100;
      blades.push({
        id: id++,
        x: baseX + (Math.random() - 0.5) * (80 / cols),
        y: baseY + (Math.random() - 0.5) * (80 / rows),
        h: 18 + Math.random() * 28,
        w: 3 + Math.random() * 4,
        delay: Math.random() * -4,
        dur: 2.0 + Math.random() * 1.8,
        color: BLADE_COLORS[id % BLADE_COLORS.length],
        sway: 3 + Math.random() * 5,
        opacity: 0.55 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return blades;
}

export function GrassFieldCSS() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bladeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  const blades = useMemo(() => generateBlades(160), []);

  // Cursor tracking via ref (no React re-renders)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerLeave = () => {
      cursorRef.current = null;
    };

    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', onPointerLeave);

    return () => {
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  // Interaction loop: spring-physics cursor push (matches original GrassField)
  // Each blade has velocity + damping for graceful, non-instant response.
  useEffect(() => {
    const PUSH_RADIUS = 120;
    const MAX_ROTATION = 22;   // gentler max lean
    const SPRING_K = 0.06;     // stiffness
    const DAMPING = 0.90;      // velocity decay per frame

    const pushCurrent = new Float32Array(blades.length);
    const pushVel = new Float32Array(blades.length);

    const tick = () => {
      const cp = cursorRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      for (let i = 0; i < blades.length; i++) {
        const b = blades[i];
        const el = bladeRefs.current[i];
        if (!el) continue;

        let targetAngle = 0;
        if (cp && vw > 0 && vh > 0) {
          const bx = (b.x / 100) * vw;
          const by = (b.y / 100) * vh;
          const dx = bx - cp.x;
          const dy = by - cp.y;
          const dist = Math.hypot(dx, dy);

          if (dist < PUSH_RADIUS && dist > 1) {
            const strength = (1 - dist / PUSH_RADIUS) ** 2;
            const awayAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            targetAngle = awayAngle * strength * (MAX_ROTATION / 90);
          }
        }

        // Damped spring: vel += (target - current) * K; vel *= damping; current += vel
        pushVel[i] += (targetAngle - pushCurrent[i]) * SPRING_K;
        pushVel[i] *= DAMPING;
        pushCurrent[i] += pushVel[i];

        el.style.setProperty('--push', `${pushCurrent[i]}deg`);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [blades]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'radial-gradient(circle at 50% 30%, #FFF0F5 0%, #F9B7FF 40%, #7FFFD4 100%)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '35%',
          background: 'linear-gradient(to top, #C3FDB8 0%, #DBF9DB 30%, transparent 100%)',
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      />

      {blades.map((b, i) => (
        <div
          key={b.id}
          ref={el => { bladeRefs.current[i] = el; }}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.w,
            height: b.h,
            marginLeft: -b.w / 2,
            marginTop: -b.h / 2,
            borderRadius: `${b.w / 2}px ${b.w / 2}px 0 0`,
            background: b.color,
            transformOrigin: 'bottom center',
            animation: `grassSway${b.id} ${b.dur}s ease-in-out infinite alternate`,
            animationDelay: `${b.delay}s`,
            opacity: b.opacity,
            zIndex: 1,
            pointerEvents: 'none',
            willChange: 'transform',
            rotate: 'var(--push, 0deg)',
          } as React.CSSProperties}
        />
      ))}

      <style>{`
        ${blades.map((b) => `
          @keyframes grassSway${b.id} {
            0% { transform: rotate(calc(-${b.sway}deg + var(--push, 0deg))) scaleY(1); }
            100% { transform: rotate(calc(${b.sway}deg + var(--push, 0deg))) scaleY(1.03); }
          }
        `).join('')}
      `}</style>
    </div>
  );
}
