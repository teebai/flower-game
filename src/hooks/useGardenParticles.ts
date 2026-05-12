import { useRef, useEffect, useState } from 'react';
import type { GardenSet, FlowerColor } from '../types/gameTypes';

// ============================================================
// GARDEN PARTICLES — Garden-level physics engine
// All flowers from all sets in one organic cluster
// Same-color attraction across entire garden
// 3-level hover: flower > set > player
// ============================================================

export interface GardenParticle {
  id: string;
  setId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotVel: number;
  brownianPhase: number;
  color: FlowerColor;
  hoverScale: number;
  brightness: number;
  saturate: number;
  opacity: number;
  isDivine: boolean;
  isSolid: boolean;
}

export interface SetCenter {
  x: number;
  y: number;
}

// Physics constants — FLUID: flowers group like liquid, new ones push neighbors
const GARDEN_CENTER_K = 0.0005;
const SAME_COLOR_K = 0.025;          // strong same-color attraction
const SET_CENTER_K = 0.002;
const REPULSION_STRENGTH = 45;
const REPULSION_SOFTENING = 4;
const DAMPING = 0.72;
const BROWNIAN_AMP = 0.001;
const BROWNIAN_FREQ = 0.002;
const ROTATION_DAMP = 0.92;
const ROTATION_BROWNIAN = 0.008;
const BOUNDARY_K = 0.015;            // 5x stronger — keep flowers inside garden
const HOVER_SPRING_K = 0.10;
const STOP_VELOCITY = 0.015;
const MAX_FRAME_DT = 2.5;
const SPAWN_PUSH_FORCE = 0.15;       // barely perceptible
const SPAWN_PUSH_RADIUS = 18;      // tiny radius

// ── Breeze constants ──
const BREEZE_AMP = 0.6;
const BREEZE_FREQ = 0.001;
const BREEZE_PHASE_SPREAD = 2.4;
const BREEZE_TURBULENCE = 0.2;

// Visual constants
const BASE_BRIGHTNESS = 1.12;
const BASE_SATURATE = 1.22;
const FLOWER_HOVER_SCALE = 1.5;
const FLOWER_HOVER_BRIGHTNESS = 1.5;
const FLOWER_HOVER_SATURATE = 1.4;
const SET_HOVER_SCALE = 1.5;
const SET_HOVER_BRIGHTNESS = 1.35;
const SET_HOVER_SATURATE = 1.3;
const PLAYER_HOVER_SCALE = 1.5;
const PLAYER_HOVER_BRIGHTNESS = 1.2;
const PLAYER_HOVER_SATURATE = 1.25;

function noise(phase: number): number {
  return (
    Math.sin(phase) * 0.50 +
    Math.sin(phase * 1.618) * 0.25 +
    Math.sin(phase * 2.718) * 0.15 +
    Math.sin(phase * 3.142) * 0.10
  );
}

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash - 1) / 2147483646;
  };
}

// ── Garden sizing: tightly proportional to garden container ──
// Gardens are ~160px wide × ~120px tall. Flowers must stay well inside.
function gardenEllipse(flowerCount: number): { rx: number; ry: number; w: number; h: number } {
  const rx = Math.min(55, 25 + flowerCount * 2.5);
  const ry = Math.min(40, 18 + flowerCount * 2);
  return { rx, ry, w: rx * 2 + 28, h: ry * 2 + 20 };
}

function flowerSize(color: FlowerColor, isDivineSet: boolean, isSolidSet: boolean): number {
  const base = 48;
  if (color === 'triple_rainbow') return base * 3;
  if (color === 'rainbow') return base * 1.5;
  if (color === 'divine' || isDivineSet || isSolidSet) return base * 1.5;
  return base;
}

function ellipseForce(x: number, y: number, rx: number, ry: number): { fx: number; fy: number } {
  const normalized = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (normalized <= 1) return { fx: 0, fy: 0 };
  const excess = Math.sqrt(normalized) - 1;
  const angle = Math.atan2(y / (ry * ry), x / (rx * rx));
  return {
    fx: -Math.cos(angle) * excess * rx * BOUNDARY_K,
    fy: -Math.sin(angle) * excess * ry * BOUNDARY_K,
  };
}

export interface UseGardenParticlesOptions {
  sets: GardenSet[];
  playerId: string;
  hoveredFlowerId: string | null;
  hoveredSetId: string | null;
  hoveredPlayerId: string | null;
  hoverLevel: 'flower' | 'set' | 'player' | null;
  isDragActive: boolean;
  changedSetIds?: string[];
  lastDropRef?: React.MutableRefObject<{ playerId: string; setId: string; x: number; y: number; time: number } | null>;
}

export interface UseGardenParticlesResult {
  particles: GardenParticle[];
  setCenters: Record<string, SetCenter>;
  containerW: number;
  containerH: number;
}

export function useGardenParticles({
  sets,
  playerId,
  hoveredFlowerId,
  hoveredSetId,
  hoveredPlayerId,
  hoverLevel,
  isDragActive,
  changedSetIds = [],
  lastDropRef,
}: UseGardenParticlesOptions): UseGardenParticlesResult {
  const particlesRef = useRef<GardenParticle[]>([]);
  const prevFlowerIdsRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const changedSetIdsRef = useRef<string[]>([]);

  useEffect(() => { changedSetIdsRef.current = changedSetIds; }, [changedSetIds]);

  const [state, setState] = useState<UseGardenParticlesResult>({
    particles: [],
    setCenters: {},
    containerW: 120,
    containerH: 100,
  });

  // Compute flower count from sets
  const flowerCount = sets.reduce((sum, s) => sum + s.flowers.length, 0);

  // Initialize / re-initialize particles when flowers change
  useEffect(() => {
    const allFlowers = sets.flatMap(s => s.flowers.map(f => ({ ...f, setId: s.id })));
    const currentIds = allFlowers.map(f => f.id).sort().join(',');

    if (currentIds === prevFlowerIdsRef.current) return;

    const { rx, ry, w, h } = gardenEllipse(allFlowers.length);

    const existingById = new Map(particlesRef.current.map(p => [p.id, p]));

    const setById = new Map(sets.map(s => [s.id, s]));

    const particles: GardenParticle[] = allFlowers.map((flower) => {
      const rng = seededRandom(flower.id);
      const existing = existingById.get(flower.id);
      const set = setById.get(flower.setId);
      const isDivine = set?.isDivine ?? false;
      const isSolid = set?.isSolid ?? false;

      if (existing) {
        return {
          ...existing,
          setId: flower.setId,
          size: flowerSize(flower.color, set?.isDivine ?? false, set?.isSolid ?? false),
          color: flower.color,
          isDivine: set?.isDivine ?? false,
          isSolid: set?.isSolid ?? false,
        };
      }

      // New flower: check if dropped recently → spawn at drop position
      const drop = lastDropRef?.current;
      const isRecentDrop = drop && drop.playerId === playerId && (drop.time > Date.now() - 3000);
      const spawnAtDrop = isRecentDrop && (drop.setId === flower.setId || !drop.setId);

      const targetX = (rng() - 0.5) * rx * 0.4;
      const targetY = (rng() - 0.5) * ry * 0.4;

      let spawnX: number, spawnY: number, spawnVx: number, spawnVy: number;

      if (spawnAtDrop) {
        // Spawn exactly where the player dropped the card
        spawnX = drop.x;
        spawnY = drop.y;
        // Velocity toward natural cluster position (strong, fast flow)
        spawnVx = (targetX - spawnX) * 0.08;
        spawnVy = (targetY - spawnY) * 0.08;
      } else {
        // Spawn near target position (not at edge) — gentle appearance
        const angle = rng() * Math.PI * 2;
        const dist = rx * (0.05 + rng() * 0.12); // close to center
        spawnX = targetX + Math.cos(angle) * dist;
        spawnY = targetY + Math.sin(angle) * dist * (ry / rx);
        spawnVx = (targetX - spawnX) * 0.03; // gentle pull to center
        spawnVy = (targetY - spawnY) * 0.03;
      }

      return {
        id: flower.id,
        setId: flower.setId,
        x: spawnX,
        y: spawnY,
        vx: spawnVx,
        vy: spawnVy,
        size: flowerSize(flower.color, set?.isDivine ?? false, set?.isSolid ?? false),
        rotation: (rng() - 0.5) * 20,
        rotVel: (rng() - 0.5) * 0.35,
        brownianPhase: rng() * Math.PI * 2,
        color: flower.color,
        hoverScale: 1.0,
        brightness: BASE_BRIGHTNESS,
        saturate: BASE_SATURATE,
        opacity: 0.6,
        isDivine: set?.isDivine ?? false,
        isSolid: set?.isSolid ?? false,
      };
    });

    if (particles.length > particlesRef.current.length && particlesRef.current.length > 0) {
      for (const p of particles) {
        if (!existingById.has(p.id)) {
          // New flower: push all nearby flowers away
          for (const neighbor of particles) {
            if (neighbor.id === p.id) continue;
            const dx = neighbor.x - p.x;
            const dy = neighbor.y - p.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < SPAWN_PUSH_RADIUS) {
              const force = (1 - dist / SPAWN_PUSH_RADIUS) * SPAWN_PUSH_FORCE;
              neighbor.vx += (dx / dist) * force;
              neighbor.vy += (dy / dist) * force;
            }
          }
        }
      }
    }

    for (const p of particles) {
      if (changedSetIdsRef.current.includes(p.setId) && existingById.has(p.id)) {
        const dist = Math.hypot(p.x, p.y) || 1;
        const push = 0.15;
        p.vx += (p.x / dist) * push;
        p.vy += (p.y / dist) * push;
      }
    }

    particlesRef.current = particles;
    prevFlowerIdsRef.current = currentIds;

    setState(prev => ({ ...prev, particles, containerW: w, containerH: h }));
  }, [sets, flowerCount]);

  // Physics simulation loop
  useEffect(() => {
    const { rx, ry } = gardenEllipse(flowerCount);

    let frameCount = 0;

    const tick = (time: number) => {
      let dt = 1;
      if (lastTimeRef.current > 0) {
        dt = Math.min(MAX_FRAME_DT, (time - lastTimeRef.current) / 16.67);
      }
      lastTimeRef.current = time;

      const particles = particlesRef.current;
      if (particles.length === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Compute set centers
      const setCenters: Record<string, { x: number; y: number; count: number }> = {};
      for (const p of particles) {
        const c = setCenters[p.setId] || { x: 0, y: 0, count: 0 };
        c.x += p.x;
        c.y += p.y;
        c.count++;
        setCenters[p.setId] = c;
      }
      for (const c of Object.values(setCenters)) {
        c.x /= c.count;
        c.y /= c.count;
      }

      // Compute same-color centers
      const colorCenters: Record<FlowerColor, { x: number; y: number; count: number }> = {} as any;
      for (const p of particles) {
        const c = colorCenters[p.color] || { x: 0, y: 0, count: 0 };
        c.x += p.x;
        c.y += p.y;
        c.count++;
        colorCenters[p.color] = c;
      }
      for (const c of Object.values(colorCenters)) {
        c.x /= c.count;
        c.y /= c.count;
      }

      // Physics integration
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.vx += -p.x * GARDEN_CENTER_K * dt;
        p.vy += -p.y * GARDEN_CENTER_K * dt;

        const setCenter = setCenters[p.setId];
        if (setCenter && setCenter.count > 1) {
          const sdx = setCenter.x - p.x;
          const sdy = setCenter.y - p.y;
          const sdist = Math.hypot(sdx, sdy) || 1;
          const setPull = SET_CENTER_K * Math.min(1, sdist / 18);
          p.vx += (sdx / sdist) * setPull * dt;
          p.vy += (sdy / sdist) * setPull * dt;
        }

        const colorCenter = colorCenters[p.color];
        if (colorCenter && colorCenter.count > 1) {
          const cdx = colorCenter.x - p.x;
          const cdy = colorCenter.y - p.y;
          const cdist = Math.hypot(cdx, cdy) || 1;
          const colorPull = SAME_COLOR_K * Math.min(1.5, cdist / 15);
          p.vx += (cdx / cdist) * colorPull * dt;
          p.vy += (cdy / cdist) * colorPull * dt;
        }

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const minDist = (p.size + q.size) * 0.55;
          if (dist < minDist) {
            // Exponential repulsion — strong when overlapping, gentle at edge
            const overlap = minDist - dist;
            const force = REPULSION_STRENGTH * Math.exp(overlap * 0.15) * 0.08;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            p.vx -= fx * dt;
            p.vy -= fy * dt;
            q.vx += fx * dt;
            q.vy += fy * dt;
          }
        }

        const isSleeping = Math.hypot(p.vx, p.vy) < STOP_VELOCITY;

        // ── BREEZE SWAY (gentle wind, not random jitter) ──
        p.brownianPhase += BROWNIAN_FREQ * dt;
        p.vx += noise(p.brownianPhase) * BROWNIAN_AMP * dt;
        p.vy += noise(p.brownianPhase + 100) * BROWNIAN_AMP * dt;

        const b = ellipseForce(p.x, p.y, rx, ry);
        p.vx += b.fx * dt;
        p.vy += b.fy * dt;

        p.vx *= Math.pow(DAMPING, dt);
        p.vy *= Math.pow(DAMPING, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // ── HARD BOUNDARY CLAMP ── snap flowers inside garden ellipse, kill velocity
        const boundaryPad = 4;
        const maxRx = rx - boundaryPad;
        const maxRy = ry - boundaryPad;
        if (maxRx > 0 && maxRy > 0) {
          const ellipseDist = (p.x / maxRx) ** 2 + (p.y / maxRy) ** 2;
          if (ellipseDist > 1) {
            const angle = Math.atan2(p.y / maxRy, p.x / maxRx);
            p.x = Math.cos(angle) * maxRx * 0.95;
            p.y = Math.sin(angle) * maxRy * 0.95;
            p.vx = 0;
            p.vy = 0;
            p.rotVel = 0;
          }
        }

        // ── Gentle rotation sway (wind blowing through flowers) ──
        p.rotVel *= Math.pow(ROTATION_DAMP, dt);
        const breeze =
          Math.sin(time * BREEZE_FREQ + p.brownianPhase * BREEZE_PHASE_SPREAD) * BREEZE_AMP +
          Math.sin(time * BREEZE_FREQ * 1.618 + p.brownianPhase * BREEZE_PHASE_SPREAD * 2.3) * BREEZE_AMP * BREEZE_TURBULENCE;
        p.rotation = breeze + p.rotVel;

        let targetScale = 1.0;
        let targetBrightness = BASE_BRIGHTNESS;
        let targetSaturate = BASE_SATURATE;
        let jitterX = 0;
        let jitterY = 0;
        let jitterRot = 0;

        if (hoverLevel === 'flower' && hoveredFlowerId === p.id) {
          targetScale = FLOWER_HOVER_SCALE;
          targetBrightness = FLOWER_HOVER_BRIGHTNESS;
          targetSaturate = FLOWER_HOVER_SATURATE;
          // Fast excited wobble
          const jit = Math.sin(time * 18 + p.brownianPhase) * 3.5;
          jitterX = Math.cos(p.brownianPhase * 5) * jit;
          jitterY = Math.sin(p.brownianPhase * 5) * jit;
          jitterRot = Math.sin(time * 14 + p.brownianPhase) * 8;
        } else if (hoverLevel === 'set' && hoveredSetId === p.setId) {
          targetScale = SET_HOVER_SCALE;
          targetBrightness = SET_HOVER_BRIGHTNESS;
          targetSaturate = SET_HOVER_SATURATE;
          // Set-level fast excitement
          const jit = Math.sin(time * 14 + p.brownianPhase) * 2.8;
          jitterX = Math.cos(p.brownianPhase * 4) * jit;
          jitterY = Math.sin(p.brownianPhase * 4) * jit;
          jitterRot = Math.sin(time * 10 + p.brownianPhase) * 5;
        } else if (hoverLevel === 'player' && hoveredPlayerId === playerId) {
          targetScale = PLAYER_HOVER_SCALE;
          targetBrightness = PLAYER_HOVER_BRIGHTNESS;
          targetSaturate = PLAYER_HOVER_SATURATE;
          // Garden-level wave excitement
          const jit = Math.sin(time * 10 + p.brownianPhase) * 2.2;
          jitterX = Math.cos(p.brownianPhase * 3) * jit;
          jitterY = Math.sin(p.brownianPhase * 3) * jit;
          jitterRot = Math.sin(time * 7 + p.brownianPhase) * 3;
        }

        p.hoverScale += (targetScale - p.hoverScale) * HOVER_SPRING_K * dt;
        p.brightness += (targetBrightness - p.brightness) * HOVER_SPRING_K * dt;
        p.saturate += (targetSaturate - p.saturate) * HOVER_SPRING_K * dt;

        // Apply jitter to position and rotation
        p.x += jitterX * dt;
        p.y += jitterY * dt;
        p.rotation += jitterRot * dt;

        if (p.opacity < 1) {
          p.opacity = Math.min(1, p.opacity + 0.08 * dt); // faster fade-in
        }
      }

      frameCount++;
      if (frameCount % 2 === 0) {
        const centers: Record<string, SetCenter> = {};
        for (const [setId, c] of Object.entries(setCenters)) {
          centers[setId] = { x: c.x, y: c.y };
        }
        setState(prev => ({
          ...prev,
          particles: particles.map(p => ({ ...p })),
          setCenters: centers,
        }));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [flowerCount, playerId, hoveredFlowerId, hoveredSetId, hoveredPlayerId, hoverLevel]);

  return state;
}
