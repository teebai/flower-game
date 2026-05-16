import React from 'react';
import { useOrganicLayout } from '../hooks/useOrganicLayout';
import type { GardenSet, FlowerColor } from '../types/gameTypes';
import { flowerArt } from '../utils/flowerArt';

function solidGlowColor(color: FlowerColor): string {
  switch (color) {
    case 'red':     return 'rgba(255, 60, 60, 0.92)';
    case 'blue':    return 'rgba(60, 140, 255, 0.92)';
    case 'green':   return 'rgba(60, 220, 100, 0.92)';
    case 'yellow':  return 'rgba(255, 230, 0, 0.95)';
    case 'orange':  return 'rgba(255, 120, 0, 0.95)';
    case 'purple':  return 'rgba(200, 60, 255, 0.92)';
    case 'black':   return 'rgba(180, 180, 200, 0.9)';
    case 'rainbow': return 'rgba(255, 200, 60, 0.92)';
    case 'triple_rainbow': return 'rgba(255, 200, 60, 0.92)';
    case 'divine':  return 'rgba(255, 215, 0, 0.92)';
    default:        return 'rgba(255, 200, 0, 0.92)';
  }
}

// ============================================================
// GARDEN FLOWER FIELD — Renders all flowers in a player's garden
//
// Organic circle-packing physics with dynamic content sizing.
// Two interaction modes:
//   • Normal: click zones per set (for drag-drop + set selection)
//   • Selection: tap individual flowers (for Wind ×2 multi-select)
// ============================================================

export interface GardenFlowerFieldProps {
  sets: GardenSet[];
  playerId: string;
  // Normal mode
  targetedSetId?: string | null;
  onSetClick?: (setId: string) => void;
  onSetHover?: (setId: string | null) => void;
  onPlayerHover?: (playerId: string | null) => void;
  highlightSetId?: string | null;
  attackedSetId?: string | null;
  changedSetIds?: string[];
  getSetRef?: (setId: string) => (node: HTMLDivElement | null) => void;
  lastDropRef?: React.MutableRefObject<{ playerId: string; setId: string; x: number; y: number; time: number } | null>;
  // Selection mode (Wind ×2 flower-level targeting)
  selectionMode?: boolean;
  eligibleFlowerIds?: string[];
  selectedFlowerIds?: string[];
  onFlowerSelect?: (flowerId: string) => void;
  // Dynamic sizing callback
  onContentSizeChange?: (width: number, height: number) => void;
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
  getSetRef,
  selectionMode = false,
  eligibleFlowerIds = [],
  selectedFlowerIds = [],
  onFlowerSelect,
  onContentSizeChange,
}: GardenFlowerFieldProps) {
  const { flowers, setCenters, settled, contentWidth, contentHeight, registerFlowerRef, registerSetZoneRef } =
    useOrganicLayout({ sets });

  // Notify parent of content size changes
  React.useEffect(() => {
    onContentSizeChange?.(contentWidth, contentHeight);
  }, [contentWidth, contentHeight, onContentSizeChange]);

  const cx = contentWidth / 2;
  const cy = contentHeight / 2;

  const eligibleSet = new Set(eligibleFlowerIds);
  const selectedSet = new Set(selectedFlowerIds);

  // Power label helper — divine sets get a crown
  function powerLabel(set: GardenSet): string {
    if (set.isDivine) return '👑';
    return '';
  }

  return (
    <div
      className="garden-particle-field"
      data-garden-id={playerId}
      style={{
        width: contentWidth,
        height: contentHeight,
        position: 'relative',
        transition: 'width 0.3s ease, height 0.3s ease',
      }}
      onPointerEnter={() => onPlayerHover?.(playerId)}
      onPointerLeave={() => onPlayerHover?.(null)}
    >
      {/* Render all flowers */}
      {(() => {
        const completeSetIds = new Set(
          sets.filter((s) => s.isComplete && !s.isDivine && !s.isSolid && !s.isToken).map((s) => s.id)
        );
        const solidSetIds = new Set(
          sets.filter((s) => s.isSolid && !s.isToken).map((s) => s.id)
        );

        return flowers.filter((f) => f.size > 0).map((f) => {
          const art = flowerArt(f.color);

          const isHighlighted = highlightSetId === f.setId;
          const isAttacked = attackedSetId === f.setId;
          const isCompleteSet = completeSetIds.has(f.setId);
          const isSolidSet = solidSetIds.has(f.setId);
          const isTargeted = targetedSetId === f.setId;

          const isEligible = eligibleSet.has(f.id);
          const isSelected = selectedSet.has(f.id);
          const isIneligible = selectionMode && !isEligible;

          const wrapperTransform = isSelected && !isTargeted ? 'scale(1.15)' : undefined;
          const wrapperFilter = isSelected && !isTargeted
            ? 'brightness(1.4) saturate(1.3)'
            : undefined;

          return (
            <div
              key={f.id}
              ref={(node) => registerFlowerRef(f.id, node)}
              className={['garden-flower-wrapper', isSolidSet ? 'is-solid-set' : '', f.isNew ? 'is-new' : ''].filter(Boolean).join(' ')}
              style={{
                position: 'absolute',
                left: `${cx + f.x - f.size / 2}px`,
                top: `${cy + f.y - f.size / 2}px`,
                width: f.size,
                height: f.size,
                zIndex: isTargeted ? 100 : Math.floor(f.size),
                pointerEvents: selectionMode ? 'auto' : 'none',
                cursor: selectionMode ? (isEligible ? 'pointer' : 'default') : 'default',
                opacity: isIneligible ? 0.35 : 1,
                transform: wrapperTransform,
                filter: wrapperFilter,
                transition: 'transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease',
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
                  isCompleteSet ? 'is-complete-set' : '',
                  isSolidSet ? 'is-solid-set' : '',
                  isTargeted ? 'targeted wiggle' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  ['--solid-glow-color' as string]: solidGlowColor(f.color),
                }}
              />
            </div>
          );
        });
      })()}

      {/* Set-level click / hover zones (always rendered, used in both modes) */}
      {sets.map((s) => {
        const center = setCenters[s.id];
        if (!center) return null;
        return (
          <div
            key={`zone-${s.id}`}
            ref={(node) => registerSetZoneRef(s.id, node)}
            data-set-id={s.id}
            data-player-id={playerId}
            className="garden-set-hover-zone"
            style={{
              position: 'absolute',
              left: `${cx + center.x - 45}px`,
              top: `${cy + center.y - 45}px`,
              width: 90,
              height: 90,
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
                left: `${cx + center.x}px`,
                top: `${cy + center.y}px`,
                width: 1,
                height: 1,
                pointerEvents: 'none',
                opacity: 0,
              }}
            />
          );
        })}

      {/* Divine token glow — slightly bigger than normal flowers (52px vs 48px) */}
      {sets.map((s) => {
        const center = setCenters[s.id];
        if (!center) return null;
        if (!s.isToken || !s.isDivine) return null;
        const sz = 52;
        const half = sz / 2;
        return (
          <div
            key={`token-${s.id}`}
            style={{
              position: 'absolute',
              left: `${cx + center.x - half}px`,
              top: `${cy + center.y - half}px`,
              width: sz,
              height: sz,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(255,180,0,0.15) 50%, transparent 75%)',
              border: '1.5px solid rgba(255,200,60,0.5)',
              boxShadow: '0 0 16px rgba(255,200,60,0.35)',
              pointerEvents: 'none',
              zIndex: 2,
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
        // Skip token labels — already rendered above
        if (s.isToken) return null;
        return (
          <span
            key={`label-${s.id}`}
            className="garden-set-power-label"
            style={{
              position: 'absolute',
              left: `${cx + center.x + 14}px`,
              top: `${cy + center.y + 10}px`,
              zIndex: 210,
            }}
          >
            {label}
          </span>
        );
      })}

      {/* Debug: settlement indicator */}
      {process.env.NODE_ENV === 'development' && !settled && flowers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            fontSize: 9,
            color: 'rgba(255,255,255,0.4)',
            pointerEvents: 'none',
            zIndex: 300,
          }}
        >
          settling…
        </div>
      )}
    </div>
  );
});
