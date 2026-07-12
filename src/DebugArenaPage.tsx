// ============================================================
// DEBUG ARENA PAGE — Full arena simulator with multiple players
// URL: /debug-arena
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GardenFlowerField } from './board/GardenFlowerField';
import { GrassField } from './board/GrassField';
import { WindPathCanvas } from './board/WindPathCanvas';
import { BugAnimationOverlay } from './board/BugAnimationOverlay';
import type { BugAnimation } from './board/BugAnimationOverlay';
import { BeeAnimationOverlay } from './board/BeeAnimationOverlay';
import type { BeeAnimation } from './board/BeeAnimationOverlay';
import { NaturalDisasterOverlay } from './board/NaturalDisasterOverlay';
import type { NaturalDisasterAnimation } from './board/NaturalDisasterOverlay';
import { DivineFavouriteTransition } from './board/DivineFavouriteTransition';
import { ActionAnimationOverlay } from './board/ActionAnimationOverlay';
import type { GardenSet, FlowerColor, Player, Garden, Card, FlowerCard } from './types/gameTypes';
import type { PowerCardName } from './types/gameTypes';
import { uid } from '../utils/shuffle';
import { normalizeGardenTokens } from '../engine/garden';
import { computeSectorLayout } from './board/sectorLayout';

const COLORS: FlowerColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black'];

function makeFlower(color: FlowerColor): { id: string; color: FlowerColor; kind: 'flower'; isWildcard: boolean } {
  return { id: uid(), color, kind: 'flower', isWildcard: false };
}

function resolveSetColor(set: GardenSet): FlowerColor | null {
  const normalColors: FlowerColor[] = ['blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black'];
  for (const f of set.flowers) {
    const c = f.representedColor ?? f.color;
    if (normalColors.includes(c)) return c;
  }
  return null;
}

function reclassifySet(set: GardenSet): GardenSet {
  const f = set.flowers;
  return {
    ...set,
    isComplete: f.length >= 3,
    isSolid: f.length >= 5,
    containsTripleRainbow: f.some((fl) => fl.color === 'triple_rainbow'),
    isDivine: f.some((fl) => fl.color === 'divine'),
  };
}

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    hand: [] as Card[],
    garden: { sets: [] },
    matchStats: { flowersPlanted: 0 },
  };
}

// Stable ref callbacks stored in module-level Map so React doesn't
// call them on every render (which would cause infinite remounting).
const gardenRefCallbacks = new Map<string, (node: HTMLDivElement | null) => void>();

function getGardenRef(
  refs: React.MutableRefObject<Record<string, HTMLDivElement | null>>,
  playerId: string,
): (node: HTMLDivElement | null) => void {
  if (!gardenRefCallbacks.has(playerId)) {
    gardenRefCallbacks.set(playerId, (node) => {
      refs.current[playerId] = node;
    });
  }
  return gardenRefCallbacks.get(playerId)!;
}

function gardenDensityClass(count: number): string {
  if (count >= 6) return 'garden-density-compact';
  if (count >= 4) return 'garden-density-comfy';
  return 'garden-density-spacious';
}

// ── Arena layout (uses production sector math for consistency) ─

type ArenaGardenLayout = {
  player: Player;
  x: number;
  y: number;
  size: number;
  angle: number;
  totalFlowers: number;
  totalSets: number;
};

function computeArenaLayout(
  players: Player[],
  viewport: { width: number; height: number },
  compactLayout: boolean,
  myPlayerIndex: number = 0,
  sizes: Record<string, { width: number; height: number }>,
): ArenaGardenLayout[] {
  // Use the same radial sector layout as production FlowerBoard
  const sectors = computeSectorLayout(players, viewport, myPlayerIndex);

  return sectors.map((sector) => {
    const actualSize = sizes[sector.player.id];
    const rawSize = actualSize
      ? Math.max(actualSize.width, actualSize.height)
      : Math.max(compactLayout ? 120 : 150, Math.min(compactLayout ? 280 : 340, (compactLayout ? 140 : 170) + (sector.totalFlowers * 3) + (sector.totalSets * 12)));

    return {
      player: sector.player,
      x: sector.clusterOffsetX,
      y: sector.clusterOffsetY,
      size: rawSize,
      angle: sector.sectorCenterAngle,
      totalFlowers: sector.totalFlowers,
      totalSets: sector.totalSets,
    };
  });
}

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// ── Component ─────────────────────────────────────────────────

export default function DebugArenaPage() {
  const [players, setPlayers] = useState<Player[]>([
    makePlayer('p0', 'You'),
    makePlayer('p1', 'Alice'),
    makePlayer('p2', 'Bob'),
  ]);
  const [activePlayerId, setActivePlayerId] = useState<string>('p0');
  const [godsFavouritePlayerId, setGodsFavouritePlayerId] = useState<string | null>(null);
  const [visualGodsFavouritePlayerId, setVisualGodsFavouritePlayerId] = useState<string | null>(null);
  const [currentSeason, setCurrentSeason] = useState<'spring' | 'summer' | 'autumn' | 'winter' | 'normal'>('normal');

  const [activeAnimation, setActiveAnimation] = useState<{ name: PowerCardName; phase: 'cast' | 'success' | 'win' } | null>(null);

  const [divineTransition, setDivineTransition] = useState<{
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromSize?: number;
    toSize?: number;
  } | null>(null);
  const prevGodsFavRef = useRef<string | null>(null);
  const pendingVisualGodsFavRef = useRef<string | null>(null);
  const godsFavouritePlayerIdRef = useRef(godsFavouritePlayerId);
  godsFavouritePlayerIdRef.current = godsFavouritePlayerId;

  const handleTransitionComplete = useCallback(() => {
    setDivineTransition(null);
    const target = pendingVisualGodsFavRef.current;
    if (target && godsFavouritePlayerIdRef.current === target) {
      setVisualGodsFavouritePlayerId(target);
    }
  }, []);

  useEffect(() => {
    const current = godsFavouritePlayerId;
    const previous = prevGodsFavRef.current;
    if (previous && current && previous !== current) {
      /* Transfer from one garden to another — hide particles during flight */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = current;
      const fromEl = gardenRefs.current[previous] || document.querySelector(`[data-garden="${previous}"]`);
      const toEl = gardenRefs.current[current] || document.querySelector(`[data-garden="${current}"]`);
      if (fromEl && toEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        setDivineTransition({
          id: `divine-${Date.now()}`,
          fromX: fromRect.left + fromRect.width / 2,
          fromY: fromRect.top + fromRect.height / 2,
          toX: toRect.left + toRect.width / 2,
          toY: toRect.top + toRect.height / 2,
          fromSize: Math.max(fromRect.width, fromRect.height),
          toSize: Math.max(toRect.width, toRect.height),
        });
      }
    } else if (!previous && current) {
      /* First-time appearance — hide particles until orbs arrive */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = current;
      const toEl = gardenRefs.current[current] || document.querySelector(`[data-garden="${current}"]`);
      if (toEl) {
        const toRect = toEl.getBoundingClientRect();
        setDivineTransition({
          id: `divine-${Date.now()}`,
          fromX: toRect.left + toRect.width / 2,
          fromY: toRect.top - 300,
          toX: toRect.left + toRect.width / 2,
          toY: toRect.top + toRect.height / 2,
        });
      }
    } else if (previous && !current) {
      /* Removal — hide particles immediately */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = null;
      setDivineTransition(null);
    } else if (!previous && !current) {
      /* No change, both null */
      pendingVisualGodsFavRef.current = null;
    }
    prevGodsFavRef.current = current;
  }, [godsFavouritePlayerId]);
  const [logs, setLogs] = useState<string[]>([]);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [arenaZoom, setArenaZoom] = useState(1);
  const [arenaPan, setArenaPan] = useState({ x: 0, y: 0 });
  const [gardenContentSizes, setGardenContentSizes] = useState<Record<string, { width: number; height: number }>>({});
  const gardenContentSizeCallbacks = useRef<Record<string, (w: number, h: number) => void>>({});
  const getGardenContentSizeCallback = useCallback((playerId: string) => {
    if (!gardenContentSizeCallbacks.current[playerId]) {
      gardenContentSizeCallbacks.current[playerId] = (w, h) => {
        setGardenContentSizes(prev => {
          const existing = prev[playerId];
          if (existing && existing.width === w && existing.height === h) return prev;
          return { ...prev, [playerId]: { width: w, height: h } };
        });
      };
    }
    return gardenContentSizeCallbacks.current[playerId];
  }, []);
  const [isMobileArena, setIsMobileArena] = useState(false);
  const [windFlights, setWindFlights] = useState<import('./board/WindPathCanvas').WindFlight[]>([]);
  const [windLandedFlowerIds, setWindLandedFlowerIds] = useState<Record<string, Set<string>>>({});
  const [bugAnimations, setBugAnimations] = useState<BugAnimation[]>([]);
  const [beeAnimations, setBeeAnimations] = useState<BeeAnimation[]>([]);
  const [ndAnimations, setNdAnimations] = useState<NaturalDisasterAnimation[]>([]);
  const [attackedSetId, setAttackedSetId] = useState<string | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const gardenRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingTransfersRef = useRef<Record<string, {
    fromPlayerId: string;
    toPlayerId: string;
    flower: FlowerCard;
    targetSetId: string | null;
  }>>({});
  const arenaPanRef = useRef(arenaPan);
  const arenaZoomRef = useRef(arenaZoom);

  useEffect(() => {
    arenaPanRef.current = arenaPan;
  }, [arenaPan]);
  useEffect(() => {
    arenaZoomRef.current = arenaZoom;
  }, [arenaZoom]);

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const compactLayout = isMobileArena || viewport.width < 1024 || viewport.height < 700;
  const myPlayerIndex = players.findIndex(p => p.id === 'p0');
  const effectiveW = viewport.width;
  const effectiveH = viewport.height;

  const arenaLayout = useMemo(
    () => computeArenaLayout(players, { width: effectiveW, height: effectiveH }, compactLayout, Math.max(0, myPlayerIndex), gardenContentSizes),
    [players, effectiveW, effectiveH, compactLayout, myPlayerIndex, gardenContentSizes]
  );

  // Auto-zoom
  useEffect(() => {
    if (arenaLayout.length === 0) return;
    // Bounding-box zoom: ensure the full rectangular extent of all gardens fits
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of arenaLayout) {
      const half = n.size * 0.72; // diagonal half ≈ 0.707, rounded up for panel padding
      minX = Math.min(minX, n.x - half);
      maxX = Math.max(maxX, n.x + half);
      minY = Math.min(minY, n.y - half);
      maxY = Math.max(maxY, n.y + half);
    }
    const totalW = Math.max(1, maxX - minX);
    const totalH = Math.max(1, maxY - minY);
    const margin = 0.94; // 6% viewport margin
    const playerCount = players.length;
    const minZoom = Math.max(0.18, 0.88 - playerCount * 0.05);
    const targetZoom = Math.max(minZoom, Math.min(1.0,
      (effectiveW * margin) / totalW,
      (effectiveH * margin) / totalH,
    ));
    setArenaZoom(prev => {
      const next = Number((prev + (targetZoom - prev) * 0.12).toFixed(3));
      return Math.max(minZoom, next);
    });
  }, [arenaLayout, effectiveW, effectiveH]);

  // Reset zoom/pan when toggling between PC and mobile modes
  useEffect(() => {
    if (arenaLayout.length === 0) return;
    if (isMobileArena) {
      // Mobile: fit everything tightly
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of arenaLayout) {
        const half = n.size * 0.72;
        minX = Math.min(minX, n.x - half);
        maxX = Math.max(maxX, n.x + half);
        minY = Math.min(minY, n.y - half);
        maxY = Math.max(maxY, n.y + half);
      }
      const totalW = Math.max(1, maxX - minX);
      const totalH = Math.max(1, maxY - minY);
      const margin = 0.94;
      const playerCount = players.length;
      const minZoom = Math.max(0.18, 0.88 - playerCount * 0.05);
      const targetZoom = Math.max(minZoom, Math.min(1.0,
        (effectiveW * margin) / totalW,
        (effectiveH * margin) / totalH,
      ));
      setArenaZoom(targetZoom);
      setArenaPan({ x: 0, y: 0 });
    } else {
      // PC: comfortable default
      setArenaZoom(1);
      setArenaPan({ x: 0, y: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileArena]);

  const clampArenaZoom = (next: number) => Math.max(0.5, Math.min(1.75, Number(next.toFixed(2))));

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-99), msg]);
  }, []);

  const activePlayer = players.find(p => p.id === activePlayerId) ?? players[0];

  const plantForPlayer = useCallback((playerId: string, color: FlowerColor) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const nextSets = p.garden.sets.map(s => ({ ...s, flowers: [...s.flowers] }));
      const matchIdx = nextSets.findIndex(s => !s.isDivine && resolveSetColor(s) === color);
      const flower = makeFlower(color);
      if (matchIdx !== -1) {
        nextSets[matchIdx] = reclassifySet({ ...nextSets[matchIdx], flowers: [...nextSets[matchIdx].flowers, flower] });
      } else {
        nextSets.push(reclassifySet({
          id: uid(), flowers: [flower], isComplete: false, isSolid: false, containsTripleRainbow: false, isDivine: false,
        }));
      }
      return { ...p, garden: { sets: nextSets }, matchStats: { ...p.matchStats, flowersPlanted: p.matchStats.flowersPlanted + 1 } };
    }));
  }, []);

  const plantAllForPlayer = useCallback((playerId: string) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      let nextSets = p.garden.sets.map(s => ({ ...s, flowers: [...s.flowers] }));
      for (const color of COLORS) {
        const matchIdx = nextSets.findIndex(s => !s.isDivine && resolveSetColor(s) === color);
        const newFlowers = [makeFlower(color), makeFlower(color), makeFlower(color)];
        if (matchIdx !== -1) {
          nextSets[matchIdx] = reclassifySet({ ...nextSets[matchIdx], flowers: [...nextSets[matchIdx].flowers, ...newFlowers] });
        } else {
          nextSets.push(reclassifySet({
            id: uid(), flowers: newFlowers, isComplete: false, isSolid: false, containsTripleRainbow: false, isDivine: false,
          }));
        }
      }
      return { ...p, garden: { sets: nextSets } };
    }));
  }, []);

  const divineMergeForPlayer = useCallback((playerId: string) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== playerId) return p;
      const colorCounts = new Map<string, number>();
      for (const set of p.garden.sets) {
        if (set.isDivine || set.isToken) continue;
        for (const f of set.flowers) {
          const c = f.representedColor ?? f.color;
          if (COLORS.includes(c as FlowerColor)) colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
        }
      }
      const result = normalizeGardenTokens({ sets: p.garden.sets }, 1);
      const newSets = result.garden.sets;
      if (result.discardedFlowers && result.discardedFlowers.length > 0) {
        setDiscardedCount(c => c + result.discardedFlowers!.length);
        addLog(`🔮 [${p.name}] Merge! ${result.discardedFlowers!.length} consumed. Colors: ${colorCounts.size}`);
      } else {
        addLog(`⚠️ [${p.name}] No merge. Colors: ${colorCounts.size} (${Array.from(colorCounts.keys()).join(',') || 'none'}), sets=${p.garden.sets.length}`);
      }
      return { ...p, garden: { sets: newSets } };
    }));
  }, [addLog, players]);

  const clearPlayerGarden = useCallback((playerId: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, garden: { sets: [] } } : p));
    addLog(`🗑️ Cleared ${players.find(p => p.id === playerId)?.name ?? playerId}'s garden`);
  }, [addLog, players]);

  const addPlayer = useCallback(() => {
    const names = ['Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];
    const existingNames = new Set(players.map(p => p.name));
    const nextName = names.find(n => !existingNames.has(n)) ?? `Player ${players.length}`;
    const newPlayer = makePlayer(`p${players.length}`, nextName);
    setPlayers(prev => [...prev, newPlayer]);
    setActivePlayerId(newPlayer.id);
  }, [players]);

  const removePlayer = useCallback((playerId: string) => {
    setPlayers(prev => {
      const next = prev.filter(p => p.id !== playerId);
      if (activePlayerId === playerId && next.length > 0) {
        setActivePlayerId(next[0].id);
      }
      return next;
    });
  }, [activePlayerId]);

  const resetAll = useCallback(() => {
    setPlayers([makePlayer('p0', 'You'), makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')]);
    setActivePlayerId('p0');
    setLogs([]);
    setDiscardedCount(0);
    setGardenContentSizes({});
  }, []);

  const randomFillAll = useCallback(() => {
    for (const p of players) {
      for (let i = 0; i < 5; i++) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        plantForPlayer(p.id, color);
      }
    }
    addLog(`🎲 Random-filled all ${players.length} players with 5 flowers each`);
  }, [players, plantForPlayer, addLog]);

  // ── Wind steal for testing ─────────────────────────────────
  const stealingRef = useRef(false);

  const stealRandomFlower = useCallback((fromPlayerId: string, toPlayerId: string) => {
    if (stealingRef.current) return;
    stealingRef.current = true;
    window.setTimeout(() => { stealingRef.current = false; }, 500);

    const fromPlayer = players.find(p => p.id === fromPlayerId);
    const toPlayer = players.find(p => p.id === toPlayerId);
    if (!fromPlayer || !toPlayer) return;

    // Find a random flower to steal (prefer non-divine, non-solid sets)
    const stealableSets = fromPlayer.garden.sets.filter(s => !s.isDivine && !s.isSolid && !s.isToken && s.flowers.length > 0);
    if (stealableSets.length === 0) {
      addLog(`⚠️ No stealable flowers in ${fromPlayer.name}'s garden`);
      return;
    }

    const targetSet = stealableSets[Math.floor(Math.random() * stealableSets.length)];
    const flowerToSteal = targetSet.flowers[targetSet.flowers.length - 1]; // steal last flower

    // Determine where the flower will land
    const destColor = flowerToSteal.representedColor ?? flowerToSteal.color;
    const destMatchIdx = toPlayer.garden.sets.findIndex(s => !s.isDivine && resolveSetColor(s) === destColor);

    // Compute flight BEFORE state update so DOM positions are current
    let fromEl = gardenRefs.current[fromPlayerId];
    let toEl = gardenRefs.current[toPlayerId];
    if (!fromEl) {
      fromEl = document.querySelector(`[data-garden="${fromPlayerId}"]`) as HTMLDivElement | null;
    }
    if (!toEl) {
      toEl = document.querySelector(`[data-garden="${toPlayerId}"]`) as HTMLDivElement | null;
    }

    // Find exact flower position in source garden
    let fromX = 0, fromY = 0;
    if (fromEl) {
      const fromFlowerEl = fromEl.querySelector(`[data-flower-id="${flowerToSteal.id}"]`) as HTMLElement | null;
      if (fromFlowerEl) {
        const rect = fromFlowerEl.getBoundingClientRect();
        fromX = rect.left + rect.width / 2;
        fromY = rect.top + rect.height / 2;
      } else {
        const rect = fromEl.getBoundingClientRect();
        fromX = rect.left + rect.width / 2;
        fromY = rect.top + rect.height / 2;
      }
    }

    // Find destination position: exact set center if matching set exists, else garden center
    let toX = 0, toY = 0;
    if (toEl) {
      if (destMatchIdx !== -1) {
        const destSetId = toPlayer.garden.sets[destMatchIdx].id;
        const destSetEl = toEl.querySelector(`[data-set-id="${destSetId}"]`) as HTMLElement | null;
        if (destSetEl) {
          const rect = destSetEl.getBoundingClientRect();
          toX = rect.left + rect.width / 2;
          toY = rect.top + rect.height / 2;
        } else {
          const rect = toEl.getBoundingClientRect();
          toX = rect.left + rect.width / 2;
          toY = rect.top + rect.height / 2;
        }
      } else {
        const rect = toEl.getBoundingClientRect();
        toX = rect.left + rect.width / 2;
        toY = rect.top + rect.height / 2;
      }
    }



    const FLIGHT_DURATION = 2500;
    const flight = {
      id: `steal-${flowerToSteal.id}-${Date.now()}`,
      flowerId: flowerToSteal.id,
      color: flowerToSteal.color,
      size: 48,
      fromX,
      fromY,
      toX,
      toY,
      startTime: 0, // Will be set by WindPathCanvas when first seen
      duration: FLIGHT_DURATION,
    };

    // Store pending transfer so we can execute it when flight lands
    pendingTransfersRef.current[flight.id] = {
      fromPlayerId,
      toPlayerId,
      flower: flowerToSteal as FlowerCard,
      targetSetId: destMatchIdx !== -1 ? toPlayer.garden.sets[destMatchIdx].id : null,
    };

    // Trigger departure animation on source set
    setAttackedSetId(targetSet.id);
    window.setTimeout(() => setAttackedSetId(null), 400);

    // Remove flower from source garden only (destination gets it when flight lands)
    setPlayers(prev => {
      const freshFrom = prev.find(p => p.id === fromPlayerId);
      if (!freshFrom) return prev;

      const freshTargetSet = freshFrom.garden.sets.find(s => s.id === targetSet.id);
      if (!freshTargetSet) return prev;
      const freshFlower = freshTargetSet.flowers[freshTargetSet.flowers.length - 1];
      if (freshFlower.id !== flowerToSteal.id) return prev;

      const fromSets = freshFrom.garden.sets.map(s => {
        if (s.id !== targetSet.id) return s;
        return reclassifySet({ ...s, flowers: s.flowers.filter(f => f.id !== flowerToSteal.id) });
      }).filter(s => s.flowers.length > 0 || s.isToken);

      return prev.map(p => {
        if (p.id === fromPlayerId) return { ...p, garden: { sets: fromSets } };
        return p;
      });
    });

    setWindFlights(prev => [...prev, flight]);
    addLog(`💨 ${toPlayer.name} stole a ${flowerToSteal.color} flower from ${fromPlayer.name}!`);
  }, [addLog, players]);

  // ── Auto-transition bug landing → idle ─────────────────────
  useEffect(() => {
    const landingAnims = bugAnimations.filter(a => a.phase === 'landing');
    if (landingAnims.length === 0) return;
    const timers = landingAnims.map(a => {
      const elapsed = a.phaseStartTime === 0 ? 0 : Date.now() - a.phaseStartTime;
      const remaining = Math.max(0, 700 - elapsed);
      return window.setTimeout(() => {
        setBugAnimations(prev => prev.map(b =>
          b.id === a.id && b.phase === 'landing'
            ? { ...b, phase: 'idle' as const, phaseStartTime: 0 }
            : b
        ));
      }, remaining + 50);
    });
    return () => timers.forEach(window.clearTimeout);
  }, [bugAnimations]);

  // ── Auto-transition bee phases ─────────────────────────────
  useEffect(() => {
    const timers: number[] = [];
    for (const a of beeAnimations) {
      if (a.phase === 'complete') continue;
      const duration =
        a.phase === 'emerge' ? 400 :
        a.phase === 'spiral' ? 1600 :
        a.phase === 'plant' ? 600 :
        a.phase === 'flyOff' ? 700 : 500;
      const elapsed = a.phaseStartTime === 0 ? 0 : Date.now() - a.phaseStartTime;
      const remaining = Math.max(0, duration - elapsed);
      const nextPhase: BeeAnimation['phase'] =
        a.phase === 'emerge' ? 'spiral' :
        a.phase === 'spiral' ? 'plant' :
        a.phase === 'plant' ? 'flyOff' : 'complete';
      timers.push(window.setTimeout(() => {
        setBeeAnimations(prev => prev.map(b =>
          b.id === a.id && b.phase === a.phase
            ? { ...b, phase: nextPhase, phaseStartTime: Date.now() }
            : b
        ));
      }, remaining + 30));
    }
    return () => timers.forEach(window.clearTimeout);
  }, [beeAnimations]);

  // ── Bug animation testing ────────────────────────────────────
  const testBugAnimation = useCallback((outcome: 'blocked' | 'success', isAutumn = false) => {
    let targetPlayer = players.find(p => p.id === activePlayerId);
    if (!targetPlayer) return;

    // Collect all valid flowers from the target player's garden
    const allSets = targetPlayer.garden.sets.filter(s => !s.isDivine && !s.isToken);
    const allFlowers = allSets.flatMap(s => s.flowers);

    if (allFlowers.length === 0) {
      addLog(`⚠️ No flowers in ${targetPlayer.name}'s garden for bug animation`);
      return;
    }
    if (isAutumn && allFlowers.length < 2) {
      addLog(`⚠️ Autumn bug needs 2 flowers in ${targetPlayer.name}'s garden, only found ${allFlowers.length}`);
      return;
    }

    // Pick victim flowers: 1 for normal, 2 (different colors if possible) for autumn
    let victimFlowers: typeof allFlowers;
    if (isAutumn) {
      const first = allFlowers[0];
      const differentColor = allFlowers.find(f => f.color !== first.color);
      victimFlowers = differentColor ? [first, differentColor] : allFlowers.slice(0, 2);
    } else {
      victimFlowers = allFlowers.slice(0, 1);
    }

    const primaryFlower = victimFlowers[0];
    const secondFlower = victimFlowers[1];
    const animId = `bug-test-${Date.now()}`;

    // Get EXACT flower position(s), fall back to first set center
    const targetEl =
      gardenRefs.current[targetPlayer.id] ??
      document.querySelector(`[data-garden="${targetPlayer.id}"]`) as HTMLElement | null;
    let fromX = window.innerWidth / 2;
    let fromY = window.innerHeight / 2;
    if (targetEl) {
      const positions: { x: number; y: number }[] = [];
      for (const f of victimFlowers) {
        const flowerEl = targetEl.querySelector(`[data-flower-id="${f.id}"]`) as HTMLElement | null;
        if (flowerEl) {
          const rect = flowerEl.getBoundingClientRect();
          positions.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
      }
      if (positions.length > 0) {
        fromX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
        fromY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
      } else {
        const firstSetEl = targetEl.querySelector(`[data-set-id]`) as HTMLElement | null;
        const rect = firstSetEl?.getBoundingClientRect();
        if (rect) {
          fromX = rect.left + rect.width / 2;
          fromY = rect.top + rect.height / 2;
        }
      }
    }

    const discardEl = document.querySelector('.discard-pile') as HTMLElement | null;
    const discardRect = discardEl?.getBoundingClientRect();
    const toX = discardRect ? discardRect.left + discardRect.width / 2 : window.innerWidth / 2;
    const toY = discardRect ? discardRect.top + discardRect.height / 2 : window.innerHeight / 2;

    // Start landing animation
    setBugAnimations(prev => [...prev, {
      id: animId,
      phase: 'landing',
      fromX,
      fromY,
      toX,
      toY,
      flowerColor: primaryFlower.color,
      flowerId: primaryFlower.id,
      secondFlowerColor: secondFlower?.color,
      secondFlowerId: secondFlower?.id,
      isAutumn,
      phaseStartTime: 0,
      startTime: Date.now(),
    }]);

    addLog(`🐛 ${isAutumn ? 'Autumn ' : ''}Bug landing on ${targetPlayer.name}'s ${primaryFlower.color}${isAutumn && secondFlower ? ` + ${secondFlower.color}` : ''} flower(s)…`);

    // Simulate counter window resolution after 1.5s
    window.setTimeout(() => {
      if (outcome === 'success') {
        // Remove flower(s) from their respective sets
        const idsToRemove = new Set(victimFlowers.map(f => f.id));
        setPlayers(prev => prev.map(p => {
          if (p.id !== targetPlayer.id) return p;
          const newSets = p.garden.sets.map(s => {
            const remaining = s.flowers.filter(f => !idsToRemove.has(f.id));
            if (remaining.length === s.flowers.length) return s; // no change
            return reclassifySet({ ...s, flowers: remaining });
          }).filter(s => s.flowers.length > 0 || s.isToken);
          return { ...p, garden: { sets: newSets } };
        }));
        setDiscardedCount(c => c + victimFlowers.length);
        addLog(`🐛 ${isAutumn ? 'Autumn ' : ''}Bug carried ${victimFlowers.map(f => f.color).join(' + ')} flower(s) to discard!`);
      } else {
        addLog(`🐛 ${isAutumn ? 'Autumn ' : ''}Bug was blocked — cricket-jumping away!`);
      }

      // Transition animation phase
      setBugAnimations(prev => prev.map(a => {
        if (a.id !== animId) return a;
        return { ...a, phase: outcome, phaseStartTime: 0 };
      }));
    }, 1500);
  }, [activePlayerId, players, addLog]);

  // ── Bee animation testing ────────────────────────────────────
  const testBeeAnimation = useCallback(() => {
    const targetPlayer = players.find(p => p.id === activePlayerId);
    if (!targetPlayer) return;

    // Pick a flower color for the carried flower
    const flowerColors: Array<'red' | 'blue' | 'yellow' | 'black' | 'white' | 'pink' | 'green' | 'purple' | 'orange'> = [
      'red', 'blue', 'yellow', 'black', 'white', 'pink', 'green', 'purple', 'orange'
    ];
    const flowerColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];

    const animId = `bee-test-${Date.now()}`;

    // Discard pile position
    const discardEl = document.querySelector('.discard-pile') as HTMLElement | null;
    const discardRect = discardEl?.getBoundingClientRect();
    const fromX = discardRect ? discardRect.left + discardRect.width / 2 : window.innerWidth / 2;
    const fromY = discardRect ? discardRect.top + discardRect.height / 2 : window.innerHeight / 2;

    // Target position: prefer an existing set, fall back to garden center
    const targetSet = targetPlayer.garden.sets.find(s => !s.isDivine && !s.isToken);
    const targetEl =
      gardenRefs.current[targetPlayer.id] ??
      document.querySelector(`[data-garden="${targetPlayer.id}"]`) as HTMLElement | null;
    let toX = window.innerWidth / 2;
    let toY = window.innerHeight / 2;
    if (targetEl) {
      if (targetSet) {
        const setEl = targetEl.querySelector(`[data-set-id="${targetSet.id}"]`) as HTMLElement | null;
        if (setEl) {
          const rect = setEl.getBoundingClientRect();
          toX = rect.left + rect.width / 2;
          toY = rect.top + rect.height / 2;
        } else {
          const gardenRect = targetEl.getBoundingClientRect();
          toX = gardenRect.left + gardenRect.width / 2;
          toY = gardenRect.top + gardenRect.height / 2;
        }
      } else {
        const gardenRect = targetEl.getBoundingClientRect();
        toX = gardenRect.left + gardenRect.width / 2;
        toY = gardenRect.top + gardenRect.height / 2;
      }
    }

    setBeeAnimations(prev => [...prev, {
      id: animId,
      phase: 'emerge',
      fromX,
      fromY,
      toX,
      toY,
      flowerColor,
      phaseStartTime: 0,
      startTime: Date.now(),
    }]);

    addLog(`🐝 Bee carrying ${flowerColor} flower from discard to ${targetPlayer.name}'s garden…`);

    // Phase transitions (must match BeeAnimationOverlay durations)
    // emerge: 400ms → spiral: 1600ms → plant: 600ms → flyOff: 700ms
    const spiralTimer = window.setTimeout(() => {
      setBeeAnimations(prev => prev.map(a =>
        a.id === animId ? { ...a, phase: 'spiral' as const, phaseStartTime: 0 } : a
      ));
    }, 400);

    const plantTimer = window.setTimeout(() => {
      setBeeAnimations(prev => prev.map(a =>
        a.id === animId ? { ...a, phase: 'plant' as const, phaseStartTime: 0 } : a
      ));
    }, 2000); // 400 + 1600

    const flyOffTimer = window.setTimeout(() => {
      setBeeAnimations(prev => prev.map(a =>
        a.id === animId ? { ...a, phase: 'flyOff' as const, phaseStartTime: 0 } : a
      ));
    }, 2600); // 400 + 1600 + 600

    // Plant the flower at the end of the plant phase (2600ms) so the overlay
    // animation finishes before the real garden flower appears — no overlap.
    const plantFlowerTimer = window.setTimeout(() => {
      const newFlower: FlowerCard = {
        id: `bee-flower-${Date.now()}`,
        kind: 'flower',
        color: flowerColor as import('./types/gameTypes').FlowerColor,
        isWildcard: false,
      };
      setPlayers(prev => prev.map(p => {
        if (p.id !== targetPlayer.id) return p;
        if (targetSet) {
          // Add to existing set
          const newSets = p.garden.sets.map(s => {
            if (s.id !== targetSet.id) return s;
            return reclassifySet({ ...s, flowers: [...s.flowers, newFlower] });
          });
          return { ...p, garden: { sets: newSets } };
        } else {
          // Create a new set
          const newSet: GardenSet = {
            id: uid(),
            flowers: [newFlower],
            isComplete: false,
            isSolid: false,
            containsTripleRainbow: false,
            isDivine: false,
          };
          return { ...p, garden: { sets: [...p.garden.sets, newSet] } };
        }
      }));
      addLog(`🐝 Bee planted ${flowerColor} flower in ${targetPlayer.name}'s garden!`);
    }, 2600);

    // Cleanup timers if component unmounts (not strictly needed for debug but good practice)
    return () => {
      window.clearTimeout(spiralTimer);
      window.clearTimeout(plantTimer);
      window.clearTimeout(flyOffTimer);
      window.clearTimeout(plantFlowerTimer);
    };
  }, [activePlayerId, players, addLog]);

  // ── Natural Disaster animation testing ───────────────────────
  const testNaturalDisaster = useCallback((outcome: 'blocked' | 'success') => {
    const targetPlayer = players.find(p => p.id === activePlayerId);
    if (!targetPlayer) return;

    const allSets = targetPlayer.garden.sets.filter(s => !s.isDivine && !s.isToken);
    if (allSets.length === 0) {
      addLog(`⚠️ No valid set in ${targetPlayer.name}'s garden for Natural Disaster`);
      return;
    }
    const targetSet = allSets[0];

    const animId = `nd-test-${Date.now()}`;

    // Target set position
    const targetEl = gardenRefs.current[targetPlayer.id];
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    if (targetEl) {
      const setEl = targetEl.querySelector(`[data-set-id="${targetSet.id}"]`) as HTMLElement | null;
      if (setEl) {
        const rect = setEl.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
      } else {
        const gardenRect = targetEl.getBoundingClientRect();
        targetX = gardenRect.left + gardenRect.width / 2;
        targetY = gardenRect.top + gardenRect.height / 2;
      }
    }

    setNdAnimations(prev => [...prev, {
      id: animId,
      phase: 'landing',
      targetX,
      targetY,
      targetSetId: targetSet.id,
      targetPlayerId: targetPlayer.id,
      phaseStartTime: 0,
      startTime: Date.now(),
    }]);

    addLog(`🌪️ Natural Disaster targeting ${targetPlayer.name}'s set…`);

    // Simulate opponent response after 2s
    const responseTimer = window.setTimeout(() => {
      if (outcome === 'success') {
        // Remove the set
        setPlayers(prev => prev.map(p => {
          if (p.id !== targetPlayer.id) return p;
          const removed = targetSet.flowers;
          const newSets = p.garden.sets.filter(s => s.id !== targetSet.id);
          return { ...p, garden: { sets: newSets } };
        }));
        setDiscardedCount(c => c + targetSet.flowers.length);
        addLog(`🌪️ Natural Disaster destroyed ${targetPlayer.name}'s set!`);
      } else {
        addLog(`🌪️ Natural Disaster blocked by Divine Protection!`);
      }

      setNdAnimations(prev => prev.map(a =>
        a.id === animId ? { ...a, phase: outcome, phaseStartTime: 0 } : a
      ));
    }, 2000);

    return () => window.clearTimeout(responseTimer);
  }, [activePlayerId, players, addLog]);

  return (
    <>
    {divineTransition && (
      <DivineFavouriteTransition
        key={divineTransition.id}
        fromX={divineTransition.fromX}
        fromY={divineTransition.fromY}
        toX={divineTransition.toX}
        toY={divineTransition.toY}
        fromSize={divineTransition.fromSize}
        toSize={divineTransition.toSize}
        onComplete={handleTransitionComplete}
      />
    )}
    <ActionAnimationOverlay
      active={activeAnimation}
      onComplete={() => setActiveAnimation(null)}
    />
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', color: '#fff', overflow: 'hidden' }}>
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div style={{
        padding: '8px 12px',
        background: '#16213e',
        borderBottom: '1px solid #0f3460',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        zIndex: 100,
        fontSize: 36,
      }}>
        <span style={{ fontWeight: 700, fontSize: 42, marginRight: 4 }}>🐛 Debug Arena</span>

        {/* Bee animation test — moved to front for visibility */}
        <button onClick={testBeeAnimation} style={{ ...btn('#f1c40f', '#222'), fontSize: 39, padding: '6px 12px', border: '2px solid #fff' }}>🐝 Bee (plant)</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Player selector */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#aaa' }}>Target:</span>
          {players.map(p => (
            <button
              key={p.id}
              onClick={() => setActivePlayerId(p.id)}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: 33,
                fontWeight: 700,
                background: activePlayerId === p.id ? '#4ecca3' : '#333',
                color: activePlayerId === p.id ? '#1a1a2e' : '#ccc',
              }}
              title={`${p.name} — ${p.garden.sets.length} sets, ${p.garden.sets.reduce((s, set) => s + (set.isToken ? 0 : set.flowers.length), 0)} flowers`}
            >
              {p.name}
            </button>
          ))}
          <button onClick={addPlayer} style={btn('#2c7be5')} title="Add player">+</button>
        </div>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Plant controls */}
        <span style={{ color: '#aaa' }}>Plant:</span>
        {COLORS.map(c => (
          <button key={c} onClick={() => plantForPlayer(activePlayerId, c)} style={btn('#4ecca3', '#1a1a2e')}>
            +{c.slice(0, 3)}
          </button>
        ))}
        <button onClick={() => plantAllForPlayer(activePlayerId)} style={btn('#d4a017', '#1a1a2e')}>+All 7</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Actions */}
        <button onClick={() => divineMergeForPlayer(activePlayerId)} style={btn('#9b59b6')}>🔮 Merge</button>
        <button onClick={() => clearPlayerGarden(activePlayerId)} style={btn('#c44')}>🗑️ Clear</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Wind steal: steal from Alice (p1) to active player */}
        {players.length >= 2 && activePlayerId !== 'p1' && (
          <button
            onClick={() => stealRandomFlower('p1', activePlayerId)}
            style={btn('#5dade2')}
            title="Steal a random flower from Alice"
          >
            💨 Steal from Alice
          </button>
        )}
        {players.length >= 3 && activePlayerId !== 'p2' && (
          <button
            onClick={() => stealRandomFlower('p2', activePlayerId)}
            style={btn('#5dade2')}
            title="Steal a random flower from Bob"
          >
            💨 Steal from Bob
          </button>
        )}

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        <button onClick={randomFillAll} style={btn('#e67e22')}>🎲 Random All</button>
        <button onClick={resetAll} style={btn('#555')}>Reset All</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Bug animation tests */}
        <button onClick={() => testBugAnimation('blocked')} style={btn('#8e44ad')}>🐛 Bug (blocked)</button>
        <button onClick={() => testBugAnimation('success')} style={btn('#c0392b')}>🐛 Bug (success)</button>
        <button onClick={() => testBugAnimation('blocked', true)} style={btn('#d35400')}>🍂 Autumn Bug (blocked)</button>
        <button onClick={() => testBugAnimation('success', true)} style={btn('#a04000')}>🍂 Autumn Bug (success)</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Natural Disaster animation tests */}
        <button onClick={() => testNaturalDisaster('blocked')} style={btn('#2c3e50')}>🌪️ ND (blocked)</button>
        <button onClick={() => testNaturalDisaster('success')} style={btn('#7f8c8d')}>🌪️ ND (success)</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Test wind flight */}
        <button onClick={() => {
          const p1 = gardenRefs.current['p1'] || document.querySelector('[data-garden="p1"]');
          const p2 = gardenRefs.current['p2'] || document.querySelector('[data-garden="p2"]');
          if (!p1 || !p2) return;
          const r1 = p1.getBoundingClientRect();
          const r2 = p2.getBoundingClientRect();
          setWindFlights(prev => [...prev, {
            id: `test-${Date.now()}`, flowerId: `test-flr-${Date.now()}`,
            color: 'red', size: 48,
            fromX: r1.left + r1.width/2, fromY: r1.top + r1.height/2,
            toX: r2.left + r2.width/2, toY: r2.top + r2.height/2,
            startTime: 0, duration: 2500,
          }]);
        }} style={btn('#5dade2')}>💨 Test Wind</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Divine Favourite toggle */}
        <button
          onClick={() => {
            setGodsFavouritePlayerId(prev => prev === activePlayerId ? null : activePlayerId);
            addLog(godsFavouritePlayerId === activePlayerId ? `👑 ${players.find(p => p.id === activePlayerId)?.name} lost Divine Favourite` : `👑 ${players.find(p => p.id === activePlayerId)?.name} became Divine Favourite!`);
          }}
          style={btn(godsFavouritePlayerId === activePlayerId ? '#e6c84a' : '#555', godsFavouritePlayerId === activePlayerId ? '#1a1a2e' : '#fff')}
          title={godsFavouritePlayerId === activePlayerId ? 'Remove Divine Favourite' : 'Grant Divine Favourite'}
        >
          {godsFavouritePlayerId === activePlayerId ? '👑 Favoured' : '👑 Divine'}
        </button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        {/* Season animation testers */}
        {(['spring', 'summer', 'autumn', 'winter'] as const).map(s => (
          <button
            key={s}
            onClick={() => {
              setCurrentSeason(s);
              setActiveAnimation({ name: s, phase: 'cast' });
            }}
            style={btn(currentSeason === s ? '#e6c84a' : '#f0c040', '#1a1a2e')}
            title={`Test ${s} animation`}
          >
            {s === 'spring' ? '🌸' : s === 'summer' ? '☀️' : s === 'autumn' ? '🍂' : '❄️'}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        <button
          onClick={() => setIsMobileArena(prev => !prev)}
          style={btn(isMobileArena ? '#4ecca3' : '#555', isMobileArena ? '#1a1a2e' : '#fff')}
          title={isMobileArena ? 'Switch to PC view' : 'Switch to mobile view'}
        >
          {isMobileArena ? '📱 Mobile' : '🖥️ PC'}
        </button>

        {/* Discard pile target for bug animation */}
        <span
          className="v2-discard-pill"
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: 12,
            background: '#2a2a3e',
            color: '#aaa',
            fontSize: 36,
            border: '1px solid #3a3a4e',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🗑 {discardedCount}
        </span>
      </div>

      {/* ── Main area: Arena + Logs ───────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Arena */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            ref={arenaRef}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
            }}
            onWheel={event => {
              event.preventDefault();
              if (event.ctrlKey || event.metaKey) {
                const delta = event.deltaY < 0 ? 0.08 : -0.08;
                setArenaZoom(prev => clampArenaZoom(prev + delta));
                return;
              }
              setArenaPan(current => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
            }}
            onPointerDown={e => {
              const startX = e.clientX;
              const startY = e.clientY;
              const startPanX = arenaPanRef.current.x;
              const startPanY = arenaPanRef.current.y;
              const move = (ev: PointerEvent) => {
                setArenaPan({
                  x: startPanX + (ev.clientX - startX),
                  y: startPanY + (ev.clientY - startY),
                });
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <div style={{ transform: `translate(${arenaPan.x}px, ${arenaPan.y}px)`, transition: 'none' }}>
              <div style={{ transform: `scale(${arenaZoom})`, transformOrigin: 'center center', transition: 'transform 0.3s ease-out' }}>
                {/* Center core decoration */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 48, height: 48,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(78,204,163,0.3) 0%, transparent 70%)',
                  border: '1px solid rgba(78,204,163,0.2)',
                  pointerEvents: 'none',
                }} />

                {/* Discard pile (center of arena, target for bug animation) */}
                <div
                  className="discard-pile"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 45,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 120,
                      borderRadius: 8,
                      border: '2px solid rgba(255,255,255,0.12)',
                      background: 'rgba(22, 33, 62, 0.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      boxShadow: '0 0 20px rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <span style={{ fontSize: 84, opacity: 0.35 }}>🗑️</span>
                    <span
                      style={{
                        fontSize: 33,
                        fontWeight: 700,
                        color: '#888',
                        background: 'rgba(0,0,0,0.35)',
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      {discardedCount}
                    </span>
                  </div>
                </div>

                {arenaLayout.map(layout => {
                  const player = layout.player;
                  const isActive = player.id === activePlayerId;
                  const setCount = player.garden.sets.length;
                  const gardenSize = Math.max(148, layout.size);
                  const estimatedRows = Math.max(1, Math.ceil(setCount / (compactLayout ? 2 : 3)));
                  const gardenHeight = Math.max(136, 102 + estimatedRows * 34);
                  const contentSize = gardenContentSizes[player.id];
                  const GAP = 44;
                  const panelW = (contentSize ? Math.max(gardenSize, contentSize.width + 28) : gardenSize) + GAP;
                  const panelH = (contentSize ? Math.max(gardenHeight, contentSize.height + 28) : gardenHeight) + GAP;
                  const totalFlowers = player.garden.sets.reduce((s, set) => s + (set.isToken ? 0 : set.flowers.length), 0);

                  return (
                    <div
                      key={player.id}
                      style={{
                        position: 'absolute',
                        left: `calc(50% + ${layout.x}px - ${panelW / 2}px)`,
                        top: `calc(50% + ${layout.y}px - ${panelH / 2}px)`,
                        width: panelW,
                        minHeight: panelH,
                        background: isActive
                          ? 'linear-gradient(180deg, rgba(78,204,163,0.12) 0%, rgba(22,33,62,0.85) 100%)'
                          : 'linear-gradient(180deg, rgba(30,40,70,0.9) 0%, rgba(22,33,62,0.85) 100%)',
                        borderRadius: 16,
                        border: isActive ? '1.5px solid rgba(78,204,163,0.55)' : '1px solid rgba(100,120,180,0.25)',
                        boxShadow: isActive
                          ? '0 8px 32px rgba(78,204,163,0.15), inset 0 1px 0 rgba(255,255,255,0.06)'
                          : '0 6px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)',
                        padding: 10,
                        transition: 'all 0.4s ease-out',
                      }}
                    >
                      {/* Player header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                        padding: '0 4px',
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 36, color: isActive ? '#4ecca3' : '#ccc' }}>
                          {player.name}
                          {player.id === 'p0' && ' (You)'}
                        </span>
                        <span style={{ fontSize: 30, color: '#888' }}>
                          {totalFlowers}🌸 {setCount} sets
                        </span>
                      </div>

                      {/* Garden */}
                      <div
                        ref={getGardenRef(gardenRefs, player.id)}
                        data-garden={player.id}
                        className={godsFavouritePlayerId === player.id ? 'is-gods-fav' : ''}
                        style={{
                          position: 'relative',
                          minHeight: 80,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(0,0,0,0.22)',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.06)',
                          padding: 8,
                          overflow: 'visible',
                        }}
                      >
                        <div className={`garden-divine-particles ${visualGodsFavouritePlayerId === player.id ? 'is-visible' : ''}`} aria-hidden="true">
                          {Array.from({ length: 10 }, (_, i) => {
                            const orbitDur = 8 + (i % 5) * 2.2;
                            const orbitDelay = -(i * 1.4);
                            /* Scale orbit radius with garden size so the ring always wraps around */
                            const maxGardenDim = contentSize
                              ? Math.max(contentSize.width + 28, contentSize.height + 28)
                              : Math.max(gardenSize, gardenHeight);
                            const radius = Math.round(maxGardenDim * (0.55 + (i % 5) * 0.12));
                            const sparkleDur = 0.9 + (i % 5) * 0.45;
                            const sparkleDelay = -(i * 0.45);
                            const size = 5 + (i % 5) * 1.8;
                            return (
                              <div
                                key={i}
                                className="garden-divine-particle"
                                style={{
                                  ['--orbit-dur' as string]: `${orbitDur}s`,
                                  ['--orbit-delay' as string]: `${orbitDelay}s`,
                                  ['--orbit-r' as string]: `${radius}px`,
                                  ['--sparkle-dur' as string]: `${sparkleDur}s`,
                                  ['--sparkle-delay' as string]: `${sparkleDelay}s`,
                                  ['--p-size' as string]: `${size}px`,
                                }}
                              >
                                <div className="garden-divine-particle__core" />
                              </div>
                            );
                          })}
                        </div>
                        {player.garden.sets.length === 0 ? (
                          <span style={{ color: '#555', fontSize: 33 }}>Empty garden</span>
                        ) : (
                          <GardenFlowerField
                            sets={player.garden.sets}
                            playerId={player.id}
                            onContentSizeChange={getGardenContentSizeCallback(player.id)}
                            windLandedFlowerIds={windLandedFlowerIds[player.id]}
                            attackedSetId={attackedSetId}
                          />
                        )}
                      </div>

                      {/* Quick actions per player */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'center' }}>
                        <button
                          onClick={() => divineMergeForPlayer(player.id)}
                          style={miniBtn('#9b59b6')}
                          title="Divine merge"
                        >
                          🔮
                        </button>
                        <button
                          onClick={() => clearPlayerGarden(player.id)}
                          style={miniBtn('#c44')}
                          title="Clear garden"
                        >
                          🗑️
                        </button>
                        {players.length > 1 && player.id !== 'p0' && (
                          <button
                            onClick={() => removePlayer(player.id)}
                            style={miniBtn('#555')}
                            title="Remove player"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bug animation overlay */}
          <BugAnimationOverlay
            animations={bugAnimations}
            onComplete={(id) => setBugAnimations(prev => prev.filter(a => a.id !== id))}
          />
          <BeeAnimationOverlay
            animations={beeAnimations}
            onComplete={(id) => setBeeAnimations(prev => prev.filter(a => a.id !== id))}
          />
          <NaturalDisasterOverlay
            animations={ndAnimations}
            onComplete={(id) => setNdAnimations(prev => prev.filter(a => a.id !== id))}
          />

          {/* Wind flight overlay */}
          <WindPathCanvas
            flights={windFlights}
            onComplete={(id) => {
              setWindFlights(prev => prev.filter(f => f.id !== id));

              const transfer = pendingTransfersRef.current[id];
              if (!transfer) return;

              // Execute the transfer: add flower to destination garden
              setPlayers(prev => {
                const freshTo = prev.find(p => p.id === transfer.toPlayerId);
                if (!freshTo) return prev;

                const destColor = transfer.flower.representedColor ?? transfer.flower.color;
                const destMatchIdx = freshTo.garden.sets.findIndex(s => !s.isDivine && resolveSetColor(s) === destColor);
                let toSets = freshTo.garden.sets.map(s => ({ ...s, flowers: [...s.flowers] }));
                if (destMatchIdx !== -1) {
                  toSets[destMatchIdx] = reclassifySet({ ...toSets[destMatchIdx], flowers: [...toSets[destMatchIdx].flowers, transfer.flower] });
                } else {
                  toSets.push(reclassifySet({
                    id: uid(), flowers: [transfer.flower], isComplete: false, isSolid: false, containsTripleRainbow: false, isDivine: false,
                  }));
                }

                return prev.map(p => {
                  if (p.id === transfer.toPlayerId) return { ...p, garden: { sets: toSets } };
                  return p;
                });
              });

              // Trigger landing animation
              setWindLandedFlowerIds(prev => ({
                ...prev,
                [transfer.toPlayerId]: new Set([...(prev[transfer.toPlayerId] || []), transfer.flower.id]),
              }));
              window.setTimeout(() => {
                setWindLandedFlowerIds(prev => {
                  const next = { ...prev };
                  if (next[transfer.toPlayerId]) {
                    const remaining = new Set([...next[transfer.toPlayerId]].filter(fid => fid !== transfer.flower.id));
                    if (remaining.size > 0) next[transfer.toPlayerId] = remaining;
                    else delete next[transfer.toPlayerId];
                  }
                  return next;
                });
              }, 5000);

              delete pendingTransfersRef.current[id];
            }}
          />

          {/* Zoom hint */}
          <div style={{
            position: 'absolute',
            bottom: 8, left: 8,
            fontSize: 30, color: '#666',
            pointerEvents: 'none',
          }}>
            Zoom: {Math.round(arenaZoom * 100)}% · Drag to pan · Ctrl+wheel to zoom
          </div>
        </div>

        {/* Dynamic grass background */}
        <div style={{ position: 'fixed', inset: 0, zIndex: -1 }}>
          <GrassField
            season={currentSeason}
            scrollX={-arenaPan.x}
            scrollY={-arenaPan.y}
          />
        </div>

        {/* Logs panel */}
        <div style={{
          width: 280,
          minWidth: 200,
          background: '#111',
          borderLeft: '1px solid #222',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #222', fontWeight: 700, fontSize: 36 }}>
            Logs
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {logs.length === 0 && (
              <p style={{ color: '#555', fontSize: 33 }}>No logs yet.</p>
            )}
            {logs.map((log, i) => (
              <pre key={i} style={{ margin: '2px 0', fontSize: 30, color: '#bbb', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {log}
              </pre>
            ))}
          </div>
          {/* Player summary */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #222', fontSize: 33 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#888' }}>Players</div>
            {players.map(p => {
              const flowers = p.garden.sets.reduce((s, set) => s + (set.isToken ? 0 : set.flowers.length), 0);
              const tokens = p.garden.sets.filter(s => s.isToken).length;
              const divine = p.garden.sets.filter(s => s.isDivine).length;
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', margin: '2px 0' }}>
                  <span>{p.name}</span>
                  <span>{flowers}🌸 {tokens}💎 {divine ? `${divine}👑` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function btn(bg = '#0f3460', color = '#fff'): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 33,
    background: bg,
    color,
    whiteSpace: 'nowrap',
  };
}

function miniBtn(bg: string): React.CSSProperties {
  return {
    padding: '2px 6px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 30,
    background: bg,
    color: '#fff',
  };
}
