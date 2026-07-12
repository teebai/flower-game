// ============================================================
// SECTOR LAYOUT — Shared radial garden positioning
// Used by FlowerBoard (production) and DebugArenaPage (testing)
// ============================================================

import type { Player } from '../types/gameTypes';

export interface SectorGardenLayout {
  player: Player;
  sectorIndex: number;
  sectorStartAngle: number;
  sectorCenterAngle: number;
  sectorEndAngle: number;
  badgeOffsetX: number;
  badgeOffsetY: number;
  clusterOffsetX: number;
  clusterOffsetY: number;
  x: number; // Pixi garden container position (same as clusterOffsetX)
  y: number; // Pixi garden container position (same as clusterOffsetY)
  totalFlowers: number;
  totalSets: number;
}

export function computeSectorLayout(
  players: Player[],
  viewport: { width: number; height: number },
  myPlayerIndex: number = 0,
  clusterRadius?: number,
): SectorGardenLayout[] {
  const count = Math.max(1, players.length);
  const sectorAngle = (2 * Math.PI) / count;
  // Use a larger radius factor on ultrawide screens so gardens don't waste space
  const shortSide = Math.min(viewport.width, viewport.height);
  const longSide = Math.max(viewport.width, viewport.height);
  const aspect = longSide / shortSide;
  const radiusFactor = Math.min(0.50, 0.42 + (aspect - 1) * 0.06);
  const arenaRadius = shortSide * radiusFactor;
  // Badges are clouds positioned away from the sun (not touching it)
  const badgeR = arenaRadius * 0.38;
  // Wireframe: flower clusters are centered in their sectors, ~55-60% of radius
  // If clusterRadius is provided (dynamic, based on actual flower reaches), use it.
  const clusterR = clusterRadius ?? arenaRadius * 0.58;

  // Base angle: -π/2 places the current player at the bottom (matches wireframes)
  const baseAngle = -Math.PI / 2;

  return players.map((player, i) => {
    const totalFlowers = player.garden.sets.reduce((sum, set) => sum + (set.isToken ? 1 : set.flowers.length), 0);
    const totalSets = player.garden.sets.length;
    const sectorCenterAngle = ((i - myPlayerIndex) * sectorAngle) + baseAngle;
    const clusterOffsetX = Math.round(clusterR * Math.cos(sectorCenterAngle));
    const clusterOffsetY = Math.round(-clusterR * Math.sin(sectorCenterAngle));
    return {
      player,
      sectorIndex: i,
      sectorStartAngle: sectorCenterAngle - sectorAngle / 2,
      sectorCenterAngle,
      sectorEndAngle: sectorCenterAngle + sectorAngle / 2,
      badgeOffsetX: Math.round(badgeR * Math.cos(sectorCenterAngle)),
      badgeOffsetY: Math.round(-badgeR * Math.sin(sectorCenterAngle)),
      clusterOffsetX,
      clusterOffsetY,
      x: clusterOffsetX,
      y: clusterOffsetY,
      totalFlowers,
      totalSets,
    };
  });
}
