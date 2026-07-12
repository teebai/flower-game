// ============================================================
// FLOWER GAME v2 — GARDEN VIEW (Pixi.js)
// Renders ONLY flowers. Background, name tags, and badges
// come from the DOM layer underneath.
// Flowers grow radially within the sector from inner arc to outer arc.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { GardenSet } from '../../types/gameTypes';
import { FlowerSprite } from './FlowerSprite';

export interface GardenViewPlayer {
  id: string;
  name: string;
  handCount: number;
  garden: { sets: GardenSet[] };
}

export class GardenView {
  container: Container;
  flowersContainer: Container;
  private flowers = new Map<string, FlowerSprite>();
  private sectorCenterAngle = 0;
  private sectorHalfAngle = Math.PI / 3;
  private sectorInnerR = 110;
  private sectorOuterR = 200;

  constructor(_playerId: string, _name: string) {
    this.container = new Container();
    this.flowersContainer = new Container();
    this.container.addChild(this.flowersContainer);
  }

  setSectorGeometry(centerAngle: number, halfAngle: number, innerR: number, outerR: number): void {
    this.sectorCenterAngle = centerAngle;
    this.sectorHalfAngle = halfAngle;
    this.sectorInnerR = innerR;
    this.sectorOuterR = outerR;
  }

  sync(player: GardenViewPlayer, hoveredSetId: string | null): void {
    const validFlowerIds = new Set<string>();

    for (let setIdx = 0; setIdx < player.garden.sets.length; setIdx++) {
      const set = player.garden.sets[setIdx];
      const isSetHovered = set.id === hoveredSetId;

      for (let flowerIdx = 0; flowerIdx < set.flowers.length; flowerIdx++) {
        const flower = set.flowers[flowerIdx];
        validFlowerIds.add(flower.id);
        let sprite = this.flowers.get(flower.id);

        if (!sprite) {
          sprite = new FlowerSprite(flower.color, flower.isWildcard);
          this.flowersContainer.addChild(sprite.container);
          this.flowers.set(flower.id, sprite);
          sprite.isNew = true;
        }

        const pos = this.computeFlowerPosition(setIdx, flowerIdx, player.garden.sets.length, set);
        sprite.targetX = pos.x;
        sprite.targetY = pos.y;
        sprite.setSetProperties(set.isComplete, set.isSolid, set.isDivine);
        sprite.setHighlighted(isSetHovered);
      }
    }

    // Remove destroyed flowers
    for (const [id, sprite] of this.flowers) {
      if (!validFlowerIds.has(id)) {
        this.flowersContainer.removeChild(sprite.container);
        sprite.destroy();
        this.flowers.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const flower of this.flowers.values()) {
      flower.update(dt);
    }
  }

  destroy(): void {
    for (const flower of this.flowers.values()) {
      flower.destroy();
    }
    this.flowers.clear();
  }

  /**
   * Compute flower position radially within the sector.
   * Sets are distributed from innerR toward outerR.
   * Flowers spread in a small spiral within each set.
   * All positions are relative to the garden container (at sector mid-radius).
   */
  private computeFlowerPosition(
    setIndex: number,
    flowerIndex: number,
    totalSets: number,
    set: { isComplete: boolean; isSolid: boolean; isDivine: boolean }
  ): { x: number; y: number } {
    const centerAngle = this.sectorCenterAngle;
    const halfAngle = this.sectorHalfAngle;
    const innerR = this.sectorInnerR;
    const outerR = this.sectorOuterR;
    const midR = (innerR + outerR) / 2;

    // Garden center in arena coordinates
    const gardenCx = Math.cos(centerAngle) * midR;
    const gardenCy = Math.sin(centerAngle) * midR;

    // Direction outward from arena center
    const outwardX = Math.cos(centerAngle);
    const outwardY = Math.sin(centerAngle);

    // Perpendicular direction for side-to-side spread
    const perpX = -outwardY;
    const perpY = outwardX;

    // ── Set placement: radial distribution from innerR to outerR ──
    const setSpacing = (outerR - innerR) / Math.max(totalSets, 3);
    const setRadius = innerR + (setIndex + 0.5) * setSpacing;

    // Alternate angular offset left/right of center for variety
    const maxAngularSpread = halfAngle * 0.6;
    const angleJitter = (setIndex % 2 === 0 ? 1 : -1) * Math.min(maxAngularSpread, setIndex * 0.12 + 0.05);
    const setAngle = centerAngle + angleJitter;

    // ── Flower placement within set: small spiral ──
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const flowerSpacing = 20;
    const flowerDist = flowerSpacing * Math.sqrt(flowerIndex + 0.5);
    const flowerAngle = flowerIndex * goldenAngle + setIndex * 0.7;

    // Absolute arena position
    let absX = Math.cos(setAngle) * setRadius + Math.cos(flowerAngle) * flowerDist;
    let absY = Math.sin(setAngle) * setRadius + Math.sin(flowerAngle) * flowerDist;

    // Constrain side-to-side spread to sector angular bounds
    const dx = absX - gardenCx;
    const dy = absY - gardenCy;
    const perpDist = dx * perpX + dy * perpY;
    const radialDist = dx * outwardX + dy * outwardY;
    const maxPerpAtRadius = Math.max(10, Math.abs(radialDist) * Math.tan(halfAngle * 0.7));
    if (Math.abs(perpDist) > maxPerpAtRadius) {
      const scale = maxPerpAtRadius / Math.abs(perpDist);
      absX = gardenCx + outwardX * radialDist + perpX * perpDist * scale;
      absY = gardenCy + outwardY * radialDist + perpY * perpDist * scale;
    }

    // Clamp radial spread
    const clampedRadial = Math.max(-(midR - innerR) + 10, Math.min(outerR - midR - 10, radialDist));

    // Relative to garden container
    let x = outwardX * clampedRadial + perpX * perpDist * Math.min(1, maxPerpAtRadius / Math.max(Math.abs(perpDist), 0.01));
    let y = outwardY * clampedRadial + perpY * perpDist * Math.min(1, maxPerpAtRadius / Math.max(Math.abs(perpDist), 0.01));

    // Divine/solid micro-offsets (perpendicular to radial)
    if (set.isDivine) {
      x += perpX * 4;
      y += perpY * 4;
    } else if (set.isSolid) {
      x -= perpX * 4;
      y -= perpY * 4;
    }

    return { x, y: -y };
  }
}
