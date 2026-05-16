// ============================================================
// DEBUG ARENA PAGE — Full arena simulator with multiple players
// URL: /debug-arena
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GardenFlowerField } from './board/GardenFlowerField';
import type { GardenSet, FlowerColor, Player, Garden, Card } from './types/gameTypes';
import { uid } from '../utils/shuffle';
import { normalizeGardenTokens } from '../engine/garden';

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

function gardenDensityClass(count: number): string {
  if (count >= 6) return 'garden-density-compact';
  if (count >= 4) return 'garden-density-comfy';
  return 'garden-density-spacious';
}

// ── Arena layout (copied from FlowerBoard) ────────────────────

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
  panelPadding: number = 90,
): ArenaGardenLayout[] {
  const count = Math.max(1, players.length);
  const shortSide = Math.max(360, Math.min(viewport.width, viewport.height));
  const longSide = Math.max(viewport.width, viewport.height);
  const baseOrbit = compactLayout
    ? Math.min(shortSide * 0.30, longSide * 0.22)
    : Math.min(shortSide * 0.38, longSide * 0.28);
  const baseRadius = Math.max(compactLayout ? 110 : 155, Math.min(compactLayout ? 260 : 360, baseOrbit));

  const nodes = players.map((player, i) => {
    const actualSize = sizes[player.id];
    const totalFlowers = player.garden.sets.reduce((sum, set) => sum + (set.isToken ? 1 : set.flowers.length), 0);
    const totalSets = player.garden.sets.length;
    const rawSize = actualSize
      ? Math.max(actualSize.width, actualSize.height)
      : Math.max(compactLayout ? 120 : 150, Math.min(compactLayout ? 280 : 340, (compactLayout ? 140 : 170) + (totalFlowers * 3) + (totalSets * 12)));
    const size = rawSize;
    const angle = (Math.PI * 2 * (i - myPlayerIndex)) / count + Math.PI / 2;
    const orbit = baseRadius + rawSize * 0.55;
    return {
      player,
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit * (compactLayout ? 0.82 : 0.72),
      size,
      angle,
      totalFlowers,
      totalSets,
    };
  });

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  for (let iter = 0; iter < 30; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const minDist = (a.size + b.size) / 2 + panelPadding;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }

    for (const node of nodes) {
      const desiredOrbit = baseRadius + node.size * 0.55;
      const dist = Math.max(1, Math.hypot(node.x, node.y));
      const pull = (dist - desiredOrbit) * 0.03;
      node.x -= (node.x / dist) * pull;
      node.y -= (node.y / dist) * pull;
      node.x = clamp(node.x, compactLayout ? -500 : -640, compactLayout ? 500 : 640);
      node.y = clamp(node.y, compactLayout ? -380 : -480, compactLayout ? 380 : 480);
    }
  }

  return nodes;
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
  const [logs, setLogs] = useState<string[]>([]);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  const [arenaZoom, setArenaZoom] = useState(1);
  const [arenaPan, setArenaPan] = useState({ x: 0, y: 0 });
  const [gardenContentSizes, setGardenContentSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [isMobileArena, setIsMobileArena] = useState(false);
  const arenaRef = useRef<HTMLDivElement | null>(null);
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
  }, [addLog]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#1a1a2e', color: '#fff', overflow: 'hidden' }}>
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div style={{
        padding: '8px 12px',
        background: '#16213e',
        borderBottom: '1px solid #0f3460',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        zIndex: 100,
        fontSize: 12,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, marginRight: 4 }}>🐛 Debug Arena</span>

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
                fontSize: 11,
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

        <button onClick={randomFillAll} style={btn('#e67e22')}>🎲 Random All</button>
        <button onClick={resetAll} style={btn('#555')}>Reset All</button>

        <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

        <button
          onClick={() => setIsMobileArena(prev => !prev)}
          style={btn(isMobileArena ? '#4ecca3' : '#555', isMobileArena ? '#1a1a2e' : '#fff')}
          title={isMobileArena ? 'Switch to PC view' : 'Switch to mobile view'}
        >
          {isMobileArena ? '📱 Mobile' : '🖥️ PC'}
        </button>

        {discardedCount > 0 && (
          <span style={{ color: '#aaa', marginLeft: 'auto' }}>Discarded: {discardedCount} 🌸</span>
        )}
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
                        <span style={{ fontWeight: 700, fontSize: 12, color: isActive ? '#4ecca3' : '#ccc' }}>
                          {player.name}
                          {player.id === 'p0' && ' (You)'}
                        </span>
                        <span style={{ fontSize: 10, color: '#888' }}>
                          {totalFlowers}🌸 {setCount} sets
                        </span>
                      </div>

                      {/* Garden */}
                      <div style={{
                        minHeight: 80,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.22)',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: 8,
                      }}>
                        {player.garden.sets.length === 0 ? (
                          <span style={{ color: '#555', fontSize: 11 }}>Empty garden</span>
                        ) : (
                          <GardenFlowerField
                            sets={player.garden.sets}
                            playerId={player.id}
                            onContentSizeChange={(w, h) => {
                              setGardenContentSizes(prev => ({ ...prev, [player.id]: { width: w, height: h } }));
                            }}
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

          {/* Zoom hint */}
          <div style={{
            position: 'absolute',
            bottom: 8, left: 8,
            fontSize: 10, color: '#666',
            pointerEvents: 'none',
          }}>
            Zoom: {Math.round(arenaZoom * 100)}% · Drag to pan · Ctrl+wheel to zoom
          </div>
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
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #222', fontWeight: 700, fontSize: 12 }}>
            Logs
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {logs.length === 0 && (
              <p style={{ color: '#555', fontSize: 11 }}>No logs yet.</p>
            )}
            {logs.map((log, i) => (
              <pre key={i} style={{ margin: '2px 0', fontSize: 10, color: '#bbb', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {log}
              </pre>
            ))}
          </div>
          {/* Player summary */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #222', fontSize: 11 }}>
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
  );
}

function btn(bg = '#0f3460', color = '#fff'): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 11,
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
    fontSize: 10,
    background: bg,
    color: '#fff',
  };
}
