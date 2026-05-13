// ============================================================
// FLOWER GAME — APP ROOT
// Handles: Lobby → Game screen routing
// ============================================================

import { useEffect, useState } from 'react';
import { Client }   from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { useAuth } from './auth/AuthProvider';
import { clearStoredMatch, loadStoredMatch, saveStoredMatch, type MatchInfo } from './auth/storage';
import { FlowerBoard } from './board/FlowerBoard';
import { Lobby } from './lobby/Lobby';
import { MatchContext, type MatchSeatPresence } from './matchContext';

const SERVER = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'http://localhost:8000';
  }
  // Production / tunnel / Railway: same origin (server serves static files + API)
  return window.location.origin;
})();

import { FlowerGame } from '../game/FlowerGame';

const BgioClient = Client({
  game:         FlowerGame as Parameters<typeof Client>[0]['game'],
  board:        FlowerBoard,
  multiplayer:  SocketIO({ server: SERVER }),
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

export function App() {
  const { loading: authLoading, profile } = useAuth();
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [seatPresence, setSeatPresence] = useState<Record<string, MatchSeatPresence>>({});
  const [storedMatch, setStoredMatch] = useState<MatchInfo | null>(null);
  const [parkedMatchKey, setParkedMatchKey] = useState('');
  const [leaving, setLeaving] = useState(false);
  const activeUserId = profile?.id ?? null;

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

  useEffect(() => {
    if (!match) {
      setPlayerNames({});
      setSeatPresence({});
      return;
    }

    let cancelled = false;
    const fetchNames = async () => {
      try {
        const res = await fetch(`${SERVER}/games/flower-game/${match.matchID}`);
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
  }, [match]);

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
            const leaveRes = await fetch(`${SERVER}/rooms/${encodeURIComponent(match.matchID)}/leave`, {
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
        borderRadius: 20, padding: '5px 12px', fontSize: 11,
        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
        boxShadow: 'none',
      }}
    >
      Report Bug
    </a>
  );

  if (!match) {
    return (
      <>
        <Lobby onJoin={handleJoin} storedMatch={storedMatch} />
        {bugButton}
      </>
    );
  }

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
      }}>
        <BgioClient
          key={`${match.matchID}:${match.playerID}`}
          matchID={match.matchID}
          playerID={match.playerID}
          credentials={match.credentials}
          playerNames={playerNames}
        />
      </MatchContext.Provider>
    </>
  );
}
