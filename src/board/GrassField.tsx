import React, { useRef, useEffect, useCallback } from 'react';

// ============================================================
// GRASS FIELD — Full-screen procedural grass with spring physics
// Spatial hash culling, 2-octave wind, player/flower/drag push
// Gust system: only triggers on wind card cast (manual input)
// Season colors from Teebai's reference PNG
//
// Coordinate system: grass is centered at viewport center to match
// the DOM arena (gardens at left:50%; top:50%; transform-origin:center).
// ============================================================

export type GrassSeason = 'normal' | 'winter' | 'spring' | 'summer' | 'autumn';

interface Blade {
  gx: number;
  gy: number;
  h: number;
  angle: number;
  vel: number;
  colorIdx: number;
  alpha: number;
  thick: number;
  phase: number;
}

const SEASON_BLADE_COLORS: Record<GrassSeason, string[]> = {
  normal:  ['#DBF9DB', '#C3FDB8'],
  spring:  ['#FDEEF4', '#FDD7E4'],
  summer:  ['#FFFDD0', '#C3FDB8'],
  autumn:  ['#FAF0E6', '#9F8C76'],
  winter:  ['#CCFFFF', '#EAEEE9'],
};

/** Season background radial-gradient colours: [center, mid, edge] */
const SEASON_BG_GRADIENT: Record<GrassSeason, [string, string, string]> = {
  normal:  ['#93FFE8', '#C3FDB8', '#5865F2'],
  spring:  ['#FFF0F5', '#F9B7FF', '#7FFFD4'],
  summer:  ['#FFFFC2', '#C3FDB8', '#FFBF00'],
  autumn:  ['#F5F5F5', '#C19A6B', '#78C7C7'],
  winter:  ['#9AFEFF', '#F0FFFF', '#967BB6'],
};

// ── World sizing ──
// World must be large enough to cover the viewport even at minimum zoom.
// With zoom=0.5 and viewport=1920x1080, visible range is ±1920 horizontally.
// We use 4800x3600 to comfortably cover all cases.
export function getWorldDims() {
  const isMobile = window.innerWidth <= 720;
  return {
    worldW: isMobile ? 2400 : 4800,
    worldH: isMobile ? 1800 : 3600,
    spacing: isMobile ? 56 : 40,
    cellSize: 60,
  };
}

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
  cursorPos?: { x: number; y: number } | null; // mouse/touch position for interactive push
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
  cursorPos,
  windGustInput,
  className = '',
}: GrassFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bladesRef = useRef<Blade[]>([]);
  const spatialHashRef = useRef<Map<string, number[]>>(new Map());
  const rafRef = useRef<number>(0);
  const gustRef = useRef({ active: false, value: 0 });
  const timeRef = useRef(0);

  // ── Mutable state refs so the RAF loop never restarts ──
  const scrollXRef = useRef(scrollX);
  const scrollYRef = useRef(scrollY);
  const zoomRef = useRef(zoom);
  const playerPositionsRef = useRef(playerPositions);
  const flowerPositionsRef = useRef(flowerPositions);
  const dragPosRef = useRef(dragPos);
  const cursorPosRef = useRef(cursorPos);
  const windGustInputRef = useRef(windGustInput);

  useEffect(() => { scrollXRef.current = scrollX; }, [scrollX]);
  useEffect(() => { scrollYRef.current = scrollY; }, [scrollY]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { playerPositionsRef.current = playerPositions; }, [playerPositions]);
  useEffect(() => { flowerPositionsRef.current = flowerPositions; }, [flowerPositions]);
  useEffect(() => { dragPosRef.current = dragPos; }, [dragPos]);
  useEffect(() => { cursorPosRef.current = cursorPos; }, [cursorPos]);
  useEffect(() => { windGustInputRef.current = windGustInput; }, [windGustInput]);

  // ── Init blades once ──
  const initBlades = useCallback((season: GrassSeason) => {
    const { worldW, worldH, spacing, cellSize } = getWorldDims();
    const blades: Blade[] = [];
    const colors = SEASON_BLADE_COLORS[season];
    const jitter = spacing * 0.6;
    const halfW = worldW / 2;
    const halfH = worldH / 2;
    for (let y = -halfH; y < halfH; y += spacing) {
      for (let x = -halfW; x < halfW; x += spacing) {
        blades.push({
          gx: x + (Math.random() - 0.5) * jitter,
          gy: y + (Math.random() - 0.5) * jitter,
          h: 20 + Math.random() * 26,
          angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.3,
          vel: 0,
          colorIdx: Math.floor(Math.random() * colors.length),
          alpha: 0.08 + Math.random() * 0.10,
          thick: 3.5 + Math.random() * 4.5,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    bladesRef.current = blades;

    // Build spatial hash
    const hash = new Map<string, number[]>();
    blades.forEach((b, i) => {
      const key = `${Math.floor(b.gx / cellSize)},${Math.floor(b.gy / cellSize)}`;
      const arr = hash.get(key) || [];
      arr.push(i);
      hash.set(key, arr);
    });
    spatialHashRef.current = hash;
  }, []);

  useEffect(() => {
    initBlades(season);
  }, [initBlades, season]);

  // ── Main render loop ──
  // ONLY restarts when season changes (blades need re-init).
  // All other props are read from refs so mouse movement / pan / zoom
  // never cancel + reschedule the RAF (which was causing blinking).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Direct window mouse listener — more reliable than React prop passing
    const onMouseMove = (e: MouseEvent) => {
      cursorPosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);

    const colors = SEASON_BLADE_COLORS[season];
    const TARGET_PIXELS = 300_000;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let viewW = 0, viewH = 0;
    let grassW = 0, grassH = 0;

    const resize = () => {
      viewW = window.innerWidth;
      viewH = window.innerHeight;
      const aspect = viewW / viewH;
      grassH = Math.round(Math.sqrt(TARGET_PIXELS / aspect));
      grassW = Math.round(TARGET_PIXELS / grassH);
      canvas.width = grassW * dpr;
      canvas.height = grassH * dpr;
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
      ctx.setTransform((grassW / viewW) * dpr, 0, 0, (grassH / viewH) * dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let pushValues: Float32Array | null = null;

    const tick = (timestamp: number) => {
      const dt = Math.min(32, timestamp - timeRef.current) * 0.001;
      timeRef.current = timestamp;

      // Read mutable state from refs (never stale, never restarts RAF)
      const sxRef = scrollXRef.current;
      const syRef = scrollYRef.current;
      const zm = zoomRef.current;
      const pl = playerPositionsRef.current;
      const fl = flowerPositionsRef.current;
      const dp = dragPosRef.current;
      const cp = cursorPosRef.current;
      const wg = windGustInputRef.current;

      const cx = viewW / 2;
      const cy = viewH / 2;

      const { worldW, worldH, cellSize } = getWorldDims();

      // Camera culling bounds (world space)
      const camLeft = (sxRef - cx) / zm;
      const camTop = (syRef - cy) / zm;
      const camRight = (sxRef + cx) / zm;
      const camBottom = (syRef + cy) / zm;

      // ── Infinite tiling: compute which tile copies are visible ──
      // The primary tile is centred at origin spanning [-halfW, +halfW].
      // A tile copy tx has world range [tx*worldW - halfW, tx*worldW + halfW].
      // We pad by ±2 tiles to be safe; culling filters the extras.
      const halfW = worldW / 2;
      const halfH = worldH / 2;
      const tileX0 = Math.floor((camLeft - halfW) / worldW) - 1;
      const tileX1 = Math.floor((camRight + halfW) / worldW) + 1;
      const tileY0 = Math.floor((camTop - halfH) / worldH) - 1;
      const tileY1 = Math.floor((camBottom + halfH) / worldH) + 1;

      const blades = bladesRef.current;
      const hash = spatialHashRef.current;
      const t = timestamp * 0.001;

      // Gust (manual trigger, softer)
      gustRef.current.active = (wg ?? 0) !== 0;
      const gust = decayGust(gustRef.current, dt) * 0.12;

      // Build push sources: players + flowers + drag
      const pushSources = [...pl, ...fl];
      if (dp) {
        pushSources.push({
          x: (dp.x + sxRef - cx) / zm,
          y: (dp.y + syRef - cy) / zm,
        });
      }
      if (cp) {
        pushSources.push({
          x: (cp.x + sxRef - cx) / zm,
          y: (cp.y + syRef - cy) / zm,
        });
      }

      // Batch strokes by (color, alpha, lineWidth) to cut draw calls
      const mainBatches = new Map<number, Array<{x1:number;y1:number;x2:number;y2:number}>>();
      const tipBatches = new Map<number, Array<{x1:number;y1:number;x2:number;y2:number}>>();

      // ── Physics pass ──
      // 1. Accumulate push per-blade using spatial-hash reverse lookup.
      //    Instead of O(blades × sources), we query only cells near each source.
      if (!pushValues || pushValues.length < blades.length) {
        pushValues = new Float32Array(blades.length);
      } else {
        pushValues.fill(0, 0, blades.length);
      }
      for (const src of pushSources) {
        const srcTx = Math.floor((src.x + halfW) / worldW);
        const srcTy = Math.floor((src.y + halfH) / worldH);
        for (let dty = -1; dty <= 1; dty++) {
          for (let dtx = -1; dtx <= 1; dtx++) {
            const tx = srcTx + dtx;
            const ty = srcTy + dty;
            const offsetX = tx * worldW;
            const offsetY = ty * worldH;
            const primaryX = src.x - offsetX;
            const primaryY = src.y - offsetY;
            // Quick reject if this tile's primary range is too far from the push source
            if (primaryX < -halfW - 120 || primaryX > halfW + 120) continue;
            if (primaryY < -halfH - 120 || primaryY > halfH + 120) continue;
            const centerCellX = Math.floor(primaryX / cellSize);
            const centerCellY = Math.floor(primaryY / cellSize);
            for (let cyCell = centerCellY - 2; cyCell <= centerCellY + 2; cyCell++) {
              for (let cxCell = centerCellX - 2; cxCell <= centerCellX + 2; cxCell++) {
                const indices = hash.get(`${cxCell},${cyCell}`);
                if (!indices) continue;
                for (const idx of indices) {
                  const b = blades[idx];
                  const dx = (b.gx + offsetX) - src.x;
                  const dy = (b.gy + offsetY) - src.y;
                  const dist = Math.hypot(dx, dy);
                  if (dist < 120 && dist > 0.5) {
                    const f = 1 - dist / 120;
                    pushValues[idx] += f * f * 6.0;
                  }
                }
              }
            }
          }
        }
      }

      // 2. Apply wind + accumulated push + spring physics to all blades
      for (let i = 0; i < blades.length; i++) {
        const b = blades[i];
        const wind = Math.sin(t * 1.5 + b.phase) * 0.15 + Math.sin(t * 0.8 + b.phase * 0.5) * 0.075;
        const target = -Math.PI / 2 + wind + gust + pushValues[i];
        b.vel += (target - b.angle) * 0.08;
        b.vel *= 0.88;
        b.angle += b.vel;
      }

      // Render pass — tile the blade field infinitely
      for (let ty = tileY0; ty <= tileY1; ty++) {
        for (let tx = tileX0; tx <= tileX1; tx++) {
          const offsetX = tx * worldW;
          const offsetY = ty * worldH;

          // Effective camera bounds for this tile (in primary-tile coordinates)
          const tileCamLeft = camLeft - offsetX;
          const tileCamRight = camRight - offsetX;
          const tileCamTop = camTop - offsetY;
          const tileCamBottom = camBottom - offsetY;

          const tCellX0 = Math.floor((tileCamLeft - 60) / cellSize);
          const tCellY0 = Math.floor((tileCamTop - 60) / cellSize);
          const tCellX1 = Math.floor((tileCamRight + 60) / cellSize);
          const tCellY1 = Math.floor((tileCamBottom + 60) / cellSize);

          for (let cyCell = tCellY0; cyCell <= tCellY1; cyCell++) {
            for (let cxCell = tCellX0; cxCell <= tCellX1; cxCell++) {
              const key = `${cxCell},${cyCell}`;
              const indices = hash.get(key);
              if (!indices) continue;
              for (const idx of indices) {
                const b = blades[idx];
                // Cull against this tile's effective bounds
                if (b.gx < tileCamLeft || b.gx > tileCamRight || b.gy < tileCamTop || b.gy > tileCamBottom) continue;

                // Render with tile offset so grass fills the viewport
                const sx = (b.gx + offsetX) * zm - sxRef + cx;
                const sy = (b.gy + offsetY) * zm - syRef + cy;
                const cosA = Math.cos(b.angle);
                const sinA = Math.sin(b.angle);
                const stx = sx + cosA * b.h;
                const sty = sy + sinA * b.h;

                const mainKey = (b.colorIdx << 16) | (Math.round(b.alpha * 10) << 8) | Math.round(b.thick * 10);
                const mainArr = mainBatches.get(mainKey);
                if (mainArr) mainArr.push({x1:sx, y1:sy, x2:stx, y2:sty});
                else mainBatches.set(mainKey, [{x1:sx, y1:sy, x2:stx, y2:sty}]);

                const smx = sx + cosA * b.h * 0.6;
                const smy = sy + sinA * b.h * 0.6;

                const tipKey = (b.colorIdx << 16) | (Math.round(b.alpha * 0.4 * 10) << 8) | Math.round(b.thick * 0.5 * 10);
                const tipArr = tipBatches.get(tipKey);
                if (tipArr) tipArr.push({x1:smx, y1:smy, x2:stx, y2:sty});
                else tipBatches.set(tipKey, [{x1:smx, y1:smy, x2:stx, y2:sty}]);
              }
            }
          }
        }
      }

      // Background gradient — lock to viewport center so panning never slides
      // the sky relative to the arena, eliminating the displaced-seam effect.
      const sunX = cx;
      const sunY = cy;
      // Match CSS radial-gradient behavior: outer radius reaches the farthest viewport
      // corner so the edge color (#5865F2 blue) is actually visible at screen edges.
      const cornerDist = Math.hypot(viewW / 2, viewH / 2);
      const [centerColor, midColor, edgeColor] = SEASON_BG_GRADIENT[season];
      const bgGrad = ctx.createRadialGradient(sunX, sunY, cornerDist * 0.05, sunX, sunY, cornerDist);
      bgGrad.addColorStop(0, centerColor);
      bgGrad.addColorStop(0.35, midColor);
      bgGrad.addColorStop(1, edgeColor);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, viewW, viewH);

      ctx.lineCap = 'round';
      // Draw main strokes — one path per batch
      for (const [key, segs] of mainBatches) {
        const colorIdx = key >> 16;
        const alpha = ((key >> 8) & 0xFF) / 10;
        const lineWidth = (key & 0xFF) / 10;
        ctx.beginPath();
        for (const s of segs) {
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
        }
        ctx.strokeStyle = colors[colorIdx];
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      // Draw tip highlights — one path per batch
      for (const [key, segs] of tipBatches) {
        const colorIdx = key >> 16;
        const alpha = ((key >> 8) & 0xFF) / 10;
        const lineWidth = (key & 0xFF) / 10;
        ctx.beginPath();
        for (const s of segs) {
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
        }
        ctx.strokeStyle = colors[colorIdx];
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [season]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
});

export default GrassField;
