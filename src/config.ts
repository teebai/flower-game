// ============================================================
// FLOWER GAME — Shared config
// ============================================================

export const SERVER = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'http://localhost:8000';
  }
  // Production / tunnel / Railway: same origin (server serves static files + API)
  return window.location.origin;
})();

export const IDENTITY_SERVER = import.meta.env.VITE_IDENTITY_SERVER_URL?.trim() || '';
export const GAME = 'flower-game';
