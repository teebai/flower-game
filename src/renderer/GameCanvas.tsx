// ============================================================
// FLOWER GAME v2 — REACT ↔ PIXI BRIDGE
// Mounts the Pixi canvas and syncs boardgame.io state to it.
// Ported from v7 renderer.
// ============================================================

import { useEffect, useRef } from 'react';
import { PixiApp } from './PixiApp';
import type { GameState, Player } from '../types/gameTypes';
import type { Ctx } from 'boardgame.io';

interface GardenPosition {
  playerId: string;
  x: number;
  y: number;
}

interface GardenSector {
  playerId: string;
  centerAngle: number;
  halfAngle: number;
  innerR: number;
  outerR: number;
}

interface GameCanvasProps {
  G: GameState;
  ctx: Ctx;
  playerID: string;
  panX?: number;
  panY?: number;
  zoom?: number;
  gardenPositions?: GardenPosition[];
  gardenSectors?: GardenSector[];
  hoveredPlayerId?: string;
  hoveredSetId?: string;
}

function toGardenViewPlayer(player: Player) {
  return {
    id: player.id,
    name: player.name,
    handCount: player.hand.length,
    garden: {
      sets: player.garden.sets.map((set) => ({
        isComplete: set.isComplete,
        isSolid: set.isSolid,
        isDivine: set.isDivine,
        flowers: set.flowers.map((f) => ({
          id: f.id,
          color: f.color,
          isWildcard: f.isWildcard,
        })),
      })),
    },
  };
}

export function GameCanvas({ G, ctx, playerID, panX = 0, panY = 0, zoom = 1, gardenPositions = [], gardenSectors = [], hoveredPlayerId, hoveredSetId }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<PixiApp | null>(null);
  const mountPromiseRef = useRef<Promise<void> | null>(null);

  // Mount Pixi app once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pixiRef.current) return;

    const pixi = new PixiApp();
    pixiRef.current = pixi;
    mountPromiseRef.current = pixi.mount(container);

    return () => {
      pixi.destroy();
      pixiRef.current = null;
      mountPromiseRef.current = null;
    };
  }, []);

  // Sync state on every update
  useEffect(() => {
    const pixi = pixiRef.current;
    if (!pixi) return;

    const currentPlayerId = G.turnOrder[G.currentPlayerIndex] ?? '';

    pixi.syncState({
      players: G.players.map(toGardenViewPlayer) as any,
      currentPlayerId,
      myPlayerId: playerID,
      godsFavouritePlayerId: G.godsFavouritePlayerId,
      gardenPositions,
      gardenSectors,
      hoveredPlayerId: hoveredPlayerId ?? null,
      hoveredSetId: hoveredSetId ?? null,
    });
  }, [G, ctx, playerID, gardenPositions, gardenSectors, hoveredPlayerId, hoveredSetId]);

  // Sync DOM camera to Pixi
  useEffect(() => {
    pixiRef.current?.syncCamera(panX, panY, zoom);
  }, [panX, panY, zoom]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}
