import React from 'react';
import type { GameState } from '../../types/gameTypes';

interface WaitingRoomProps {
  G: GameState;
  playerID: string;
  theme: {
    panel: string;
    panelSoft: string;
    panelAlt: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    glow: string;
  };
  matchCtx: { matchID: string } | null;
  nameOf: (player?: import('../../types/gameTypes').Player | null) => string;
  isSubmitting: boolean;
  onStart: () => void;
  onReady: () => void;
  onLeave: () => void;
  onKick?: (targetPlayerID: string) => void;
}

export const WaitingRoom = React.memo(function WaitingRoom({
  G, playerID, theme, matchCtx, nameOf, isSubmitting, onStart, onReady, onLeave, onKick,
}: WaitingRoomProps) {
  const roomOwnerName = nameOf(G.players.find(p => p.id === G.ownerPlayerId) ?? null) || 'Room owner';
  const joinedRoomCount = G.players.filter(p => p.name.trim()).length;
  const roomReadyEnabled = joinedRoomCount >= G.minPlayers;
  const myReady = !!playerID && G.readyPlayerIds.includes(playerID);
  const iAmRoomOwner = !!playerID && G.ownerPlayerId === playerID;
  const joinedPlayers = G.players.filter(p => p.name.trim());
  const readyJoinedCount = joinedPlayers.filter(p => G.readyPlayerIds.includes(p.id)).length;
  const enoughReady = readyJoinedCount >= G.minPlayers;
  const isOwner = playerID === G.ownerPlayerId;

  return (
    <div className="waiting-room-shell">
      <div
        className="waiting-room-panel"
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          boxShadow: `0 24px 60px ${theme.glow}`,
        }}
      >
        <div className="waiting-room-header">
          <div className="waiting-room-heading">
            <div className="waiting-room-kicker" style={{ color: theme.muted }}>
              Waiting Room
            </div>
            <h1 className="waiting-room-title" style={{ color: theme.text }}>{G.roomName || 'Flower Room'}</h1>
            <div className="waiting-room-subtitle" style={{ color: theme.muted }}>
              Hosted by <b style={{ color: theme.text }}>{roomOwnerName}</b> · room ID <span style={{ fontFamily: 'monospace', color: theme.text }}>{matchCtx?.matchID}</span>
            </div>
          </div>
          <div
            className="waiting-room-rules"
            style={{
              background: theme.panelSoft,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <div className="waiting-room-card-label">Room rules</div>
            <div className="waiting-room-card-copy" style={{ color: theme.muted }}>
              {G.minPlayers}-{G.maxPlayers} players. Owner is auto-ready. Game starts when at least {G.minPlayers} joined players are ready. Seats shuffle on start.
            </div>
          </div>
        </div>

        <div className="waiting-room-seat-grid">
          {G.players.map((player, index) => {
            const occupied = !!player.name.trim();
            const isMine = player.id === playerID;
            const isOwnerSeat = player.id === G.ownerPlayerId;
            const isReady = G.readyPlayerIds.includes(player.id);
            return (
              <div
                key={player.id}
                className="waiting-room-seat-card"
                style={{
                  border: `1px solid ${occupied ? theme.accent : theme.border}`,
                  background: occupied ? theme.panelSoft : theme.panelAlt,
                  opacity: occupied ? 1 : 0.82,
                }}
              >
                <div className="waiting-room-seat-top">
                  <div className="waiting-room-seat-index" style={{ color: theme.muted }}>Seat {index + 1}</div>
                  <div className="waiting-room-seat-badges">
                    {isOwnerSeat && (
                      <span className="waiting-room-badge" style={{ color: theme.text, background: theme.panel }}>
                        Owner
                      </span>
                    )}
                    {(occupied && isReady) || isOwnerSeat ? (
                      <span className="waiting-room-badge" style={{ color: '#1a1a2e', background: '#4ecca3' }}>
                        Ready
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="waiting-room-seat-name" style={{ color: occupied ? theme.text : theme.muted }}>
                  {occupied ? player.name : 'Open seat'}
                </div>
                <div className="waiting-room-seat-copy" style={{ color: theme.muted }}>
                  {occupied
                    ? isMine
                      ? 'This is your seat.'
                      : 'Joined and waiting.'
                    : 'Another player can join here.'}
                </div>
                {isOwner && occupied && !isOwnerSeat && onKick && (
                  <button
                    className="waiting-room-kick-btn"
                    onClick={() => onKick(player.id)}
                    title={`Kick ${player.name}`}
                    style={{ marginTop: 8 }}
                  >
                    🥾 Kick
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="waiting-room-actions">
          {isOwner ? (
            <button
              className="waiting-room-btn-primary"
              style={{
                background: enoughReady ? theme.accent : theme.panelSoft,
                color: enoughReady ? '#1a1a2e' : theme.muted,
                border: `1px solid ${enoughReady ? theme.accent : theme.border}`,
                cursor: enoughReady ? 'pointer' : 'not-allowed',
                opacity: enoughReady ? 1 : 0.7,
              }}
              onClick={onStart}
              disabled={!enoughReady}
              title={enoughReady ? `Start with ${readyJoinedCount} ready players` : `${readyJoinedCount}/${joinedPlayers.length} ready · need ${G.minPlayers} to start`}
            >
              🚀 Start Match
            </button>
          ) : (
            <button
              className="waiting-room-btn-primary"
              style={{
                background: G.readyPlayerIds.includes(playerID) ? theme.panelSoft : theme.accent,
                color: G.readyPlayerIds.includes(playerID) ? theme.text : '#1a1a2e',
              }}
              onClick={onReady}
            >
              {G.readyPlayerIds.includes(playerID) ? '✅ Ready!' : '👍 Ready Up'}
            </button>
          )}
          <button
            className="waiting-room-btn-secondary"
            style={{ color: theme.muted }}
            onClick={onLeave}
          >
            ← Leave Room
          </button>
        </div>
      </div>
    </div>
  );
});
