// ============================================================
// FLOWER GAME — LOBBY
// Create or join a match via boardgame.io Lobby API.
// ============================================================

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { MatchInfo } from '../auth/storage';
import { SERVER, IDENTITY_SERVER, GAME } from '../config';
import { GrassField } from '../board/GrassField';
import { GrassFieldCSS } from './GrassFieldCSS';
import { HowToPlay } from './HowToPlay';
import {
  type DanmakuComment,
  getWhimsicalColor,
  WHIMSICAL_COLORS,
  subscribeDanmaku,
  getDanmakuSnapshot,
  addDanmakuComment,
  cleanupDanmakuComments,
  assignDanmakuLane,
  occupyLane,
  getLastDanmakuSendAt,
  setLastDanmakuSendAt,
  DANMAKU_MIN_DURATION,
  DANMAKU_MAX_DURATION,
  DANMAKU_MAX_COMMENTS,
  DANMAKU_SEND_COOLDOWN_MS,
  DANMAKU_LANE_HEIGHT,
  DANMAKU_TOP_OFFSET,
} from '../danmakuStore';

interface Props {
  onJoin: (matchID: string, playerID: string, playerName: string, credentials: string) => void;
  onSpectate: (matchID: string) => void;
  storedMatch: MatchInfo | null;
  /** When false the animated grass background is skipped (e.g. lobby
   *  rendered as a popup over the MMORPG world — two Pixi/Canvas apps
   *  would fight for the same WebGL context). */
  showBackground?: boolean;
}

interface LobbyPlayer {
  id: string | number;
  isReady?: boolean;
  name?: string;
  isConnected?: boolean;
}

interface RoomSummary {
  matchID: string;
  createdAt: number | null;
  gameover?: { winner?: string | number } | null;
  joinedCount: number;
  maxPlayers: number;
  minPlayers: number;
  openSeatCount: number;
  ownerPlayerId: string | null;
  players: LobbyPlayer[];
  readyPlayerIds: string[];
  roomName: string;
  started: boolean;
  updatedAt: number | null;
  winner?: string | null;
}

interface LobbyListResponse {
  rooms?: RoomSummary[];
}

interface PlayerStats {
  accountId: string | null;
  avatarUrl: string | null;
  displayName: string;
  flowersPlanted: number;
  gamesPlayed: number;
  gamesWon: number;
  lastPlayedAt: string | null;
  lastWonAt: string | null;
  updatedAt: string | null;
  winRate: number;
}

interface LeaderboardEntry extends PlayerStats {
  rank: number;
}

// ── Helpers ─────────────────────────────────────────────────

const GAME_NAME = GAME;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function generateRoomName(): string {
  const adjectives = ['Blooming', 'Whimsical', 'Sunny', 'Mystic', 'Gentle', 'Radiant', 'Dreamy'];
  const nouns = ['Garden', 'Meadow', 'Field', 'Glade', 'Orchard', 'Pasture', 'Haven'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${a} ${n}`;
}

async function createWaitingRoom(
  roomName: string,
  minPlayers: number,
  maxPlayers: number,
): Promise<{ matchID: string; playerID: string; playerCredentials: string }> {
  const res = await fetch(`${SERVER}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomName,
      minPlayers,
      maxPlayers,
      gameName: GAME_NAME,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create room (${res.status})`);
  }
  const { matchID, playerID, playerCredentials } = await res.json() as {
    matchID: string;
    playerID: string;
    playerCredentials: string;
  };
  return { matchID, playerID, playerCredentials };
}

async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${SERVER}/rooms`);
  if (!res.ok) {
    console.warn('Room list failed:', res.status);
    return [];
  }
  const data = await res.json() as LobbyListResponse;
  return data.rooms ?? [];
}

async function getPlayerStats(userId: string): Promise<PlayerStats | null> {
  try {
    const res = await fetch(`${IDENTITY_SERVER}/api/players/${userId}`);
    if (!res.ok) return null;
    return (await res.json()) as PlayerStats;
  } catch {
    return null;
  }
}

async function updatePlayerDisplayName(userId: string, displayName: string): Promise<void> {
  await fetch(`${IDENTITY_SERVER}/api/players/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
}

async function refreshRoom(matchID: string): Promise<RoomSummary | null> {
  const rooms = await listRooms();
  return rooms.find((r) => r.matchID === matchID) ?? null;
}

// ── Leaderboard helpers ─────────────────────────────────────

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${IDENTITY_SERVER}/api/leaderboard`);
    if (!res.ok) return [];
    const data = await res.json() as { leaderboard?: PlayerStats[] };
    return (data.leaderboard ?? []).map((entry, i) => ({
      ...entry,
      rank: i + 1,
    }));
  } catch {
    return [];
  }
}

// ── Formatters ──────────────────────────────────────────────

function timeAgo(ts: number | null): string {
  if (!ts) return 'just now';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Skeleton loader row ─────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="skeleton-row">
      <div className="skeleton-block" style={{ width: '35%' }} />
      <div className="skeleton-block" style={{ width: '25%' }} />
      <div className="skeleton-block" style={{ width: '15%' }} />
    </div>
  );
}

// ── Lobby component ─────────────────────────────────────────

export function Lobby({ onJoin, onSpectate, storedMatch, showBackground = true }: Props) {
  const { user, profile, signIn } = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [myRoom, setMyRoom] = useState<RoomSummary | null>(null);
  const [polling, setPolling] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [copiedMatchID, setCopiedMatchID] = useState<string | null>(null);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [compactLockedIdentity, setCompactLockedIdentity] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [installExpanded, setInstallExpanded] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // ── Danmaku ──
  const danmakuComments = useSyncExternalStore(
    subscribeDanmaku,
    getDanmakuSnapshot,
  );
  const [danmakuInput, setDanmakuInput] = useState('');

  // ── Name / profile sync ──
  useEffect(() => {
    if (profile?.displayName) {
      setPlayerName(profile.displayName);
    } else if (user?.id) {
      // Try to fetch existing stats
      getPlayerStats(user.id).then((stats) => {
        if (stats?.displayName) setPlayerName(stats.displayName);
      });
    }
  }, [profile?.displayName, user?.id]);

  // ── Persist last-used name in localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem('flower-game:last-name');
    if (saved) setPlayerName(saved);
  }, []);

  useEffect(() => {
    if (playerName.trim()) {
      localStorage.setItem('flower-game:last-name', playerName.trim());
    }
  }, [playerName]);

  // ── Compact mode when scrolled ──
  useEffect(() => {
    const el = document.querySelector('.lobby-shell');
    if (!el) return;
    const handler = () => setCompactLockedIdentity(el.scrollTop > 30);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  // ── Room list polling ──
  const refreshRooms = useCallback(async () => {
    try {
      const list = await listRooms();
      setRooms(list);
    } catch (err) {
      console.warn('Room list error:', err);
    }
  }, []);

  useEffect(() => {
    refreshRooms();
    const id = setInterval(refreshRooms, 3000);
    return () => clearInterval(id);
  }, [refreshRooms]);

  // ── Restore stored match seat ──
  useEffect(() => {
    if (!storedMatch || myRoom) return;
    refreshRoom(storedMatch.matchID).then((room) => {
      if (room) setMyRoom(room);
    });
  }, [storedMatch, myRoom]);

  // ── Poll my room ──
  useEffect(() => {
    if (!myRoom || polling) return;
    setPolling(true);
    const id = setInterval(async () => {
      const room = await refreshRoom(myRoom.matchID);
      if (!room) {
        setMyRoom(null);
        setPolling(false);
        clearInterval(id);
        return;
      }
      setMyRoom(room);
    }, 2000);
    return () => {
      setPolling(false);
      clearInterval(id);
    };
  }, [myRoom?.matchID]);

  // ── Create room ──
  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const name = playerName.trim() || 'Guest';
      const { matchID, playerID, playerCredentials } = await createWaitingRoom(
        generateRoomName(),
        MIN_PLAYERS,
        MAX_PLAYERS,
      );
      await joinMatch(matchID, playerID, name, playerCredentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  // ── Join room ──
  async function handleJoinRoom(matchID: string) {
    setLoading(true);
    setError(null);
    try {
      const name = playerName.trim() || 'Guest';
      // Find the first open seat
      const room = await refreshRoom(matchID);
      if (!room) throw new Error('Room not found');
      if (room.gameover) throw new Error('This room has already finished.');

      const takenIDs = new Set(room.players.map((p) => String(p.id)));
      let seatID = '0';
      for (let i = 0; i < room.maxPlayers; i++) {
        if (!takenIDs.has(String(i))) {
          seatID = String(i);
          break;
        }
      }
      if (takenIDs.has(seatID)) throw new Error('No open seats');

      const res = await fetch(`${SERVER}/rooms/${matchID}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerID: seatID,
          playerName: name,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Join failed (${res.status})`);
      }
      const { playerCredentials } = await res.json() as { playerCredentials: string };
      await joinMatch(matchID, seatID, name, playerCredentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }

  // ── Spectate room ──
  async function handleSpectateRoom(matchID: string) {
    onSpectate(matchID);
  }

  // ── Leave room ──
  async function handleLeaveRoom() {
    if (!myRoom) return;
    try {
      const seat = myRoom.players.find((p) => p.name === playerName.trim());
      if (!seat) {
        setMyRoom(null);
        return;
      }
      await fetch(`${SERVER}/rooms/${myRoom.matchID}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID: seat.id }),
      });
    } catch (err) {
      console.warn('Leave room error:', err);
    } finally {
      setMyRoom(null);
    }
  }

  // ── Start match ──
  async function handleStart() {
    if (!myRoom) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER}/rooms/${myRoom.matchID}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Start failed (${res.status})`);
      }
      // Room will transition to 'started' state
      const room = await refreshRoom(myRoom.matchID);
      if (room) setMyRoom(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
    } finally {
      setLoading(false);
    }
  }

  // ── Copy match ID to clipboard ──
  async function copyMatchID(matchID: string) {
    try {
      await navigator.clipboard.writeText(matchID);
      setCopiedMatchID(matchID);
      setTimeout(() => setCopiedMatchID(null), 2000);
    } catch {
      setCopiedMatchID(null);
    }
  }

  // ──── Auth helpers ──

  async function joinMatch(
    matchID: string,
    playerID: string,
    name: string,
    credentials: string,
  ) {
    // If authenticated, sync display name
    if (user?.id && name.trim()) {
      try {
        await updatePlayerDisplayName(user.id, name.trim());
      } catch (err) {
        console.warn('Failed to update display name:', err);
      }
    }
    onJoin(matchID, playerID, name, credentials);
  }

  async function handleGoogleSignIn() {
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handlePointerLeave() {
    setCursorPos(null);
  }

  // ──── Danmaku submit ──

  function handleDanmakuSend(e: React.FormEvent) {
    e.preventDefault();
    const text = danmakuInput.trim();
    if (!text) return;
    if (text.length > 100) {
      setError('Comment too long (max 100 chars)');
      return;
    }
    const lastSend = getLastDanmakuSendAt();
    if (lastSend && Date.now() - lastSend < DANMAKU_SEND_COOLDOWN_MS) {
      setError('Please wait a moment before sending another comment');
      return;
    }
    setLastDanmakuSendAt(Date.now());
    const lane = assignDanmakuLane();
    if (lane === -1) return;
    occupyLane(lane);
    const duration =
      DANMAKU_MIN_DURATION +
      Math.random() * (DANMAKU_MAX_DURATION - DANMAKU_MIN_DURATION);
    const comment: DanmakuComment = {
      id: crypto.randomUUID(),
      text,
      color: getWhimsicalColor(),
      lane,
      duration,
      timestamp: Date.now(),
    };
    addDanmakuComment(comment);
    setDanmakuInput('');
    cleanupDanmakuComments();
  }

  // ──── Leaderboard ──

  async function handleOpenLeaderboard() {
    setShowLeaderboard(true);
    setLeaderboardLoading(true);
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data);
    } finally {
      setLeaderboardLoading(false);
    }
  }

  return (
    <div
      className="lobby-shell"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={showBackground
        ? { position: 'relative' }
        : { position: 'relative', background: 'radial-gradient(circle at 50% 30%, #93FFE8 0%, #C3FDB8 40%, #7ec8e3 100%)' }}
    >
      {showBackground ? (
        <GrassField
          season="spring"
          scrollX={0}
          scrollY={0}
          zoom={1}
          cursorPos={cursorPos}
          className="lobby-grass"
        />
      ) : (
        <GrassFieldCSS />
      )}
      <div className="lobby-card" style={{ zIndex: 1 }}>
        {/* Hero banner with animated GIF */}
        <section className="lobby-hero-gif">
          <img
            src="/flower_game.gif"
            alt="Flower Game"
            className="lobby-hero-image"
            draggable={false}
          />
          <div className="lobby-install-anchor">
            <button
              type="button"
              className="lobby-install-button"
              onClick={() => setInstallExpanded((v) => !v)}
              aria-expanded={installExpanded}
              aria-controls="install-hint"
            >
              📲 Install App
            </button>
            {installExpanded && (
              <div className="lobby-install-hint" id="install-hint" role="note">
                <div className="lobby-install-hint__title">Install on iPhone</div>
                <ol>
                  <li>Tap the <strong>Share</strong> button in Safari</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* Auth + Name */}
        <section className="lobby-auth-center">
          {user ? (
            <div className="lobby-name-gif-wrapper">
              {isEditingName ? (
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                  }}
                  autoFocus
                  maxLength={20}
                  className="lobby-auth-name-input"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="lobby-auth-name-display"
                >
                  {playerName || 'Guest'}
                  <span className="lobby-auth-name-edit">✎</span>
                </button>
              )}
              <div className="lobby-name-glow" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />

              <div className="lobby-auth-buttons">
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--signin"
                  onClick={handleOpenLeaderboard}
                >
                  🏆 Leaderboard
                </button>
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--how"
                  onClick={() => setHowToPlayOpen(true)}
                >
                  ❓ How to Play
                </button>
              </div>
            </div>
          ) : (
            <div className="lobby-name-gif-wrapper">
              {isEditingName ? (
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false);
                  }}
                  autoFocus
                  maxLength={20}
                  className="lobby-auth-name-input"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="lobby-auth-name-display"
                >
                  {playerName || 'Guest'}
                  <span className="lobby-auth-name-edit">✎</span>
                </button>
              )}
              <div className="lobby-name-glow" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />
              <span className="lobby-sparkle" aria-hidden="true" />

              <div className="lobby-auth-buttons">
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--signin"
                  onClick={handleGoogleSignIn}
                >
                  Sign in with Google
                </button>
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--how"
                  onClick={() => setHowToPlayOpen(true)}
                >
                  ❓ How to Play
                </button>
              </div>
            </div>
          )}

          {compactLockedIdentity && (
            <div className="lobby-identity-stub" />
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="lobby-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {/* My Room */}
        {myRoom && (
          <div className="lobby-my-room lobby-panel">
            <h3>
              <span className="lobby-room-icon">🌸</span>
              {myRoom.roomName}
            </h3>
            <div className="lobby-room-players">
              {Array.from({ length: myRoom.maxPlayers }, (_, i) => {
                const p = myRoom!.players.find((pl) => String(pl.id) === String(i));
                return (
                  <div key={i} className={`lobby-seat${p ? ' occupied' : ''}`}>
                    <span className="lobby-seat-avatar">
                      {p ? '👤' : '➕'}
                    </span>
                    <span className="lobby-seat-name">
                      {p?.name ?? 'Open'}
                    </span>
                    {p?.isConnected === false && (
                      <span className="lobby-seat-offline" title="Offline">
                        ⚠️
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="lobby-room-actions">
              {!myRoom.started && (
                <button
                  type="button"
                  className="lobby-btn lobby-btn--start"
                  onClick={handleStart}
                  disabled={loading || myRoom.joinedCount < myRoom.minPlayers}
                >
                  {loading ? 'Starting…' : '▶ Start'}
                </button>
              )}
              <button
                type="button"
                className="lobby-btn lobby-btn--leave"
                onClick={handleLeaveRoom}
              >
                Leave
              </button>
            </div>
          </div>
        )}

        {/* Create / Join */}
        {!myRoom && (
          <div className="lobby-actions lobby-panel">
            <button
              type="button"
              className="lobby-create-btn"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating…' : '🌱 Create Garden'}
            </button>

            {/* How-to-play mini card */}
            <div
              className="lobby-hint-card"
              onClick={() => setHowToPlayOpen(true)}
              role="button"
              tabIndex={0}
            >
              <div className="lobby-hint-emoji">❓</div>
              <div className="lobby-hint-text">
                <strong>New here?</strong>
                <span>Tap to learn how to play</span>
              </div>
              <div className="lobby-hint-arrow">→</div>
            </div>

            {/* Leaderboard mini card */}
            <div
              className="lobby-hint-card"
              onClick={handleOpenLeaderboard}
              role="button"
              tabIndex={0}
            >
              <div className="lobby-hint-emoji">🏆</div>
              <div className="lobby-hint-text">
                <strong>Leaderboard</strong>
                <span>See top players</span>
              </div>
              <div className="lobby-hint-arrow">→</div>
            </div>
          </div>
        )}

        {/* Room List */}
        {!myRoom && (
          <div className="lobby-rooms">
            <div className="lobby-lobby-title">
              <span className="lobby-lobby-label">🌸 Lobby</span>
              <span className="lobby-room-count">
                {rooms.length} garden{rooms.length !== 1 ? 's' : ''}
              </span>
            </div>
            {loading && rooms.length === 0 ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : rooms.length === 0 ? (
              <div className="lobby-empty">
                <p>No gardens yet.</p>
                <p>Be the first to plant one! 🌱</p>
              </div>
            ) : (
              rooms.map((room) => (
                <div key={room.matchID} className="lobby-room-card">
                  <div className="lobby-room-header">
                    <span className="lobby-room-name">{room.roomName}</span>
                    <span className="lobby-room-meta">
                      {room.joinedCount}/{room.maxPlayers} · {timeAgo(room.updatedAt)}
                    </span>
                  </div>
                  <div className="lobby-room-seats">
                    {Array.from({ length: room.maxPlayers }, (_, i) => {
                      const p = room.players.find((pl) => String(pl.id) === String(i));
                      return (
                        <div key={i} className={`lobby-seat${p ? ' occupied' : ''}`}>
                          <span className="lobby-seat-avatar">
                            {p ? '👤' : '➕'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="lobby-room-actions">
                    {room.openSeatCount > 0 && !room.started && (
                      <button
                        type="button"
                        className="lobby-btn lobby-btn--join"
                        onClick={() => handleJoinRoom(room.matchID)}
                      >
                        Join
                      </button>
                    )}
                    <button
                      type="button"
                      className="lobby-btn lobby-btn--spectate"
                      onClick={() => handleSpectateRoom(room.matchID)}
                    >
                      👁 Watch
                    </button>
                    <button
                      type="button"
                      className="lobby-btn lobby-btn--copy"
                      onClick={() => copyMatchID(room.matchID)}
                    >
                      {copiedMatchID === room.matchID ? '✓ Copied' : 'Copy ID'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Danmaku ── */}
        <div className="lobby-danmaku-section">
          <div className="lobby-danmaku-header">
            <span className="lobby-danmaku-title">💬 Live Comments</span>
            <span className="lobby-danmaku-count">
              {danmakuComments.length}/{DANMAKU_MAX_COMMENTS}
            </span>
          </div>

          <div className="lobby-danmaku-lane-box">
            {Array.from({ length: 6 }, (_, laneIndex) => (
              <div
                key={laneIndex}
                className="danmaku-lane"
                style={{ top: DANMAKU_TOP_OFFSET + laneIndex * DANMAKU_LANE_HEIGHT }}
              >
                {danmakuComments
                  .filter((c) => c.lane === laneIndex)
                  .map((comment) => (
                    <div
                      key={comment.id}
                      className="danmaku-comment"
                      style={{
                        color: comment.color,
                        animationDuration: `${comment.duration}s`,
                      }}
                    >
                      {comment.text}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <form className="lobby-danmaku-form" onSubmit={handleDanmakuSend}>
            <input
              type="text"
              value={danmakuInput}
              onChange={(e) => setDanmakuInput(e.target.value)}
              placeholder="Say something whimsical…"
              maxLength={100}
              className="lobby-danmaku-input"
            />
            <button type="submit" className="lobby-danmaku-send">
              Send
            </button>
          </form>
        </div>

        {/* Footer */}
        <footer className="lobby-footer">
          <p>Flower Game v1.0 · {new Date().getFullYear()}</p>
        </footer>
      </div>

      {/* How to Play Modal */}
      {howToPlayOpen && (
        <HowToPlay onClose={() => setHowToPlayOpen(false)} />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="leaderboard-overlay" onClick={() => setShowLeaderboard(false)}>
          <div className="leaderboard-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="leaderboard-close"
              onClick={() => setShowLeaderboard(false)}
            >
              ✕
            </button>
            <h2 className="leaderboard-title">🏆 Leaderboard</h2>
            {leaderboardLoading ? (
              <div className="leaderboard-loading">Loading…</div>
            ) : leaderboard.length === 0 ? (
              <div className="leaderboard-empty">
                <p>No players yet.</p>
                <p>Be the first! 🌱</p>
              </div>
            ) : (
              <div className="leaderboard-list">
                {leaderboard.map((entry) => (
                  <div key={entry.accountId ?? entry.displayName} className="leaderboard-row">
                    <span className="leaderboard-rank">#{entry.rank}</span>
                    <span className="leaderboard-name">{entry.displayName}</span>
                    <span className="leaderboard-wins">{entry.gamesWon} wins</span>
                    <span className="leaderboard-rate">
                      {Math.round(entry.winRate * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
