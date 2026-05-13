import React from 'react';
import type { Player, GameState } from '../../types/gameTypes';
import { GardenFlowerField } from '../GardenFlowerField';
import { gardenSetColor, flowerDisplayColor } from '../../utils/gardenUtils';
import { FLOWER_EMOJI } from '../../cards/cardUtils';

interface PlayerGardenPanelProps {
  player: Player;
  layout: { x: number; y: number; size: number };
  playerID: string;
  currentPlayerId: string;
  godsFavouritePlayerId: string | null;
  isActive: boolean;
  isMe: boolean;
  isGodsFav: boolean;
  canDropTarget: boolean;
  activeGardenCardId: string | null;
  activeGardenPlayerId: string | null;
  activeGardenSetId: string | null;
  targetPlayer: string;
  myTurn: boolean;
  phase: GameState['phase'];
  hoveredSetId: string | null;
  hoveredPlayerId: string | null;
  hoverLevel: 'none' | 'set' | 'player';
  hoverMode: 'move' | 'target' | 'none';
  settlingGardens: Record<string, { changedSetIds: string[] } | null>;
  gardenVisualEffect: { playerId: string; key: number; type: string } | null;
  chatBubbles: Record<string, { text: string; key: number } | undefined>;
  attackedGardenPlayerId: string | null;
  attackedGardenSetId: string | null;
  compactLayout: boolean;
  theme: {
    panelSoft: string;
    accent: string;
    muted: string;
  };
  nameOf: (player?: Player | null) => string;
  gardenRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  gardenSetRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  suppressSetClickRef: React.MutableRefObject<string | null>;
  onPlayerInfoClick: (playerId: string) => void;
  onSetClick: (playerId: string, setId: string) => void;
  onEmptyClick: (playerId: string) => void;
  onSetHover: (setId: string | null) => void;
  onPlayerHover: (playerId: string | null) => void;
  onGardenConfirmClick: () => void;
  step: string;
  moveType: string;
  moveLabel: (type: string) => string;
  showConfirm: boolean;
}

function gardenDensityClass(count: number): string {
  if (count <= 2) return 'garden-density--low';
  if (count <= 4) return 'garden-density--medium';
  if (count <= 6) return 'garden-density--high';
  return 'garden-density--very-high';
}

function gardenSetRefKey(playerId: string, setId: string): string {
  return `${playerId}::${setId}`;
}

export const PlayerGardenPanel = React.memo(function PlayerGardenPanel({
  player, layout, playerID, isActive, isMe, isGodsFav, canDropTarget,
  activeGardenCardId, activeGardenPlayerId, activeGardenSetId,
  targetPlayer, myTurn, phase, hoveredSetId, hoveredPlayerId,
  hoverLevel, hoverMode, settlingGardens, gardenVisualEffect,
  chatBubbles, attackedGardenPlayerId, attackedGardenSetId,
  compactLayout, theme, nameOf, gardenRefs, gardenSetRefs,
  suppressSetClickRef, onPlayerInfoClick, onSetClick, onEmptyClick,
  onSetHover, onPlayerHover, onGardenConfirmClick,
  step, moveType, moveLabel: ml, showConfirm,
}: PlayerGardenPanelProps) {
  const setCount = player.garden.sets.length;
  const gardenSize = Math.max(148, Math.min(216, layout.size));
  const estimatedRows = Math.max(1, Math.ceil(setCount / (compactLayout ? 2 : 3)));
  const gardenHeight = Math.max(136, 102 + estimatedRows * 34);
  const targeting = activeGardenPlayerId === player.id || targetPlayer === player.id;
  const gardenFx = gardenVisualEffect?.playerId === player.id ? gardenVisualEffect : null;
  const gardenSettle = settlingGardens[player.id] ?? null;

  const panelClass = [
    'player-garden',
    isActive ? 'is-current-turn' : '',
    isMe ? 'is-me' : '',
    isGodsFav ? 'is-gods-fav' : '',
    gardenDensityClass(setCount),
    activeGardenPlayerId === player.id ? 'is-targeted' : '',
    gardenSettle ? 'is-settling' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={panelClass}
      style={{
        ['--pg-x' as string]: `${layout.x}px`,
        ['--pg-y' as string]: `${layout.y}px`,
        ['--pg-w' as string]: `${gardenSize}px`,
        ['--pg-h' as string]: `${gardenHeight}px`,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        borderRadius: 0,
      } as React.CSSProperties}
      ref={(node) => { gardenRefs.current[player.id] = node; }}
    >
      <div className={`garden-body ${gardenSettle ? 'is-settling' : ''}`}>
        {gardenFx?.type === 'natural-disaster' && (
          <div key={gardenFx.key} className="garden-visual-fx garden-visual-fx--natural-disaster" aria-hidden="true">
            <img src="/assets/natural-disaster.gif" alt="" className="garden-visual-fx__image" draggable={false} />
          </div>
        )}
        {chatBubbles[player.id] && (
          <div key={chatBubbles[player.id]!.key} className="garden-chat-bubble">
            💬 {chatBubbles[player.id]!.text}
          </div>
        )}
        <button
          type="button"
          className="garden-mini-meta"
          onClick={() => onPlayerInfoClick(player.id)}
          title={`Open ${nameOf(player)} details`}
          aria-label={`Open ${nameOf(player)} details`}
        >
          <span className="garden-mini-meta__name">
            {nameOf(player)}
            <span className="garden-mini-meta__count" aria-hidden="true">
              🃏 {player.hand.length}
            </span>
          </span>
        </button>
        <div className="garden-zone" style={{ background: 'transparent', border: 'none' }}>
          <div className={`garden-grid ${gardenDensityClass(setCount)} ${activeGardenCardId ? 'is-dragging' : ''} ${setCount === 0 ? 'is-empty' : ''}`}>
            {setCount === 0
              ? <div className="garden-empty-slot"
                  onClick={canDropTarget && activeGardenCardId
                    ? () => onEmptyClick(player.id)
                    : isMe && myTurn && phase === 'action'
                    ? () => onEmptyClick(player.id)
                    : undefined}>
                  Tap or drop a flower here
                </div>
              : <GardenFlowerField
                  sets={player.garden.sets}
                  playerId={player.id}
                  onSetClick={(setId) => {
                    if (canDropTarget && activeGardenCardId) {
                      onSetClick(player.id, setId);
                    } else if (isMe && myTurn && phase === 'action') {
                      if (suppressSetClickRef.current === setId) { suppressSetClickRef.current = null; return; }
                      onSetClick(player.id, setId);
                    }
                  }}
                  highlightSetId={activeGardenSetId}
                  attackedSetId={player.id === attackedGardenPlayerId ? attackedGardenSetId : undefined}
                  changedSetIds={gardenSettle?.changedSetIds ?? []}
                  getSetRef={(setId) => (node) => { gardenSetRefs.current[gardenSetRefKey(player.id, setId)] = node; }}
                />
            }
          </div>
        </div>
        {showConfirm && targetPlayer === player.id && (
          <div className="garden-quick-confirm" style={{
            marginTop: 6, padding: '6px 8px', borderRadius: 10,
            background: theme.panelSoft, border: `1px solid ${theme.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 6, flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.muted, marginBottom: 1 }}>Ready here</div>
              <div style={{ fontWeight: 800, color: theme.text, fontSize: 11 }}>{ml(moveType)}</div>
            </div>
            <button
              style={{ background: theme.accent, color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
              onClick={onGardenConfirmClick}
            >
              ✔
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
