// ============================================================
// FLOWER GAME — ORGANIC GARDEN LAYOUT ENGINE (v7)
//
// Key features:
//   • Force-based local cluster simulation per set
//   • Same-set cohesion + repulsion = tight organic blob
//   • Cross-set repulsion = colors push apart
//   • Dynamic content sizing — container grows with flowers
//   • Unchanged sets anchored; only changed sets re-simulate
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import type { GardenSet, FlowerColor } from '../types/gameTypes';

const PADDING = 2;
const TWEEN_SPEED = 0.13;
const SETTLE_DISTANCE_THRESHOLD = 0.35;
const SETTLE_FRAMES_REQUIRED = 6;
const MAX_TWEEN_FRAMES = 60;

const BASE_FLOWER_SIZE = 48;

// Force simulation parameters
const COHESION_STRENGTH = 0.15;
const SAME_SET_REPULSION = 1.2;
const CROSS_SET_REPULSION = 1.0;
const DAMPING = 0.5;
const MAX_CENTROID_DIST_MULTIPLIER = 2.2;
const SIMULATION_ITERATIONS = 120;

interface FlowerBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  color: FlowerColor;
  setId: string;
  size: number;
  radius: number;
}

export interface OrganicFlower {
  id: string;
  x: number;
  y: number;
  color: FlowerColor;
  setId: string;
  size: number;
  isNew?: boolean;
}

export interface OrganicSetCenter {
  id: string;
  x: number;
  y: number;
}

export interface UseOrganicLayoutResult {
  flowers: OrganicFlower[];
  setCenters: Record<string, OrganicSetCenter>;
  settled: boolean;
  contentWidth: number;
  contentHeight: number;
  registerFlowerRef: (id: string, el: HTMLElement | null) => void;
  registerSetZoneRef: (id: string, el: HTMLElement | null) => void;
}

function flowerSize(color: FlowerColor, isDivineSet: boolean): number {
  if (color === 'triple_rainbow') return BASE_FLOWER_SIZE * 3;
  if (color === 'rainbow') return BASE_FLOWER_SIZE * 1.5;
  if (color === 'divine' || isDivineSet) return BASE_FLOWER_SIZE * 1.5;
  return BASE_FLOWER_SIZE;
}

function displayColor(flower: GardenSet['flowers'][number]): FlowerColor {
  return flower.representedColor ?? flower.color;
}

function setsKey(sets: GardenSet[]): string {
  return sets.map((s) => `${s.id}:[${s.flowers.map((f) => f.id).join(',')}]`).join(';');
}

function log(label: string, data?: unknown) {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'layout') {
    // eslint-disable-next-line no-console
    console.log(`[OrganicLayout] ${label}`, data ?? '');
  }
}

// ── Set Center Placement ───────────────────────────────────

function computeSetCenter(
  setId: string,
  setIndex: number,
  setCount: number,
  existing: Map<string, FlowerBody>,
  reuseExisting: boolean = true,
): { x: number; y: number } {
  if (reuseExisting) {
    const existingInSet = Array.from(existing.values()).filter((b) => b.setId === setId);
    if (existingInSet.length > 0) {
      const cx = existingInSet.reduce((s, b) => s + b.x, 0) / existingInSet.length;
      const cy = existingInSet.reduce((s, b) => s + b.y, 0) / existingInSet.length;
      return { x: cx, y: cy };
    }
  }
  if (setCount <= 1) return { x: 0, y: 0 };

  // Phyllotaxis (golden-angle spiral) — fills disk including center.
  // Set 0 at center, others spiral outward at ~137.5° increments.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const angle = setIndex * goldenAngle - Math.PI / 2;
  const spacing = 58;
  const dist = spacing * Math.sqrt(setIndex);

  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
  };
}

// ── Local Force Simulation (per set) ───────────────────────

function simulateSetCluster(set: GardenSet, center: { x: number; y: number }): FlowerBody[] {
  const sizes = set.flowers.map((f) => flowerSize(displayColor(f), set.isDivine));

  // Empty set (e.g. divine token) — create an anchor body so it has a position
  if (set.flowers.length === 0) {
    return [{
      id: `__anchor__${set.id}`,
      x: center.x,
      y: center.y,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      color: 'divine',
      setId: set.id,
      size: 0,
      radius: 16,
    }];
  }

  // Place flowers in a phyllotaxis (golden-angle) spiral for natural round clustering
  const bodies: FlowerBody[] = set.flowers.map((flower, i) => {
    const size = sizes[i];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.508° in radians
    const angle = i * goldenAngle;
    // spacing factor: slightly larger than radius so they don't heavily overlap
    const spacing = (size / 2 + PADDING) * 1.35;
    const dist = spacing * Math.sqrt(Math.max(0, i));
    return {
      id: flower.id,
      x: center.x + Math.cos(angle) * dist,
      y: center.y + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      color: displayColor(flower),
      setId: set.id,
      size,
      radius: size / 2 + PADDING,
    };
  });

  if (bodies.length <= 1) {
    bodies[0].targetX = bodies[0].x - center.x;
    bodies[0].targetY = bodies[0].y - center.y;
    return bodies;
  }

  // Short physics pass: resolve any overlaps while keeping round shape
  for (let iter = 0; iter < SIMULATION_ITERATIONS; iter++) {
    const centroidX = bodies.reduce((s, b) => s + b.x, 0) / bodies.length;
    const centroidY = bodies.reduce((s, b) => s + b.y, 0) / bodies.length;

    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      let fx = (centroidX - a.x) * COHESION_STRENGTH;
      let fy = (centroidY - a.y) * COHESION_STRENGTH;

      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const b = bodies[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius;

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const force = overlap * SAME_SET_REPULSION;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      a.x += fx * DAMPING;
      a.y += fy * DAMPING;

      // Clamp: keep flowers within a tight circular bound for round clusters
      const dcx = a.x - centroidX;
      const dcy = a.y - centroidY;
      const d = Math.sqrt(dcx * dcx + dcy * dcy);
      const maxD = a.radius * MAX_CENTROID_DIST_MULTIPLIER;
      if (d > maxD) {
        const scale = maxD / d;
        a.x = centroidX + dcx * scale;
        a.y = centroidY + dcy * scale;
      }
    }
  }

  // Final centroid after simulation
  const finalCx = bodies.reduce((s, b) => s + b.x, 0) / bodies.length;
  const finalCy = bodies.reduce((s, b) => s + b.y, 0) / bodies.length;

  // Store positions relative to set center (global offset added later)
  for (const b of bodies) {
    b.targetX = b.x - finalCx;
    b.targetY = b.y - finalCy;
  }

  return bodies;
}

// ── Set-Level Overlap Resolution ───────────────────────────
// Pushes entire sets apart as rigid units so clusters stay tight
// but don't overlap. Runs before flower-level fine-tuning.

function resolveSetLevelOverlaps(bodies: FlowerBody[]) {
  // Compute each set's centroid and bounding radius
  const setBounds = new Map<string, { cx: number; cy: number; r: number; ids: string[] }>();
  for (const b of bodies) {
    let info = setBounds.get(b.setId);
    if (!info) {
      info = { cx: 0, cy: 0, r: 0, ids: [] };
      setBounds.set(b.setId, info);
    }
    info.cx += b.targetX;
    info.cy += b.targetY;
    info.ids.push(b.id);
  }
  for (const info of setBounds.values()) {
    info.cx /= info.ids.length;
    info.cy /= info.ids.length;
    // bounding radius = max distance from centroid to any flower edge
    let maxR = 0;
    for (const b of bodies) {
      if (!info.ids.includes(b.id)) continue;
      const dx = b.targetX - info.cx;
      const dy = b.targetY - info.cy;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy) + b.radius);
    }
    info.r = maxR;
  }

  // Push overlapping sets apart
  const entries = Array.from(setBounds.entries());
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, a] = entries[i];
        const [idB, b] = entries[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const minDist = a.r + b.r + 6; // 6px gap between clusters
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          // Shift set centroids
          a.cx -= nx * push;
          a.cy -= ny * push;
          b.cx += nx * push;
          b.cy += ny * push;
          // Apply same shift to all flowers in each set
          for (const body of bodies) {
            if (body.setId === idA) {
              body.targetX -= nx * push;
              body.targetY -= ny * push;
            } else if (body.setId === idB) {
              body.targetX += nx * push;
              body.targetY += ny * push;
            }
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

// ── Global Overlap Resolution ──────────────────────────────

function resolveOverlaps(bodies: FlowerBody[], movableIds: Set<string>) {
  for (let iter = 0; iter < 50; iter++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.targetX - a.targetX;
        const dy = b.targetY - a.targetY;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius;

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          const aMovable = movableIds.has(a.id);
          const bMovable = movableIds.has(b.id);
          const crossSet = a.setId !== b.setId;
          const pushFactor = crossSet ? CROSS_SET_REPULSION / SAME_SET_REPULSION : 1.0;

          if (crossSet) {
            // Cross-set overlaps ALWAYS resolve — old sets get pushed too
            const aWeight = aMovable ? 0.5 : 0.3;
            const bWeight = bMovable ? 0.5 : 0.3;
            const totalWeight = aWeight + bWeight;
            a.targetX -= nx * overlap * (aWeight / totalWeight) * pushFactor;
            a.targetY -= ny * overlap * (aWeight / totalWeight) * pushFactor;
            b.targetX += nx * overlap * (bWeight / totalWeight) * pushFactor;
            b.targetY += ny * overlap * (bWeight / totalWeight) * pushFactor;
            moved = true;
          } else if (aMovable && bMovable) {
            a.targetX -= nx * overlap * 0.5 * pushFactor;
            a.targetY -= ny * overlap * 0.5 * pushFactor;
            b.targetX += nx * overlap * 0.5 * pushFactor;
            b.targetY += ny * overlap * 0.5 * pushFactor;
            moved = true;
          } else if (aMovable) {
            a.targetX -= nx * overlap * 0.9 * pushFactor;
            a.targetY -= ny * overlap * 0.9 * pushFactor;
            moved = true;
          } else if (bMovable) {
            b.targetX += nx * overlap * 0.9 * pushFactor;
            b.targetY += ny * overlap * 0.9 * pushFactor;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
}

// ── Bounding Box & Centering ───────────────────────────────

function centerAndMeasure(bodies: FlowerBody[]): { width: number; height: number } {
  if (bodies.length === 0) return { width: 100, height: 80 };

  // ── 1. Center on set centroids (each set contributes equally) ──
  // This preserves circular symmetry — the bounding-box center would
  // drift toward clusters with more flowers or wider spread.
  const setCentroids = new Map<string, { x: number; y: number; count: number }>();
  for (const b of bodies) {
    const c = setCentroids.get(b.setId) ?? { x: 0, y: 0, count: 0 };
    c.x += b.targetX;
    c.y += b.targetY;
    c.count++;
    setCentroids.set(b.setId, c);
  }
  let offsetX = 0;
  let offsetY = 0;
  for (const [, c] of setCentroids) {
    offsetX += c.x / c.count;
    offsetY += c.y / c.count;
  }
  offsetX /= setCentroids.size;
  offsetY /= setCentroids.size;

  // ── 2. Measure container from flower bounds (includes sizes) ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of bodies) {
    minX = Math.min(minX, b.targetX - b.size / 2);
    maxX = Math.max(maxX, b.targetX + b.size / 2);
    minY = Math.min(minY, b.targetY - b.size / 2);
    maxY = Math.max(maxY, b.targetY + b.size / 2);
  }

  const pad = 16;
  const width = Math.max(100, maxX - minX + pad * 2);
  const height = Math.max(80, maxY - minY + pad * 2);

  // ── 3. Shift everything so set-centroid mean becomes (0,0) ──
  for (const b of bodies) {
    b.targetX -= offsetX;
    b.targetY -= offsetY;
  }

  return { width, height };
}

// ── Hook ───────────────────────────────────────────────────

export function useOrganicLayout(options: {
  sets: GardenSet[];
}): UseOrganicLayoutResult {
  const { sets } = options;

  const flowerRefs = useRef(new Map<string, HTMLElement>());
  const setZoneRefs = useRef(new Map<string, HTMLElement>());
  const bodiesRef = useRef(new Map<string, FlowerBody>());
  const settledRef = useRef(true);
  const settledFramesRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const prevKeyRef = useRef('');
  const frameCountRef = useRef(0);
  const newFlowerIdsRef = useRef(new Set<string>());

  const [state, setState] = useState<{
    flowers: OrganicFlower[];
    setCenters: Record<string, OrganicSetCenter>;
    settled: boolean;
    contentWidth: number;
    contentHeight: number;
  }>({ flowers: [], setCenters: {}, settled: true, contentWidth: 100, contentHeight: 80 });

  const registerFlowerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) flowerRefs.current.set(id, el);
    else flowerRefs.current.delete(id);
  }, []);

  const registerSetZoneRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) setZoneRefs.current.set(id, el);
    else setZoneRefs.current.delete(id);
  }, []);

  const key = setsKey(sets);
  const needsInit = prevKeyRef.current !== key;
  prevKeyRef.current = key;

  if (needsInit) {
    const existing = bodiesRef.current;
    const next = new Map<string, FlowerBody>();

    const existingSetIds = new Set(Array.from(existing.values()).map((b) => b.setId));
    const changedSetIds = new Set<string>();

    // Track new flowers for pop-in animation
    newFlowerIdsRef.current.clear();
    for (const set of sets) {
      for (const flower of set.flowers) {
        if (!existing.has(flower.id)) {
          changedSetIds.add(set.id);
          newFlowerIdsRef.current.add(flower.id);
        }
      }
    }

    // New empty sets (e.g. divine tokens) are also changed
    for (const set of sets) {
      if (!existingSetIds.has(set.id)) {
        changedSetIds.add(set.id);
      }
    }

    // If sets were added or removed, re-layout ALL sets so the global circle re-forms
    const setsAddedOrRemoved = sets.length !== existingSetIds.size ||
      sets.some((s) => !existingSetIds.has(s.id)) ||
      Array.from(existingSetIds).some((id) => !sets.find((s) => s.id === id));
    if (setsAddedOrRemoved) {
      for (const set of sets) {
        changedSetIds.add(set.id);
      }
    }

    log('needsInit', {
      existingCount: existing.size,
      setCount: sets.length,
      changedSets: Array.from(changedSetIds),
    });

    // Purge bodies for removed flowers / deleted sets, anchor unchanged survivors
    const validSetIds = new Set(sets.map((s) => s.id));
    const validFlowerIds = new Set(sets.flatMap((s) => s.flowers.map((f) => f.id)));
    for (const [id, body] of existing) {
      if (!validSetIds.has(body.setId)) continue;           // set was removed
      if (!validFlowerIds.has(body.id)) continue;           // flower was removed from set
      if (!changedSetIds.has(body.setId)) {
        next.set(id, { ...body });
      }
    }

    // Re-layout changed sets
    // Divine tokens get the inner (center) positions of the phyllotaxis spiral.
    const sortedSets = [...sets].sort((a, b) => {
      const aToken = a.isToken ? 1 : 0;
      const bToken = b.isToken ? 1 : 0;
      return bToken - aToken; // tokens first
    });
    const setIndexMap = new Map<string, number>();
    for (let i = 0; i < sortedSets.length; i++) setIndexMap.set(sortedSets[i].id, i);

    for (const set of sets) {
      if (!changedSetIds.has(set.id)) continue;

      const setIndex = setIndexMap.get(set.id) ?? 0;
      const center = computeSetCenter(set.id, setIndex, sets.length, existing, !setsAddedOrRemoved);
      const placed = simulateSetCluster(set, center);

      for (const b of placed) {
        // Add global set center offset
        b.targetX += center.x;
        b.targetY += center.y;

        const prev = existing.get(b.id);
        if (prev) {
          next.set(b.id, {
            ...prev,
            targetX: b.targetX,
            targetY: b.targetY,
            color: b.color,
            size: b.size,
            radius: b.radius,
            vx: prev.vx,
            vy: prev.vy,
          });
        } else {
          next.set(b.id, {
            ...b,
            x: center.x,
            y: center.y,
            vx: 0,
            vy: 0,
          });
        }
      }
    }

    // Resolve overlaps (only changed-set flowers move)
    const allBodies = Array.from(next.values());
    // Push entire overlapping sets apart as rigid units (keeps clusters tight)
    resolveSetLevelOverlaps(allBodies);

    const movableIds = new Set(
      allBodies.filter((b) => changedSetIds.has(b.setId)).map((b) => b.id)
    );
    resolveOverlaps(allBodies, movableIds);

    // Center everything and measure content
    const { width, height } = centerAndMeasure(allBodies);

    log('layout', { contentWidth: width.toFixed(1), contentHeight: height.toFixed(1), bodies: allBodies.length });

    bodiesRef.current = next;
    settledRef.current = false;
    settledFramesRef.current = 0;
    frameCountRef.current = 0;
  }

  useEffect(() => {
    const bodies = bodiesRef.current;
    if (bodies.size === 0) {
      setState({ flowers: [], setCenters: {}, settled: true, contentWidth: 100, contentHeight: 80 });
      return;
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    settledRef.current = false;
    settledFramesRef.current = 0;
    frameCountRef.current = 0;

    const bodiesArray = Array.from(bodies.values());
    const n = bodiesArray.length;

    // Measure content size for the tween loop
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of bodiesArray) {
      minX = Math.min(minX, b.targetX - b.size / 2);
      maxX = Math.max(maxX, b.targetX + b.size / 2);
      minY = Math.min(minY, b.targetY - b.size / 2);
      maxY = Math.max(maxY, b.targetY + b.size / 2);
    }
    const pad = 16;
    const contentWidth = Math.max(100, maxX - minX + pad * 2);
    const contentHeight = Math.max(80, maxY - minY + pad * 2);
    const cx = contentWidth / 2;
    const cy = contentHeight / 2;

    const SPRING_STRENGTH = 0.09;
    const SPRING_DAMPING = 0.78;

    const step = () => {
      frameCountRef.current++;
      let maxDist = 0;

      for (let i = 0; i < n; i++) {
        const b = bodiesArray[i];
        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        maxDist = Math.max(maxDist, dist);

        if (dist > 0.01) {
          // Damped spring: flowers accelerate toward target with velocity
          b.vx = (b.vx + dx * SPRING_STRENGTH) * SPRING_DAMPING;
          b.vy = (b.vy + dy * SPRING_STRENGTH) * SPRING_DAMPING;
          b.x += b.vx;
          b.y += b.vy;
        } else {
          b.x = b.targetX;
          b.y = b.targetY;
          b.vx = 0;
          b.vy = 0;
        }

        const el = flowerRefs.current.get(b.id);
        if (el) {
          el.style.left = `${cx + b.x - b.size / 2}px`;
          el.style.top = `${cy + b.y - b.size / 2}px`;
        }
      }

      const setSums = new Map<string, { x: number; y: number; count: number }>();
      for (const b of bodiesArray) {
        const s = setSums.get(b.setId) ?? { x: 0, y: 0, count: 0 };
        s.x += b.x;
        s.y += b.y;
        s.count++;
        setSums.set(b.setId, s);
      }
      for (const [setId, s] of setSums) {
        const el = setZoneRefs.current.get(setId);
        if (el) {
          el.style.left = `${cx + s.x / s.count - 45}px`;
          el.style.top = `${cy + s.y / s.count - 45}px`;
        }
      }

      if (maxDist < SETTLE_DISTANCE_THRESHOLD || frameCountRef.current >= MAX_TWEEN_FRAMES) {
        settledFramesRef.current++;
        if (settledFramesRef.current >= SETTLE_FRAMES_REQUIRED || frameCountRef.current >= MAX_TWEEN_FRAMES) {
          settledRef.current = true;

          for (const b of bodiesArray) {
            b.x = b.targetX;
            b.y = b.targetY;
          }

          const flowers: OrganicFlower[] = bodiesArray.map((b) => ({
            id: b.id,
            x: b.x,
            y: b.y,
            color: b.color,
            setId: b.setId,
            size: b.size,
            isNew: newFlowerIdsRef.current.has(b.id) || undefined,
          }));

          const setCenters: Record<string, OrganicSetCenter> = {};
          for (const [setId, s] of setSums) {
            setCenters[setId] = { id: setId, x: s.x / s.count, y: s.y / s.count };
          }

          setState({ flowers, setCenters, settled: true, contentWidth, contentHeight });
          return;
        }
      } else {
        settledFramesRef.current = 0;
      }

      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [key]);

  const bodiesArray = Array.from(bodiesRef.current.values());
  const flowers: OrganicFlower[] = bodiesArray.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    color: b.color,
    setId: b.setId,
    size: b.size,
    isNew: newFlowerIdsRef.current.has(b.id) || undefined,
  }));

  const setSums = new Map<string, { x: number; y: number; count: number }>();
  for (const b of bodiesArray) {
    const s = setSums.get(b.setId) ?? { x: 0, y: 0, count: 0 };
    s.x += b.x;
    s.y += b.y;
    s.count++;
    setSums.set(b.setId, s);
  }
  const setCenters: Record<string, OrganicSetCenter> = {};
  for (const [setId, s] of setSums) {
    setCenters[setId] = { id: setId, x: s.x / s.count, y: s.y / s.count };
  }

  return {
    flowers,
    setCenters,
    settled: state.settled,
    contentWidth: state.contentWidth,
    contentHeight: state.contentHeight,
    registerFlowerRef,
    registerSetZoneRef,
  };
}
