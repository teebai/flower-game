import { http, HttpResponse } from 'msw';
import { GAME } from '../config';

// Base URL must match what config.ts resolves to in test environments.
// Config.ts uses http://localhost:8000 for localhost, so we hardcode it here.
const BASE = 'http://localhost:8000';

// In-memory mock state
const matches = new Map<string, MockMatch>();
let matchCounter = 0;

interface MockPlayer {
  id: string | number;
  name?: string;
  isConnected?: boolean;
}

interface MockMatch {
  matchID: string;
  gameName: string;
  players: MockPlayer[];
  roomName: string;
  createdAt: number;
  started: boolean;
  gameover: { winner?: string | number } | null;
  maxPlayers: number;
  minPlayers: number;
  updatedAt: number;
}

function generateMatchID(): string {
  matchCounter++;
  return `mock-${Date.now()}-${matchCounter}`;
}

function createMockMatch(roomName: string, playerName: string, maxPlayers = 6): MockMatch {
  const matchID = generateMatchID();
  const match: MockMatch = {
    matchID,
    gameName: GAME,
    players: [{ id: '0', name: playerName, isConnected: true }],
    roomName: roomName || `${playerName}'s room`,
    createdAt: Date.now(),
    started: false,
    gameover: null,
    maxPlayers,
    minPlayers: 2,
    updatedAt: Date.now(),
  };
  matches.set(matchID, match);
  return match;
}

export const handlers = [
  // List rooms
  http.get(`${BASE}/rooms`, () => {
    const rooms = Array.from(matches.values())
      .filter(m => !m.gameover)
      .map(m => ({
        matchID: m.matchID,
        gameName: m.gameName,
        roomName: m.roomName,
        players: m.players,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        gameover: m.gameover,
        started: m.started,
        joinedCount: m.players.filter(p => p.name).length,
        maxPlayers: m.maxPlayers,
        minPlayers: m.minPlayers,
        openSeatCount: m.maxPlayers - m.players.filter(p => p.name).length,
        ownerPlayerId: '0',
        readyPlayerIds: [],
      }));
    return HttpResponse.json({ rooms });
  }),

  // Create match
  http.post(`${BASE}/games/${GAME}/create`, async ({ request }) => {
    const body = (await request.json()) as { numPlayers?: number; setupData?: { names?: string[]; roomName?: string; maxPlayers?: number } };
    const setupData = body?.setupData ?? {};
    const playerName = setupData.names?.[0] ?? 'Guest';
    const roomName = setupData.roomName ?? `${playerName}'s room`;
    const maxPlayers = setupData.maxPlayers ?? 6;
    const match = createMockMatch(roomName, playerName, maxPlayers);
    return HttpResponse.json({ matchID: match.matchID });
  }),

  // Join match
  http.post(`${BASE}/games/${GAME}/:matchID/join`, async ({ request, params }) => {
    const { matchID } = params;
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Match not found', { status: 404 });
    if (match.gameover) return new HttpResponse('Match already finished', { status: 410 });

    const body = (await request.json()) as { playerID?: string; playerName?: string };
    const playerID = body?.playerID;
    const playerName = body?.playerName;

    if (playerID && match.players.find(p => String(p.id) === String(playerID) && p.name)) {
      return new HttpResponse('Seat already taken', { status: 409 });
    }

    if (playerID) {
      const existing = match.players.find(p => String(p.id) === String(playerID));
      if (existing) {
        existing.name = playerName;
        existing.isConnected = true;
      } else {
        match.players.push({ id: playerID, name: playerName, isConnected: true });
      }
    } else {
      const openSeat = match.players.find(p => !p.name);
      if (!openSeat) {
        const newId = String(match.players.length);
        match.players.push({ id: newId, name: playerName, isConnected: true });
      } else {
        openSeat.name = playerName;
        openSeat.isConnected = true;
      }
    }

    match.updatedAt = Date.now();
    return HttpResponse.json({ playerCredentials: `cred-${Date.now()}` });
  }),

  // Get match metadata
  http.get(`${BASE}/games/${GAME}/:matchID`, ({ params }) => {
    const { matchID } = params;
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Match not found', { status: 404 });
    return HttpResponse.json({
      matchID: match.matchID,
      gameName: match.gameName,
      players: match.players,
      gameover: match.gameover,
      started: match.started,
      roomName: match.roomName,
    });
  }),

  // Get room details
  http.get(`${BASE}/rooms/:matchID`, ({ params }) => {
    const { matchID } = params;
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Room not found', { status: 404 });
    return HttpResponse.json({
      matchID: match.matchID,
      gameName: match.gameName,
      roomName: match.roomName,
      players: match.players,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      gameover: match.gameover,
      started: match.started,
      joinedCount: match.players.filter(p => p.name).length,
      maxPlayers: match.maxPlayers,
      minPlayers: match.minPlayers,
      openSeatCount: match.maxPlayers - match.players.filter(p => p.name).length,
      ownerPlayerId: '0',
      readyPlayerIds: [],
    });
  }),

  // Leave match
  http.post(`${BASE}/rooms/:matchID/leave`, async ({ request, params }) => {
    const { matchID } = params;
    const body = (await request.json()) as { playerID?: string };
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Match not found', { status: 404 });

    const player = match.players.find(p => String(p.id) === String(body?.playerID));
    if (player) {
      player.name = undefined;
      player.isConnected = false;
    }
    match.updatedAt = Date.now();
    return HttpResponse.json({ success: true });
  }),

  // Start match
  http.post(`${BASE}/rooms/:matchID/start`, ({ params }) => {
    const { matchID } = params;
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Match not found', { status: 404 });
    match.started = true;
    match.updatedAt = Date.now();
    return HttpResponse.json({ started: true });
  }),

  // Leave via game server endpoint
  http.post(`${BASE}/games/${GAME}/:matchID/leave`, async ({ request, params }) => {
    const { matchID } = params;
    const body = (await request.json()) as { playerID?: string };
    const match = matches.get(String(matchID));
    if (!match) return new HttpResponse('Match not found', { status: 404 });

    const player = match.players.find(p => String(p.id) === String(body?.playerID));
    if (player) {
      player.name = undefined;
      player.isConnected = false;
    }
    return HttpResponse.json({});
  }),
];

export { matches, createMockMatch };
