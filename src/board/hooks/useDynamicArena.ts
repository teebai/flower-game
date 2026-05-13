// ============================================================
// FLOWER GAME — DYNAMIC ARENA PHYSICS HOOK
// Spring-physics garden layout with 60fps animation,
// auto-zoom, idle breathing, and targeted growth.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Player } from '../../types/gameTypes';

// ── Types ───────────────────────────────────────────────────

export interface GardenTransform {
  x: number;
  y: number;
  scale: number;
}

export interface DynamicArenaState {
  transforms: Record<string, GardenTransform>;
  arenaScale: number;
  isSettling: boolean;
}

export interface UseDynamicArenaOptions {
  players: Player[];
  viewport: { width: number; height: number };
  compactLayout: boolean;
  myPlayerIndex: number;
  targetedGardenId: string | null;
  draggedOverGardenId: string | null;
}

// ── Physics constants ───────────────────────────────────────

const SPRING_STIFFNESS = 0.018;
const SEPARATION_STIFFNESS = 0.035;
const DAMPING = 0.82;
const HOME_PULL = 0.012;
const MAX_SPEED = 18;
const SETTLING_THRESHOLD = 0.15;
const BREATH_AMP = 3.5;
const BREATH_FREQ = 0.0012;
const TARGET_GROWTH = 1.3;
const SIZE_PER_FLOWER = 2.4;
const SIZE_PER_SET = 8.5;
const BASE_GARDEN_SIZE = 142;
const ORBIT_BASE = 0.28;
const ORBIT_FLOWER = 1.8;
const ORBIT_SET = 10;
const MIN_ARENA_SCALE = 0.55;
const MAX_ARENA_SCALE = 1.0;

// ── Helpers ─────────────────────────────────────────────────

function gardenSize(player: Player, compact: boolean): number {
  const flowers = player.garden.sets.reduce((s, set) => s + (set.isToken ? 1 : set.flowers.length), 0);
  const sets = player.garden.sets.length;
  const raw = BASE_GARDEN_SIZE + flowers * SIZE_PER_FLOWER + sets * SIZE_PER_SET;
  const scale = compact ? 0.82 : 1.0;
  return Math.max(90, Math.min(260, raw * scale));
}

function computeOrbitPositions(
  players: Player[],
  viewport: { width: number; height: number },
  compact: boolean,
  myPlayerIndex: number,
): Array<{ playerId: string; x: number; y: number; size: number; angle: number }> {
  const count = Math.max(1, players.length);
  const shortSide = Math.max(360, Math.min(viewport.width, viewport.height));
  const longSide = Math.max(viewport.width, viewport.height);
  const baseOrbit = compact
    ? Math.min(shortSide * 0.22, longSide * 0.15)
    : Math.min(shortSide * 0.28, longSide * 0.20);
  const baseRadius = Math.max(compact ? 90 : 130, Math.min(compact ? 190 : 260, baseOrbit));

  return players.map((player, i) => {
    const size = gardenSize(player, compact);
    const angle = (Math.PI * 2 * ((i - myPlayerIndex + count) % count)) / count - Math.PI / 2;
    const flowers = player.garden.sets.reduce((s, set) => s + (set.isToken ? 1 : set.flowers.length), 0);
    const sets = player.garden.sets.length;
    const orbit = baseRadius + flowers * (compact ? ORBIT_FLOWER * 0.7 : ORBIT_FLOWER) + sets * (compact ? ORBIT_SET * 0.8 : ORBIT_SET);
    return {
      playerId: player.id,
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit * (compact ? 0.82 : 0.72),
      size,
      angle,
    };
  });
}

interface Body {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  targetSize: number;
  currentSize: number;
  homeX: number;
  homeY: number;
  angle: number;
}

function createBodies(
  players: Player[],
  orbits: Array<{ playerId: string; x: number; y: number; size: number; angle: number }>,
): Body[] {
  return players.map((player) => {
    const orbit = orbits.find(o => o.playerId === player.id)!;
    return {
      playerId: player.id,
      x: orbit.x,
      y: orbit.y,
      vx: 0,
      vy: 0,
      baseSize: orbit.size,
      targetSize: orbit.size,
      currentSize: orbit.size,
      homeX: orbit.x,
      homeY: orbit.y,
      angle: orbit.angle,
    };
  });
}

// ── Hook ────────────────────────────────────────────────────

export function useDynamicArena(opts: UseDynamicArenaOptions): DynamicArenaState {
  const { players, viewport, compactLayout, myPlayerIndex, targetedGardenId, draggedOverGardenId } = opts;

  const bodiesRef = useRef<Body[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [state, setState] = useState<DynamicArenaState>({
    transforms: {},
    arenaScale: 1,
    isSettling: false,
  });

  // Initialize / re-initialize bodies when players change
  useEffect(() => {
    const orbits = computeOrbitPositions(players, viewport, compactLayout, myPlayerIndex);
    const existing = bodiesRef.current;

    bodiesRef.current = players.map((player) => {
      const orbit = orbits.find(o => o.playerId === player.id)!;
      const prev = existing.find(b => b.playerId === player.id);
      if (prev) {
        // Preserve current position, just update home and size
        return {
          ...prev,
          baseSize: orbit.size,
          targetSize: orbit.size,
          homeX: orbit.x,
          homeY: orbit.y,
          angle: orbit.angle,
        };
      }
      return {
        playerId: player.id,
        x: orbit.x,
        y: orbit.y,
        vx: 0,
        vy: 0,
        baseSize: orbit.size,
        targetSize: orbit.size,
        currentSize: orbit.size,
        homeX: orbit.x,
        homeY: orbit.y,
        angle: orbit.angle,
      };
    });
  }, [players, viewport, compactLayout, myPlayerIndex]);

  const stepPhysics = useCallback((now: number) => {
    const bodies = bodiesRef.current;
    if (bodies.length === 0) return;

    const dt = Math.min(32, lastTimeRef.current ? now - lastTimeRef.current : 16);
    lastTimeRef.current = now;

    // Update target sizes based on hover / drag state
    for (const body of bodies) {
      const isTargeted = body.playerId === targetedGardenId || body.playerId === draggedOverGardenId;
      body.targetSize = isTargeted ? body.baseSize * TARGET_GROWTH : body.baseSize;
      // Smooth size transition
      body.currentSize += (body.targetSize - body.currentSize) * 0.12;
    }

    // Apply forces
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      let fx = 0;
      let fy = 0;

      // 1. Home spring (pull toward orbit position)
      fx += (body.homeX - body.x) * HOME_PULL;
      fy += (body.homeY - body.y) * HOME_PULL;

      // 2. Separation spring (AABB overlap resolution)
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const other = bodies[j];
        const dx = other.x - body.x;
        const dy = other.y - body.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) continue;

        const halfA = body.currentSize / 2;
        const halfB = other.currentSize / 2;
        const minDist = halfA + halfB + (compactLayout ? 24 : 36);
        const overlap = minDist - dist;

        if (overlap > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          const force = overlap * SEPARATION_STIFFNESS;
          fx -= nx * force;
          fy -= ny * force;
        }
      }

      // 3. Idle breathing (subtle sine wave when not targeted)
      const isTargeted = body.playerId === targetedGardenId || body.playerId === draggedOverGardenId;
      if (!isTargeted) {
        const breathPhase = now * BREATH_FREQ + body.angle * 3;
        fx += Math.sin(breathPhase) * BREATH_AMP * 0.003;
        fy += Math.cos(breathPhase * 0.7) * BREATH_AMP * 0.003;
      }

      // Apply force
      body.vx += fx;
      body.vy += fy;

      // Damping
      body.vx *= DAMPING;
      body.vy *= DAMPING;

      // Clamp speed
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > MAX_SPEED) {
        body.vx = (body.vx / speed) * MAX_SPEED;
        body.vy = (body.vy / speed) * MAX_SPEED;
      }

      // Integrate position
      body.x += body.vx;
      body.y += body.vy;
    }

    // Compute bounds and auto-zoom
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const body of bodies) {
      const half = body.currentSize / 2 + 20;
      minX = Math.min(minX, body.x - half);
      maxX = Math.max(maxX, body.x + half);
      minY = Math.min(minY, body.y - half);
      maxY = Math.max(maxY, body.y + half);
    }

    const boundsW = maxX - minX;
    const boundsH = maxY - minY;
    const margin = compactLayout ? 60 : 90;
    const scaleX = (viewport.width - margin * 2) / Math.max(1, boundsW);
    const scaleY = (viewport.height - margin * 2) / Math.max(1, boundsH);
    const arenaScale = Math.max(MIN_ARENA_SCALE, Math.min(MAX_ARENA_SCALE, scaleX, scaleY));

    // Check settling
    let maxVel = 0;
    for (const body of bodies) {
      maxVel = Math.max(maxVel, Math.hypot(body.vx, body.vy));
    }
    const isSettling = maxVel > SETTLING_THRESHOLD;

    // Build transforms
    const transforms: Record<string, GardenTransform> = {};
    for (const body of bodies) {
      transforms[body.playerId] = {
        x: body.x,
        y: body.y,
        scale: body.currentSize / body.baseSize,
      };
    }

    setState({ transforms, arenaScale, isSettling });

    rafRef.current = requestAnimationFrame(stepPhysics);
  }, [targetedGardenId, draggedOverGardenId, compactLayout, viewport]);

  // Start/stop RAF loop
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(stepPhysics);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [stepPhysics]);

  return state;
}
