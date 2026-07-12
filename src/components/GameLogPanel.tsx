// ============================================================
// FLOWER GAME v2 — GAME LOG PANEL
// Slide-in panel showing recent game events from G.log.
// ============================================================

import { useState } from 'react';

interface GameLogPanelProps {
  log: string[];
}

export function GameLogPanel({ log }: GameLogPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Toggle button */}
      <button
        style={{
          position: 'fixed',
          top: 56,
          right: 16,
          zIndex: 100,
          background: 'rgba(10, 10, 26, 0.8)',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '6px 12px',
          color: '#aaa',
          fontSize: 36,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        📜 Log {log.length > 0 && `(${log.length})`}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            top: 92,
            right: 16,
            width: 300,
            maxHeight: 360,
            background: 'rgba(10, 10, 26, 0.95)',
            border: '1px solid #333',
            borderRadius: 12,
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #222',
              fontSize: 39,
              fontWeight: 600,
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Game Log</span>
            <button
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 36 }}
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              overflowY: 'auto',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {log.length === 0 && (
              <span style={{ color: '#666', fontSize: 36, textAlign: 'center', padding: '12px 0' }}>
                No events yet.
              </span>
            )}
            {[...log].reverse().map((entry, idx) => (
              <div key={log.length - idx} style={{ fontSize: 33, color: '#bbb', lineHeight: 1.4 }}>
                <span style={{ color: '#666', fontSize: 30, marginRight: 6 }}>
                  #{log.length - idx}
                </span>
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
