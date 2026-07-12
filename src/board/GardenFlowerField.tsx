// ============================================================
// GARDEN FLOWER FIELD v2.1 — Fixed positioning
// Container centered on garden-wrapper origin.
// All positions are garden-center-relative. No double offsets.
// ============================================================

import React from 'react';
import type { GardenSet, FlowerColor } from '../types/gameTypes';
import { flowerArt } from '../utils/flowerArt';
import {
  useSectorFlowerLayout,
  type SectorGeometry,
} from '../hooks/useSectorFlowerLayout';

const EMPTY_ARRAY: string[] = [];
const EMPTY_SET = new Set<string>();

function solidGlowColor(color: FlowerColor): string {
  switch (color) {
    case 'red':
      return 'rgba(255, 60, 60, 0.92)';
    case 'blue':
      return 'rgba(60, 140, 255, 0.92)';
    case 'green':
      return 'rgba(60, 220, 100, 0.92)';
    case 'yellow':
      return 'rgba(255, 230, 0, 0.95)';
    case 'orange':
      return 'rgba(255, 120, 0, 0.95)';
    case 'purple':
      return 'rgba(200, 60, 255, 0.92)';
    case 'black':
      return 'rgba(180, 180, 200, 0.9)';
    case 'rainbow':
      return 'rgba(255, 200, 60, 0.92)';
    case 'triple_rainbow':
      return 'rgba(255, 200, 60, 0.92)';
    case 'divine':
      return 'rgba(255, 215, 0, 0.92)';
    default:
      return 'rgba(255, 200, 0, 0.92)';
  }
}

export interface GardenFlowerFieldProps {
  sets: GardenSet[];
  playerId: string;
  sectorGeometry?: SectorGeometry;
  // Legacy fallback for debug pages
  arenaSize?: { width: number; height: number };
  // Normal mode
  targetedSetId?: string | null;
  invalidTargetSetId?: string | null;
  validTargetSetId?: string | null;
  onSetClick?: (setId: string) => void;
  onSetHover?: (setId: string | null) => void;
  onPlayerHover?: (playerId: string | null) => void;
  highlightSetId?: string | null;
  attackedSetId?: string | null;
  counterTargetSetId?: string | null;
  changedSetIds?: string[];
  getSetRef?: (setId: string) => (node: HTMLDivElement | null) => void;
  lastDropRef?: React.MutableRefObject<{
    playerId: string;
    setId: string;
    x: number;
    y: number;
    time: number;
  } | null>;
  // Selection mode
  selectionMode?: boolean;
  eligibleFlowerIds?: string[];
  selectedFlowerIds?: string[];
  onFlowerSelect?: (flowerId: string) => void;
  // Wind arrival tracking
  windLandedFlowerIds?: Set<string>;
  // Dynamic sizing callback — reports actual flower bounds (local to garden center)
  onContentSizeChange?: (width: number, height: number, minX: number, maxX: number, minY: number, maxY: number) => void;
  // Report max distance from garden center to any flower edge (for dynamic cluster spacing)
  onGardenReachChange?: (reach: number) => void;
}

const DEFAULT_SECTOR: SectorGeometry = {
  centerAngle: -Math.PI / 2,
  halfAngle: Math.PI / 2,
  innerR: 0,
  outerR: 200,
};

export const GardenFlowerField = React.memo(function GardenFlowerField({
  sets,
  playerId,
  sectorGeometry,
  arenaSize,
  targetedSetId,
  invalidTargetSetId,
  validTargetSetId,
  onSetClick,
  onSetHover,
  onPlayerHover,
  highlightSetId,
  attackedSetId,
  counterTargetSetId,
  getSetRef,
  selectionMode = false,
  eligibleFlowerIds = EMPTY_ARRAY,
  selectedFlowerIds = EMPTY_ARRAY,
  onFlowerSelect,
  onContentSizeChange,
  onGardenReachChange,
  windLandedFlowerIds = EMPTY_SET,
}: GardenFlowerFieldProps) {
  // (diagnostics removed for performance)
  const sector = sectorGeometry ?? DEFAULT_SECTOR;

  // Garden cluster offset — must match Pixi GardenView.container.position
  // computeSectorLayout uses clusterR = arenaRadius * 0.58; midR = (innerR+outerR)/2 ≈ 0.575*arenaRadius
  // The 0.005*arenaRadius difference (~0.75px) is visually negligible
  const midR = (sector.innerR + sector.outerR) / 2;
  const clusterOffsetX = Math.cos(sector.centerAngle) * midR;
  const clusterOffsetY = -Math.sin(sector.centerAngle) * midR;

  const flowers = useSectorFlowerLayout({
    sets,
    sector,
  });

  const eligibleSet = new Set(eligibleFlowerIds);
  const selectedSet = new Set(selectedFlowerIds);

  // Pre-compute set property lookups
  const completeSetIds = new Set(
    sets
      .filter((s) => s.isComplete && !s.isDivine && !s.isSolid && !s.isToken)
      .map((s) => s.id)
  );
  const megaCompleteSetIds = new Set(
    sets
      .filter(
        (s) =>
          s.isComplete &&
          !s.isDivine &&
          !s.isSolid &&
          !s.isToken &&
          s.flowers.length >= 5
      )
      .map((s) => s.id)
  );
  const solidSetIds = new Set(
    sets.filter((s) => s.isSolid && !s.isToken).map((s) => s.id)
  );
  const divineSetIds = new Set(
    sets.filter((s) => s.isDivine && !s.isToken).map((s) => s.id)
  );

  // Set centers: arithmetic mean of flower positions (garden-local)
  const setCenters = React.useMemo(() => {
    const sums: Record<string, { x: number; y: number; count: number }> = {};
    for (const f of flowers) {
      if (!sums[f.setId]) {
        sums[f.setId] = { x: f.x, y: f.y, count: 1 };
      } else {
        sums[f.setId].x += f.x;
        sums[f.setId].y += f.y;
        sums[f.setId].count += 1;
      }
    }
    const centers: Record<string, { x: number; y: number }> = {};
    for (const id in sums) {
      centers[id] = {
        x: sums[id].x / sums[id].count,
        y: sums[id].y / sums[id].count,
      };
    }
    return centers;
  }, [flowers]);

  // ── Token sets (7-color merge) have no flowers — compute their positions directly ──
  const tokenSetCenters = React.useMemo(() => {
    const centers: Record<string, { x: number; y: number }> = {};
    const { centerAngle, halfAngle, innerR, outerR } = sector;
    const setSpacing = (outerR - innerR) / Math.max(sets.length, 3);
    const outwardX = Math.cos(centerAngle);
    const outwardY = Math.sin(centerAngle);
    const gardenCx = outwardX * midR;
    const gardenCy = outwardY * midR;

    for (let setIdx = 0; setIdx < sets.length; setIdx++) {
      const set = sets[setIdx];
      if (!set.isToken) continue;

      const setRadius = innerR + (setIdx + 0.5) * setSpacing;
      const maxAngularSpread = halfAngle * 0.6;
      const angleJitter = (setIdx % 2 === 0 ? 1 : -1) * Math.min(maxAngularSpread, setIdx * 0.12 + 0.05);
      const setAngle = centerAngle + angleJitter;

      const absX = Math.cos(setAngle) * setRadius;
      const absY = Math.sin(setAngle) * setRadius;

      centers[set.id] = {
        x: absX - gardenCx,
        y: -(absY - gardenCy),
      };
    }
    return centers;
  }, [sets, sector, midR]);

  const allSetCenters = React.useMemo(() => {
    return { ...setCenters, ...tokenSetCenters };
  }, [setCenters, tokenSetCenters]);

  // ── Compute true bounds from flowers (no circular dep on fieldWidth) ──
  const flowerBounds = React.useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of flowers) {
      const half = f.size / 2;
      minX = Math.min(minX, f.x - half);
      maxX = Math.max(maxX, f.x + half);
      minY = Math.min(minY, f.y - half);
      maxY = Math.max(maxY, f.y + half);
    }
    return { minX, maxX, minY, maxY };
  }, [flowers]);

  // ── actualContentSize: depends only on flowerBounds + tokens ──
  const actualContentSize = React.useMemo(() => {
    const padding = 60;
    let minX = flowerBounds.minX;
    let maxX = flowerBounds.maxX;
    let minY = flowerBounds.minY;
    let maxY = flowerBounds.maxY;

    // Include token sets in bounds
    for (const s of sets) {
      if (!s.isToken) continue;
      const center = tokenSetCenters[s.id];
      if (!center) continue;
      const sz = 78;
      minX = Math.min(minX, center.x - sz / 2);
      maxX = Math.max(maxX, center.x + sz / 2);
      minY = Math.min(minY, center.y - sz / 2);
      maxY = Math.max(maxY, center.y + sz / 2);
    }

    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;

    return {
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      minX, maxX, minY, maxY,
    };
  }, [flowerBounds, sets, tokenSetCenters]);

  // ── Container size: uses actual bounds, not fixed outerR ──
  const fieldWidth = actualContentSize.width;
  const fieldHeight = actualContentSize.height;
  // Center the field on the garden center, not on the bounds origin.
  // The original fixed-size code used cx = fieldWidth/2, cy = fieldHeight/2,
  // which kept the garden center at the field's center. With dynamic sizing,
  // we must preserve this centering or flowers drift off-screen for top/bottom
  // gardens where the distribution is asymmetric around the garden center.
  const cx = fieldWidth / 2;
  const cy = fieldHeight / 2;

  // ── Compute garden reach AFTER all layout phases ──
  const gardenReach = React.useMemo(() => {
    let maxReach = 0;
    for (const f of flowers) {
      const reach = Math.hypot(f.x, f.y) + f.size / 2;
      if (reach > maxReach) maxReach = reach;
    }
    // Include token sets
    for (const s of sets) {
      if (!s.isToken) continue;
      const center = tokenSetCenters[s.id];
      if (!center) continue;
      const reach = Math.hypot(center.x, center.y) + 39;
      if (reach > maxReach) maxReach = reach;
    }
    // Include cloud badge
    const badgeR = sector.outerR * 0.32;
    const midR = (sector.innerR + sector.outerR) / 2;
    const cloudDistFromGardenCenter = Math.abs(midR - badgeR);
    const cloudReach = cloudDistFromGardenCenter + 35;
    if (cloudReach > maxReach) maxReach = cloudReach;
    return maxReach;
  }, [flowers, sets, tokenSetCenters, sector]);

  // ── Unified reporting: reach + content size ──
  const onReachChangeRef = React.useRef(onGardenReachChange);
  onReachChangeRef.current = onGardenReachChange;
  const onSizeChangeRef = React.useRef(onContentSizeChange);
  onSizeChangeRef.current = onContentSizeChange;
  React.useEffect(() => {
    onReachChangeRef.current?.(gardenReach);
    onSizeChangeRef.current?.(
      actualContentSize.width,
      actualContentSize.height,
      actualContentSize.minX,
      actualContentSize.maxX,
      actualContentSize.minY,
      actualContentSize.maxY,
    );
    // Use primitive fields so a new object reference with identical values doesn't
    // re-trigger the reporting effect and restart FlowerBoard's zoom animation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gardenReach, actualContentSize.width, actualContentSize.height, actualContentSize.minX, actualContentSize.maxX, actualContentSize.minY, actualContentSize.maxY]);

  return (
    <div
      className="garden-particle-field"
      data-garden-id={playerId}
      style={{
        width: fieldWidth,
        height: fieldHeight,
        position: 'absolute',
        left: '50%',
        top: '50%',
        marginLeft: -cx,
        marginTop: -cy,
      }}
      onPointerEnter={() => onPlayerHover?.(playerId)}
      onPointerLeave={() => onPlayerHover?.(null)}
    >
      {/* ── Flowers ── */}
      {flowers.map((f) => {
        const art = flowerArt(f.color);

        const isHighlighted = highlightSetId === f.setId;
        const isAttacked = attackedSetId === f.setId;
        const isCompleteSet = completeSetIds.has(f.setId);
        const isMegaCompleteSet = megaCompleteSetIds.has(f.setId);
        const isSolidSet = solidSetIds.has(f.setId);
        const isDivineSet = divineSetIds.has(f.setId);
        const isTargeted = targetedSetId === f.setId;
        const isInvalidTarget = invalidTargetSetId === f.setId;
        const isValidTarget = validTargetSetId === f.setId;

        const isEligible = eligibleSet.has(f.id);
        const isSelected = selectedSet.has(f.id);
        const isIneligible = selectionMode && !isEligible;
        const isWindLanded = windLandedFlowerIds.has(f.id);

        // Fan & breathe: rotation + scale jitter so flowers don't blob
        const rotation = ((f.indexInSet % 5) - 2) * 11;
        const scaleJit = 0.90 + ((f.indexInSet % 3) * 0.05);

        // Position relative to container center (garden center)
        const screenX = cx + f.x;
        const screenY = cy + f.y;

        return (
          <div
            key={f.id}
            data-flower-id={f.id}
            data-flower-color={f.color}
            data-set-id={f.setId}
            className={[
              'garden-flower-wrapper',
              isSolidSet ? 'is-solid-set' : '',
              isDivineSet ? 'is-divine-set' : '',
              f.isNew && !isWindLanded ? 'is-new' : '',
              isWindLanded ? 'is-wind-landed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              position: 'absolute',
              left: screenX - f.size / 2,
              top: screenY - f.size / 2,
              width: f.size,
              height: f.size,
              zIndex: isTargeted ? 100 : Math.floor(f.size),
              pointerEvents: selectionMode ? 'auto' : 'none',
              cursor: selectionMode
                ? isEligible
                  ? 'pointer'
                  : 'default'
                : 'default',
              opacity: isIneligible ? 0.35 : isInvalidTarget ? 0.5 : 1,
              transform:
                isSelected && !isTargeted
                  ? 'scale(1.15)'
                  : isInvalidTarget
                  ? `translate(${Math.sign(f.x) * 8}px, ${Math.sign(f.y) * 8}px) scale(0.75)`
                  : undefined,
              filter:
                isSelected && !isTargeted
                  ? 'brightness(1.35) saturate(1.25)'
                  : isInvalidTarget
                  ? 'grayscale(0.6) brightness(0.7)'
                  : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (selectionMode && isEligible) {
                onFlowerSelect?.(f.id);
              } else {
                onSetClick?.(f.setId);
              }
            }}
          >
            <img
              src={art}
              alt={f.color}
              draggable={false}
              className={[
                'garden-flower-particle',
                isHighlighted ? 'is-highlighted' : '',
                isAttacked ? 'is-attacked' : '',
                isAttacked ? 'is-wind-departing' : '',
                isCompleteSet ? 'is-complete-set' : '',
                isMegaCompleteSet ? 'is-mega-complete' : '',
                isSolidSet ? 'is-solid-set' : '',
                isDivineSet ? 'is-divine-set' : '',
                isTargeted ? 'targeted wiggle' : '',
                isValidTarget ? 'is-valid-target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                ['--solid-glow-color' as string]: solidGlowColor(f.color),
                ['--f-rot' as string]: `${rotation}deg`,
                ['--f-scale' as string]: String(scaleJit),
              }}
            />
          </div>
        );
      })}

      {/* ── Token sets (7-color divine tokens) ── */}
      {sets.filter((s) => s.isToken).map((s) => {
        const center = allSetCenters[s.id];
        if (!center) return null;
        const zx = cx + center.x;
        const zy = cy + center.y;
        return (
          <div
            key={`token-img-${s.id}`}
            style={{
              position: 'absolute',
              left: zx - 39,
              top: zy - 39,
              width: 78,
              height: 78,
              zIndex: 50,
              pointerEvents: 'none',
            }}
          >
            <img
              src={flowerArt('divine')}
              alt="divine token"
              className="garden-flower-particle"
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        );
      })}

      {/* ── Set-level click / hover zones ── */}
      {sets.map((s) => {
        const center = allSetCenters[s.id];
        if (!center) return null;
        const zx = cx + center.x;
        const zy = cy + center.y;
        return (
          <div
            key={`zone-${s.id}`}
            data-set-id={s.id}
            data-player-id={playerId}
            className="garden-set-hover-zone"
            style={{
              position: 'absolute',
              left: zx - 70,
              top: zy - 70,
              width: 140,
              height: 140,
              borderRadius: '50%',
              cursor: onSetClick && !selectionMode ? 'pointer' : 'default',
              zIndex: 200,
              pointerEvents: selectionMode ? 'none' : 'auto',
            }}
            onClick={() => {
              if (!selectionMode) onSetClick?.(s.id);
            }}
            onPointerEnter={() => onSetHover?.(s.id)}
            onPointerLeave={() => onSetHover?.(null)}
          />
        );
      })}

      {/* ── Counter target indicator ── */}
      {counterTargetSetId &&
        allSetCenters[counterTargetSetId] &&
        (() => {
          const c = allSetCenters[counterTargetSetId];
          const zx = cx + c.x;
          const zy = cy + c.y;
          return (
            <div
              key="counter-target"
              className="garden-counter-target"
              style={{
                position: 'absolute',
                left: zx - 80,
                top: zy - 80,
                width: 160,
                height: 160,
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          );
        })()}

      {/* ── Invisible refs for scroll-into-view ── */}
      {getSetRef &&
        sets.map((s) => {
          const center = allSetCenters[s.id];
          if (!center) return null;
          const zx = cx + center.x;
          const zy = cy + center.y;
          return (
            <div
              key={`ref-${s.id}`}
              ref={getSetRef(s.id)}
              style={{
                position: 'absolute',
                left: zx,
                top: zy,
                width: 1,
                height: 1,
                pointerEvents: 'none',
                opacity: 0,
              }}
            />
          );
        })}

      {/* ── Divine token glow ── */}
      {sets.map((s) => {
        const center = allSetCenters[s.id];
        if (!center || !s.isToken || !s.isDivine) return null;
        const sz = 48;
        const zx = cx + center.x;
        const zy = cy + center.y;
        return (
          <div
            key={`token-${s.id}`}
            style={{
              position: 'absolute',
              left: zx - sz / 2,
              top: zy - sz / 2,
              width: sz,
              height: sz,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(255,180,0,0.15) 50%, transparent 75%)',
              border: '1.5px solid rgba(255,200,60,0.5)',
              boxShadow: '0 0 16px rgba(255,200,60,0.35)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        );
      })}
    </div>
  );
});
