import React from 'react';
import { formatElapsedClock } from '../../utils/formatters';

interface TurnInfoBarProps {
  playerName: string;
  timeRemaining: number; // seconds
  totalTime: number;     // seconds
  movesRemaining: number;
  isMyTurn: boolean;
  isGodsFavourite?: boolean;
}

export const TurnInfoBar = React.memo(function TurnInfoBar({
  playerName,
  timeRemaining,
  totalTime,
  movesRemaining,
  isMyTurn,
  isGodsFavourite,
}: TurnInfoBarProps) {
  const timerIsUrgent = timeRemaining > 0 && timeRemaining <= 10;
  const timerColor = timerIsUrgent ? 'var(--danger)' : 'var(--accent)';

  return (
    <div
      className="turn-info-bar"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '186px',
        transform: 'translateX(-50%)',
        zIndex: 48,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 18px',
        borderRadius: '999px',
        background: 'rgba(22, 33, 62, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Player name + God's Favourite */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text)' }}>
        {isGodsFavourite && <span style={{ fontSize: 14 }}>👑</span>}
        <span>
          {isMyTurn ? (
            playerName
          ) : (
            <>
              Waiting for <span style={{ color: 'var(--accent-3)' }}>{playerName}</span>
            </>
          )}
        </span>
      </span>

      {/* Divider */}
      <span
        style={{
          width: 1,
          height: 16,
          background: 'rgba(255, 255, 255, 0.12)',
          flexShrink: 0,
        }}
      />

      {/* Time remaining */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: timerColor,
          transition: 'color 0.3s ease',
        }}
        title="Time remaining"
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>⏱</span>
        {formatElapsedClock(Math.max(0, Math.ceil(timeRemaining)))}
      </span>

      {/* Total time */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-muted)',
        }}
        title="Total time"
      >
        <span style={{ fontSize: 12, opacity: 0.7 }}>⌛</span>
        {formatElapsedClock(Math.max(0, Math.ceil(totalTime)))}
      </span>

      {/* Divider */}
      <span
        style={{
          width: 1,
          height: 16,
          background: 'rgba(255, 255, 255, 0.12)',
          flexShrink: 0,
        }}
      />

      {/* Moves remaining */}
      <span
        style={{
          color: movesRemaining > 0 ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'color 0.3s ease',
        }}
        title="Moves remaining"
      >
        {movesRemaining}mv
      </span>
    </div>
  );
});
