// ============================================================
// FLOWER GAME — MATTER.JS GARDEN SYNC HOOK
// Bridges GardenPhysicsWorld (Matter.js) with React rendering.
//   • One GardenPhysicsWorld per player
//   • Syncs GardenSet[] → add/remove flower bodies
//   • Polls body state on rAF and returns GardenParticle-compatible data
//   • Delegates hover, wind, and gust to the physics engine
// ============================================================

import { useRef, useEffect, useState } from 'react';
import Matter from 'matter-js';
import {
  GardenPhysicsWorld,
  buildGardenPhysicsConfig,
} from '../engine/GardenPhysics';
import type { GardenSet, FlowerColor } from '../types/gameTypes';

// ── Types ──────────────────────────────────────────────────

export interface MatterGardenParticle {
  id: string;
  setId: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: FlowerColor;
  hoverScale: number;
  brightness: number;
  saturate: number;
  opacity: number;
  isDivine: boolean;
  isSolid: boolean;
}

export interface MatterSetCenter {
  x: number;
  y: number;
}

export interface UseMatterGardensOptions {
  /** All garden sets for this player */
  sets: GardenSet[];
  /** The player whose garden this is */
  playerId: string;
  /** Currently hovered flower id (if any) */
  hoveredFlowerId: string | null;
  /** Currently hovered set id (if any) */
  hoveredSetId: string | null;
  /** Currently hovered player id (if any) */
  hoveredPlayerId: string | null;
  /** Hover level granularity */
  hoverLevel: 'flower' | 'set' | 'player' | null;
  /** Whether a card drag is active (for visual glow state) */
  isDragActive: boolean;
  /** Total container width in px (used for ellipse sizing) */
  containerWidth: number;
  /** Total container height in px (used for ellipse sizing) */
  containerHeight: number;
  /** Optional: ids of sets that recently changed (physics settle pulse) */
  changedSetIds?: string[];
}

export interface UseMatterGardensResult {
  /** Renderable particles matching GardenFlowerField expectations */
  particles: MatterGardenParticle[];
  /** Centre of each set, computed from flower body positions */
  setCenters: Record<string, MatterSetCenter>;
  /** Garden container width */
  containerW: number;
  /** Garden container height */
  containerH: number;
}

// ── Visual constants (mirrors useGardenParticles.ts) ────────

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

function flowerSize(color: FlowerColor, isDivineSet: boolean, isSolidSet: boolean): number {
  const base = 48;
  if (color === 'triple_rainbow') return base * 3;
  if (color === 'rainbow') return base * 1.5;
  if (color === 'divine' || isDivineSet || isSolidSet) return base * 1.5;
  return base;
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

// ── Hook ─────────────────────────────────────────────────────

export function useMatterGardens({
  sets,
  playerId,
  hoveredFlowerId,
  hoveredSetId,
  hoveredPlayerId,
  hoverLevel,
  isDragActive,
  containerWidth,
  containerHeight,
  changedSetIds = [],
}: UseMatterGardensOptions): UseMatterGardensResult {
  const worldRef = useRef<GardenPhysicsWorld | null>(null);
  const prevFlowerIdsRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const changedSetIdsRef = useRef<string[]>([]);

  useEffect(() => {
    changedSetIdsRef.current = changedSetIds;
  }, [changedSetIds]);

  const [state, setState] = useState<UseMatterGardensResult>({
    particles: [],
    setCenters: {},
    containerW: containerWidth || 120,
    containerH: containerHeight || 100,
  });

  // ── Initialise / lazy-create the physics world ────────────
  useEffect(() => {
    if (!worldRef.current) {
      const totalFlowers = sets.reduce((sum, s) => sum + s.flowers.length, 0);
      const totalSets = sets.length;
      const config = buildGardenPhysicsConfig(
        playerId,
        0, // centre is (0,0) — we offset in rendering
        0,
        totalFlowers,
        totalSets,
        containerWidth || 120,
        containerHeight || 100,
      );
      worldRef.current = new GardenPhysicsWorld(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // ── Sync garden geometry on resize ──────────────────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const totalFlowers = sets.reduce((sum, s) => sum + s.flowers.length, 0);
    const totalSets = sets.length;
    const config = buildGardenPhysicsConfig(
      playerId,
      0,
      0,
      totalFlowers,
      totalSets,
      containerWidth || 120,
      containerHeight || 100,
    );
    world.updateGardenGeometry(config.gardenCenter, config.gardenRadius);
    setState((prev) => ({
      ...prev,
      containerW: containerWidth || prev.containerW,
      containerH: containerHeight || prev.containerH,
    }));
  }, [containerWidth, containerHeight, sets, playerId]);

  // ── Sync flowers (add new / remove missing) ─────────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    const allFlowers = sets.flatMap((s) => s.flowers.map((f) => ({ ...f, setId: s.id })));
    const currentIds = allFlowers.map((f) => f.id).sort().join(',');

    if (currentIds === prevFlowerIdsRef.current) {
      // Still sync hover states even if ids haven't changed
      world.clearAllHovers();
      if (hoverLevel === 'flower' && hoveredFlowerId) {
        world.setFlowerHover(hoveredFlowerId, true);
      } else if (hoverLevel === 'set' && hoveredSetId) {
        for (const f of allFlowers) {
          if (f.setId === hoveredSetId) {
            world.setFlowerHover(f.id, true);
          }
        }
      } else if (hoverLevel === 'player' && hoveredPlayerId === playerId) {
        for (const f of allFlowers) {
          world.setFlowerHover(f.id, true);
        }
      }
      return;
    }

    prevFlowerIdsRef.current = currentIds;

    const existingIds = new Set(world.getFlowerStates().map((f) => f.id));
    const targetIds = new Set(allFlowers.map((f) => f.id));

    // Remove flowers that no longer exist
    for (const id of existingIds) {
      if (!targetIds.has(id)) {
        world.removeFlower(id);
      }
    }

    // Add new flowers
    for (const flower of allFlowers) {
      if (existingIds.has(flower.id)) continue;

      const rng = seededRandom(flower.id);
      const set = sets.find((s) => s.id === flower.setId);
      const isDivine = set?.isDivine ?? false;
      const isSolid = set?.isSolid ?? false;

      // Spawn near centre with random scatter
      const rx = worldRef.current ? 40 : 20;
      const ry = worldRef.current ? 30 : 15;
      const angle = rng() * Math.PI * 2;
      const dist = rx * (0.05 + rng() * 0.25);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * (ry / rx);

      world.addFlower({
        id: flower.id,
        color: flower.color,
        setId: flower.setId,
        playerId,
        isDivine,
        isSolid,
        x,
        y,
      });
    }
  }, [sets, playerId, hoveredFlowerId, hoveredSetId, hoveredPlayerId, hoverLevel]);

  // ── Apply settle pulse to recently-changed sets ─────────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    if (changedSetIdsRef.current.length === 0) return;

    const states = world.getFlowerStates();
    for (const s of states) {
      if (changedSetIdsRef.current.includes(s.setId)) {
        const body = (world as any).flowers?.get(s.id)?.body;
        if (body) {
          const dist = Math.hypot(s.x, s.y) || 1;
          const push = 0.15;
          Matter.Body.setVelocity(body, {
            x: body.velocity.x + (s.x / dist) * push,
            y: body.velocity.y + (s.y / dist) * push,
          });
        }
      }
    }
    // Clear after one application
    changedSetIdsRef.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changedSetIds]);

  // ── rAF polling loop: read physics → React state ──────────
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;

    let frameCount = 0;

    const tick = (time: number) => {
      let dt = 1;
      if (lastTimeRef.current > 0) {
        dt = Math.min(2.5, (time - lastTimeRef.current) / 16.67);
      }
      lastTimeRef.current = time;

      const rawStates = world.getFlowerStates();
      if (rawStates.length === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Compute set centres from body positions
      const setAcc: Record<string, { x: number; y: number; count: number }> = {};
      for (const s of rawStates) {
        const c = setAcc[s.setId] || { x: 0, y: 0, count: 0 };
        c.x += s.x;
        c.y += s.y;
        c.count++;
        setAcc[s.setId] = c;
      }
      const setCenters: Record<string, MatterSetCenter> = {};
      for (const [setId, c] of Object.entries(setAcc)) {
        setCenters[setId] = { x: c.x / c.count, y: c.y / c.count };
      }

      // Map to GardenParticle-compatible shape
      const setById = new Map(sets.map((s) => [s.id, s]));
      const particles: MatterGardenParticle[] = rawStates.map((s) => {
        const set = setById.get(s.setId);
        const size = flowerSize(s.color, set?.isDivine ?? false, set?.isSolid ?? false);

        // Determine hover scale/brightness based on hoverLevel
        let hoverScale = s.scale;
        let brightness = BASE_BRIGHTNESS;
        let saturate = BASE_SATURATE;

        if (hoverLevel === 'flower' && hoveredFlowerId === s.id) {
          hoverScale = Math.max(hoverScale, FLOWER_HOVER_SCALE);
          brightness = FLOWER_HOVER_BRIGHTNESS;
          saturate = FLOWER_HOVER_SATURATE;
        } else if (hoverLevel === 'set' && hoveredSetId === s.setId) {
          hoverScale = Math.max(hoverScale, SET_HOVER_SCALE);
          brightness = SET_HOVER_BRIGHTNESS;
          saturate = SET_HOVER_SATURATE;
        } else if (hoverLevel === 'player' && hoveredPlayerId === playerId) {
          hoverScale = Math.max(hoverScale, PLAYER_HOVER_SCALE);
          brightness = PLAYER_HOVER_BRIGHTNESS;
          saturate = PLAYER_HOVER_SATURATE;
        }

        return {
          id: s.id,
          setId: s.setId,
          x: s.x,
          y: s.y,
          size,
          rotation: (s.angle * 180) / Math.PI,
          color: s.color,
          hoverScale,
          brightness,
          saturate,
          opacity: 1,
          isDivine: s.isDivine,
          isSolid: s.isSolid,
        };
      });

      frameCount++;
      if (frameCount % 2 === 0) {
        setState((prev) => ({
          ...prev,
          particles,
          setCenters,
        }));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = 0;
    };
  }, [
    sets,
    playerId,
    hoveredFlowerId,
    hoveredSetId,
    hoveredPlayerId,
    hoverLevel,
  ]);

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (worldRef.current) {
        worldRef.current.dispose();
        worldRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return state;
}

// ── Imperative helpers (for parent components / board actions) ─

/** Trigger wind on a specific flower toward a target garden centre. */
export function triggerWindFlower(
  world: GardenPhysicsWorld,
  flowerId: string,
  targetX: number,
  targetY: number,
): void {
  world.windFlower(flowerId, targetX, targetY);
}

/** Gust every flower in a player's garden. */
export function triggerGustGarden(world: GardenPhysicsWorld, strength?: number): void {
  world.gustGarden(strength);
}

/** Get the underlying GardenPhysicsWorld for advanced use. */
export function getWorldRef(
  ref: React.MutableRefObject<GardenPhysicsWorld | null>,
): GardenPhysicsWorld | null {
  return ref.current;
}
