// ============================================================
// FLOWER GAME — Shared config
// ============================================================

export const SERVER = (() => {
  // Allow explicit override for all environments (static deploys, etc.)
  const envUrl = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined)?.trim();
  if (envUrl) return envUrl;

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  // Production / tunnel / Railway: same origin (server serves static files + API)
  return window.location.origin;
})();

export const IDENTITY_SERVER = import.meta.env.VITE_IDENTITY_SERVER_URL?.trim() || '';
export const GAME = 'flower-game';
