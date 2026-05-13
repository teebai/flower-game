// @ts-nocheck
// ============================================================
// FLOWER GAME — boardgame.io SERVER
// ============================================================
// Starts a boardgame.io server with Express.
// The same process serves both the game API and static
// React client files (from ../client/build).
//
// Environment variables:
//   PORT        — HTTP port (default 8000)
//   ALLOW_BOTS  — set to "true" to enable bot/AI players
// ============================================================

import path from 'path';
import fs from 'fs';
import { FlatFile, Server } from 'boardgame.io/dist/cjs/server.js';
import { FlowerGame }  from '../game/FlowerGame.js';
import pkg from '../package.json';
const { Master } = require('boardgame.io/dist/cjs/master.js') as {
  Master: new (game: typeof FlowerGame, storageAPI: FlatFile, transportAPI: { sendAll: (payload: unknown) => void }, auth: unknown) => {
    onUpdate: (action: unknown, stateID: number, matchID: string, playerID: string) => Promise<{ error?: string } | void>;
  };
};
const { makeMove } = require('boardgame.io/dist/cjs/turn-order-4ab12333.js') as {
  makeMove: (type: string, args?: unknown[], playerID?: string, credentials?: string) => unknown;
};

const PORT = Number(process.env.PORT ?? 8000);
const LIVE_VERSION = process.env.FLOWER_GAME_VERSION ?? 'flower-game-v6';
const GAME_ID = FlowerGame.name;
const HISTORY_DB_DIR = process.env.FLOWER_HISTORY_DB_DIR ?? path.resolve(process.cwd(), 'data/boardgameio-db');
const FLOWER_ADMIN_KEY = process.env.FLOWER_ADMIN_KEY || (() => { throw new Error('FLOWER_ADMIN_KEY env var required') })();
const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_LENGTH = 400;
const TURN_TIMEOUT_SEC = Number(process.env.FLOWER_TURN_TIMEOUT_SEC ?? 60);
const COUNTER_RESPONSE_TIMEOUT_SEC = Number(process.env.FLOWER_COUNTER_TIMEOUT_SEC ?? 14);
const TURN_TIMEOUT_POLL_MS = Number(process.env.FLOWER_TURN_TIMEOUT_POLL_MS ?? 2000);
const LOBBY_STALE_MIN = Number(process.env.FLOWER_LOBBY_STALE_MIN ?? 10);
const LOBBY_STALE_MS = LOBBY_STALE_MIN * 60 * 1000;
const FLOWER_IDENTITY_SERVER_URL = process.env.FLOWER_IDENTITY_SERVER_URL?.trim() ?? '';
const FLOWER_IDENTITY_SERVER_SECRET = process.env.FLOWER_IDENTITY_SERVER_SECRET?.trim() ?? '';

// ── Presence (connected users) history ──────────────────────
// Records connection state changes forever in JSONL + a compact summary JSON.
const PRESENCE_DIR = process.env.FLOWER_PRESENCE_DIR ?? path.resolve(process.cwd(), 'data/presence');
const PRESENCE_EVENTS_PATH = path.join(PRESENCE_DIR, 'events.jsonl');
const PRESENCE_SUMMARY_PATH = path.join(PRESENCE_DIR, 'summary.json');

type PresenceEvent = {
  ts: number;
  type: 'connect' | 'disconnect';
  matchID: string;
  playerID: string;
  name: string;
};

type PresenceSeatEntry = {
  seatKey: string; // matchID:playerID
  matchID: string;
  playerID: string;
  name: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  connectedNow: boolean;
};

type PresenceSummary = {
  updatedAt: number;
  seats: Record<string, PresenceSeatEntry>;
};

function safeMkdirp(dir: string): void {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
}

function loadPresenceSummary(): PresenceSummary {
  try {
    if (!fs.existsSync(PRESENCE_SUMMARY_PATH)) return { updatedAt: Date.now(), seats: {} };
    const raw = fs.readFileSync(PRESENCE_SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('bad summary');
    const seats = (parsed as { seats?: unknown }).seats;
    return {
      updatedAt: typeof (parsed as { updatedAt?: unknown }).updatedAt === 'number' ? (parsed as { updatedAt: number }).updatedAt : Date.now(),
      seats: typeof seats === 'object' && seats ? (seats as Record<string, PresenceSeatEntry>) : {},
    };
  } catch {
    return { updatedAt: Date.now(), seats: {} };
  }
}

function savePresenceSummary(summary: PresenceSummary): void {
  try {
    summary.updatedAt = Date.now();
    fs.writeFileSync(PRESENCE_SUMMARY_PATH, JSON.stringify(summary));
  } catch {
    // ignore
  }
}

function appendPresenceEvent(evt: PresenceEvent): void {
  try {
    fs.appendFileSync(PRESENCE_EVENTS_PATH, JSON.stringify(evt) + '\n');
  } catch {
    // ignore
  }
}

safeMkdirp(PRESENCE_DIR);
let presenceSummary: PresenceSummary = loadPresenceSummary();
const lastPresenceByMatch = new Map<string, Record<string, boolean>>();

function normalizePresencePlayers(metadata: unknown): Array<{ playerID: string; name: string; connected: boolean }> {
  const rawPlayers = (metadata as { players?: unknown })?.players;
  const out: Array<{ playerID: string; name: string; connected: boolean }> = [];

  if (Array.isArray(rawPlayers)) {
    rawPlayers.forEach((p, idx) => {
      const pid = String((p as { id?: unknown })?.id ?? idx);
      const name = typeof (p as { name?: unknown })?.name === 'string' ? String((p as { name: string }).name).trim() : '';
      if (!name) return;
      out.push({ playerID: pid, name, connected: !!(p as { isConnected?: unknown })?.isConnected });
    });
    return out;
  }

  if (rawPlayers && typeof rawPlayers === 'object') {
    for (const [playerID, p] of Object.entries(rawPlayers as Record<string, unknown>)) {
      const name = typeof (p as { name?: unknown })?.name === 'string' ? String((p as { name: string }).name).trim() : '';
      if (!name) continue;
      out.push({ playerID: String(playerID), name, connected: !!(p as { isConnected?: unknown })?.isConnected });
    }
  }

  return out;
}

function recordPresenceFromMetadata(matchID: string, metadata: unknown, now: number): void {
  const players = normalizePresencePlayers(metadata);
  if (!players.length) return;

  const prevBySeat = lastPresenceByMatch.get(matchID) ?? {};
  const nextBySeat: Record<string, boolean> = { ...prevBySeat };
  let dirty = false;

  for (const p of players) {
    const seatKey = matchID + ':' + p.playerID;
    const prevConnected = prevBySeat[p.playerID];

    const existing = presenceSummary.seats[seatKey];
    const entry: PresenceSeatEntry = existing ?? {
      seatKey,
      matchID,
      playerID: p.playerID,
      name: p.name,
      firstSeenAt: now,
      lastSeenAt: now,
      connectedNow: p.connected,
    };

    entry.name = p.name;
    entry.lastSeenAt = now;
    entry.connectedNow = p.connected;

    if (prevConnected === undefined) {
      if (p.connected) {
        entry.lastConnectedAt = now;
        // first time we observe this seat and it is already connected: record an initial connect event
        appendPresenceEvent({ ts: now, type: 'connect', matchID, playerID: p.playerID, name: p.name });
      }
      dirty = true;
    } else if (prevConnected !== p.connected) {
      if (p.connected) entry.lastConnectedAt = now;
      else entry.lastDisconnectedAt = now;

      appendPresenceEvent({
        ts: now,
        type: p.connected ? 'connect' : 'disconnect',
        matchID,
        playerID: p.playerID,
        name: p.name,
      });
      dirty = true;
    }

    presenceSummary.seats[seatKey] = entry;
    nextBySeat[p.playerID] = p.connected;
  }

  lastPresenceByMatch.set(matchID, nextBySeat);
  if (dirty) savePresenceSummary(presenceSummary);
}

function purgePresenceMatch(matchID: string): void {
  let changed = false;
  for (const key of Object.keys(presenceSummary.seats)) {
    if (presenceSummary.seats[key]?.matchID === matchID) {
      delete presenceSummary.seats[key];
      changed = true;
    }
  }
  if (lastPresenceByMatch.has(matchID)) {
    lastPresenceByMatch.delete(matchID);
    changed = true;
  }
  if (changed) savePresenceSummary(presenceSummary);
}

type ChatMessage = {
  id: string;
  matchID: string;
  playerID?: string;
  playerName: string;
  text: string;
  createdAt: number;
};

type LobbyMetadataPlayer = {
  id: string | number;
  name?: string;
  isConnected?: boolean;
  credentials?: string;
};

type LobbyMetadata = {
  createdAt?: number;
  updatedAt?: number;
  gameover?: unknown;
  lobbyCleanupMarkedAt?: number;
  statsRecordedAt?: number;
  statsRecordingError?: string;
  /** When the lobby first became full (all seats named). Used to start the turn timer only after everyone has joined. */
  lobbyFilledAt?: number;
  players?: Record<string, LobbyMetadataPlayer>;
};

type RoomStateSnapshot = {
  phase?: unknown;
  roomName?: unknown;
  ownerPlayerId?: unknown;
  minPlayers?: unknown;
  maxPlayers?: unknown;
  readyPlayerIds?: unknown;
  players?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
  winner?: unknown;
};

type RoomPlayerSummary = {
  id: string;
  isReady: boolean;
  name: string;
};

type RoomSummary = {
  createdAt: number | null;
  gameover: unknown;
  joinedCount: number;
  matchID: string;
  maxPlayers: number;
  minPlayers: number;
  openSeatCount: number;
  ownerPlayerId: string | null;
  players: RoomPlayerSummary[];
  readyPlayerIds: string[];
  roomName: string;
  started: boolean;
  updatedAt: number | null;
  winner: string | null;
};

const chatByMatch = new Map<string, ChatMessage[]>();

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readJsonBody(req: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function extractWinnerPlayerId(gameover: unknown, fallbackWinner: unknown): string | null {
  const candidate = (gameover as { winner?: unknown } | null | undefined)?.winner ?? fallbackWinner;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  return null;
}

function toIsoTimestamp(value: unknown): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric).toISOString();
}

function getRoomStateSnapshot(state: unknown): RoomStateSnapshot {
  return ((state as { G?: unknown } | null | undefined)?.G as RoomStateSnapshot | undefined) ?? {};
}

function listRoomPlayers(metadata: LobbyMetadata, roomState: RoomStateSnapshot): RoomPlayerSummary[] {
  const readyPlayerIds = new Set(
    Array.isArray(roomState.readyPlayerIds)
      ? roomState.readyPlayerIds
        .map(value => (typeof value === 'string' || typeof value === 'number') ? String(value) : '')
        .filter(Boolean)
      : []
  );

  const metadataPlayers = metadata.players ?? {};
  const playerIds = Object.keys(metadataPlayers).sort((a, b) => Number(a) - Number(b));
  return playerIds.map(playerId => {
    const metadataPlayer = metadataPlayers[playerId];
    const livePlayer = Array.isArray(roomState.players)
      ? roomState.players.find(player => String(player?.id ?? '') === playerId)
      : null;
    const name = typeof metadataPlayer?.name === 'string' && metadataPlayer.name.trim()
      ? metadataPlayer.name.trim()
      : typeof livePlayer?.name === 'string' && livePlayer.name.trim()
        ? livePlayer.name.trim()
        : '';
    return {
      id: playerId,
      isReady: readyPlayerIds.has(playerId),
      name,
    };
  });
}

function buildRoomSummary(matchID: string, state: unknown, metadata: LobbyMetadata): RoomSummary {
  const roomState = getRoomStateSnapshot(state);
  const players = listRoomPlayers(metadata, roomState);
  const maxPlayersRaw = Number(roomState.maxPlayers);
  const minPlayersRaw = Number(roomState.minPlayers);
  const maxPlayers = Number.isFinite(maxPlayersRaw) && maxPlayersRaw > 0
    ? Math.max(3, Math.min(6, Math.floor(maxPlayersRaw)))
    : Math.max(3, players.length || 6);
  const minPlayers = Number.isFinite(minPlayersRaw) && minPlayersRaw > 0
    ? Math.max(3, Math.min(maxPlayers, Math.floor(minPlayersRaw)))
    : 3;
  const joinedCount = players.filter(player => player.name.trim()).length;
  const started = roomState.phase !== 'waiting';
  const winner = extractWinnerPlayerId(metadata.gameover, roomState.winner);
  const ownerPlayerId = typeof roomState.ownerPlayerId === 'string' && roomState.ownerPlayerId.trim()
    ? roomState.ownerPlayerId.trim()
    : '0';

  return {
    createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : null,
    gameover: metadata.gameover ?? null,
    joinedCount,
    matchID,
    maxPlayers,
    minPlayers,
    openSeatCount: Math.max(0, maxPlayers - joinedCount),
    ownerPlayerId,
    players,
    readyPlayerIds: players.filter(player => player.isReady).map(player => player.id),
    roomName: typeof roomState.roomName === 'string' && roomState.roomName.trim()
      ? roomState.roomName.trim()
      : `${players[0]?.name?.trim() || 'Flower'}'s room`,
    started,
    updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : null,
    winner,
  };
}

async function fetchRoomSummary(matchID: string): Promise<RoomSummary | null> {
  const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
  if (!metadata) return null;
  return buildRoomSummary(matchID, state, metadata as LobbyMetadata);
}

async function reportMatchResult(matchID: string, state: Record<string, unknown>, metadata: LobbyMetadata): Promise<boolean> {
  if (!FLOWER_IDENTITY_SERVER_URL || !FLOWER_IDENTITY_SERVER_SECRET) {
    return false;
  }

  const gameover = (state.ctx as { gameover?: unknown } | undefined)?.gameover ?? metadata.gameover ?? null;
  const winnerPlayerId = extractWinnerPlayerId(gameover, (state.G as { winner?: unknown } | undefined)?.winner);
  const gameState = (state.G as {
    gameStartedAt?: unknown;
    players?: Array<{
      id?: unknown;
      name?: unknown;
      matchStats?: {
        flowersPlanted?: unknown;
      };
    }>;
  } | undefined) ?? {};
  const players = Array.isArray(gameState.players) ? gameState.players : [];
  const participants = players.map(player => {
    const flowersPlantedRaw = Number(player.matchStats?.flowersPlanted);
    return {
      flowersPlanted: Number.isFinite(flowersPlantedRaw) && flowersPlantedRaw > 0
        ? Math.floor(flowersPlantedRaw)
        : 0,
      playerId: typeof player.id === 'string' || typeof player.id === 'number' ? String(player.id) : '',
      playerName: typeof player.name === 'string' ? player.name : '',
    };
  });
  const playerCount = players.length || Object.keys(metadata.players ?? {}).length;
  const startedAt = toIsoTimestamp(gameState.gameStartedAt);
  const flowersPlantedTotal = participants.reduce((sum, participant) => sum + participant.flowersPlanted, 0);

  const response = await fetch(
    `${FLOWER_IDENTITY_SERVER_URL.replace(/\/$/, '')}/internal/matches/${encodeURIComponent(matchID)}/results`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-flower-server-secret': FLOWER_IDENTITY_SERVER_SECRET,
      },
      body: JSON.stringify({
        finishedAt: new Date().toISOString(),
        playerCount,
        resultPayload: {
          ctxGameover: gameover,
          flowersPlantedTotal,
          participants,
          winnerPlayerId,
        },
        source: 'flower_game_server',
        startedAt,
        winnerPlayerId,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Identity server result sync failed (${response.status})`);
  }

  return true;
}

// ── Create boardgame.io server ───────────────────────────────

const db = new FlatFile({ dir: HISTORY_DB_DIR });

const server = Server({
  games: [FlowerGame],
  db,

  // Allow all origins in development.
  // Restrict this to your domain in production.
  origins: (ctx) => {
    const origin = ctx.get('origin') || '';
    if (process.env.NODE_ENV === 'production') {
      return origin || '*';
    }
    const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    return allowed.includes(origin) ? origin : allowed[0];
  },
});

server.app.use(async (ctx: any, next: () => Promise<void>) => {
  ctx.set('X-Flower-Game-Version', LIVE_VERSION);

  if (ctx.path.startsWith('/chat/')) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type');
    ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    const matchID = decodeURIComponent(ctx.path.replace(/^\/chat\//, '').trim());
    if (!matchID) {
      ctx.status = 400;
      ctx.body = { error: 'matchID is required' };
      return;
    }

    if (ctx.method === 'GET') {
      ctx.type = 'application/json';
      ctx.body = { messages: chatByMatch.get(matchID) ?? [] };
      return;
    }

    if (ctx.method === 'POST') {
      try {
        const body = await readJsonBody(ctx.req);
        const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const playerID = typeof body.playerID === 'string' ? body.playerID.trim() : undefined;

        if (!playerName) {
          ctx.status = 400;
          ctx.body = { error: 'playerName is required' };
          return;
        }
        if (!text) {
          ctx.status = 400;
          ctx.body = { error: 'text is required' };
          return;
        }

        const message: ChatMessage = {
          id: uid(),
          matchID,
          playerID,
          playerName: playerName.slice(0, 40),
          text: text.slice(0, MAX_CHAT_LENGTH),
          createdAt: Date.now(),
        };

        const existing = chatByMatch.get(matchID) ?? [];
        const nextMessages = [...existing, message].slice(-MAX_CHAT_MESSAGES);
        chatByMatch.set(matchID, nextMessages);

        ctx.status = 201;
        ctx.type = 'application/json';
        ctx.body = { ok: true, message, messages: nextMessages };
        return;
      } catch {
        ctx.status = 400;
        ctx.body = { error: 'Invalid JSON body' };
        return;
      }
    }

    ctx.status = 405;
    ctx.body = { error: 'Method not allowed' };
    return;
  }

  if (ctx.path === '/version') {
    ctx.type = 'text/plain; charset=utf-8';
    ctx.body = LIVE_VERSION;
    return;
  }

  if (ctx.path === '/rooms') {
    ctx.set('Access-Control-Allow-Origin', '*');
    if (ctx.method !== 'GET') {
      ctx.status = 405;
      ctx.type = 'application/json';
      ctx.body = { error: 'Method not allowed' };
      return;
    }

    const matchIDs: string[] = await db.listMatches({ gameName: GAME_ID });
    const rooms = (
      await Promise.all(matchIDs.map(async (matchID: string) => fetchRoomSummary(matchID)))
    )
      .filter((room: any): room is RoomSummary => Boolean(room))
      .sort((a: any, b: any) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));

    ctx.type = 'application/json';
    ctx.body = { rooms };
    return;
  }

  if (ctx.path.startsWith('/rooms/')) {
    ctx.set('Access-Control-Allow-Origin', '*');
    if (ctx.method !== 'GET') {
      ctx.status = 405;
      ctx.type = 'application/json';
      ctx.body = { error: 'Method not allowed' };
      return;
    }

    const matchID = decodeURIComponent(ctx.path.replace(/^\/rooms\//, '').trim());
    if (!matchID) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'matchID is required' };
      return;
    }

    const room = await fetchRoomSummary(matchID);
    if (!room) {
      ctx.status = 404;
      ctx.type = 'application/json';
      ctx.body = { error: 'Match not found' };
      return;
    }

    ctx.type = 'application/json';
    ctx.body = room;
    return;
  }

  const joinPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/join$/);
  if (joinPathMatch) {
    const matchID = decodeURIComponent(joinPathMatch[1] ?? '').trim();
    if (matchID) {
      const room = await fetchRoomSummary(matchID);
      if (!room) {
        ctx.status = 404;
        ctx.type = 'application/json';
        ctx.body = { error: 'Match not found' };
        return;
      }
      if (room.started) {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: 'That room has already started.' };
        return;
      }
      if (room.joinedCount >= room.maxPlayers) {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: 'No open seats in that match' };
        return;
      }
    }
  }

  // ── Kick player endpoint ────────────────────────────────────
  const kickPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/kick$/);
  if (kickPathMatch) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type');
    ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    if (ctx.method !== 'POST') {
      ctx.status = 405;
      ctx.type = 'application/json';
      ctx.body = { error: 'Method not allowed' };
      return;
    }

    const matchID = decodeURIComponent(kickPathMatch[1] ?? '').trim();
    if (!matchID) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'matchID is required' };
      return;
    }

    try {
      const body = await readJsonBody(ctx.req) as {
        playerID?: string;
        targetPlayerID?: string;
        credentials?: string;
      };
      const playerID = typeof body.playerID === 'string' ? body.playerID.trim() : '';
      const targetPlayerID = typeof body.targetPlayerID === 'string' ? body.targetPlayerID.trim() : '';
      const credentials = typeof body.credentials === 'string' ? body.credentials.trim() : '';

      if (!playerID || !targetPlayerID) {
        ctx.status = 400;
        ctx.type = 'application/json';
        ctx.body = { error: 'playerID and targetPlayerID are required' };
        return;
      }

      const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
      if (!state || !metadata) {
        ctx.status = 404;
        ctx.type = 'application/json';
        ctx.body = { error: 'Match not found' };
        return;
      }

      const lobbyMetadata = metadata as LobbyMetadata;
      const roomState = getRoomStateSnapshot(state);

      if (roomState.phase !== 'waiting') {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: 'Game has already started' };
        return;
      }

      if (roomState.ownerPlayerId !== playerID) {
        ctx.status = 403;
        ctx.type = 'application/json';
        ctx.body = { error: 'Only the room owner can kick players' };
        return;
      }

      // Verify credentials
      const requesterMeta = lobbyMetadata.players?.[playerID];
      if (!requesterMeta || requesterMeta.credentials !== credentials) {
        ctx.status = 403;
        ctx.type = 'application/json';
        ctx.body = { error: 'Invalid credentials' };
        return;
      }

      if (targetPlayerID === playerID) {
        ctx.status = 400;
        ctx.type = 'application/json';
        ctx.body = { error: 'You cannot kick yourself' };
        return;
      }

      const targetMeta = lobbyMetadata.players?.[targetPlayerID];
      if (!targetMeta || !targetMeta.name) {
        ctx.status = 404;
        ctx.type = 'application/json';
        ctx.body = { error: 'Target player not found' };
        return;
      }

      // Remove from metadata
      const nextPlayers = { ...lobbyMetadata.players };
      delete nextPlayers[targetPlayerID];
      await db.setMetadata(matchID, {
        ...lobbyMetadata,
        players: nextPlayers,
        updatedAt: Date.now(),
      } as unknown as Parameters<typeof db.setMetadata>[1]);

      // Remove from game state
      const gPlayers = (state.G?.players ?? []) as Array<{ id: string; name: string }>;
      const gReady = (state.G?.readyPlayerIds ?? []) as string[];
      const gTurnOrder = (state.G?.turnOrder ?? []) as string[];
      const nextGPlayers = gPlayers.filter((p: any) => p.id !== targetPlayerID);
      const nextGReady = gReady.filter(id => id !== targetPlayerID);
      const nextGTurnOrder = gTurnOrder.filter(id => id !== targetPlayerID);

      const targetName = gPlayers.find((p: any) => p.id === targetPlayerID)?.name ?? targetPlayerID;
      const nextG = {
        ...state.G,
        players: nextGPlayers,
        readyPlayerIds: nextGReady,
        turnOrder: nextGTurnOrder,
        log: [...((state.G?.log ?? []) as string[]), `${targetName} was kicked from the room.`],
      };

      const nextState = { ...state, G: nextG };
      await db.setState(matchID, nextState, []);

      ctx.type = 'application/json';
      ctx.body = { ok: true, matchID, kickedPlayerID: targetPlayerID };
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown kick error';
      console.warn(`[FlowerGame] kick failed for ${matchID}:`, message);
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { error: message };
      return;
    }
  }

  // ── Start game endpoint ─────────────────────────────────────
  const startPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/start$/);
  if (startPathMatch) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type');
    ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    if (ctx.method !== 'POST') {
      ctx.status = 405;
      ctx.type = 'application/json';
      ctx.body = { error: 'Method not allowed' };
      return;
    }

    const matchID = decodeURIComponent(startPathMatch[1] ?? '').trim();
    if (!matchID) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'matchID is required' };
      return;
    }

    try {
      const body = await readJsonBody(ctx.req) as {
        playerID?: string;
        credentials?: string;
      };
      const playerID = typeof body.playerID === 'string' ? body.playerID.trim() : '';
      const credentials = typeof body.credentials === 'string' ? body.credentials.trim() : '';

      if (!playerID) {
        ctx.status = 400;
        ctx.type = 'application/json';
        ctx.body = { error: 'playerID is required' };
        return;
      }

      const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
      if (!state || !metadata) {
        ctx.status = 404;
        ctx.type = 'application/json';
        ctx.body = { error: 'Match not found' };
        return;
      }

      const lobbyMetadata = metadata as LobbyMetadata;
      const roomState = getRoomStateSnapshot(state);

      if (roomState.phase !== 'waiting') {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: 'Game has already started' };
        return;
      }

      if (roomState.ownerPlayerId !== playerID) {
        ctx.status = 403;
        ctx.type = 'application/json';
        ctx.body = { error: 'Only the room owner can start the game' };
        return;
      }

      // Verify credentials
      const requesterMeta = lobbyMetadata.players?.[playerID];
      if (!requesterMeta || requesterMeta.credentials !== credentials) {
        ctx.status = 403;
        ctx.type = 'application/json';
        ctx.body = { error: 'Invalid credentials' };
        return;
      }

      const joinedCount = (roomState.players ?? []).filter((p: any) => p.name?.trim()).length;
      const readyCount = (roomState.readyPlayerIds ?? []).filter((id: string) =>
        (roomState.players ?? []).some((p: any) => p.id === id && p.name?.trim())
      ).length;

      if (joinedCount < (roomState.minPlayers ?? 2)) {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: `Need at least ${roomState.minPlayers} players to start` };
        return;
      }

      if (readyCount < (roomState.minPlayers ?? 2)) {
        ctx.status = 409;
        ctx.type = 'application/json';
        ctx.body = { error: `Need at least ${roomState.minPlayers ?? 2} ready players to start` };
        return;
      }

      // Execute startGame move via Master
      const result = await timeoutMaster.onUpdate(
        makeMove('startGame', [], playerID, credentials),
        (state as any)._stateID ?? 0,
        matchID,
        playerID
      );

      if (result && 'error' in result && result.error) {
        ctx.status = 500;
        ctx.type = 'application/json';
        ctx.body = { error: result.error };
        return;
      }

      ctx.type = 'application/json';
      ctx.body = { ok: true, matchID, started: true };
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown start error';
      console.warn(`[FlowerGame] start failed for ${matchID}:`, message);
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { error: message };
      return;
    }
  }

  // ── Leave room endpoint ─────────────────────────────────────
  const leavePathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/leave$/);
  if (leavePathMatch) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type');
    ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    if (ctx.method !== 'POST') {
      ctx.status = 405;
      ctx.type = 'application/json';
      ctx.body = { error: 'Method not allowed' };
      return;
    }

    const matchID = decodeURIComponent(leavePathMatch[1] ?? '').trim();
    if (!matchID) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'matchID is required' };
      return;
    }

    try {
      const body = await readJsonBody(ctx.req) as {
        playerID?: string;
        credentials?: string;
      };
      const playerID = typeof body.playerID === 'string' ? body.playerID.trim() : '';
      const credentials = typeof body.credentials === 'string' ? body.credentials.trim() : '';

      if (!playerID) {
        ctx.status = 400;
        ctx.type = 'application/json';
        ctx.body = { error: 'playerID is required' };
        return;
      }

      const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
      if (!state || !metadata) {
        ctx.status = 404;
        ctx.type = 'application/json';
        ctx.body = { error: 'Match not found' };
        return;
      }

      const lobbyMetadata = metadata as LobbyMetadata;
      const roomState = getRoomStateSnapshot(state);

      // Verify credentials
      const requesterMeta = lobbyMetadata.players?.[playerID];
      if (!requesterMeta || requesterMeta.credentials !== credentials) {
        ctx.status = 403;
        ctx.type = 'application/json';
        ctx.body = { error: 'Invalid credentials' };
        return;
      }

      // Remove from metadata
      const nextMetaPlayers = { ...lobbyMetadata.players };
      delete nextMetaPlayers[playerID];
      await db.setMetadata(matchID, {
        ...lobbyMetadata,
        players: nextMetaPlayers,
        updatedAt: Date.now(),
      } as unknown as Parameters<typeof db.setMetadata>[1]);

      // Remove from game state
      const gPlayers = (state.G?.players ?? []) as Array<{ id: string; name: string }>;
      const gReady = (state.G?.readyPlayerIds ?? []) as string[];
      const gTurnOrder = (state.G?.turnOrder ?? []) as string[];
      const nextGPlayers = gPlayers.filter((p: any) => p.id !== playerID).map((p: any) =>
        p.id === playerID ? { ...p, name: '' } : p
      );
      const nextGReady = gReady.filter(id => id !== playerID);
      const nextGTurnOrder = gTurnOrder.filter(id => id !== playerID);

      const playerName = gPlayers.find((p: any) => p.id === playerID)?.name ?? playerID;
      const nextG = {
        ...state.G,
        players: nextGPlayers,
        readyPlayerIds: nextGReady,
        turnOrder: nextGTurnOrder,
        log: [...((state.G?.log ?? []) as string[]), `${playerName} left the room.`],
      };

      // If owner leaves, assign new owner or delete room
      if (roomState.ownerPlayerId === playerID) {
        const remainingPlayers = nextGPlayers.filter((p: any) => p.name?.trim());
        if (remainingPlayers.length === 0) {
          await db.wipe(matchID);
          chatByMatch.delete(matchID);
          purgePresenceMatch(matchID);
          console.log(`[FlowerGame] owner left, deleted room ${matchID}`);
          ctx.type = 'application/json';
          ctx.body = { ok: true, matchID, deleted: true };
          return;
        }
        const newOwner = remainingPlayers[0];
        nextG.ownerPlayerId = newOwner.id;
        nextG.readyPlayerIds = [...new Set([...nextGReady, newOwner.id])];
        nextG.log = [...nextG.log, `${newOwner.name} is now the room owner.`];
      }

      const nextState = { ...state, G: nextG };
      await db.setState(matchID, nextState, []);

      ctx.type = 'application/json';
      ctx.body = { ok: true, matchID, leftPlayerID: playerID };
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown leave error';
      console.warn(`[FlowerGame] leave failed for ${matchID}:`, message);
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { error: message };
      return;
    }
  }

  if (ctx.path.startsWith('/presence/')) {
    ctx.set('Access-Control-Allow-Origin', '*');

    if (ctx.path === '/presence/summary') {
      ctx.type = 'application/json';

      const seats = Object.values(presenceSummary.seats);
      const PRESENCE_LIVE_STALE_MS = Number(process.env.FLOWER_PRESENCE_LIVE_STALE_MS ?? 30000);
      const presenceNow = Date.now();
      const byName = new Map<string, {
        name: string;
        connectedNow: boolean;
        firstSeenAt: number;
        lastSeenAt: number;
        lastConnectedAt?: number;
        lastDisconnectedAt?: number;
        seats: PresenceSeatEntry[];
      }>();

      for (const seat of seats) {
        const name = seat.name;
        const existing = byName.get(name);
        if (!existing) {
          byName.set(name, {
            name,
            connectedNow: (seat.connectedNow && (presenceNow - seat.lastSeenAt) < PRESENCE_LIVE_STALE_MS),
            firstSeenAt: seat.firstSeenAt,
            lastSeenAt: seat.lastSeenAt,
            lastConnectedAt: seat.lastConnectedAt,
            lastDisconnectedAt: seat.lastDisconnectedAt,
            seats: [seat],
          });
          continue;
        }

        const seatLive = seat.connectedNow && (presenceNow - seat.lastSeenAt) < PRESENCE_LIVE_STALE_MS;
        existing.connectedNow = existing.connectedNow || seatLive;
        existing.firstSeenAt = Math.min(existing.firstSeenAt, seat.firstSeenAt);
        existing.lastSeenAt = Math.max(existing.lastSeenAt, seat.lastSeenAt);
        if (typeof seat.lastConnectedAt === 'number') {
          existing.lastConnectedAt = typeof existing.lastConnectedAt === 'number'
            ? Math.max(existing.lastConnectedAt, seat.lastConnectedAt)
            : seat.lastConnectedAt;
        }
        if (typeof seat.lastDisconnectedAt === 'number') {
          existing.lastDisconnectedAt = typeof existing.lastDisconnectedAt === 'number'
            ? Math.max(existing.lastDisconnectedAt, seat.lastDisconnectedAt)
            : seat.lastDisconnectedAt;
        }
        existing.seats.push(seat);
      }

      const users = Array.from(byName.values()).sort((a, b) => {
        const ak = (a.lastConnectedAt ?? a.lastSeenAt) || 0;
        const bk = (b.lastConnectedAt ?? b.lastSeenAt) || 0;
        return bk - ak;
      });

      const connectedUsers = users.filter(u => u.connectedNow);

      ctx.body = {
        updatedAt: presenceSummary.updatedAt,
        totalSeats: seats.length,
        totalUsers: users.length,
        connectedUserCount: connectedUsers.length,
        connectedUsers: connectedUsers.map(u => ({
          name: u.name,
          lastConnectedAt: u.lastConnectedAt ?? null,
          lastSeenAt: u.lastSeenAt,
          seats: u.seats.map(s => ({ matchID: s.matchID, playerID: s.playerID })),
        })),
        users: users.map(u => ({
          name: u.name,
          connectedNow: u.connectedNow,
          firstSeenAt: u.firstSeenAt,
          lastSeenAt: u.lastSeenAt,
          lastConnectedAt: u.lastConnectedAt ?? null,
          lastDisconnectedAt: u.lastDisconnectedAt ?? null,
          seatCount: u.seats.length,
        })),
      };
      return;
    }

    if (ctx.path === '/presence/events') {
      const limitRaw = typeof (ctx.query?.limit) === 'string' ? ctx.query.limit : '';
      const limit = Math.max(0, Math.min(5000, Number(limitRaw || 200) || 200));
      try {
        if (!fs.existsSync(PRESENCE_EVENTS_PATH)) {
          ctx.type = 'application/json';
          ctx.body = { events: [] };
          return;
        }
        const raw = fs.readFileSync(PRESENCE_EVENTS_PATH, 'utf8').trim();
        const lines = raw ? raw.split(/\n/g) : [];
        const tail = lines.slice(-limit);
        const events = tail.map(l => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        ctx.type = 'application/json';
        ctx.body = { events };
        return;
      } catch {
        ctx.status = 500;
        ctx.type = 'application/json';
        ctx.body = { error: 'failed to read presence events' };
        return;
      }
    }

    ctx.status = 404;
    ctx.type = 'application/json';
    ctx.body = { error: 'Not Found' };
    return;
  }

  if (ctx.path.startsWith('/admin/rooms/') && ctx.path.endsWith('/kill')) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, x-flower-admin-key');
    ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');

    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }

    const adminKey = String(ctx.get('x-flower-admin-key') || '').trim();
    if (adminKey !== FLOWER_ADMIN_KEY) {
      ctx.status = 401;
      ctx.type = 'application/json';
      ctx.body = { error: 'Unauthorized' };
      return;
    }

    const matchID = decodeURIComponent(ctx.path.replace(/^\/admin\/rooms\//, '').replace(/\/kill$/, '').trim());
    if (!matchID) {
      ctx.status = 400;
      ctx.type = 'application/json';
      ctx.body = { error: 'matchID is required' };
      return;
    }

    const body = (await readJsonBody(ctx.req).catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : 'manual-kill';

    const existing = await db.fetch(matchID, { state: true, metadata: true });
    if (!existing?.state && !existing?.metadata) {
      ctx.status = 404;
      ctx.type = 'application/json';
      ctx.body = { error: 'Match not found', matchID };
      return;
    }

    await db.wipe(matchID);
    chatByMatch.delete(matchID);
    purgePresenceMatch(matchID);
    console.log(`[FlowerGame] killed room ${matchID} (${reason})`);

    ctx.type = 'application/json';
    ctx.body = { ok: true, matchID, deleted: true, reason };
    return;
  }

  if (ctx.path === '/health') {
    ctx.type = 'application/json';
    ctx.body = {
      ok: true,
      game: GAME_ID,
      version: LIVE_VERSION,
      packageVersion: pkg.version,
    };
    return;
  }

  await next();
});

// ── Serve built React client ────────────────────────────────
const distDir = path.join(__dirname, '..');
if (fs.existsSync(distDir)) {
  server.app.use(async (ctx, next) => {
    // Skip API routes
    if (ctx.path.startsWith('/games/') || ctx.path.startsWith('/lobby') || ctx.path === '/version') {
      return next();
    }

    // Security: prevent directory traversal
    const sanitized = path.normalize(ctx.path).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolved = path.join(distDir, sanitized);

    // Ensure resolved path stays within distDir
    if (!resolved.startsWith(path.resolve(distDir))) {
      ctx.status = 403;
      ctx.body = 'Forbidden';
      return;
    }

    // Check file exists and is not a directory
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      return next(); // Let other middleware handle (e.g., SPA fallback)
    }

    // Serve file with correct MIME type
    const ext = path.extname(resolved);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    ctx.set('Content-Type', mimeType);
    ctx.body = fs.createReadStream(resolved);
  });

  // SPA fallback: serve index.html for any non-API route
  server.app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/games/') || ctx.path.startsWith('/lobby') || ctx.path === '/version' || ctx.path === '/health') {
      return next();
    }
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      ctx.type = 'html';
      ctx.body = fs.createReadStream(indexPath);
    } else {
      await next();
    }
  });
}

// ── Turn timeout sweeper ─────────────────────────────────────

const timeoutMaster = new Master(
  FlowerGame,
  db,
  {
    sendAll: (payload: unknown) => {
      const args = typeof payload === 'object' && payload && 'args' in payload
        ? (payload as { args?: unknown[] }).args
        : undefined;
      const matchID = Array.isArray(args) ? String(args[0] ?? '') : '';
      if (matchID) {
        (server.transport as unknown as { pubSub: { publish: (channel: string, data: unknown) => void } }).pubSub.publish(`MATCH-${matchID}`, payload);
      }
    },
  },
  server.auth
);

let timeoutSweepRunning = false;

function getLobbyOccupancy(metadata: LobbyMetadata): { namedCount: number; totalSeats: number } {
  const players = Object.values(metadata.players ?? {});
  const namedCount = players.filter(player => !!player.name?.trim()).length;
  return { namedCount, totalSeats: players.length };
}

function getLobbyCleanupAction(metadata: LobbyMetadata, now: number, joinedCount: number): 'keep' | 'mark' | 'clear' | 'delete' {
  const { namedCount, totalSeats } = getLobbyOccupancy(metadata);
  if (totalSeats === 0) return 'keep';

  const needsCleanupTimer = namedCount <= 1 && joinedCount <= 1;
  const markedAt = metadata.lobbyCleanupMarkedAt ?? null;

  if (!needsCleanupTimer) {
    return markedAt ? 'clear' : 'keep';
  }

  if (!markedAt) {
    return 'mark';
  }

  return now - markedAt >= LOBBY_STALE_MS ? 'delete' : 'keep';
}

async function runMaintenanceSweep(): Promise<void> {
  if (timeoutSweepRunning) return;
  timeoutSweepRunning = true;

  try {
    const matchIDs = await db.listMatches({ gameName: GAME_ID });
    const now = Date.now();

    for (const matchID of matchIDs) {
      const queue = server.transport.getMatchQueue(matchID);
      await queue.add(async () => {
        const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });

        // Update presence history (connected users) from lobby metadata.
        try {
          if (metadata) recordPresenceFromMetadata(matchID, metadata as LobbyMetadata, now);
        } catch {
          // ignore
        }
        if (!state || !metadata) return;

        const lobbyMetadata = metadata as LobbyMetadata;
        const gameover = lobbyMetadata.gameover ?? state.ctx.gameover ?? null;

        if (gameover != null) {
          if (!lobbyMetadata.statsRecordedAt) {
            try {
              const recorded = await reportMatchResult(matchID, state as unknown as Record<string, unknown>, lobbyMetadata);
              if (recorded) {
                await db.setMetadata(matchID, {
                  ...lobbyMetadata,
                  statsRecordedAt: now,
                  statsRecordingError: undefined,
                } as unknown as Parameters<typeof db.setMetadata>[1]);
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown stats sync error';
              await db.setMetadata(matchID, {
                ...lobbyMetadata,
                statsRecordingError: message,
              } as unknown as Parameters<typeof db.setMetadata>[1]);
              console.warn(`[FlowerGame] stats sync failed for ${matchID}:`, message);
            }
          }
          return;
        }

        const roomState = getRoomStateSnapshot(state);
        const roomSummary = buildRoomSummary(matchID, state, lobbyMetadata);
        const joinedCount = roomSummary.joinedCount;

        const lobbyCleanupAction = getLobbyCleanupAction(lobbyMetadata, now, joinedCount);
        if (lobbyCleanupAction === 'mark') {
          await db.setMetadata(matchID, {
            ...lobbyMetadata,
            lobbyCleanupMarkedAt: now,
          } as unknown as Parameters<typeof db.setMetadata>[1]);
          return;
        }
        if (lobbyCleanupAction === 'clear') {
          const { lobbyCleanupMarkedAt, ...rest } = lobbyMetadata;
          await db.setMetadata(matchID, rest as unknown as Parameters<typeof db.setMetadata>[1]);
          lobbyMetadata.lobbyCleanupMarkedAt = undefined;
        }
        if (lobbyCleanupAction === 'delete') {
          await db.wipe(matchID);
          chatByMatch.delete(matchID);
          console.log(`[FlowerGame] deleted stale lobby room ${matchID} (${joinedCount}/${roomSummary.maxPlayers} seats filled)`);
          return;
        }

        if (roomState.phase === 'waiting') return;

        if ((state._stateID ?? 0) === 0 && !state.G?.turnStartedAt) {
          const initializedState = { ...state, G: { ...state.G, turnStartedAt: now, gameStartedAt: now } };
          await db.setState(matchID, initializedState, []);
          console.log(`[FlowerGame] initialized timer for ready match ${matchID}`);
          return;
        }

        if (state.G?.turnStartedAt && !state.G?.gameStartedAt) {
          const initializedState = { ...state, G: { ...state.G, gameStartedAt: Number(state.G.turnStartedAt) || now } };
          await db.setState(matchID, initializedState, []);
          return;
        }

        const phase = state.G?.phase;
        if (phase === 'counter' && !state.G?.pendingAction?.startedAt) {
          const initializedState = {
            ...state,
            G: { ...state.G, pendingAction: { ...state.G.pendingAction, startedAt: now, responseTimeLimitSec: COUNTER_RESPONSE_TIMEOUT_SEC } },
          };
          await db.setState(matchID, initializedState, []);
          return;
        }

        const startedAt = phase === 'counter'
          ? Number(state.G?.pendingAction?.startedAt ?? 0)
          : Number(state.G?.turnStartedAt ?? 0);
        const limitSec = phase === 'counter'
          ? Number(state.G?.pendingAction?.responseTimeLimitSec ?? COUNTER_RESPONSE_TIMEOUT_SEC)
          : Math.max(TURN_TIMEOUT_SEC, state.G?.turnTimeLimitSec ?? 0);
        if (!startedAt || startedAt + (limitSec * 1000) > now) return;

        const actorId = phase === 'counter'
          ? state.G?.pendingAction?.targetPlayerId
          : state.ctx.currentPlayer;
        if (!actorId) return;

        const credentials = lobbyMetadata.players?.[String(actorId)]?.credentials;
        if (!credentials) {
          console.warn(`[FlowerGame] timeout sweep skipped for ${matchID}: no credentials for player ${actorId}`);
          return;
        }

        const result = await timeoutMaster.onUpdate(
          makeMove('timeoutAuto', [], String(actorId), credentials),
          state._stateID,
          matchID,
          String(actorId)
        );

        if (result && 'error' in result && result.error) {
          console.warn(`[FlowerGame] timeout sweep failed for ${matchID}:`, result.error);
          return;
        }

        console.log(`[FlowerGame] auto-skipped expired timer for match ${matchID} (${actorId})`);
      });
    }
  } catch (error) {
    console.error('[FlowerGame] maintenance sweep error:', error);
  } finally {
    timeoutSweepRunning = false;
  }
}

// ── Start ────────────────────────────────────────────────────

server.run({ port: PORT, callback: () => {
  console.log(`
╔════════════════════════════════════════╗
║  🌸 Flower Game Server                 ║
║                                        ║
║  Lobby   → http://localhost:${PORT}/lobby ║
║  API     → http://localhost:${PORT}       ║
║  Version → http://localhost:${PORT}/version ║
╚════════════════════════════════════════╝
Version: ${LIVE_VERSION}
History DB: ${HISTORY_DB_DIR}
Turn timeout: ${TURN_TIMEOUT_SEC}s
Lobby cleanup: ${LOBBY_STALE_MIN} min
`);

  void runMaintenanceSweep();
  setInterval(() => {
    void runMaintenanceSweep();
  }, TURN_TIMEOUT_POLL_MS);
} });

// Keep Node.js process alive
setInterval(() => {}, 60000);
