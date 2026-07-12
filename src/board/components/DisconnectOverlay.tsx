import React from 'react';

interface DisconnectOverlayProps {
  show: boolean;
  reason: string | null;
  theme: {
    panel: string;
    border: string;
    text: string;
    muted: string;
  };
  onDismiss: () => void;
}

export const DisconnectOverlay = React.memo(function DisconnectOverlay({
  show,
  reason,
  theme,
  onDismiss,
}: DisconnectOverlayProps) {
  if (!show) return null;

  const isMatchGone = reason === 'match-gone';

  return (
    <div className="disconnect-overlay-backdrop">
      <div
        className="disconnect-overlay-card"
        style={{
          background: theme.panel,
          borderColor: theme.border,
        }}
      >
        <div className="disconnect-overlay-icon">
          {isMatchGone ? '🚫' : '🔌'}
        </div>
        <div className="disconnect-overlay-title" style={{ color: theme.text }}>
          {isMatchGone ? 'Match Ended' : 'Connection Lost'}
        </div>
        <div className="disconnect-overlay-body" style={{ color: theme.muted }}>
          {isMatchGone
            ? 'This match no longer exists on the server — it may have been ended or deleted.'
            : "You've been disconnected from the game server. Refresh the page to reconnect — your match is saved."}
        </div>
        <button
          type="button"
          className="disconnect-overlay-btn reconnect"
          onClick={() => window.location.reload()}
        >
          🔄 {isMatchGone ? 'Back to Lobby' : 'Reconnect'}
        </button>
        <button
          type="button"
          className="disconnect-overlay-btn dismiss"
          style={{ borderColor: theme.border, color: theme.muted }}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
});
