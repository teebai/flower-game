import React from 'react';
import type { Player } from '../../types/gameTypes';
import { FLOWER_EMOJI } from '../../cards/cardUtils';
import { gardenSetColor, flowerDisplayColor } from '../../utils/gardenUtils';

interface PlayerInfoModalProps {
  playerId: string | null;
  players: Player[];
  theme: {
    panel: string;
    border: string;
    text: string;
    muted: string;
    panelSoft: string;
  };
  nameOf: (player?: Player | null) => string;
  onClose: () => void;
}

export const PlayerInfoModal = React.memo(function PlayerInfoModal({
  playerId,
  players,
  theme,
  nameOf,
  onClose,
}: PlayerInfoModalProps) {
  if (!playerId) return null;
  const infoPlayer = players.find(p => p.id === playerId);
  if (!infoPlayer) return null;

  return (
    <div className="v2-modal-backdrop" onClick={onClose}>
      <div className="v2-modal" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}>
        <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 700, color: theme.text }}>🌿 {nameOf(infoPlayer)}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="v2-modal-body" style={{ color: theme.text }}>
          <div style={{ marginBottom: 12, fontSize: 13 }}>
            🃏 <b>{infoPlayer.hand.length}</b> card{infoPlayer.hand.length !== 1 ? 's' : ''} in hand
          </div>
          <div style={{ fontSize: 12, color: theme.muted, marginBottom: 6 }}>
            {infoPlayer.garden.sets.length === 0 ? 'No sets yet.' : `${infoPlayer.garden.sets.length} set${infoPlayer.garden.sets.length !== 1 ? 's' : ''}:`}
          </div>
          {infoPlayer.garden.sets.map(set => {
            const setColor = gardenSetColor(set);
            const badge = set.isToken ? '💎' : set.isDivine ? '👑' : set.isSolid ? '💛' : set.isComplete ? '✅' : '';
            return (
              <div key={set.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 6, padding: '5px 8px',
                background: theme.panelSoft, borderRadius: 8,
                fontSize: 13,
              }}>
                <span style={{ fontSize: 15 }}>{set.isToken ? '💎' : setColor ? (FLOWER_EMOJI[setColor] ?? '🌸') : '🌈'}</span>
                <span style={{ flex: 1 }}>
                  {set.isToken ? 'Token set' : set.flowers.map(f => FLOWER_EMOJI[flowerDisplayColor(f)] ?? '🌸').join('')}
                </span>
                {badge && <span>{badge}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
