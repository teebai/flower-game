// ============================================================
// FLOWER GAME v2 — TOAST CONTAINER
// Renders toast notifications in top-right corner.
// ============================================================

import { useEffect, useState } from 'react';
import { subscribeToToasts, removeToast, type Toast } from '../stores/toastStore';

const TYPE_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  error:   { bg: 'rgba(233, 69, 96, 0.15)',  border: '#e94560', icon: '✕' },
  warning: { bg: 'rgba(255, 152, 0, 0.15)',  border: '#ff9800', icon: '!' },
  info:    { bg: 'rgba(78, 204, 163, 0.15)', border: '#4ecca3', icon: 'i' },
  success: { bg: 'rgba(76, 175, 80, 0.15)',  border: '#4caf50', icon: '✓' },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return subscribeToToasts(setToasts);
  }, []);

  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
        return (
          <div
            key={toast.id}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 10,
              padding: '10px 14px',
              color: '#fff',
              fontSize: 39,
              maxWidth: 280,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backdropFilter: 'blur(8px)',
              animation: 'toastIn 0.25s ease-out',
              pointerEvents: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }}
            onClick={() => removeToast(toast.id)}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: style.border,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 33,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {style.icon}
            </span>
            <span style={{ lineHeight: 1.4 }}>{toast.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
