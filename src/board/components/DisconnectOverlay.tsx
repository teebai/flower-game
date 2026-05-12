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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: '32px 28px',
        textAlign: 'center',
        maxWidth: 340,
        width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {isMatchGone ? '🚫' : '🔌'}
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: theme.text, marginBottom: 8 }}>
          {isMatchGone ? 'Match Ended' : 'Connection Lost'}
        </div>
        <div style={{ fontSize: 13, color: theme.muted, marginBottom: 24, lineHeight: 1.6 }}>
          {isMatchGone
            ? 'This match no longer exists on the server — it may have been ended or deleted.'
            : 'You\'ve been disconnected from the game server. Refresh the page to reconnect — your match is saved.'}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%', padding: '11px 0',
            background: 'linear-gradient(135deg,#e94560,#c73652)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          🔄 {isMatchGone ? 'Back to Lobby' : 'Refresh Page'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            width: '100%', padding: '8px 0',
            background: 'transparent', border: `1px solid ${theme.border}`,
            color: theme.muted, borderRadius: 10,
            fontSize: 13, cursor: 'pointer',
          }}
        >
          Dismiss (stay on page)
        </button>
      </div>
    </div>
  );
});
