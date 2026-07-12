// ============================================================
// SECTOR-AWARE FLOWER LAYOUT v4.4 — Angular Cluster Around Garden Center
// Sets spread by ANGLE along the arc, not by RADIUS.
// This keeps all flowers at the garden layer (midR), never between cloud and sun.
// ============================================================

import { useMemo } from 'react';
import type { GardenSet, FlowerColor } from '../types/gameTypes';

const RAINBOW_MULTIPLIER = 1.5;
const TRIPLE_RAINBOW_MULTIPLIER = 3.0;
const MIN_SCALE_FACTOR = 0.75; // less compression = bigger flowers
const GAP_PX = 8;
const BUFFER_PX = 30;
const CLOUD_RADIUS_PX = 35;
// CLOUD_CLEARANCE removed — now proportional per-set in setRadii

export interface SectorFlower {
  id: string;
  setId: string;
  color: FlowerColor;
  x: number; // relative to GARDEN CENTER, SCREEN Y-down
  y: number; // SCREEN Y-down (flipped at return to match Pixi)
  size: number;
  isNew: boolean;
  indexInSet: number;
}

export interface SectorGeometry {
  centerAngle: number; // radians. Screen convention: 0=right, -PI/2=bottom
  halfAngle: number; // radians, half the sector wedge width
  innerR: number; // px, distance from arena center to inner arc
  outerR: number; // px, distance from arena center to outer arc
}

interface UseSectorFlowerLayoutOptions {
  sets: GardenSet[];
  sector: SectorGeometry;
  newFlowerIds?: Set<string>;
}

function displayColor(flower: GardenSet['flowers'][number]): FlowerColor {
  return flower.representedColor ?? flower.color;
}

function getFlowerSize(color: FlowerColor, isDivineSet: boolean): number {
  if (color === 'triple_rainbow') return 100 * 5.0;   // 500px
  if (color === 'rainbow' || color === 'divine' || isDivineSet)
                                      return 100 * 3.5;   // 350px
  return 100 * 2.8;                                    // 280px
}

function getSetScale(set: GardenSet): number {
  const count = set.flowers.length;
  return set.isDivine
    ? 1.3
    : set.isSolid
    ? 1.25
    : set.isComplete && count >= 5
    ? 1.2
    : set.isComplete
    ? 1.1
    : 1.0;
}

/**
 * Place flowers in concentric rings with real gaps between edges.
 * Innermost ring is forced to clear the cloud sprite at the set center.
 */
function placeFlowersInRings(
  count: number,
  setCenterX: number,
  setCenterY: number,
  maxFlowerSize: number,
): Array<{ x: number; y: number }> {
  const flowerRadius = maxFlowerSize / 2;
  const minRingRadius = CLOUD_RADIUS_PX + flowerRadius + BUFFER_PX;

  if (count <= 1) {
    // Push the single flower outside the cloud, not on top of it
    return [{ x: setCenterX + minRingRadius, y: setCenterY }];
  }

  const positions: Array<{ x: number; y: number }> = [];

  if (count <= 6) {
    // Exact radius for edge-to-edge touching, plus gap
    const minRadius = maxFlowerSize / (2 * Math.sin(Math.PI / count));
    const ringRadius = Math.max(minRadius + GAP_PX, minRingRadius);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions.push({
        x: setCenterX + Math.cos(angle) * ringRadius,
        y: setCenterY + Math.sin(angle) * ringRadius,
      });
    }
    return positions;
  }

  // Multi-ring for 7+ flowers
  const ringCapacity = (ring: number) => {
    if (ring === 0) return 6;
    return Math.max(4, 4 + ring * 2);
  };

  // Ring spacing: flower size + gap (no shrinking multiplier)
  const ringSpacing = maxFlowerSize + GAP_PX;
  let idx = 0;
  let ring = 0;

  while (idx < count) {
    const cap = ringCapacity(ring);
    const countInRing = Math.min(cap, count - idx);

    // Exact radius for edge-to-edge touching in this ring, plus gap
    // Guard: sin(PI / 1) ≈ 0 would cause division by zero (infinite radius)
    const minRadius = countInRing <= 1
      ? maxFlowerSize * 0.5
      : maxFlowerSize / (2 * Math.sin(Math.PI / countInRing));
    const ringBaseRadius = Math.max(minRadius + GAP_PX, minRingRadius);
    const ringRadius = ringBaseRadius + ring * ringSpacing;
    const ringOffset = ring * 0.6;

    for (let i = 0; i < countInRing; i++) {
      const angle = (i / countInRing) * Math.PI * 2 + ringOffset;
      positions.push({
        x: setCenterX + Math.cos(angle) * ringRadius,
        y: setCenterY + Math.sin(angle) * ringRadius,
      });
      idx++;
    }
    ring++;
  }

  return positions;
}

/** Estimate radial span (diameter) a set needs */
function estimateSetRadialSpan(count: number, maxFlowerSize: number): number {
  if (count <= 6) {
    const minRadius = maxFlowerSize / (2 * Math.sin(Math.PI / Math.max(2, count)));
    const ringRadius = minRadius + GAP_PX; // match placeFlowersInRings
    return ringRadius * 2 + maxFlowerSize * 0.35;
  }

  const ringCapacity = (ring: number) => (ring === 0 ? 6 : Math.max(4, 4 + ring * 2));
  const ringSpacing = maxFlowerSize + GAP_PX;
  let remaining = count;
  let ringIdx = 0;
  let maxRingRadius = 0;

  while (remaining > 0) {
    const cap = ringCapacity(ringIdx);
    const countInRing = Math.min(cap, remaining);
    const minRadius = countInRing <= 1
      ? maxFlowerSize * 0.5
      : maxFlowerSize / (2 * Math.sin(Math.PI / countInRing));
    const ringBaseRadius = minRadius + GAP_PX;
    const ringRadius = ringBaseRadius + ringIdx * ringSpacing;
    if (ringRadius > maxRingRadius) maxRingRadius = ringRadius;
    remaining -= countInRing;
    ringIdx++;
  }

  return maxRingRadius * 2 + maxFlowerSize * 0.35;
}

export function useSectorFlowerLayout({
  sets,
  sector,
  newFlowerIds,
}: UseSectorFlowerLayoutOptions): SectorFlower[] {
  return useMemo(() => {
    const { centerAngle, halfAngle, innerR, outerR } = sector;
    // Approximate cloud badge radius. In the full layout, badgeR = arenaRadius*0.32
    // and midR ≈ arenaRadius*0.575, so badgeR ≈ midR * 0.557.
    const midR = (innerR + outerR) / 2;

    // ── Y-UP basis vectors ──
    const outwardX = Math.cos(centerAngle);
    const outwardY = Math.sin(centerAngle);
    const perpX = -outwardY;
    const perpY = outwardX;

    // Garden center in ARENA space (Y-up)
    const gardenCx = outwardX * midR;
    const gardenCy = outwardY * midR;

    // ── Phase 1: Compute set metadata ──
    interface SetMeta {
      set: GardenSet;
      setScale: number;
      count: number;
      maxFlowerSize: number;
      idealRadialSpan: number;
    }

    const setMetas: SetMeta[] = sets.map((set) => {
      const count = set.flowers.length;
      const setScale = getSetScale(set);

      let maxFlowerSize = 0;
      for (const f of set.flowers) {
        const fSize = getFlowerSize(displayColor(f), set.isDivine) * setScale;
        if (fSize > maxFlowerSize) maxFlowerSize = fSize;
      }
      if (maxFlowerSize === 0) maxFlowerSize = 40;

      const idealRadialSpan = estimateSetRadialSpan(count, maxFlowerSize);
      return { set, setScale, count, maxFlowerSize, idealRadialSpan };
    });

    // ── Phase 2: TIGHT angular cluster around garden center (midR) ──
    // CRITICAL FIX: All sets stay at distance midR from arena center.
    // They spread by ANGLE along the arc, not by RADIUS. This prevents
    // flowers from landing between the cloud and the sun.
    const totalIdealSpan = setMetas.reduce((sum, m) => sum + m.idealRadialSpan, 0);

    // Scale factor: shrink flower sizes if there are many large sets
    const maxSetSpan = setMetas.length > 0
      ? Math.max(...setMetas.map((m) => m.idealRadialSpan))
      : 0;
    const maxClusterDepth = Math.min(
      outerR - innerR,
      Math.max(maxSetSpan * 0.8, sets.length * 22)
    );
    const clusterDepth = Math.min(maxClusterDepth, totalIdealSpan * 0.9);
    const scaleFactor = totalIdealSpan > clusterDepth ? clusterDepth / totalIdealSpan : 1.0;
    const finalScaleFactor = Math.max(MIN_SCALE_FACTOR, scaleFactor);

    // Moderate-wide angular spread — distributes overlap in both X and Y so the
    // resolver doesn't push everything off-screen in one direction. Tight clusters
    // collapse all overlap onto the radial axis, causing runaway vertical pushing
    // for top/bottom gardens. A wider arc fans flowers horizontally, reducing
    // how far they extend above/below the garden center. Too wide causes flowers
    // to overlap the cloud badge on the inner edge.
    const maxAngularSpread = halfAngle * 0.65;
    const setAngles = sets.map((_, i) => {
      if (sets.length <= 1) return centerAngle;
      const t = (i / (sets.length - 1)) * 2 - 1; // -1 to +1
      return centerAngle + t * maxAngularSpread;
    });

    // Distribute sets radially from midR toward outerR.
    // The y:-y flip at the end of Phase 3 maps setRel to CSS screen coords.
    // For all player positions, setRadius > midR places flowers on the OUTWARD side.
    const totalSets = sets.length;
    const setSpacing = totalSets <= 1 ? 0 : (outerR - midR) / Math.max(totalSets, 1);

    // Compute per-set geometry: ringBaseRadius (innermost ring, for cloud guard)
    // and maxRingR (outermost ring, for outer boundary guard).
    // Using a global max would force small sets to inherit the radius of large sets,
    // collapsing everything to a tiny circle around the garden center.
    const setMetasWithGeom = setMetas.map((meta) => {
      const scaledMaxSize = meta.maxFlowerSize * finalScaleFactor;
      const flowerRadius = scaledMaxSize / 2;
      const minRingRadius = CLOUD_RADIUS_PX + flowerRadius + BUFFER_PX;
      const count = meta.count;
      let ringBaseRadius = 0;
      let maxRingR = 0;
      if (count <= 6) {
        const minRadius = count <= 1
          ? scaledMaxSize * 0.5
          : scaledMaxSize / (2 * Math.sin(Math.PI / count));
        ringBaseRadius = Math.max(minRadius + GAP_PX, minRingRadius);
        maxRingR = ringBaseRadius;
      } else {
        const ringCapacity = (ring: number) => (ring === 0 ? 6 : Math.max(4, 4 + ring * 2));
        const ringSpacing = scaledMaxSize + GAP_PX;
        let remaining = count;
        let ringIdx = 0;
        while (remaining > 0) {
          const cap = ringCapacity(ringIdx);
          const countInRing = Math.min(cap, remaining);
          const minRadius = countInRing <= 1
            ? scaledMaxSize * 0.5
            : scaledMaxSize / (2 * Math.sin(Math.PI / countInRing));
          const rBase = Math.max(minRadius + GAP_PX, minRingRadius);
          const rRadius = rBase + ringIdx * ringSpacing;
          if (ringIdx === 0) ringBaseRadius = rRadius;
          if (rRadius > maxRingR) maxRingR = rRadius;
          remaining -= countInRing;
          ringIdx++;
        }
      }
      return { ...meta, ringBaseRadius, maxRingR, flowerRadius };
    });

    const setRadii = sets.map((_, i) => {
      const meta = setMetasWithGeom[i];
      const { ringBaseRadius, flowerRadius } = meta;

      // Proportional cloud clearance: early game (1-2 flowers) sits closer
      const flowerCount = sets[i].flowers.length;
      const clearance = Math.min(20, Math.max(4, flowerCount * 3));
      const minSetR = midR + ringBaseRadius + flowerRadius + CLOUD_RADIUS_PX + clearance;

      if (totalSets === 1) return minSetR;

      const raw = midR + (i + 0.5) * setSpacing;

      // If minSetR forces all sets to same radius, add radial step
      if (minSetR > raw) {
        const radialStep = Math.max(GAP_PX * 2, 40);
        return minSetR + i * radialStep;
      }

      return Math.max(raw, minSetR);
    });

    const setPositions = sets.map((_, setIdx) => ({
      setRadius: setRadii[setIdx],
      setAngle: setAngles[setIdx],
    }));

    // ── Phase 3: Place flowers ──
    const flowers: SectorFlower[] = [];

    for (let setIdx = 0; setIdx < sets.length; setIdx++) {
      const meta = setMetas[setIdx];
      const { set, setScale, count, maxFlowerSize } = meta;
      const { setRadius, setAngle } = setPositions[setIdx];

      const setAbsX = Math.cos(setAngle) * setRadius;
      const setAbsY = Math.sin(setAngle) * setRadius;
      const setRelX = setAbsX - gardenCx;
      const setRelY = setAbsY - gardenCy;

      const scaledMaxSize = maxFlowerSize * finalScaleFactor;
      const ringPositions = placeFlowersInRings(count, setRelX, setRelY, scaledMaxSize);

      // Sort flowers by color so same-color flowers are adjacent on the ring
      const colorOrder: Record<FlowerColor, number> = {
        red: 0, orange: 1, yellow: 2, green: 3, blue: 4,
        purple: 5, black: 6, rainbow: 7, divine: 8, triple_rainbow: 9,
      };
      const sortedFlowers = [...set.flowers].sort((a, b) => {
        const ca = colorOrder[displayColor(a)] ?? 99;
        const cb = colorOrder[displayColor(b)] ?? 99;
        return ca - cb;
      });

      for (let i = 0; i < count; i++) {
        const flower = sortedFlowers[i];
        const fColor = displayColor(flower);
        const fSize = getFlowerSize(fColor, set.isDivine) * setScale * finalScaleFactor;
        const pos = ringPositions[i];

        let x = pos.x;
        let y = pos.y;

        // ── Constrain side-to-side spread to sector wedge ──
        const perpDist = x * perpX + y * perpY;
        const radialDist = x * outwardX + y * outwardY;
        // Use actual distance from garden center, not radial projection.
        // Math.abs(radialDist) collapses to near-zero for wide-angle sets,
        // crushing them back to the center line.
        const distFromGardenCenter = Math.hypot(x, y);
        const maxPerpAtRadius = Math.max(
          60,
          distFromGardenCenter * Math.tan(halfAngle * 0.95)
        );

        const scaledPerpDist =
          perpDist *
          Math.min(1, maxPerpAtRadius / Math.max(Math.abs(perpDist), 0.01));

        x = outwardX * radialDist + perpX * scaledPerpDist;
        y = outwardY * radialDist + perpY * scaledPerpDist;

        // ── Divine/solid micro-offsets ──
        if (set.isDivine) {
          x += perpX * 4;
          y += perpY * 4;
        } else if (set.isSolid) {
          x -= perpX * 4;
          y -= perpY * 4;
        }

        flowers.push({
          id: flower.id,
          setId: set.id,
          color: fColor,
          x,
          y: -y,
          size: fSize,
          isNew: newFlowerIds?.has(flower.id) ?? false,
          indexInSet: i,
        });
      }
    }

    // ── Phase 4: Intra-set overlap resolver ──
    // Only resolve overlaps WITHIN each set. This preserves the ring-based
    // color adjacency computed in Phase 3.
    const MAX_ITERATIONS = 50;
    const PUSH_FACTOR = 0.25;
    const DAMPING = 0.95;
    const MIN_GAP_PX = 10; // minimum gap between flower edges

    const flowersBySet = new Map<string, SectorFlower[]>();
    for (const f of flowers) {
      if (!flowersBySet.has(f.setId)) flowersBySet.set(f.setId, []);
      flowersBySet.get(f.setId)!.push(f);
    }

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let hadOverlap = false;
      const currentPush = PUSH_FACTOR * Math.pow(DAMPING, iter);

      for (const [, setFlowers] of flowersBySet) {
        for (let i = 0; i < setFlowers.length; i++) {
          for (let j = i + 1; j < setFlowers.length; j++) {
            const a = setFlowers[i];
            const b = setFlowers[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);

            // Target: flower edges must be MIN_GAP_PX apart
            // (a.size + b.size) / 2 = sum of radii = touching
            // + MIN_GAP_PX = gap between edges
            const minDist = (a.size + b.size) / 2 + MIN_GAP_PX;

            if (dist < minDist && dist > 0.1) {
              hadOverlap = true;
              const overlap = minDist - dist;
              const nx = dx / dist;
              const ny = dy / dist;

              const push = overlap * currentPush;
              a.x -= nx * push * 0.5;
              a.y -= ny * push * 0.5;
              b.x += nx * push * 0.5;
              b.y += ny * push * 0.5;
            }
          }
        }
      }

      if (!hadOverlap) break;
    }

    // ── Phase 5: Inter-set nudge (rigid-body, flower-level detection) ──
    // Detect actual flower-to-flower overlaps between sets and push entire
    // sets apart as rigid bodies.
    const INTER_SET_PUSH = 0.20;
    const INTER_SET_GAP = 10;

    for (let iter = 0; iter < 5; iter++) {
      let hadOverlap = false;
      const setArrays = Array.from(flowersBySet.values());

      for (let s = 0; s < setArrays.length; s++) {
        for (let t = s + 1; t < setArrays.length; t++) {
          const setA = setArrays[s];
          const setB = setArrays[t];
          if (setA.length === 0 || setB.length === 0) continue;

          // Find closest flower pair between the two sets
          let minDist = Infinity;
          let pairA = setA[0];
          let pairB = setB[0];

          for (const a of setA) {
            for (const b of setB) {
              const d = Math.hypot(b.x - a.x, b.y - a.y);
              if (d < minDist) {
                minDist = d;
                pairA = a;
                pairB = b;
              }
            }
          }

          const overlapThreshold = (pairA.size + pairB.size) / 2 + INTER_SET_GAP;
          if (minDist < overlapThreshold && minDist > 0.1) {
            hadOverlap = true;
            const push = (overlapThreshold - minDist) * INTER_SET_PUSH;
            const ux = (pairB.x - pairA.x) / minDist;
            const uy = (pairB.y - pairA.y) / minDist;

            for (const f of setA) {
              f.x -= ux * push;
              f.y -= uy * push;
            }
            for (const f of setB) {
              f.x += ux * push;
              f.y += uy * push;
            }
          }
        }
      }

      if (!hadOverlap) break;
    }

    // ── Phase 6: Hard cloud repulsion ──
    // Push any flower that entered the cloud zone back outward.
    // The resolver doesn't know about the cloud, so this is mandatory.
    // Iterative 100% push guarantees full clearance (single-pass 50% leaves
    // flowers still inside the guard).
    const CLOUD_GUARD_RADIUS = CLOUD_RADIUS_PX + 20; // repulsion guard — tighter clearance

    for (let iter = 0; iter < 15; iter++) {
      let hadViolation = false;
      for (const f of flowers) {
        const dist = Math.hypot(f.x, f.y);
        const minDist = CLOUD_GUARD_RADIUS + f.size / 2;
        if (dist < minDist && dist > 0.1) {
          hadViolation = true;
          const push = minDist - dist; // 100% push, not 50%
          f.x += (f.x / dist) * push;
          f.y += (f.y / dist) * push;
        }
      }
      if (!hadViolation) break;
    }

    return flowers;
  // Destructure sector so an unstable parent object reference doesn't invalidate
  // the memo and trigger a re-render loop in GardenFlowerField.
  }, [sets, newFlowerIds, sector.centerAngle, sector.halfAngle, sector.innerR, sector.outerR]);
}
