import React, { useRef, useState, useEffect } from 'react';
import { useMatterGardens } from '../hooks/useMatterGardens';
import type { GardenSet, FlowerColor } from '../types/gameTypes';
import { flowerArt } from '../utils/flowerArt';

// ============================================================
// GARDEN FLOWER FIELD — Renders all flowers in a player's garden
// Single organic cluster, no visible containers
// Click handling via invisible zones at set centers
// Target highlighting via CSS 'targeted' class (driven by dragState)
// ============================================================

export interface GardenFlowerFieldProps {
  sets: GardenSet[];
  playerId: string;
  targetedSetId?: string | null;
  onSetClick?: (setId: string) => void;
  onSetHover?: (setId: string | null) => void;
  onPlayerHover?: (playerId: string | null) => void;
  highlightSetId?: string | null;
  attackedSetId?: string | null;
  changedSetIds?: string[];
  getSetRef?: (setId: string) => (node: HTMLDivElement | null) => void;
  lastDropRef?: React.MutableRefObject<{ playerId: string; setId: string; x: number; y: number; time: number } | null>;
}

export const GardenFlowerField = React.memo(function GardenFlowerField({
  sets,
  playerId,
  targetedSetId,
  onSetClick,
  onSetHover,
  onPlayerHover,
  highlightSetId,
  attackedSetId,
  changedSetIds,
  getSetRef,
  lastDropRef,
}: GardenFlowerFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 160, height: 120 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: Math.max(rect.width, 100), height: Math.max(rect.height, 80) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { particles, setCenters, containerW, containerH } = useMatterGardens({
    sets,
    playerId,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    changedSetIds,
  });

  // Power label helper — only 👑 and ✦, complete sets use glow instead
  function powerLabel(set: GardenSet): string {
    if (set.isToken) return '';
    if (set.isDivine) return '👑';
    if (set.isSolid) return '✦';
    return '';
  }

  // Glow color for complete sets
  function completeGlow(set: GardenSet): string | null {
    if (set.isToken || set.isDivine || set.isSolid) return null;
    if (set.isComplete) return 'rgba(78, 204, 163, 0.55)';
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="garden-particle-field"
      style={{
        width: containerW,
        height: containerH,
        position: 'relative',
      }}
      onPointerEnter={() => onPlayerHover?.(playerId)}
      onPointerLeave={() => onPlayerHover?.(null)}
    >
      {/* Render all flowers */}
      {(() => {
        const completeSetIds = new Set(sets.filter(s => s.isComplete && !s.isDivine && !s.isSolid && !s.isToken).map(s => s.id));

        return particles.map((p) => {
          const art = flowerArt(p.color);
          if (p.opacity < 0.01) return null;

          const isHighlighted = highlightSetId === p.setId;
          const isAttacked = attackedSetId === p.setId;
          const isCompleteSet = completeSetIds.has(p.setId);
          const isTargeted = targetedSetId === p.setId;

          return (
            <img
              key={p.id}
              src={art}
              alt={p.color}
              draggable={false}
              className={[
                'garden-flower-particle',
                isHighlighted ? 'is-highlighted' : '',
                isAttacked ? 'is-attacked' : '',
                isCompleteSet ? 'is-complete-set' : '',
                isTargeted ? 'targeted wiggle' : '',
              ].filter(Boolean).join(' ')}
              style={{
                position: 'absolute',
                left: `calc(50% + ${p.x.toFixed(1)}px - ${p.size / 2}px)`,
                top: `calc(50% + ${p.y.toFixed(1)}px - ${p.size / 2}px)`,
                width: p.size,
                height: p.size,
                transformOrigin: 'center',
                filter: isCompleteSet ? 'drop-shadow(0 0 8px rgba(78,204,163,0.6))' : undefined,
                opacity: p.opacity,
                zIndex: isTargeted ? 100 : Math.floor(p.size),
                cursor: onSetClick ? 'pointer' : 'default',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSetClick?.(p.setId);
              }}
            />
          );
        });
      })()}

      {/* Invisible click zones per set */}
      {sets.map((s) => {
        const center = setCenters[s.id];
        if (!center) return null;
        return (
          <div
            key={`zone-${s.id}`}
            className="garden-set-hover-zone"
            style={{
              position: 'absolute',
              left: `calc(50% + ${center.x}px - 45px)`,
              top: `calc(50% + ${center.y}px - 45px)`,
              width: 90,
              height: 90,
              borderRadius: '50%',
              cursor: onSetClick ? 'pointer' : 'default',
              zIndex: 200,
            }}
            onClick={() => onSetClick?.(s.id)}
            onPointerEnter={() => onSetHover?.(s.id)}
            onPointerLeave={() => onSetHover?.(null)}
          />
        );
      })}

      {/* Invisible refs for scroll-into-view */}
      {getSetRef &&
        sets.map((s) => {
          const center = setCenters[s.id];
          if (!center) return null;
          return (
            <div
              key={`ref-${s.id}`}
              ref={getSetRef(s.id)}
              style={{
                position: 'absolute',
                left: `calc(50% + ${center.x}px)`,
                top: `calc(50% + ${center.y}px)`,
                width: 1,
                height: 1,
                pointerEvents: 'none',
                opacity: 0,
              }}
            />
          );
        })}

      {/* Power labels */}
      {sets.map((s) => {
        const center = setCenters[s.id];
        if (!center) return null;
        const label = powerLabel(s);
        if (!label) return null;
        return (
          <span
            key={`label-${s.id}`}
            className="garden-set-power-label"
            style={{
              position: 'absolute',
              left: `calc(50% + ${center.x}px + 14px)`,
              top: `calc(50% + ${center.y}px + 10px)`,
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
});
