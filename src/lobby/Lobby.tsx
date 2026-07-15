// ============================================================
// FLOWER GAME — LOBBY
// Create or join a match via boardgame.io Lobby API.
// ============================================================

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { MatchInfo } from '../auth/storage';
import { SERVER, IDENTITY_SERVER, GAME } from '../config';
import { HowToPlay } from './HowToPlay';
import { GrassFieldCSS } from './GrassFieldCSS';
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
  /** Kept for backward compat; ignored — Lobby always uses GrassFieldCSS. */
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
  fontSize: 45,
};

const FLOWER_GIFS = [
  '/src/assets/flowers/black-flower.gif',
  '/src/assets/flowers/blue-flower.gif',
  '/src/assets/flowers/green-flower.gif',
  '/src/assets/flowers/orange-flower.gif',
  '/src/assets/flowers/purple-flower.gif',
  '/src/assets/flowers/red-flower.gif',
  '/src/assets/flowers/yellow-flower.gif',
];

function getFlowerGif(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % FLOWER_GIFS.length;
  return FLOWER_GIFS[idx];
}

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

export function Lobby({ onJoin, onSpectate, storedMatch, showBackground = true }: Props) {
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
  const [editingName, setEditingName] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [createBubbleOpen, setCreateBubbleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<'play' | 'leaderboard'>('play');
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [copiedMatchId, setCopiedMatchId] = useState('');
  const [error, setError] = useState('');
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHintOpen, setInstallHintOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  /* ── Global danmaku chat ── */
  const [chatInput, setChatInput] = useState('');
  const danmakuComments = useSyncExternalStore(
    subscribeDanmaku,
    getDanmakuSnapshot,
  );

  function sendChat() {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const now = Date.now();
    if (now - getLastDanmakuSendAt() < DANMAKU_SEND_COOLDOWN_MS) return;
    setLastDanmakuSendAt(now);
    const lane = assignDanmakuLane(now);
    const duration = DANMAKU_MIN_DURATION
      + Math.random() * (DANMAKU_MAX_DURATION - DANMAKU_MIN_DURATION);
    const color = getWhimsicalColor(trimmed + now);
    const playerName = profile?.displayName?.trim() || name.trim() || 'Guest';
    const comment: DanmakuComment = {
      id: `${now}-${Math.random()}`,
      text: `${playerName}: ${trimmed}`,
      color,
      lane,
      duration: Math.round(duration),
      createdAt: now,
    };
    addDanmakuComment(comment);
    occupyLane(lane, now, duration);
    setChatInput('');
  }

  useEffect(() => {
    if (danmakuComments.length === 0) return;
    const interval = window.setInterval(() => {
      cleanupDanmakuComments();
    }, 500);
    return () => window.clearInterval(interval);
  }, [danmakuComments.length > 0]);

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
    console.log('[join] Step 1: fetching room info', targetMatchID);
    const res = await fetch(`${SERVER}/rooms/${encodeURIComponent(targetMatchID)}`);
    console.log('[join] Step 1 result:', res.status, res.ok);
    if (!res.ok) throw new Error('Match not found');
    const match = await res.json() as RoomSummary;
    console.log('[join] Step 2: room data', { gameover: match.gameover, started: match.started, players: match.players?.length });
    if (match.gameover) throw new Error('That room has already finished.');
    if (match.started) throw new Error('Game already started. Only seated players can rejoin.');
    const players = match.players ?? [];
    const myExistingSeat = players.find(p => (p.name ?? '').trim().toLowerCase() === resolvedName.toLowerCase());
    if (myExistingSeat) throw new Error(`You're already seated in this match. Refresh the page to reconnect \u2014 your session is saved.`);
    const openSeat = players.find(player => !player.name);
    if (!openSeat) {
      throw new Error('No open seats in that match');
    }

    console.log('[join] Step 3: posting join', { playerID: openSeat.id, playerName: resolvedName });
    const joinRes = await fetch(`${SERVER}/games/${GAME}/${targetMatchID}/join`, {
      method:  'POST',
      headers: buildGameHeaders(),
      body:    JSON.stringify({ playerID: String(openSeat.id), playerName: resolvedName }),
    });
    console.log('[join] Step 3 result:', joinRes.status, joinRes.ok);
    if (!joinRes.ok) {
      const errText = await joinRes.text().catch(() => 'unknown');
      throw new Error(`Could not join that room (${joinRes.status}): ${errText}`);
    }

    const { playerCredentials } = await joinRes.json() as { playerCredentials: string };
    console.log('[join] Step 4: success, credentials received');
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

  /**
   * Load room list from server.
   * @param silent - If true, don't overwrite existing user-facing errors.
   *                 Used by background polling to avoid wiping create/join errors.
   */
  async function loadRooms(silent = false) {
    setLoadingRooms(true);
    try {
      const res = await fetch(`${SERVER}/rooms`);
      if (!res.ok) throw new Error(`Could not load rooms (${res.status})`);
      const data = await res.json() as LobbyListResponse;
      setRooms(data.rooms ?? []);
    } catch (e: unknown) {
      if (!silent) {
        setError(e instanceof Error ? e.message : String(e));
      }
      // On silent failure, just keep the existing room list (stale is better than empty)
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
    void loadRooms(false); // first load: show errors
    const interval = window.setInterval(() => {
      void loadRooms(true); // background polls: silent, don't overwrite user errors
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
      if (!nameTouched && !name.trim()) {
        setName(suggestedName);
      }
      return;
    }
    if (!nameTouched && !name.trim()) {
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

    return () => {
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
        try {
          const trustedRes = await fetch(`${IDENTITY_SERVER}/api/matches/create`, {
            method: 'POST',
            headers: await buildIdentityHeaders(),
            body: JSON.stringify({
              playerName: trimmedName,
              roomName: trimmedRoomName || `${trimmedName}'s room`,
            }),
          });

          const trustedData = await readJsonOrNull<{
            error?: string;
            matchID?: string;
            playerCredentials?: string;
            playerID?: string;
            playerName?: string;
          }>(trustedRes);
          if (trustedRes.ok && trustedData?.matchID && trustedData.playerCredentials && trustedData.playerID) {
            onJoin(
              trustedData.matchID,
              trustedData.playerID,
              trustedData.playerName || trimmedName,
              trustedData.playerCredentials,
            );
            return;
          }
          console.warn('[create] identity server returned unusable response, falling back', {
            status: trustedRes.status,
            hasData: !!trustedData,
          });
        } catch (trustedError) {
          console.warn('[create] identity server error, falling back to game server', trustedError);
        }
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
    console.log('[join] start', { targetMatchID, hasProfile: !!profile, resolvedName: resolvedName.slice(0, 20) });
    if (!resolvedName) { setError('Enter your name first'); return; }
    if (profile && !profile.isGuest && !profile.displayNameConfirmed) {
      setError('Choose your username before joining a match.');
      return;
    }
    if (!targetMatchID) { setError('Enter a Match ID'); return; }
    setLoading(true); setError('');
    try {
      if (!profile) {
        console.log('[join] calling continueAsGuest');
        await continueAsGuest(resolvedName);
        console.log('[join] continueAsGuest done, profile now:', !!profile);
      }
      if (profile && !profile.isGuest && IDENTITY_SERVER) {
        try {
          const trustedRes = await fetch(`${IDENTITY_SERVER}/api/matches/${encodeURIComponent(targetMatchID)}/join`, {
            method: 'POST',
            headers: await buildIdentityHeaders(),
            body: JSON.stringify({
              playerName: resolvedName,
            }),
          });

          const trustedData = await readJsonOrNull<{
            error?: string;
            matchID?: string;
            playerCredentials?: string;
            playerID?: string;
            playerName?: string;
          }>(trustedRes);
          if (trustedRes.ok && trustedData?.matchID && trustedData.playerCredentials && trustedData.playerID) {
            onJoin(
              trustedData.matchID,
              trustedData.playerID,
              trustedData.playerName || resolvedName,
              trustedData.playerCredentials,
            );
            return;
          }
          console.warn('[join] identity server returned unusable response, falling back', {
            status: trustedRes.status,
            hasData: !!trustedData,
          });
        } catch (trustedError) {
          console.warn('[join] identity server error, falling back to game server', trustedError);
        }
      }
      console.log('[join] using game server join');
      await joinMatchViaGameServer(targetMatchID, resolvedName);
    } catch (e: unknown) {
      console.error('[join] failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      void loadRooms(true); // silent refresh after join failure
    } finally {
      setLoading(false);
    }
  }

  const openRooms = rooms.filter(match => !match.gameover && !match.started && match.openSeatCount > 0);
  const ongoingRooms = rooms.filter(match => !match.gameover && match.started);
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
    <div className="lobby-shell" style={{ position: 'relative' }}>
      {/* GrassFieldCSS is the single grass implementation for the Lobby.
          It handles its own cursor tracking and spring physics. */}
      <GrassFieldCSS />
      <div className="lobby-card" style={{ zIndex: 1 }}>
        {/* Hero banner with animated GIF */}
        <section className="lobby-hero-gif">
          <img
            src="/flower_game.gif"
            alt="Flower Game"
            className="lobby-hero-image"
            draggable={false}
          />
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

        {/* Centered auth section */}
        <section className="lobby-auth-center">
          {!profile ? (
            <>
              <div className="lobby-name-gif-wrapper">
                {!editingName ? (
                  <button
                    type="button"
                    className="lobby-auth-name-display"
                    onClick={() => setEditingName(true)}
                  >
                    {name.trim() || 'NAME'}
                  </button>
                ) : (
                  <input
                    autoFocus
                    value={name}
                    onChange={e => { setNameTouched(true); setName(e.target.value); }}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); }}
                    placeholder="NAME"
                    className="lobby-auth-name-input"
                  />
                )}
                <div className="lobby-name-glow" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
              </div>
              <div className="lobby-auth-buttons">
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  disabled={socialButtonsDisabled}
                  className="lobby-auth-btn lobby-auth-btn--signin"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => void continueAsGuest(name.trim())}
                  disabled={authLoading}
                  className="lobby-auth-btn lobby-auth-btn--guest"
                >
                  Guest
                </button>
              </div>
            </>
          ) : profile.isGuest ? (
            <>
              <div className="lobby-name-gif-wrapper">
                {!editingName ? (
                  <button
                    type="button"
                    className="lobby-auth-name-display"
                    onClick={() => setEditingName(true)}
                  >
                    {profile.displayName}
                  </button>
                ) : (
                  <input
                    autoFocus
                    value={name}
                    onChange={e => { setNameTouched(true); setName(e.target.value); }}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={e => { if (e.key === 'Enter') { setEditingName(false); void continueAsGuest(name.trim()); } }}
                    placeholder="NAME"
                    className="lobby-auth-name-input"
                  />
                )}
                <div className="lobby-name-glow" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
              </div>
              <div className="lobby-auth-buttons">
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  disabled={socialButtonsDisabled}
                  className="lobby-auth-btn lobby-auth-btn--signin"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => void continueAsGuest(name.trim())}
                  disabled={authLoading}
                  className="lobby-auth-btn lobby-auth-btn--guest"
                >
                  Guest
                </button>
              </div>
            </>
          ) : !profile.displayNameConfirmed ? (
            <>
              <div className="lobby-auth-welcome">Choose your name</div>
              <div className="lobby-auth-input-row">
                <input
                  value={profileDisplayName}
                  onChange={e => { setProfileFeedback(''); setProfileDisplayName(e.target.value); }}
                  placeholder="USERNAME"
                  className="lobby-auth-name-input"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleSaveProfileName(); }} }
                />
                <button
                  type="button"
                  onClick={() => void handleSaveProfileName()}
                  disabled={!canSaveProfileName || profileSaving}
                  className="lobby-auth-btn lobby-auth-btn--signin"
                >
                  {profileSaving ? '...' : 'Go'}
                </button>
              </div>
              {profileFeedback && (
                <div className={`lobby-auth-feedback${profileFeedback.includes('chosen') || profileFeedback.includes('updated') ? ' is-success' : ''}`}>
                  {profileFeedback}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="lobby-name-gif-wrapper">
                {!editingName ? (
                  <button
                    type="button"
                    className="lobby-auth-name-display"
                    onClick={() => setEditingName(true)}
                  >
                    {profile.displayName}
                  </button>
                ) : (
                  <input
                    autoFocus
                    value={profileDisplayName}
                    onChange={e => { setProfileFeedback(''); setProfileDisplayName(e.target.value); }}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditingName(false); void handleSaveProfileName(); }} }
                    placeholder="USERNAME"
                    className="lobby-auth-name-input"
                  />
                )}
                <div className="lobby-name-glow" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
                <span className="lobby-sparkle" aria-hidden="true" />
              </div>
              <div className="lobby-auth-buttons">
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={authLoading}
                  className="lobby-auth-btn lobby-auth-btn--ghost"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
          {authNotice && (
            <div className={`lobby-auth-notice is-${authNotice.tone}`}>
              <span>{authNotice.message}</span>
              <button type="button" className="lobby-auth-notice__dismiss" onClick={dismissNotice}>\u00d7</button>
            </div>
          )}
        </section>

        {/* Resume last game \u2014 expandable reconnect bubble */}
        {storedMatch && (
          <div className="lobby-resume-wrap">
            {!resumeOpen ? (
              <button
                type="button"
                className="lobby-resume-btn"
                onClick={() => setResumeOpen(true)}
              >
                Reconnect
              </button>
            ) : (
              <div className="lobby-resume-bubble">
                <button type="button" className="lobby-resume-bubble__close" onClick={() => setResumeOpen(false)}>\u00d7</button>
                <div className="lobby-resume-bubble__label">Match ID</div>
                <div className="lobby-resume-bubble__id">{storedMatch.matchID}</div>
                <div className="lobby-resume-bubble__as">as {storedMatch.playerName}</div>
                <button
                  className="lobby-resume-bubble__action"
                  onClick={() => onJoin(storedMatch.matchID, storedMatch.playerID, storedMatch.playerName, storedMatch.credentials)}
                >
                  Reconnect
                </button>
              </div>
            )}
          </div>
        )}

        {/* Login popup */}
        {loginOpen && (
          <div className="lobby-login-overlay" onClick={() => setLoginOpen(false)}>
            <div className="lobby-login-popup" onClick={e => e.stopPropagation()}>
              <button type="button" className="lobby-login-close" onClick={() => setLoginOpen(false)}>\u00d7</button>
              <div className="lobby-login-title">Sign In</div>
              <div className="lobby-login-body">
                <button
                  type="button"
                  className="lobby-login-provider"
                  onClick={() => { setLoginOpen(false); void signInWithGoogle(); }}
                  disabled={socialButtonsDisabled}
                >
                  <span className="lobby-login-provider__icon">G</span>
                  Continue with Google
                </button>
                {!configured && (
                  <div className="lobby-auth-hint" style={{ marginTop: 8 }}>Social login requires server setup.</div>
                )}
              </div>
              <div className="lobby-login-footer">
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--guest"
                  onClick={() => { setLoginOpen(false); void continueAsGuest(name.trim()); }}
                  disabled={authLoading}
                >
                  Guest
                </button>
                <button
                  type="button"
                  className="lobby-auth-btn lobby-auth-btn--signin"
                  onClick={() => { setLoginOpen(false); void signInWithGoogle(); }}
                  disabled={socialButtonsDisabled}
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="lobby-nav-row">
          <button
            type="button"
            className="lobby-nav-btn lobby-nav-btn--guide"
            onClick={() => setHowToPlayOpen(true)}
          >
            How to Play
          </button>
          <button
            type="button"
            className={`lobby-nav-btn${activeTab === 'leaderboard' ? ' is-active' : ''}`}
            onClick={() => {
              setActiveTab(activeTab === 'leaderboard' ? 'play' : 'leaderboard');
              if (activeTab !== 'leaderboard') {
                void loadLeaderboard();
                void loadMyStats();
              }
            }}
          >
            {activeTab === 'leaderboard' ? '\u2190 Back' : 'Leaderboard'}
          </button>
        </div>

        {howToPlayOpen && <HowToPlay onClose={() => setHowToPlayOpen(false)} />}

        {activeTab === 'play' ? (
        <div className="lobby-grid">
          <div className="lobby-actions-column">
            {(profile && !profile.isGuest && (myStats || !compactLockedIdentity)) && (
              <div className={`lobby-identity-card${compactLockedIdentity ? ' is-compact' : ''}`}>
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

                {profile && !profile.isGuest && !compactLockedIdentity && (
                  <div className="lobby-identity-note">
                    Your room name uses your username automatically.
                    {signedInNeedsUsername && ' Choose your username above before creating or joining a room.'}
                  </div>
                )}
              </div>
            )}

            <section className="lobby-rooms-panel lobby-rooms-panel--open">
              <div className={`lobby-gif-pair${createBubbleOpen ? ' is-open' : ''}`}>
                {/* Primary button */}
                <button
                  type="button"
                  className="lobby-create-gif-btn lobby-gif-item--primary"
                  onClick={() => setCreateBubbleOpen(open => !open)}
                  title="Create new room"
                >
                  <img src="/player_name.gif" alt="" draggable={false} />
                  <span className="lobby-gif-overlay">
                    <span className="lobby-gif-label">LOBBY</span>
                    <span className="lobby-gif-plus">+</span>
                  </span>
                </button>

                {/* Slide-out \u2014 starts behind primary, moves right */}
                <div className="lobby-gif-slideout">
                  {/* Ghost \u2014 raw GIF without text, stays visible */}
                  <div className="lobby-gif-ghost">
                    <div className="lobby-create-gif-btn lobby-gif-ghost__btn">
                      <img src="/player_name.gif" alt="" draggable={false} />
                    </div>
                  </div>

                  {/* Form popup \u2014 solid, appears below the GIF */}
                  <div className="lobby-create-form-popup">
                    <input
                      value={roomName}
                      onChange={e => setRoomName(e.target.value)}
                      placeholder="Room name"
                      className="lobby-create-form-popup__input"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createMatch(); }} }
                    />
                    <button
                      type="button"
                      className="lobby-create-form-popup__btn"
                      onClick={() => void createMatch()}
                      disabled={loading || signedInNeedsUsername}
                    >
                      {loading ? '...' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat input */}
              <div className="lobby-chat-bar">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (!chatInput.trim()) {
                        e.currentTarget.blur();
                      } else {
                        sendChat();
                      }
                    }
                  }}
                  placeholder="chat here"
                  className={`lobby-chat-input${chatInput.trim() ? ' is-typing' : ''}`}
                  maxLength={60}
                />
                {chatInput.trim() && (
                  <button
                    type="button"
                    onClick={sendChat}
                    className="lobby-chat-send"
                  >
                    Send
                  </button>
                )}
              </div>

              <div className="lobby-rooms-header">
                <button
                  onClick={() => void loadRooms(false)}
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
                  const openSeats = room.openSeatCount;
                  const creator = players.find(player => String(player.id) === String(room.ownerPlayerId))?.name?.trim()
                    || players.find(player => !!player.name?.trim())?.name?.trim()
                    || 'Unknown';
                  const displayRoomName = room.roomName?.trim() || `${creator}'s room`;
                  const occupiedPlayers = players.filter(p => !!p.name?.trim());

                  const roomNameColor = getWhimsicalColor(displayRoomName);
                  const hostColor = getWhimsicalColor('host:' + creator);
                  const idColor = getWhimsicalColor('id:' + room.matchID);

                  return (
                    <div
                      key={room.matchID}
                      className="lobby-garden-card"
                    >
                      {/* Flower avatars around the top */}
                      <div className="lobby-garden-flowers">
                        {occupiedPlayers.slice(0, 4).map((player, idx) => (
                          <div key={player.id} className="lobby-garden-flower" title={player.name}>
                            <img
                              src={getFlowerGif(player.name || String(idx))}
                              alt=""
                              className="lobby-garden-flower__gif"
                              draggable={false}
                            />
                            <span className="lobby-garden-flower__name" style={{ color: getWhimsicalColor(player.name || '') }}>
                              {player.name}
                            </span>
                          </div>
                        ))}
                        {occupiedPlayers.length > 4 && (
                          <div className="lobby-garden-flower">
                            <div className="lobby-garden-flower__more">+{occupiedPlayers.length - 4}</div>
                          </div>
                        )}
                      </div>

                      {/* Room name in center */}
                      <div className="lobby-garden-center">
                        <div className="lobby-garden-name" style={{ color: roomNameColor }}>{displayRoomName}</div>
                        <div className="lobby-garden-host" style={{ color: hostColor }}>by {creator}</div>
                      </div>

                      {/* Room ID & capacity */}
                      <div className="lobby-garden-meta">
                        <span className="lobby-garden-id" style={{ color: idColor }}>{room.matchID}</span>
                        <span style={{ color: '#9a7a8a' }}>{occupiedPlayers.length}/{room.maxPlayers}</span>
                      </div>

                      {/* Join button */}
                      <button
                        className="lobby-garden-join"
                        onClick={() => {
                          setMatchID(room.matchID);
                          void joinMatch(room.matchID);
                        }}
                        disabled={loading || openSeats <= 0}
                      >
                        {loading ? '\u2026' : 'Join'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Ongoing matches \u2014 spectate */}
            {ongoingRooms.length > 0 && (
              <section className="lobby-rooms-panel lobby-rooms-panel--ongoing">
                <div className="lobby-rooms-header">
                  <span className="lobby-rooms-header__title">Live Matches</span>
                </div>
                <div className="lobby-room-list">
                  {ongoingRooms.map(room => {
                    const players = room.players ?? [];
                    const creator = players.find(player => String(player.id) === String(room.ownerPlayerId))?.name?.trim()
                      || players.find(player => !!player.name?.trim())?.name?.trim()
                      || 'Unknown';
                    const displayRoomName = room.roomName?.trim() || `${creator}'s room`;
                    const occupiedPlayers = players.filter(p => !!p.name?.trim());
                    const roomNameColor = getWhimsicalColor(displayRoomName);
                    const hostColor = getWhimsicalColor('host:' + creator);
                    const idColor = getWhimsicalColor('id:' + room.matchID);

                    return (
                      <div
                        key={room.matchID}
                        className="lobby-garden-card lobby-garden-card--spectate"
                      >
                        <div className="lobby-garden-flowers">
                          {occupiedPlayers.slice(0, 4).map((player, idx) => (
                            <div key={player.id} className="lobby-garden-flower" title={player.name}>
                              <img
                                src={getFlowerGif(player.name || String(idx))}
                                alt=""
                                className="lobby-garden-flower__gif"
                                draggable={false}
                              />
                              <span className="lobby-garden-flower__name" style={{ color: getWhimsicalColor(player.name || '') }}>
                                {player.name}
                              </span>
                            </div>
                          ))}
                          {occupiedPlayers.length > 4 && (
                            <div className="lobby-garden-flower">
                              <div className="lobby-garden-flower__more">+{occupiedPlayers.length - 4}</div>
                            </div>
                          )}
                        </div>

                        <div className="lobby-garden-center">
                          <div className="lobby-garden-name" style={{ color: roomNameColor }}>{displayRoomName}</div>
                          <div className="lobby-garden-host" style={{ color: hostColor }}>by {creator}</div>
                        </div>

                        <div className="lobby-garden-meta">
                          <span className="lobby-garden-id" style={{ color: idColor }}>{room.matchID}</span>
                          <span style={{ color: '#9a7a8a' }}>{occupiedPlayers.length}/{room.maxPlayers}</span>
                        </div>

                        <button
                          className="lobby-garden-join lobby-garden-join--spectate"
                          onClick={() => onSpectate(room.matchID)}
                        >
                          Spectate
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

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
              </div>
            )}

            {leaderboardLoading && (
              <div className="lobby-loading-spinner">Loading...</div>
            )}

            {leaderboardError && (
              <div className="lobby-error-banner">
                {leaderboardError}
                <button onClick={() => void loadLeaderboard()}>Retry</button>
              </div>
            )}

            {!leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
              <div className="lobby-empty-state">No leaderboard data yet. Play some games!</div>
            )}

            {!leaderboardLoading && !leaderboardError && leaderboard.length > 0 && (
              <div className="lobby-leaderboard-table">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.accountId || entry.displayName}
                    className={`lobby-leaderboard-row${highlightedLeaderboardEntry?.accountId === entry.accountId ? ' is-me' : ''}`}
                  >
                    <div className="lobby-leaderboard-rank">#{entry.rank}</div>
                    <div className="lobby-leaderboard-name">{entry.displayName}</div>
                    <div className="lobby-leaderboard-stat">
                      <span>{entry.gamesWon}W</span>
                      <span>{entry.gamesPlayed}P</span>
                      <span>{formatWinRate(entry.winRate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
