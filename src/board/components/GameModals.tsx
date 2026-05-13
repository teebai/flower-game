import React from 'react';
import type { GameState } from '../../types/gameTypes';
import type { MatchContextType } from '../../matchContext';
import { formatSeasonLabel, formatElapsedClock } from '../../utils/formatters';

interface GameModalsProps {
  modalOpen: 'menu' | 'results' | 'rules' | 'bugReport' | 'changelog' | 'quitConfirm' | null;
  theme: {
    panel: string;
    panelSoft: string;
    panelAlt: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
  matchCtx: MatchContextType | null;
  playerID: string;
  G: GameState;
  matchResult: {
    winnerName: string | null;
    durationSec: number;
    seasonAtFinish: string | null;
    drawPileCount: number;
    discardPileCount: number;
    players: {
      playerId: string;
      playerName: string;
      won: boolean;
      isGodsFavourite: boolean;
      flowersPlanted: number;
      gardenSetCount: number;
      completeSetCount: number;
      totalFlowers: number;
      solidSetCount: number;
      handCount: number;
    }[];
  } | null;
  totalTimerLabel: string;
  onClose: () => void;
  onViewResults: () => void;
  onLeave: () => void;
}

function btn(bg: string, color = '#fff') {
  return {
    background: bg, color, border: 'none',
    borderRadius: 8, padding: '8px 14px',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
  };
}

export const GameModals = React.memo(function GameModals({
  modalOpen, theme, matchCtx, playerID, G, matchResult,
  totalTimerLabel, onClose, onViewResults, onLeave,
}: GameModalsProps) {
  if (!modalOpen) return null;

  return (
    <div className="v2-modal-backdrop" onClick={onClose}>
      <div className={`v2-modal${modalOpen === 'results' ? ' v2-modal--results' : ''}`}
        style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}>
        <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 700, color: theme.text }}>
            {modalOpen === 'menu' ? 'Match Info' : modalOpen === 'results' ? 'Match Results' : 'Rules'}
          </span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className={`v2-modal-body${modalOpen === 'results' ? ' v2-modal-body--results' : ''}`} style={{ color: theme.text }}>
          {modalOpen === 'menu' && (
            <>
              <div style={{ marginBottom: 10, fontSize: 13 }}>Match: <b>{matchCtx?.matchID ?? '—'}</b></div>
              <div style={{ marginBottom: 10, fontSize: 13 }}>You: <b>{matchCtx?.playerName ?? playerID}</b></div>
              <div style={{ marginBottom: 10, fontSize: 13 }}>Phase: <b>{G.phase}</b></div>
              <div style={{ marginBottom: 10, fontSize: 13 }}>Season: <b>{formatSeasonLabel(G.season)}</b></div>
              <div style={{ marginBottom: 16, fontSize: 13 }}>Total time: <b>{totalTimerLabel}</b></div>
              {matchResult && (
                <button style={{ ...btn(theme.accent, '#1a1a2e'), fontSize: 12, marginBottom: 10 }}
                  onClick={onViewResults}>
                  View Results
                </button>
              )}
              <button style={{ ...btn('#555'), fontSize: 12 }}
                onClick={() => { void navigator.clipboard.writeText(matchCtx?.matchID ?? ''); }}>
                📋 Copy Match ID
              </button>
            </>
          )}
          {modalOpen === 'results' && matchResult && (
            <>
              <div className="v2-results-summary-grid">
                <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                  <div className="v2-results-summary-label" style={{ color: theme.muted }}>Winner</div>
                  <div className="v2-results-summary-value">{matchResult.winnerName ?? 'Unknown'}</div>
                </div>
                <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                  <div className="v2-results-summary-label" style={{ color: theme.muted }}>Final Time</div>
                  <div className="v2-results-summary-value">{formatElapsedClock(matchResult.durationSec)}</div>
                </div>
                <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                  <div className="v2-results-summary-label" style={{ color: theme.muted }}>Season</div>
                  <div className="v2-results-summary-value">{formatSeasonLabel(matchResult.seasonAtFinish)}</div>
                </div>
                <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                  <div className="v2-results-summary-label" style={{ color: theme.muted }}>Cards Left</div>
                  <div className="v2-results-summary-value">{matchResult.drawPileCount} draw / {matchResult.discardPileCount} discard</div>
                </div>
              </div>
              <div className="v2-results-section-label" style={{ color: theme.muted }}>Player state at finish</div>
              <div className="v2-results-player-list">
                {matchResult.players.map(player => (
                  <div key={player.playerId}
                    className="v2-results-player-card"
                    style={{
                      background: player.won ? theme.panelAlt : theme.panelSoft,
                      border: `1px solid ${player.won ? theme.accent : theme.border}`,
                    }}
                  >
                    <div className="v2-results-player-head">
                      <div style={{ minWidth: 0 }}>
                        <div className="v2-results-player-name" style={{ color: theme.text }}>{player.playerName}</div>
                        <div className="v2-results-player-meta" style={{ color: theme.muted }}>
                          {player.won ? 'Winner' : 'Finished'}
                          {player.isGodsFavourite ? " · God's Favourite" : ''}
                        </div>
                      </div>
                      <div className="v2-results-player-badge" style={{
                        background: player.won ? theme.accent : theme.panel,
                        color: player.won ? '#1a1a2e' : theme.text,
                      }}>
                        {player.won ? 'WIN' : 'END'}
                      </div>
                    </div>
                    <div className="v2-results-player-stats">
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Flowers Planted</div><div className="v2-results-player-stat-value">{player.flowersPlanted}</div></div>
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Garden Sets</div><div className="v2-results-player-stat-value">{player.gardenSetCount}</div></div>
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Completed Sets</div><div className="v2-results-player-stat-value">{player.completeSetCount}</div></div>
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Flowers In Garden</div><div className="v2-results-player-stat-value">{player.totalFlowers}</div></div>
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Solid Sets</div><div className="v2-results-player-stat-value">{player.solidSetCount}</div></div>
                      <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Cards In Hand</div><div className="v2-results-player-stat-value">{player.handCount}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="v2-results-actions">
                <button style={{ ...btn(theme.accent, '#1a1a2e'), fontSize: 12 }} onClick={onLeave}>
                  Back to Lobby
                </button>
                <button style={{ ...btn('#555'), fontSize: 12 }}
                  onClick={() => { void navigator.clipboard.writeText(matchCtx?.matchID ?? ''); }}>
                  Copy Match ID
                </button>
              </div>
            </>
          )}
          {modalOpen === 'rules' && (
            <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.6 }}>
              <p>Plant flowers into gardens. Complete sets of 3+ matching flowers to score. Use power cards to disrupt opponents.</p>
              <p>The player with the most complete sets when the draw pile empties wins!</p>
              <p>God's Favourite cannot win until they pass it on.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
