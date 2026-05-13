// ============================================================
// FLOWER GAME — LOBBY
// Create or join a match via boardgame.io Lobby API.
// ============================================================

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { MatchInfo } from '../auth/storage';
import { CardArtManager } from '../cards/CardArtManager';

const SERVER = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'http://localhost:8000';
  }
  // Production / tunnel / Railway: same origin (server serves static files + API)
  return window.location.origin;
})();
const IDENTITY_SERVER = import.meta.env.VITE_IDENTITY_SERVER_URL?.trim() || '';
const GAME   = 'flower-game';

interface Props {
  onJoin: (matchID: string, playerID: string, playerName: string, credentials: string) => void;
  storedMatch: MatchInfo | null;
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

function toSafeStatNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizePlayerStats(raw: Partial<PlayerStats> | null | undefined): PlayerStats | null {
  if (!raw) return null;
  const gamesPlayed = toSafeStatNumber(raw.gamesPlayed);
  const gamesWon = toSafeStatNumber(raw.gamesWon);
  const flowersPlanted = toSafeStatNumber(raw.flowersPlanted);
  const winRate = typeof raw.winRate === 'number' && Number.isFinite(raw.winRate)
    ? raw.winRate
    : gamesPlayed > 0
      ? Number((gamesWon / gamesPlayed).toFixed(3))
      : 0;

  return {
    accountId: typeof raw.accountId === 'string' ? raw.accountId : null,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    displayName: typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName.trim()
      : 'Flower Player',
    flowersPlanted,
    gamesPlayed,
    gamesWon,
    lastPlayedAt: typeof raw.lastPlayedAt === 'string' ? raw.lastPlayedAt : null,
    lastWonAt: typeof raw.lastWonAt === 'string' ? raw.lastWonAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    winRate,
  };
}

function normalizeLeaderboardEntry(raw: Partial<LeaderboardEntry> | null | undefined, index: number): LeaderboardEntry | null {
  const stats = normalizePlayerStats(raw);
  if (!stats) return null;
  return {
    ...stats,
    rank: toSafeStatNumber(raw?.rank) || index + 1,
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const btn: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 15,
};

function formatTime(ts?: number): string {
  if (!ts) return 'just now';
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function formatRelativeDate(value: string | null): string {
  if (!value) return 'No matches yet';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Recently';
  return formatTime(timestamp);
}

function formatDateOnly(value: string | null): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString();
}

function formatWinRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function providerLabel(provider: string, isGuest: boolean): string {
  if (isGuest) return 'Guest';
  if (provider === 'google') return 'Google';
  if (provider === 'apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function Lobby({ onJoin, storedMatch }: Props) {
  const {
    configured,
    error: authError,
    loading: authLoading,
    notice: authNotice,
    dismissNotice,
    profile,
    continueAsGuest,
    getAccessToken,
    signInWithGoogle,
    signOut,
    updateDisplayName,
  } = useAuth();
  const [name, setName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [matchID, setMatchID] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [joinByIdOpen, setJoinByIdOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<'play' | 'leaderboard'>('play');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [copiedMatchId, setCopiedMatchId] = useState('');
  const [error, setError] = useState('');
  const [designerOpen, setDesignerOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const canShowInstallButton = !isStandalone && (!!deferredInstallPrompt || (isIos && isSafari));

  function buildGameHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async function buildIdentityHeaders(): Promise<Record<string, string>> {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Your sign-in session expired. Please sign in again.');
    }

    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async function readJsonOrNull<T>(res: Response): Promise<T | null> {
    try {
      return await res.json() as T;
    } catch {
      return null;
    }
  }

  async function createMatchViaGameServer(trimmedName: string, trimmedRoomName: string): Promise<void> {
    const res = await fetch(`${SERVER}/games/${GAME}/create`, {
      method:  'POST',
      headers: buildGameHeaders(),
      body:    JSON.stringify({
        numPlayers: 6,
        setupData: {
          names: [trimmedName],
          maxPlayers: 6,
          minPlayers: 2,
          roomName: trimmedRoomName || `${trimmedName}'s room`,
        },
      }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const { matchID: mid } = await res.json() as { matchID: string };

    const joinRes = await fetch(`${SERVER}/games/${GAME}/${mid}/join`, {
      method:  'POST',
      headers: buildGameHeaders(),
      body:    JSON.stringify({ playerID: '0', playerName: trimmedName }),
    });
    if (!joinRes.ok) throw new Error('Could not join as player 0');
    const { playerCredentials } = await joinRes.json() as { playerCredentials: string };

    await claimSeatIdentity(mid, '0', trimmedName);
    onJoin(mid, '0', trimmedName, playerCredentials);
  }

  async function joinMatchViaGameServer(targetMatchID: string, resolvedName: string): Promise<void> {
    const res = await fetch(`${SERVER}/rooms/${encodeURIComponent(targetMatchID)}`);
    if (!res.ok) throw new Error('Match not found');
    const match = await res.json() as RoomSummary;
    if (match.gameover) throw new Error('That room has already finished.');
    if (match.started) throw new Error('Game already started. Only seated players can rejoin.');
    const players = match.players ?? [];
    const myExistingSeat = players.find(p => p.name?.trim().toLowerCase() === resolvedName.toLowerCase());
    if (myExistingSeat) throw new Error(`You're already seated in this match. Refresh the page to reconnect — your session is saved.`);
    const openSeat = players.find(player => !player.name);
    if (!openSeat) {
      throw new Error('No open seats in that match');
    }

    const joinRes = await fetch(`${SERVER}/games/${GAME}/${targetMatchID}/join`, {
      method:  'POST',
      headers: buildGameHeaders(),
      body:    JSON.stringify({ playerID: String(openSeat.id), playerName: resolvedName }),
    });
    if (!joinRes.ok) throw new Error('Could not join that room');

    const { playerCredentials } = await joinRes.json() as { playerCredentials: string };
    await claimSeatIdentity(targetMatchID, String(openSeat.id), resolvedName);
    onJoin(targetMatchID, String(openSeat.id), resolvedName, playerCredentials);
  }

  async function claimSeatIdentity(matchId: string, playerId: string, playerName: string): Promise<void> {
    if (!IDENTITY_SERVER || !profile || profile.isGuest) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    try {
      await fetch(`${IDENTITY_SERVER}/api/seat-claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          matchId,
          playerId,
          playerName,
          provider: profile.provider,
          isGuest: profile.isGuest,
        }),
      });
    } catch {
      // The match flow should keep working even if the identity bridge is unavailable.
    }
  }

  async function loadRooms() {
    setLoadingRooms(true);
    try {
      const res = await fetch(`${SERVER}/rooms`);
      if (!res.ok) throw new Error(`Could not load rooms (${res.status})`);
      const data = await res.json() as LobbyListResponse;
      setRooms(data.rooms ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRooms(false);
    }
  }

  async function loadLeaderboard() {
    if (!IDENTITY_SERVER) {
      setLeaderboard([]);
      setLeaderboardError('');
      return;
    }

    setLeaderboardLoading(true);
    try {
      const res = await fetch(`${IDENTITY_SERVER}/api/leaderboard?limit=10`);
      const data = await res.json() as { error?: string; leaderboard?: LeaderboardEntry[] };
      if (!res.ok) throw new Error(data.error || `Could not load leaderboard (${res.status})`);
      setLeaderboard(
        (data.leaderboard ?? [])
          .map((entry, index) => normalizeLeaderboardEntry(entry, index))
          .filter((entry): entry is LeaderboardEntry => Boolean(entry)),
      );
      setLeaderboardError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not load leaderboard.';
      setLeaderboardError(message);
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function loadMyStats() {
    if (!IDENTITY_SERVER || !profile || profile.isGuest) {
      setMyStats(null);
      return;
    }

    try {
      const res = await fetch(`${IDENTITY_SERVER}/api/me/stats`, {
        headers: await buildIdentityHeaders(),
      });
      const data = await res.json() as { error?: string; stats?: PlayerStats };
      if (!res.ok) throw new Error(data.error || `Could not load your stats (${res.status})`);
      setMyStats(normalizePlayerStats(data.stats));
    } catch {
      setMyStats(null);
    }
  }

  useEffect(() => {
    void loadRooms();
    const interval = window.setInterval(() => {
      void loadRooms();
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadLeaderboard();
    const interval = window.setInterval(() => {
      void loadLeaderboard();
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadMyStats();
  }, [profile?.id, profile?.isGuest]);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  useEffect(() => {
    const suggestedName = profile?.displayName?.trim();
    if (!suggestedName) return;
    if (!profile || profile.isGuest) {
      if (!nameTouched || !name.trim()) {
        setName(suggestedName);
      }
      return;
    }
    if (!nameTouched || !name.trim()) {
      setName(suggestedName);
    }
  }, [nameTouched, name, profile]);

  useEffect(() => {
    if (!profile) {
      setProfileDisplayName('');
      setProfileFeedback('');
      return;
    }
    setProfileDisplayName(profile.displayName);
    setProfileFeedback('');
  }, [profile?.id, profile?.displayName]);

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewport?.getAttribute('content') ?? '';

    viewport?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );

    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener('gesturestart', preventGesture, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      if (viewport) viewport.setAttribute('content', previousViewport);
    };
  }, []);

  useEffect(() => {
    const syncStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
      if (standalone) setInstallHintOpen(false);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallHintOpen(false);
      syncStandalone();
    };

    syncStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('resize', syncStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('resize', syncStandalone);
    };
  }, []);

  async function handleAddToHomeScreen() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } finally {
        setDeferredInstallPrompt(null);
      }
      return;
    }
    setInstallHintOpen(open => !open);
  }

  async function handleSaveProfileName() {
    const trimmedName = profileDisplayName.trim();
    if (!profile || !trimmedName || profileSaving) return;

    setProfileSaving(true);
    setProfileFeedback('');

    try {
      await updateDisplayName(trimmedName);
      setProfileFeedback(
        profile.displayNameConfirmed
          ? 'Username updated. You can change it again after 90 days.'
          : 'Username chosen. You can change it again after 90 days.',
      );
      if (profile.isGuest || !profile.displayNameConfirmed) {
        setName(trimmedName);
      }
      void loadMyStats();
      void loadLeaderboard();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save username.';
      setProfileFeedback(message);
      setError(message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function copyMatchId(matchId: string) {
    try {
      await navigator.clipboard.writeText(matchId);
      setCopiedMatchId(matchId);
      window.setTimeout(() => {
        setCopiedMatchId(current => (current === matchId ? '' : current));
      }, 1600);
    } catch {
      setError('Could not copy room ID.');
    }
  }

  async function createMatch() {
    const resolvedName = profile && !profile.isGuest
      ? profile.displayName.trim()
      : name.trim() || profile?.displayName?.trim() || '';
    if (!resolvedName) { setError('Enter your name first'); return; }
    if (profile && !profile.isGuest && !profile.displayNameConfirmed) {
      setError('Choose your username before creating a match.');
      return;
    }
    setLoading(true); setError('');
    try {
      if (!profile) {
        await continueAsGuest(resolvedName);
      }
      const trimmedName = resolvedName;
      const trimmedRoomName = roomName.trim();
      if (profile && !profile.isGuest && IDENTITY_SERVER) {
        let trustedRes: Response;
        try {
          trustedRes = await fetch(`${IDENTITY_SERVER}/api/matches/create`, {
            method: 'POST',
            headers: await buildIdentityHeaders(),
            body: JSON.stringify({
              playerName: trimmedName,
              roomName: trimmedRoomName || `${trimmedName}'s room`,
            }),
          });
        } catch (trustedError) {
          await createMatchViaGameServer(trimmedName, trimmedRoomName);
          return;
        }

        const trustedData = await readJsonOrNull<{
          error?: string;
          matchID?: string;
          playerCredentials?: string;
          playerID?: string;
          playerName?: string;
        }>(trustedRes);
        if (!trustedRes.ok || !trustedData?.matchID || !trustedData.playerCredentials || !trustedData.playerID) {
          throw new Error(trustedData?.error || `Server error ${trustedRes.status}`);
        }

        onJoin(
          trustedData.matchID,
          trustedData.playerID,
          trustedData.playerName || trimmedName,
          trustedData.playerCredentials,
        );
        return;
      }
      await createMatchViaGameServer(trimmedName, trimmedRoomName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function joinMatch(requestedMatchID?: string) {
    const targetMatchID = requestedMatchID ?? matchID.trim();
    const resolvedName = profile && !profile.isGuest
      ? profile.displayName.trim()
      : name.trim() || profile?.displayName?.trim() || '';
    if (!resolvedName) { setError('Enter your name first'); return; }
    if (profile && !profile.isGuest && !profile.displayNameConfirmed) {
      setError('Choose your username before joining a match.');
      return;
    }
    if (!targetMatchID) { setError('Enter a Match ID'); return; }
    setLoading(true); setError('');
    try {
      if (!profile) {
        await continueAsGuest(resolvedName);
      }
      if (profile && !profile.isGuest && IDENTITY_SERVER) {
        let trustedRes: Response;
        try {
          trustedRes = await fetch(`${IDENTITY_SERVER}/api/matches/${encodeURIComponent(targetMatchID)}/join`, {
            method: 'POST',
            headers: await buildIdentityHeaders(),
            body: JSON.stringify({
              playerName: resolvedName,
            }),
          });
        } catch (trustedError) {
          await joinMatchViaGameServer(targetMatchID, resolvedName);
          return;
        }

        const trustedData = await readJsonOrNull<{
          error?: string;
          matchID?: string;
          playerCredentials?: string;
          playerID?: string;
          playerName?: string;
        }>(trustedRes);
        if (!trustedRes.ok || !trustedData?.matchID || !trustedData.playerCredentials || !trustedData.playerID) {
          throw new Error(trustedData?.error || 'Could not join that room');
        }

        onJoin(
          trustedData.matchID,
          trustedData.playerID,
          trustedData.playerName || resolvedName,
          trustedData.playerCredentials,
        );
        return;
      }
      await joinMatchViaGameServer(targetMatchID, resolvedName);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      void loadRooms();
    } finally {
      setLoading(false);
    }
  }

  const openRooms = rooms.filter(match => !match.gameover && !match.started && match.openSeatCount > 0);
  const finishedRooms = rooms.filter(match => !!match.gameover);
  const canSaveProfileName = Boolean(
    profile
    && profileDisplayName.trim()
    && (
      !profile.displayNameConfirmed
      || (profile.canChangeDisplayName && profileDisplayName.trim() !== profile.displayName.trim())
    ),
  );
  const showSocialActions = !profile || profile.isGuest;
  const socialButtonsDisabled = authLoading || !configured;
  const socialHint = configured
    ? 'Social login is ready when you want to save your identity beyond this device.'
    : 'Add Supabase URL and anon key to turn on Google and Apple sign-in.';
  const highlightedLeaderboardEntry = profile && !profile.isGuest
    ? leaderboard.find(entry => entry.accountId === myStats?.accountId)
    : null;
  const usernameLockedDate = formatDateOnly(profile?.displayNameLockedUntil ?? null);
  const signedInNeedsUsername = Boolean(profile && !profile.isGuest && !profile.displayNameConfirmed);
  const usernameLocked = Boolean(
    profile
    && !profile.isGuest
    && profile.displayNameConfirmed
    && !profile.canChangeDisplayName,
  );
  const compactLockedIdentity = Boolean(profile && !profile.isGuest && profile.displayNameConfirmed && usernameLocked);

  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        {storedMatch && (
          <div className="lobby-resume-banner">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#4ecca3' }}>Resume last game</div>
              <div style={{ fontSize: 12, color: '#7d5470', marginTop: 2 }}>
                Match <span style={{ color: '#eee', fontFamily: 'monospace' }}>{storedMatch.matchID}</span> as <b style={{ color: '#eee' }}>{storedMatch.playerName}</b>
              </div>
            </div>
            <button
              onClick={() => onJoin(storedMatch.matchID, storedMatch.playerID, storedMatch.playerName, storedMatch.credentials)}
              style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', padding: '8px 18px', fontSize: 13 }}
            >
              Reconnect
            </button>
          </div>
        )}
        <section className="lobby-hero">
          <div className="lobby-hero-copy">
            <div className="lobby-kicker">Play online</div>
            <h1 className="app-title" style={{ fontSize: 32, marginBottom: 4 }}>Flower Game</h1>
          </div>
          {canShowInstallButton && (
            <div className="lobby-install-anchor">
              <button
                type="button"
                className="lobby-install-button"
                onClick={() => void handleAddToHomeScreen()}
              >
                Add to Home Screen
              </button>
              {installHintOpen && !deferredInstallPrompt && (
                <div className="lobby-install-hint" role="note">
                  <div className="lobby-install-hint__title">Install on iPhone</div>
                  <div>Tap Share in Safari, then choose Add to Home Screen.</div>
                </div>
              )}
            </div>
          )}
        </section>

        <nav className="lobby-tabs" aria-label="Lobby sections">
          <button
            type="button"
            className={`lobby-tab${activeTab === 'play' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('play')}
          >
            Play
          </button>
          <button
            type="button"
            className={`lobby-tab${activeTab === 'leaderboard' ? ' is-active' : ''}`}
            onClick={() => {
              setActiveTab('leaderboard');
              void loadLeaderboard();
              void loadMyStats();
            }}
          >
            Leaderboard
          </button>
        </nav>

        {activeTab === 'play' ? (
        <div className="lobby-grid">
          <div className="lobby-actions-column">
            <div className={`lobby-identity-card${compactLockedIdentity ? ' is-compact' : ''}`}>
              <div className="lobby-auth-header">
                <div className="lobby-auth-copy">
                  <div className="lobby-field-label">{profile ? 'Identity' : 'Sign In'}</div>
                  <div className="lobby-auth-status">
                    {authLoading
                      ? 'Checking session...'
                      : profile
                        ? `${providerLabel(profile.provider, profile.isGuest)} session`
                        : 'Choose a social login or continue as guest'}
                  </div>
                </div>
                {profile && !compactLockedIdentity && (
                  <div className="lobby-auth-chip">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt={profile.displayName} className="lobby-auth-avatar" draggable={false} />
                    ) : (
                      <div className="lobby-auth-avatar lobby-auth-avatar--fallback">
                        {profile.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="lobby-auth-chip__name">{profile.displayName}</div>
                      <div className="lobby-auth-chip__meta">{providerLabel(profile.provider, profile.isGuest)}</div>
                    </div>
                  </div>
                )}
              </div>

              {compactLockedIdentity && profile && (
                <div className="lobby-locked-account">
                  <div className="lobby-locked-user">
                    <div className="lobby-locked-username">{profile.displayName}</div>
                    <div className="lobby-locked-meta">
                      {providerLabel(profile.provider, profile.isGuest)}
                      {usernameLockedDate ? ` · change after ${usernameLockedDate}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={authLoading}
                    className="lobby-pill-button lobby-pill-button--ghost lobby-pill-button--mini"
                  >
                    Sign Out
                  </button>
                </div>
              )}

              <div className="lobby-auth-actions">
                {!profile && (
                  <button
                    type="button"
                    onClick={() => void continueAsGuest(name.trim())}
                    disabled={authLoading}
                    className="lobby-pill-button lobby-pill-button--soft"
                  >
                    Continue as Guest
                  </button>
                )}
                {showSocialActions && (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    disabled={socialButtonsDisabled}
                    className="lobby-pill-button"
                    aria-disabled={socialButtonsDisabled}
                  >
                    {profile?.isGuest ? 'Sign in with Google' : 'Continue with Google'}
                  </button>
                )}
                {profile && !compactLockedIdentity && (
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={authLoading}
                    className="lobby-pill-button lobby-pill-button--ghost"
                  >
                    Sign Out
                  </button>
                )}
              </div>
              {showSocialActions && (
                <div className={`lobby-identity-note${configured ? '' : ' lobby-identity-note--warning'}`}>
                  {socialHint}
                </div>
              )}
              {authNotice && (
                <div className={`lobby-auth-notice is-${authNotice.tone}`}>
                  <span>{authNotice.message}</span>
                  <button
                    type="button"
                    className="lobby-auth-notice__dismiss"
                    onClick={dismissNotice}
                    aria-label="Dismiss auth message"
                  >
                    x
                  </button>
                </div>
              )}

              {profile && !compactLockedIdentity && (
                <div className="lobby-profile-editor">
                  <label className="lobby-field-label">{profile.displayNameConfirmed ? 'Username' : 'Choose Username'}</label>
                  <div className="lobby-inline-field">
                    <input
                      value={profileDisplayName}
                      onChange={event => {
                        setProfileFeedback('');
                        setProfileDisplayName(event.target.value);
                      }}
                      disabled={usernameLocked || profileSaving}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSaveProfileName();
                        }
                      }}
                      placeholder="How your account appears"
                      className="lobby-input"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveProfileName()}
                      disabled={!canSaveProfileName || profileSaving}
                      className="lobby-pill-button lobby-pill-button--soft lobby-inline-field__button"
                    >
                      {profileSaving ? 'Saving...' : usernameLocked ? 'Locked' : profile.displayNameConfirmed ? 'Save' : 'Choose'}
                    </button>
                  </div>
                  <div className="lobby-identity-note">
                    {profile.displayNameConfirmed
                      ? `This username appears in every Flower Game room. Once you set it, you can only change it after 90 days.${profile.canChangeDisplayName ? '' : ` Next change: ${usernameLockedDate || 'soon'}.`}`
                      : 'Pick the username you want to use across every Flower Game room.'}
                  </div>
                  {profileFeedback && (
                    <div className={`lobby-inline-feedback${profileFeedback.includes('chosen') || profileFeedback.includes('updated') ? ' is-success' : ''}`}>
                      {profileFeedback}
                    </div>
                  )}
                </div>
              )}

              {profile && !profile.isGuest && myStats && !compactLockedIdentity && (
                <div className="lobby-player-stats">
                  <div className="lobby-field-label">Your Record</div>
                  <div className="lobby-player-stats__grid">
                    <div className="lobby-stat-tile">
                      <div className="lobby-stat-tile__value">{myStats.gamesWon}</div>
                      <div className="lobby-stat-tile__label">Wins</div>
                    </div>
                    <div className="lobby-stat-tile">
                      <div className="lobby-stat-tile__value">{myStats.gamesPlayed}</div>
                      <div className="lobby-stat-tile__label">Played</div>
                    </div>
                    <div className="lobby-stat-tile">
                      <div className="lobby-stat-tile__value">{formatWinRate(myStats.winRate)}</div>
                      <div className="lobby-stat-tile__label">Win rate</div>
                    </div>
                    <div className="lobby-stat-tile">
                      <div className="lobby-stat-tile__value">{myStats.flowersPlanted}</div>
                      <div className="lobby-stat-tile__label">Flowers</div>
                    </div>
                  </div>
                  <div className="lobby-identity-note">
                    Last match {formatRelativeDate(myStats.lastPlayedAt)}
                  </div>
                </div>
              )}

              {(!profile || profile.isGuest) ? (
                <>
                  <label className="lobby-field-label">Your Name</label>
                  <input
                    value={name}
                    onChange={e => {
                      setNameTouched(true);
                      setName(e.target.value);
                    }}
                    placeholder="e.g. Alice"
                  className="lobby-input"
                />
              </>
              ) : !compactLockedIdentity ? (
                <div className="lobby-identity-note">
                  Your room name uses your username automatically, so every Flower Game match sees the same identity.
                  {signedInNeedsUsername && ' Choose it above before creating or joining a room.'}
                </div>
              ) : null}
            </div>

            <section className="lobby-panel lobby-rooms-panel lobby-rooms-panel--open">
              <div className="lobby-rooms-header">
                <div>
                  <div className="lobby-section-tag">Open Rooms</div>
                  <h3 style={{ margin: 0, color: '#ffd166' }}>Join a live table</h3>
                </div>
                <button
                  onClick={() => void loadRooms()}
                  disabled={loadingRooms}
                  className="lobby-refresh-button"
                >
                  {loadingRooms ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              <div className="lobby-room-list">
                {openRooms.length === 0 && !loadingRooms && (
                  <div className="lobby-empty-state">
                    No open rooms right now. Create one and it will show up here.
                  </div>
                )}

                {openRooms.map(room => {
                  const players = room.players ?? [];
                  const totalSeats = room.maxPlayers;
                  const joinedSeats = room.joinedCount;
                  const openSeats = room.openSeatCount;
                  const creator = players.find(player => String(player.id) === String(room.ownerPlayerId))?.name?.trim()
                    || players.find(player => !!player.name?.trim())?.name?.trim()
                    || 'Unknown';
                  const displayRoomName = room.roomName?.trim() || `${creator}'s room`;
                  const roomIdCopied = copiedMatchId === room.matchID;
                  const roomStatus = room.started ? 'In progress' : 'Waiting';

                  return (
                    <div
                      key={room.matchID}
                      className="lobby-room-card lobby-room-card--open"
                    >
                      <div className="lobby-room-title-row">
                        <div>
                          <div className="lobby-room-name">{displayRoomName}</div>
                          <div className="lobby-room-host">Hosted by {creator} · {roomStatus}</div>
                        </div>
                        <div className="lobby-room-time">{formatTime(room.createdAt ?? undefined)}</div>
                      </div>

                      <div className="lobby-room-meta">
                        <div className="lobby-room-id-row">
                          <span className="lobby-room-id-label">Room ID</span>
                          <span className="lobby-room-id-value">{room.matchID}</span>
                          <button
                            type="button"
                            className="lobby-copy-id-button"
                            onClick={() => void copyMatchId(room.matchID)}
                          >
                            {roomIdCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="lobby-room-capacity">
                          {joinedSeats}/{totalSeats} joined · {openSeats} seat{openSeats === 1 ? '' : 's'} open
                          {` · starts at ${room.minPlayers}`}
                        </div>
                      </div>

                      <div className="lobby-room-seats">
                        {players.map((player, index) => {
                          const occupied = !!player.name?.trim();
                          return (
                            <div
                              key={player.id}
                              className={`lobby-seat-chip${occupied ? ' is-occupied' : ''}`}
                            >
                              <div style={{ marginBottom: 4, color: occupied ? '#7d5470' : '#ad8ba0' }}>Seat {index + 1}</div>
                              <div style={{ fontWeight: 700, color: occupied ? '#6b2e55' : '#ad8ba0' }}>
                                {occupied ? player.name : 'Empty'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="lobby-room-actions">
                        <button
                          onClick={() => {
                            setMatchID(room.matchID);
                            void joinMatch(room.matchID);
                          }}
                          disabled={loading || openSeats <= 0}
                          style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', flex: 1 }}
                        >
                          {loading ? 'Joining…' : 'Join Room'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="lobby-join-toggle">
              <button
                type="button"
                className="lobby-toggle-button"
                onClick={() => setJoinByIdOpen(open => !open)}
                aria-expanded={joinByIdOpen}
              >
                <span>Join by ID</span>
                <span className="lobby-toggle-arrow">{joinByIdOpen ? '−' : '+'}</span>
              </button>

              {joinByIdOpen && (
                <div className="lobby-join-panel">
                  <label className="lobby-field-label">Match ID</label>
                  <input
                    value={matchID}
                    onChange={e => setMatchID(e.target.value)}
                    placeholder="Paste ID"
                    className="lobby-input"
                  />
                  <button
                    onClick={() => void joinMatch()}
                    disabled={loading || signedInNeedsUsername}
                    style={{ ...btn, background: '#4ecca3', color: '#1a1a2e', width: '100%', padding: '10px 14px', fontSize: 14 }}
                  >
                    {loading ? 'Joining...' : 'Join'}
                  </button>
                </div>
              )}
            </div>

            <div className="lobby-actions-grid">
              <section className="lobby-panel lobby-action-card">
                <div className="lobby-section-tag">Create</div>
                <h3 style={{ marginBottom: 8, color: '#e94560' }}>Start a fresh garden</h3>
                <label className="lobby-field-label">Room Name</label>
                <input
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Petal Party"
                  className="lobby-input"
                />
                <div className="lobby-identity-note">
                  Dynamic seating room. Up to 6 players can join, and the game can start once at least 3 are in the room.
                </div>
                <button
                  onClick={createMatch}
                  disabled={loading || signedInNeedsUsername}
                  style={{ ...btn, background: '#e94560', color: '#fff', width: '100%', padding: '10px 14px', fontSize: 14 }}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </section>
            </div>
          </div>

          <div className="lobby-right-column">
            <section className="lobby-panel lobby-rooms-panel lobby-rooms-panel--finished">
              <div className="lobby-rooms-header">
                <div>
                  <div className="lobby-section-tag">Finished Rooms</div>
                  <h3 style={{ margin: 0, color: '#ffd166' }}>Recent winners</h3>
                </div>
              </div>

              <div className="lobby-room-list">
                {finishedRooms.length === 0 && !loadingRooms && (
                  <div style={{ color: '#7d5470', fontSize: 13, padding: '8px 2px' }}>
                    No finished rooms yet.
                  </div>
                )}

                {finishedRooms.map(room => {
                  const players = room.players ?? [];
                  const creator = players.find(player => String(player.id) === String(room.ownerPlayerId))?.name?.trim()
                    || players.find(player => !!player.name?.trim())?.name?.trim()
                    || 'Unknown';
                  const displayRoomName = room.roomName?.trim() || `${creator}'s room`;
                  const winnerPlayer = players.find(player => String(player.id) === String(room.winner ?? ''));
                  const winnerLabel = winnerPlayer?.name?.trim() || 'Unknown';

                  return (
                    <div key={room.matchID} className="lobby-room-card lobby-room-card--finished">
                      <div className="lobby-room-title-row">
                        <div>
                          <div className="lobby-room-name">{displayRoomName}</div>
                          <div className="lobby-room-host">Winner: {winnerLabel}</div>
                        </div>
                        <div style={{ color: '#7d5470', fontSize: 12, marginLeft: 'auto' }}>{formatTime(room.updatedAt ?? room.createdAt ?? undefined)}</div>
                      </div>

                      <div style={{ color: '#7d5470', fontSize: 13, lineHeight: 1.5 }}>
                        <div>Match ID: <span style={{ color: '#6b2e55', fontFamily: 'monospace', fontWeight: 700 }}>{room.matchID}</span></div>
                        <div>{room.joinedCount} player{room.joinedCount === 1 ? '' : 's'} seated</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
        ) : (
          <section className="lobby-panel lobby-leaderboard-page">
            <div className="lobby-page-head">
              <div>
                <div className="lobby-section-tag">Leaderboard</div>
                <h2 className="lobby-page-title">Season board</h2>
              </div>
              <button
                onClick={() => {
                  void loadLeaderboard();
                  void loadMyStats();
                }}
                disabled={leaderboardLoading}
                className="lobby-refresh-button"
              >
                {leaderboardLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {profile && !profile.isGuest && myStats && (
              <div className="lobby-leaderboard-me">
                <div>
                  <div className="lobby-field-label">Your Record</div>
                  <div className="lobby-leaderboard-me__name">{myStats.displayName}</div>
                </div>
                <div className="lobby-leaderboard-me__stats">
                  <span>{myStats.gamesWon} wins</span>
                  <span>{myStats.gamesPlayed} played</span>
                  <span>{myStats.flowersPlanted} flowers</span>
                  <span>{formatWinRate(myStats.winRate)} win rate</span>
                </div>
              </div>
            )}

            <div className="lobby-leaderboard-list lobby-leaderboard-list--page">
              <div className="lobby-leaderboard-columns" aria-hidden="true">
                <span>Rank</span>
                <span>Player</span>
                <span>Wins</span>
                <span>Played</span>
                <span>Flowers</span>
                <span>Rate</span>
              </div>
              {leaderboardError && (
                <div className="lobby-inline-feedback">{leaderboardError}</div>
              )}
              {!leaderboardError && leaderboard.length === 0 && !leaderboardLoading && (
                <div className="lobby-empty-state">
                  No completed matches yet. The board will populate after the first recorded win.
                </div>
              )}

              {leaderboard.map(entry => (
                <div
                  key={entry.accountId ?? `${entry.rank}-${entry.displayName}`}
                  className={`lobby-leaderboard-row${highlightedLeaderboardEntry?.accountId === entry.accountId ? ' is-current' : ''}`}
                >
                  <div className="lobby-leaderboard-rank">#{entry.rank}</div>
                  <div className="lobby-leaderboard-name">{entry.displayName}</div>
                  <div className="lobby-leaderboard-stat">{entry.gamesWon}</div>
                  <div className="lobby-leaderboard-stat">{entry.gamesPlayed}</div>
                  <div className="lobby-leaderboard-stat">{entry.flowersPlanted}</div>
                  <div className="lobby-leaderboard-stat">{formatWinRate(entry.winRate)}</div>
                  <div className="lobby-leaderboard-lastplay">
                    Last match {formatRelativeDate(entry.lastPlayedAt)}
                  </div>
                  <div className="lobby-leaderboard-meta">
                    {entry.lastWonAt ? `Last win ${formatRelativeDate(entry.lastWonAt)}` : 'No win yet'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <div className="lobby-error-banner">
            {error}
          </div>
        )}
      </div>

      {designerOpen && <CardArtManager onClose={() => setDesignerOpen(false)} />}
    </div>
  );
}
