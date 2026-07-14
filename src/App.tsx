// ============================================================
// FLOWER GAME — APP ROOT
// Handles: Lobby → Game screen → MMORPG World routing
// ============================================================

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { Client }   from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { useAuth } from './auth/AuthProvider';
import { clearStoredMatch, loadStoredMatch, saveStoredMatch, type MatchInfo } from './auth/storage';
import { SERVER } from './config';
import { FlowerBoard } from './board/FlowerBoard';
import { Lobby } from './lobby/Lobby';
import { MatchContext, type MatchSeatPresence } from './matchContext';
import DebugLayoutPage from './DebugLayoutPage';
import DebugArenaPage from './DebugArenaPage';
import { ToastContainer } from './components/ToastContainer';

import { FlowerGame } from '../game/FlowerGame';

// Lazy-load MMORPG world to avoid bundling PixiJS for card-game players
const MmorpgApp = lazy(() => import('./mmorpg/MmorpgApp').then(m => ({ default: m.MmorpgApp })));

const BgioClient = Client({
  game:         FlowerGame as Parameters<typeof Client>[0]['game'],
  board:        FlowerBoard,
  multiplayer:  SocketIO({ 
    server: SERVER,
    socketOpts: {
      transports: ['polling', 'websocket'],
    },
  }),
  debug:        false,
});

interface MatchMetadataResponse {
  gameover?: unknown;
  players?: Array<{ id: string | number; name?: string }>;
}

interface MatchRoomSummary {
  gameover?: unknown;
  started?: boolean;
}

function storedMatchKey(match: MatchInfo | null, userId: string | null): string {
  if (!match) return '';
  return `${userId ?? 'guest'}:${match.matchID}:${match.playerID}`;
}

const MOBILE_VIEW_KEY = 'flower-game:mobile-view';

export function App() {
  const { loading: authLoading, profile } = useAuth();
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(MOBILE_VIEW_KEY) === '1';
  });
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [spectatingMatchID, setSpectatingMatchID] = useState<string | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [seatPresence, setSeatPresence] = useState<Record<string, MatchSeatPresence>>({});
  const [storedMatch, setStoredMatch] = useState<MatchInfo | null>(null);
  const [parkedMatchKey, setParkedMatchKey] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const activeUserId = profile?.id ?? null;

  // Stable guest id: generating it inline during render would hand a fresh
  // id to MmorpgApp on every state change, re-initialising the whole Pixi
  // world (character respawn) each time the lobby popup toggles.
  const guestIdRef = useRef<string | null>(null);
  if (!guestIdRef.current) guestIdRef.current = generateGuestId();
  const worldGuestId = activeUserId || guestIdRef.current;

  useEffect(() => {
    if (isMobileView) {
      document.documentElement.classList.add('mobile-view-active');
      window.localStorage.setItem(MOBILE_VIEW_KEY, '1');
    } else {
      document.documentElement.classList.remove('mobile-view-active');
      window.localStorage.setItem(MOBILE_VIEW_KEY, '0');
    }
  }, [isMobileView]);

  // Global iOS gesture prevention (pinch-zoom)
  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    return () => document.removeEventListener('gesturestart', preventGesture);
  }, []);

  // DEBUG: auto-spectate via query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spectateId = params.get('spectate');
    if (spectateId && !spectatingMatchID && !match) {
      setSpectatingMatchID(spectateId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading || match) {
      if (authLoading) setStoredMatch(null);
      return;
    }

    let cancelled = false;
    const candidate = loadStoredMatch(activeUserId);
    setStoredMatch(candidate);
    if (!candidate) return;
    if (storedMatchKey(candidate, activeUserId) === parkedMatchKey) return;

    const validateStoredMatch = async () => {
      try {
        const res = await fetch(`${SERVER}/games/flower-game/${candidate.matchID}`);
        if (!res.ok) throw new Error(`Match lookup failed (${res.status})`);

        const data = await res.json() as MatchMetadataResponse;
        const players = Array.isArray(data.players) ? data.players : [];
        const hasSeat = players.some(player => String(player.id) === candidate.playerID);
        if (!hasSeat || data.gameover) {
          throw new Error('Saved match is no longer playable.');
        }

        if (!cancelled) setMatch(candidate);
      } catch {
        clearStoredMatch(activeUserId);
        if (!cancelled) setStoredMatch(null);
      }
    };

    void validateStoredMatch();
    return () => {
      cancelled = true;
    };
  }, [activeUserId, authLoading, match, parkedMatchKey]);

  useEffect(() => {
    if (!match) return;
    saveStoredMatch(match, activeUserId);
  }, [activeUserId, match]);

  // Fetch player names for both players and spectators
  const activeMatchID = match?.matchID ?? spectatingMatchID ?? null;
  useEffect(() => {
    if (!activeMatchID) {
      setPlayerNames({});
      setSeatPresence({});
      return;
    }

    let cancelled = false;
    const fetchNames = async () => {
      try {
        const res = await fetch(`${SERVER}/games/flower-game/${activeMatchID}`);
        if (!res.ok) return;
        const data = await res.json() as MatchMetadataResponse;
        if (cancelled || !data.players) return;
        const next: Record<string, string> = {};
        const nextPresence: Record<string, MatchSeatPresence> = {};
        for (const p of data.players) {
          const id = String(p.id);
          const fallbackName = `Player ${Number(id) + 1}`;
          const trimmedName = p.name?.trim() || '';
          const name = trimmedName || fallbackName;
          next[id] = name;
          nextPresence[id] = {
            name,
            occupied: Boolean(trimmedName),
          };
        }
        setPlayerNames(next);
        setSeatPresence(nextPresence);
      } catch { /* best-effort */ }
    };

    void fetchNames();
    const interval = window.setInterval(fetchNames, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeMatchID]);

  async function leaveMatch() {
    if (!match || leaving) return;
    setLeaving(true);
    let shouldClearStoredMatch = true;
    try {
      let usedWaitingRoomLeave = false;
      let startedMatch = false;
      try {
        const roomRes = await fetch(`${SERVER}/rooms/${encodeURIComponent(match.matchID)}`);
        if (roomRes.ok) {
          const room = await roomRes.json() as MatchRoomSummary;
          startedMatch = Boolean(room.started);
          if (!room.started) {
            const leaveRes = await fetch(`${SERVER}/rooms/${match.matchID}/leave`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerID: match.playerID, credentials: match.credentials }),
            });
            if (leaveRes.ok) {
              usedWaitingRoomLeave = true;
            }
          } else if (!room.gameover) {
            shouldClearStoredMatch = false;
          }
        }
      } catch {
        usedWaitingRoomLeave = false;
      }

      if (!usedWaitingRoomLeave && !startedMatch) {
        await fetch(`${SERVER}/games/flower-game/${match.matchID}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerID: match.playerID, credentials: match.credentials }),
        });
      }
    } catch { /* best-effort */ }
    if (shouldClearStoredMatch) {
      clearStoredMatch(activeUserId);
      setParkedMatchKey('');
    } else {
      saveStoredMatch(match, activeUserId);
      setStoredMatch(match);
      setParkedMatchKey(storedMatchKey(match, activeUserId));
    }
    setMatch(null);
    setLeaving(false);
  }

  function handleJoin(matchID: string, playerID: string, playerName: string, credentials: string) {
    const info: MatchInfo = { matchID, playerID, playerName, credentials };
    setParkedMatchKey('');
    saveStoredMatch(info, activeUserId);
    setStoredMatch(info);
    setMatch(info);
  }

  function handleSpectate(matchID: string) {
    setSpectatingMatchID(matchID);
  }

  function handleLeaveSpectator() {
    setSpectatingMatchID(null);
    setPlayerNames({});
    setSeatPresence({});
  }

  const mobileToggle = (
    <button
      type="button"
      className="app-mobile-toggle"
      onClick={() => setIsMobileView(v => !v)}
      title={isMobileView ? 'Switch to desktop view' : 'Switch to mobile view'}
      style={{
        position: 'fixed', bottom: 14, right: 140, zIndex: 9999,
        background: isMobileView ? '#4ecca3' : '#222',
        color: isMobileView ? '#1a1a2e' : '#fff',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 20, padding: '5px 12px', fontSize: 33,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {isMobileView ? '📱 Mobile' : '🖥️ Desktop'}
    </button>
  );

  const bugButton = (
    <a
      href="https://flowerbug.a133.mov"
      target="_blank"
      rel="noreferrer"
      className="app-bug-link"
      style={{
        position: 'fixed', bottom: 14, right: 14, zIndex: 9999,
        background: '#111', backdropFilter: 'none',
        color: '#fff', border: '1px solid #111',
        borderRadius: 20, padding: '5px 12px', fontSize: 33,
        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
        boxShadow: 'none',
      }}
    >
      Report Bug
    </a>
  );

  // === MMORPG WORLD ROUTE ===
  // The world is the LANDING PAGE: '/' and '/world' both drop the player
  // into teebai.flowers. Tapping the big minigame flower on the right edge
  // pops up the card-game lobby over the world; joining a match takes over
  // the screen (see the match branch below).
  const pathname = window.location.pathname;
  const worldRoute = pathname === '/' || pathname === '/world';

  if (pathname === '/debug-layout') {
    return (
      <>
        <DebugLayoutPage />
        {mobileToggle}
      </>
    );
  }

  if (pathname === '/debug-arena') {
    return (
      <>
        <DebugArenaPage />
        {mobileToggle}
      </>
    );
  }

  // Spectator mode
  if (spectatingMatchID) {
    return (
      <>
        <MatchContext.Provider value={{
          matchID:     spectatingMatchID,
          server:      SERVER,
          seatPresence,
          onLeave:     handleLeaveSpectator,
          isSpectator: true,
        }}>
          <ErrorBoundary>
            <BgioClient
              key={`spectate:${spectatingMatchID}`}
              matchID={spectatingMatchID}
              playerNames={playerNames}
            />
          </ErrorBoundary>
        </MatchContext.Provider>
        {mobileToggle}
        <ToastContainer />
      </>
    );
  }

  // Active card-game match — fullscreen, covers the world underneath.
  if (match) {
    return (
      <>
        <MatchContext.Provider value={{
          matchID:     match.matchID,
          playerID:    match.playerID,
          playerName:  match.playerName,
          credentials: match.credentials,
          server:      SERVER,
          seatPresence,
          onLeave:     () => void leaveMatch(),
          isSpectator: false,
        }}>
          <ErrorBoundary>
            <BgioClient
              key={`${match.matchID}:${match.playerID}`}
              matchID={match.matchID}
              playerID={match.playerID}
              credentials={match.credentials}
              playerNames={playerNames}
            />
          </ErrorBoundary>
        </MatchContext.Provider>
        {mobileToggle}
        <ToastContainer />
      </>
    );
  }

  // === WORLD LANDING ('/' and '/world') ===
  if (worldRoute) {
    return (
      <>
        <Suspense fallback={
          <div style={{
            position: 'fixed', inset: 0, background: '#1a1a2e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 24, fontFamily: 'sans-serif',
          }}>
            Entering teebai.flowers world...
          </div>
        }>
          <MmorpgApp guestId={worldGuestId} onOpenMinigame={() => setLobbyOpen(true)} />
        </Suspense>

        {/* Minigame lobby popup — opened by tapping the big portal flower.
            Renders over the MMORPG world. The CSS-only GrassField (via
            GrassFieldCSS) provides the animated meadow background without
            conflicting with the MMORPG's WebGL context. */}
        {lobbyOpen && (
          <div
            className="lobby-popup-overlay"
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              overflow: 'auto',
            }}
          >
            <ErrorBoundary>
              <Lobby
                showBackground={false}
                onJoin={(matchID, playerID, playerName, credentials) => {
                  setLobbyOpen(false);
                  handleJoin(matchID, playerID, playerName, credentials);
                }}
                onSpectate={(matchID) => {
                  setLobbyOpen(false);
                  handleSpectate(matchID);
                }}
                storedMatch={storedMatch}
              />
            </ErrorBoundary>
            <button
              type="button"
              onClick={() => setLobbyOpen(false)}
              style={{
                position: 'fixed', top: 14, right: 14, zIndex: 10001,
                background: 'rgba(0,0,0,0.4)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 20, padding: '8px 16px', fontSize: 18,
                cursor: 'pointer', backdropFilter: 'blur(4px)',
              }}
            >
              ✕ Back to world
            </button>
            <ToastContainer />
          </div>
        )}
      </>
    );
  }

  // === CARD-GAME LOBBY (direct entry — e.g. /cardgame) ===
  return (
    <>
      <ErrorBoundary>
        <Lobby onJoin={handleJoin} onSpectate={handleSpectate} storedMatch={storedMatch} />
      </ErrorBoundary>
      {mobileToggle}
      {bugButton}
      <ToastContainer />
    </>
  );
}

// Helper for guest ID generation in MMORPG route
function generateGuestId(): string {
  return 'guest_' + Math.random().toString(36).substring(2, 10);
}
