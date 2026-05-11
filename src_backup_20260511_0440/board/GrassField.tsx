import React, { useRef, useEffect, useCallback } from 'react';

// ============================================================
// GRASS FIELD — Full-screen procedural grass with spring physics
// Spatial hash culling, 2-octave wind, player/flower/drag push
// Gust system: only triggers on wind card cast (manual input)
// Season colors from Teebai's reference PNG
// ============================================================

export type GrassSeason = 'normal' | 'winter' | 'spring' | 'summer' | 'autumn';

interface Blade {
  gx: number;
  gy: number;
  h: number;
  angle: number;
  vel: number;
  color: string;
  alpha: number;
  thick: number;
  phase: number;
}

// ── Exact colors from Teebai's reference PNG ──
const SEASON_BG: Record<GrassSeason, string> = {
  normal: '#90f090',
  winter: '#b8f0f8',
  spring: '#ffe0f0',
  summer: '#f8e870',
  autumn: '#a08060',
};

const SEASON_BLADE_COLORS: Record<GrassSeason, string[]> = {
  normal:  ['#5a9e4a', '#6ab05a', '#4a8c3a', '#7ac06a', '#5aaa4d', '#62a050', '#58a848', '#6eb860'],
  winter:  ['#c0e8f0', '#d0f0f8', '#a8dce8', '#e0f8ff', '#b8e4f0', '#cceef8', '#a0d4e8', '#d8f4fc'],
  spring:  ['#90e890', '#a0f0a0', '#80d880', '#b0f8b0', '#88e088', '#98e898', '#78d078', '#a8f0a8'],
  summer:  ['#d0c050', '#e0d060', '#c0b040', '#f0e070', '#c8b848', '#d8c858', '#b8a838', '#e8d068'],
  autumn:  ['#c8a848', '#d8b858', '#b89838', '#e8c868', '#c0a040', '#d0b050', '#a89030', '#e0c060'],
};

// ── World ──
const WORLD_W = 2400;
const WORLD_H = 1800;
const SPACING = 28;
const JITTER = SPACING * 0.6; // 16.8
const CELL_SIZE = 60;

// ── Gust system (manual trigger only — set windGustInput when wind card cast) ──
function decayGust(gust: { active: boolean; value: number }, dt: number): number {
  if (!gust.active) {
    gust.value *= Math.pow(0.85, dt * 60); // fast decay when not active
    return gust.value;
  }
  // Active gust: ramp up then hold
  gust.value = Math.min(1.0, gust.value + dt * 2.0);
  return gust.value;
}

export interface GrassFieldProps {
  season: GrassSeason;
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
  playerPositions?: Array<{ x: number; y: number }>;
  flowerPositions?: Array<{ x: number; y: number }>;
  dragPos?: { x: number; y: number } | null;
  windGustInput?: number; // -1 to +1, set when wind card cast
  className?: string;
}

export const GrassField = React.memo(function GrassField({
  season,
  scrollX = 0,
  scrollY = 0,
  zoom = 1,
  playerPositions = [],
  flowerPositions = [],
  dragPos,
  windGustInput,
  className = '',
}: GrassFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bladesRef = useRef<Blade[]>([]);
  const spatialHashRef = useRef<Map<string, number[]>>(new Map());
  const rafRef = useRef<number>(0);
  const gustRef = useRef({ active: false, value: 0 });
  const timeRef = useRef(0);

  // ── Init blades once ──
  const initBlades = useCallback((w: number, h: number) => {
    const blades: Blade[] = [];
    const colors = SEASON_BLADE_COLORS[season];
    for (let y = 0; y < WORLD_H; y += SPACING) {
      for (let x = 0; x < WORLD_W; x += SPACING) {
        blades.push({
          gx: x + (Math.random() - 0.5) * JITTER,
          gy: y + (Math.random() - 0.5) * JITTER,
          h: 14 + Math.random() * 18,
          angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.3,
          vel: 0,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 0.5 + Math.random() * 0.4,
          thick: 2.0 + Math.random() * 2.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    bladesRef.current = blades;

    // Build spatial hash
    const hash = new Map<string, number[]>();
    blades.forEach((b, i) => {
      const key = `${Math.floor(b.gx / CELL_SIZE)},${Math.floor(b.gy / CELL_SIZE)}`;
      const arr = hash.get(key) || [];
      arr.push(i);
      hash.set(key, arr);
    });
    spatialHashRef.current = hash;
  }, [season]);

  useEffect(() => {
    initBlades(WORLD_W, WORLD_H);
  }, [initBlades]);

  // ── Main render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let viewW = 0, viewH = 0;

    const resize = () => {
      viewW = window.innerWidth;
      viewH = window.innerHeight;
      canvas.width = viewW * dpr;
      canvas.height = viewH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = (timestamp: number) => {
      const dt = Math.min(32, timestamp - timeRef.current) * 0.001;
      timeRef.current = timestamp;

      const bg = SEASON_BG[season];
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, viewW, viewH);

      // Camera culling bounds (world space)
      const camLeft = scrollX - 60;
      const camTop = scrollY - 60;
      const camRight = scrollX + viewW / zoom + 60;
      const camBottom = scrollY + viewH / zoom + 60;

      const cellX0 = Math.floor(camLeft / CELL_SIZE);
      const cellY0 = Math.floor(camTop / CELL_SIZE);
      const cellX1 = Math.floor(camRight / CELL_SIZE);
      const cellY1 = Math.floor(camBottom / CELL_SIZE);

      const blades = bladesRef.current;
      const hash = spatialHashRef.current;
      const t = timestamp * 0.001;

      // Gust (manual trigger, softer)
      gustRef.current.active = (windGustInput ?? 0) !== 0;
      const gust = decayGust(gustRef.current, dt) * 0.12; // much softer: 0.12 instead of 0.4

      // Build push sources: players + flowers + drag
      const pushSources = [...playerPositions, ...flowerPositions];
      if (dragPos) pushSources.push(dragPos);

      ctx.lineCap = 'round';

      // Iterate visible cells
      for (let cy = cellY0; cy <= cellY1; cy++) {
        for (let cx = cellX0; cx <= cellX1; cx++) {
          const key = `${cx},${cy}`;
          const indices = hash.get(key);
          if (!indices) continue;

          for (const idx of indices) {
            const b = blades[idx];

            // Skip if outside exact view
            if (b.gx < camLeft || b.gx > camRight || b.gy < camTop || b.gy > camBottom) continue;

            // ── Physics ──
            // 2-octave wind
            const wind = Math.sin(t * 1.5 + b.phase) * 0.15 + Math.sin(t * 0.8 + b.phase * 0.5) * 0.075;

            // Player/drag/flower push
            let push = 0;
            for (const src of pushSources) {
              const dx = b.gx - src.x;
              const dy = b.gy - src.y;
              const dist = Math.hypot(dx, dy);
              if (dist < 45 && dist > 0.5) {
                const f = 1 - dist / 45;
                push += f * f * 2.5;
              }
            }

            // Spring integration
            const target = -Math.PI / 2 + wind + gust + push;
            b.vel += (target - b.angle) * 0.08;
            b.vel *= 0.88;
            b.angle += b.vel;

            // ── Render ──
            const tipX = b.gx + Math.cos(b.angle) * b.h;
            const tipY = b.gy + Math.sin(b.angle) * b.h;

            // Screen-space transform
            const sx = (b.gx - scrollX) * zoom;
            const sy = (b.gy - scrollY) * zoom;
            const stx = (tipX - scrollX) * zoom;
            const sty = (tipY - scrollY) * zoom;

            // Main stroke
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(stx, sty);
            ctx.strokeStyle = b.color;
            ctx.globalAlpha = b.alpha;
            ctx.lineWidth = b.thick * zoom;
            ctx.stroke();

            // Tip highlight
            const midX = b.gx + Math.cos(b.angle) * b.h * 0.6;
            const midY = b.gy + Math.sin(b.angle) * b.h * 0.6;
            const smx = (midX - scrollX) * zoom;
            const smy = (midY - scrollY) * zoom;
            ctx.beginPath();
            ctx.moveTo(smx, smy);
            ctx.lineTo(stx, sty);
            ctx.strokeStyle = b.color;
            ctx.globalAlpha = b.alpha * 0.4;
            ctx.lineWidth = b.thick * 0.5 * zoom;
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [season, scrollX, scrollY, zoom, playerPositions, flowerPositions, dragPos, windGustInput]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
});

export default GrassField;
