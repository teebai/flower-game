import React, { useState, useSyncExternalStore } from 'react';
import type { GameState } from '../../types/gameTypes';
import {
  type DanmakuComment,
  getWhimsicalColor,
  subscribeDanmaku,
  getDanmakuSnapshot,
  addDanmakuComment,
  assignDanmakuLane,
  occupyLane,
  getLastDanmakuSendAt,
  setLastDanmakuSendAt,
  DANMAKU_MIN_DURATION,
  DANMAKU_MAX_DURATION,
  DANMAKU_SEND_COOLDOWN_MS,
} from '../../danmakuStore';

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
  G, playerID, matchCtx, nameOf, isSubmitting, onStart, onReady, onLeave, onKick,
}: WaitingRoomProps) {
  const roomOwnerName = nameOf(G.players.find(p => p.id === G.ownerPlayerId) ?? null) || 'Room owner';
  const joinedRoomCount = G.players.filter(p => p.name.trim()).length;
  const myReady = !!playerID && G.readyPlayerIds.includes(playerID);
  const isOwner = playerID === G.ownerPlayerId;
  const joinedPlayers = G.players.filter(p => p.name.trim());
  const readyJoinedCount = joinedPlayers.filter(p => G.readyPlayerIds.includes(p.id)).length;
  const enoughReady = readyJoinedCount >= G.minPlayers;

  /* ── Danmaku chat ── */
  const [chatInput, setChatInput] = useState('');
  const danmakuComments = useSyncExternalStore(
    subscribeDanmaku,
    getDanmakuSnapshot,
  );

  function sendChat() {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (now - getLastDanmakuSendAt() < DANMAKU_SEND_COOLDOWN_MS) return;
    setLastDanmakuSendAt(now);
    const lane = assignDanmakuLane(now);
    const duration = DANMAKU_MIN_DURATION
      + Math.random() * (DANMAKU_MAX_DURATION - DANMAKU_MIN_DURATION);
    const color = getWhimsicalColor(trimmed + now);
    occupyLane(lane, now, duration);
    const comment: DanmakuComment = {
      id: `${now}-${lane}-${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      color,
      lane,
      duration,
      createdAt: now,
    };
    addDanmakuComment(comment);
    setChatInput('');
  }

  return (
    <div className="waiting-room-shell">
      <div className="waiting-room-panel">
        <div className="waiting-room-header">
          <div className="waiting-room-heading">
            <div className="waiting-room-kicker" style={{ color: '#c45a6e' }}>
              Waiting Room
            </div>
            <div className="waiting-room-rules-caption" style={{ color: '#6b8a6b' }}>
              {G.minPlayers}-{G.maxPlayers} players · seats shuffle on start
            </div>
            <h1 className="waiting-room-title" style={{ color: '#4a2c5a' }}>
              {G.roomName || 'Flower Room'}
            </h1>
            <div className="waiting-room-subtitle" style={{ color: '#7a6a4a' }}>
              Hosted by <b style={{ color: '#5a3a2a' }}>{roomOwnerName}</b> · room ID <span style={{ fontFamily: 'Teebai, monospace', color: '#8a6a3a' }}>{matchCtx?.matchID}</span>
            </div>
          </div>
        </div>

        <div className="waiting-room-seat-grid">
          {G.players.map((player, index) => {
            const occupied = !!player.name.trim();
            const isOwnerSeat = player.id === G.ownerPlayerId;
            const isReady = G.readyPlayerIds.includes(player.id);
            return (
              <div
                key={player.id}
                className="waiting-room-seat-card"
                style={{
                  background: occupied ? 'rgba(255, 255, 255, 0.50)' : 'rgba(255, 255, 255, 0.28)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <div className="waiting-room-seat-top">
                  <div className="waiting-room-seat-index" style={{ color: '#5a6a9a' }}>
                    Seat {index + 1}
                  </div>
                  <div className="waiting-room-seat-badges">
                    {isOwnerSeat && (
                      <span
                        className="waiting-room-badge"
                        style={{ color: '#7a3a2a', background: '#ffd5c8' }}
                      >
                        Owner
                      </span>
                    )}
                    {(occupied && isReady) || isOwnerSeat ? (
                      <span
                        className="waiting-room-badge"
                        style={{ color: '#2a5a3a', background: '#c8f0d8' }}
                      >
                        Ready
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="waiting-room-seat-name" style={{ color: occupied ? '#2a5a5a' : '#9a8aaa' }}>
                  {occupied ? player.name : 'Open seat'}
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
                background: enoughReady ? 'rgba(255, 200, 180, 0.55)' : 'rgba(255, 255, 255, 0.35)',
                color: '#5a2a2a',
                border: `2px solid ${enoughReady ? '#d48a7a' : 'rgba(30, 30, 30, 0.15)'}`,
                cursor: enoughReady ? 'pointer' : 'not-allowed',
                opacity: enoughReady ? 1 : 0.55,
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
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
                background: G.readyPlayerIds.includes(playerID) ? 'rgba(180, 235, 200, 0.50)' : 'rgba(255, 200, 180, 0.45)',
                color: '#4a2a2a',
                border: `2px solid ${G.readyPlayerIds.includes(playerID) ? '#7aba8a' : '#d48a7a'}`,
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
              onClick={onReady}
            >
              {G.readyPlayerIds.includes(playerID) ? '✅ Ready!' : '👍 Ready Up'}
            </button>
          )}
          <button
            className="waiting-room-btn-secondary"
            style={{
              color: '#4a4a5a',
              background: 'rgba(230, 230, 240, 0.45)',
              border: '2px solid rgba(90, 90, 120, 0.25)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
            onClick={onLeave}
          >
            ← Leave Room
          </button>
        </div>
      </div>

      {/* Chat input bar */}
      <div className="waiting-room-chat-bar">
        <input
          type="text"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (!chatInput.trim()) {
                e.currentTarget.blur();
              } else {
                sendChat();
              }
            }
          }}
          placeholder="chat here"
          className={`waiting-room-chat-input${chatInput.trim() ? ' is-typing' : ''}`}
          maxLength={60}
        />
        {chatInput.trim() && (
          <button
            type="button"
            onClick={sendChat}
            className="waiting-room-chat-send"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
});
