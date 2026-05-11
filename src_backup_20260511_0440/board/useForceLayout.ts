import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import type { GardenSet } from '../types/gameTypes';
import { gardenEllipseRadii, clampToEllipse } from './gardenBounds';

interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetX: number;
  targetY: number;
  flexY: number; // approximate flex-layout Y offset from garden center
}

export interface ForcePosition {
  x: number;
  y: number;
}

// Approximate flex-layout Y of row R chips in garden-body centered coordinates.
// zone inset top=28, padding-top=8, grid translateY=6, ~15px effective row height, ~11px chip half-height.
function chipFlexY(row: number, gardenH: number): number {
  return (28 + 8 + 6 + row * 15 + 11) - gardenH / 2;
}

// Clamp transform offset (x, y) accounting for the flex layout contribution.
function clampTransformOffset(
  x: number, y: number, flexY: number, rx: number, ry: number
): { x: number; y: number } {
  const clamped = clampToEllipse(x, y + flexY, rx, ry);
  return { x: clamped.x, y: clamped.y - flexY };
}

function clusterTarget(index: number, totalSetCount: number, rx: number, ry: number, gardenH: number): { x: number; y: number } {
  const columns = totalSetCount >= 6 ? 3 : 2;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCenter = (columns - 1) / 2;
  const x = (column - rowCenter) * (columns === 3 ? 27 : 24);
  const y = (row * 22) - 8 - Math.min(12, totalSetCount * 1.1);
  return clampTransformOffset(x, y, chipFlexY(row, gardenH), rx, ry);
}

function gardenSignature(sets: GardenSet[]): string {
  return sets.map(s => `${s.id}:${s.flowers.length}`).join(',');
}

interface PlayerSim {
  nodes: ForceNode[];
  rafId: number | null;
  startTime: number;
  wasPinned: boolean;
}

type PositionSetter = React.Dispatch<React.SetStateAction<Map<string, Map<string, ForcePosition>>>>;

function startPlayerSim(
  playerId: string,
  sets: GardenSet[],
  gardenW: number,
  gardenH: number,
  totalFlowers: number,
  simsRef: React.MutableRefObject<Map<string, PlayerSim>>,
  pinnedRef: React.MutableRefObject<Map<string, Map<string, ForcePosition>>>,
  setPositions: PositionSetter
): void {
  const sims = simsRef.current;
  const existing = sims.get(playerId);
  if (existing?.rafId != null) cancelAnimationFrame(existing.rafId);

  if (sets.length === 0) {
    sims.delete(playerId);
    setPositions(prev => { const next = new Map(prev); next.delete(playerId); return next; });
    return;
  }

  const totalGooMargin = 11 + 12; // chip half-height + goo filter bleed
  const { rx, ry } = gardenEllipseRadii(totalFlowers, sets.length, 1.8, gardenW, gardenH, totalGooMargin);

  const prevNodes = existing?.nodes ?? [];
  const prevById = new Map(prevNodes.map(n => [n.id, n]));
  const initPinned = pinnedRef.current.get(playerId);

  const nodes: ForceNode[] = sets.map((set, index) => {
    const columns = sets.length >= 6 ? 3 : 2;
    const row = Math.floor(index / columns);
    const fY = chipFlexY(row, gardenH);
    const target = clusterTarget(index, sets.length, rx, ry, gardenH);
    const prev = prevById.get(set.id);
    const pin = initPinned?.get(set.id);
    const entryAngle = Math.random() * Math.PI * 2;
    const entryDist = 35 + Math.random() * 15;
    const rawEntryX = Math.cos(entryAngle) * entryDist;
    const rawEntryY = Math.sin(entryAngle) * entryDist;
    const entry = clampTransformOffset(rawEntryX, rawEntryY, fY, rx, ry);
    return {
      id: set.id,
      x: pin?.x ?? prev?.x ?? entry.x,
      y: pin?.y ?? prev?.y ?? entry.y,
      vx: pin ? 0 : (prev?.vx ?? (target.x - entry.x) * 0.006),
      vy: pin ? 0 : (prev?.vy ?? (target.y - entry.y) * 0.006),
      radius: 20 + set.flowers.length * 2.5,
      targetX: target.x,
      targetY: target.y,
      flexY: fY,
    };
  });

  const sim: PlayerSim = {
    nodes,
    rafId: null,
    startTime: performance.now(),
    wasPinned: !!initPinned?.size,
  };
  sims.set(playerId, sim);

  const MAX_DURATION = 8000;
  const SPRING_K = 0.007;
  const REPULSION = 180;
  const DAMPING = 0.97;
  const STOP_VELOCITY = 0.008;

  const tick = () => {
    const currentPinned = pinnedRef.current.get(playerId);
    const isPinned = !!currentPinned?.size;

    // Reset timer when drag releases so spring-back gets a full window
    if (sim.wasPinned && !isPinned) {
      sim.startTime = performance.now();
    }
    sim.wasPinned = isPinned;

    const elapsed = performance.now() - sim.startTime;
    if (elapsed > MAX_DURATION && !isPinned) {
      sim.rafId = null;
      setPositions(prev => { const next = new Map(prev); next.delete(playerId); return next; });
      return;
    }

    const { nodes: ns } = sim;

    // Override pinned nodes before applying forces
    for (const n of ns) {
      const pin = currentPinned?.get(n.id);
      if (pin) { n.x = pin.x; n.y = pin.y; n.vx = 0; n.vy = 0; }
    }

    // Spring toward target (skip pinned nodes)
    for (const n of ns) {
      if (currentPinned?.has(n.id)) continue;
      n.vx += (n.targetX - n.x) * SPRING_K;
      n.vy += (n.targetY - n.y) * SPRING_K;
    }

    // Pairwise repulsion
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x;
        const dy = ns[j].y - ns[i].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minDist = ns[i].radius + ns[j].radius;
        if (dist < minDist) {
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!currentPinned?.has(ns[i].id)) { ns[i].vx -= fx; ns[i].vy -= fy; }
          if (!currentPinned?.has(ns[j].id)) { ns[j].vx += fx; ns[j].vy += fy; }
        }
      }
    }

    // Integrate + dampen + boundary clamp (accounting for flex offset)
    let maxV = 0;
    for (const n of ns) {
      if (currentPinned?.has(n.id)) continue;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      const clamped = clampTransformOffset(n.x, n.y, n.flexY, rx, ry);
      if (clamped.x !== n.x || clamped.y !== n.y) {
        const outX = n.x - clamped.x, outY = n.y - clamped.y;
        const len = Math.hypot(outX, outY) || 1;
        const dot = (n.vx * outX + n.vy * outY) / len;
        if (dot > 0) { n.vx -= dot * outX / len; n.vy -= dot * outY / len; }
        n.x = clamped.x;
        n.y = clamped.y;
      }
      maxV = Math.max(maxV, Math.hypot(n.vx, n.vy));
    }

    // Publish positions
    const playerMap = new Map(ns.map(n => [n.id, { x: n.x, y: n.y }]));
    setPositions(prev => {
      const next = new Map(prev);
      next.set(playerId, playerMap);
      return next;
    });

    // Keep running while a chip is pinned (dragging)
    if (isPinned) {
      sim.rafId = requestAnimationFrame(tick);
      return;
    }

    if (maxV < STOP_VELOCITY) {
      sim.rafId = null;
      setPositions(prev => { const next = new Map(prev); next.delete(playerId); return next; });
      return;
    }

    sim.rafId = requestAnimationFrame(tick);
  };

  sim.rafId = requestAnimationFrame(tick);
}

// Returns per-player, per-set position overrides during physics settlement.
// When a player's garden is not simulating, their entry is absent from the map.
export function useAllGardensForceLayout(
  players: { id: string; sets: GardenSet[]; gardenW: number; gardenH: number; totalFlowers: number }[],
  pinnedPositions: Map<string, Map<string, ForcePosition>> = new Map()
): Map<string, Map<string, ForcePosition>> {
  const simsRef = useRef<Map<string, PlayerSim>>(new Map());
  const signaturesRef = useRef<Map<string, string>>(new Map());
  const pinnedRef = useRef(pinnedPositions);
  const playersRef = useRef(players);

  const [positions, setPositions] = useState<Map<string, Map<string, ForcePosition>>>(new Map());

  // Keep refs in sync each render without causing effect re-runs
  useLayoutEffect(() => {
    pinnedRef.current = pinnedPositions;
    playersRef.current = players;
  });

  // Restart sim on garden changes
  useEffect(() => {
    for (const { id: playerId, sets, gardenW, gardenH, totalFlowers } of players) {
      const sig = gardenSignature(sets);
      if (sig === signaturesRef.current.get(playerId)) continue;
      signaturesRef.current.set(playerId, sig);
      startPlayerSim(playerId, sets, gardenW, gardenH, totalFlowers, simsRef, pinnedRef, setPositions);
    }
    return () => {
      for (const sim of simsRef.current.values()) {
        if (sim.rafId != null) cancelAnimationFrame(sim.rafId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p => gardenSignature(p.sets)).join('|')]);

  // Start sim when a player becomes pinned and has no active sim
  useEffect(() => {
    for (const [playerId, pinMap] of pinnedPositions) {
      if (!pinMap.size) continue;
      const sim = simsRef.current.get(playerId);
      if (sim?.rafId != null) continue; // already running; tick will read fresh pinnedRef
      const player = playersRef.current.find(p => p.id === playerId);
      if (!player) continue;
      startPlayerSim(playerId, player.sets, player.gardenW, player.gardenH, player.totalFlowers, simsRef, pinnedRef, setPositions);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(pinnedPositions.keys()).sort().join('|')]);

  return positions;
}
