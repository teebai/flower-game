import React, { useRef, useCallback } from 'react';
import { useGardenParticles } from '../hooks/useGardenParticles';
import type { GardenSet, FlowerColor } from '../types/gameTypes';
import { flowerArt } from '../utils/flowerArt';

// ============================================================
// GARDEN FLOWER FIELD — Renders all flowers in a player's garden
// Single organic cluster, no visible containers
// Click + hover handling via invisible zones at set centers
// ============================================================

export interface GardenFlowerFieldProps {
  sets: GardenSet[];
  playerId: string;
  hoveredSetId: string | null;
  hoveredPlayerId: string | null;
  hoverLevel: 'flower' | 'set' | 'player' | null;
  isDragActive: boolean;
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
  hoveredSetId,
  hoveredPlayerId,
  hoverLevel,
  isDragActive,
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

  const { particles, setCenters, containerW, containerH } = useGardenParticles({
    sets,
    playerId,
    hoveredFlowerId: null,
    hoveredSetId,
    hoveredPlayerId,
    hoverLevel,
    isDragActive,
    changedSetIds,
    lastDropRef,
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

          return (
            <img
              key={p.id}
              src={art}
              alt={p.color}
              className={[
                'garden-flower-particle',
                isHighlighted ? 'is-highlighted' : '',
                isAttacked ? 'is-attacked' : '',
                isCompleteSet ? 'is-complete-set' : '',
              ].filter(Boolean).join(' ')}
              style={{
                position: 'absolute',
                left: `calc(50% + ${p.x.toFixed(1)}px - ${p.size / 2}px)`,
                top: `calc(50% + ${p.y.toFixed(1)}px - ${p.size / 2}px)`,
                width: p.size,
                height: p.size,
                transform: `rotate(${p.rotation.toFixed(1)}deg) scale(${p.hoverScale.toFixed(3)})`,
                filter: `brightness(${p.brightness.toFixed(2)}) saturate(${p.saturate.toFixed(2)})${isCompleteSet ? ' drop-shadow(0 0 8px rgba(78,204,163,0.6))' : ''}`,
                opacity: p.opacity,
                zIndex: Math.floor(p.size),
                willChange: 'transform',
                cursor: hoverLevel === 'set' ? 'pointer' : 'default',
              }}
              onPointerEnter={(e) => {
                e.stopPropagation();
                onSetHover?.(p.setId);
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                onSetHover?.(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSetClick?.(p.setId);
              }}
            />
          );
        });
      })()}

      {/* Invisible hover/click zones per set — with drag target glow */}
      {sets.map((s) => {
        const center = setCenters[s.id];
        if (!center) return null;
        const isHovered = hoveredSetId === s.id;
        return (
          <div
            key={`zone-${s.id}`}
            className={`garden-set-hover-zone${isDragActive ? ' drag-active' : ''}${isHovered && isDragActive ? ' is-target' : ''}`}
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
