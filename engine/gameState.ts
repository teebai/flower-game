// ============================================================
// FLOWER GAME — GAME STATE INITIALISATION
// ============================================================

import { GameState, Player } from '../types';
import { buildDeck, drawCards } from '../cards/deck';
import { uid } from '../utils/shuffle';

export interface PlayerSetup {
  id: string;
  name: string;
}

interface RoomConfig {
  roomName?: string;
  ownerPlayerId?: string | null;
  minPlayers?: number;
  maxPlayers?: number;
  readyPlayerIds?: string[];
  startedAt?: number;
}

function normalizeRoomConfig(players: PlayerSetup[], config?: RoomConfig): Required<RoomConfig> {
  const ownerPlayerId = config?.ownerPlayerId ?? players[0]?.id ?? null;
  return {
    roomName: config?.roomName?.trim() || 'Flower Room',
    ownerPlayerId,
    minPlayers: Math.max(3, Math.min(6, config?.minPlayers ?? 3)),
    maxPlayers: Math.max(3, Math.min(6, config?.maxPlayers ?? 6)),
    readyPlayerIds: [...new Set((config?.readyPlayerIds ?? []).filter(Boolean))],
    startedAt: Math.max(0, config?.startedAt ?? 0),
  };
}

export function createWaitingRoom(players: PlayerSetup[], config?: RoomConfig): GameState {
  if (players.length < 3 || players.length > 6) {
    throw new Error('Flower Game waiting rooms support 3–6 seats');
  }

  const room = normalizeRoomConfig(players, config);
  const gamePlayers: Player[] = players.map(p => ({
    id: p.id,
    name: p.name,
    hand: [],
    garden: { sets: [] },
    matchStats: {
      flowersPlanted: 0,
    },
  }));

  return {
    id: uid(),
    gameStartedAt: 0,
    roomName: room.roomName,
    ownerPlayerId: room.ownerPlayerId,
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    readyPlayerIds: room.readyPlayerIds,
    players: gamePlayers,
    turnOrder: gamePlayers.map(player => player.id),
    currentPlayerIndex: 0,
    turnDirection: 1,
    drawPile: [],
    discardPile: [],
    season: null,
    drawPhaseSeason: null,
    seasonTurnsRemaining: 0,
    godsFavouritePlayerId: null,
    phase: 'waiting',
    movesRemaining: 0,
    pendingAction: null,
    blessingState: null,
    turnStartedAt: 0,
    turnTimeLimitSec: 60,
    winner: null,
    matchResult: null,
    log: ['Room created. Waiting for players to join.'],
  };
}

/**
 * Create a fresh GameState for a new game.
 * Deals 5 cards to each player, rest goes to draw pile.
 */
export function createGame(players: PlayerSetup[], config?: RoomConfig): GameState {
  if (players.length < 2 || players.length > 6) {
    throw new Error('Flower Game requires 2–6 players');
  }

  let drawPile = buildDeck();
  let discardPile: import('../types').Card[] = [];

  // Deal 5 cards to each player
  const gamePlayers: Player[] = players.map(p => {
    const { drawn, drawPile: newPile, discardPile: newDiscard } =
      drawCards(5, drawPile, discardPile);
    drawPile    = newPile;
    discardPile = newDiscard;

    return {
      id:     p.id,
      name:   p.name,
      hand:   drawn,
      garden: { sets: [] },
      matchStats: {
        flowersPlanted: 0,
      },
    };
  });

  const turnOrder = gamePlayers.map(p => p.id);
  const room = normalizeRoomConfig(players, config);

  return {
    id:                    uid(),
    gameStartedAt:         room.startedAt,
    roomName:              room.roomName,
    ownerPlayerId:         room.ownerPlayerId,
    minPlayers:            room.minPlayers,
    maxPlayers:            room.maxPlayers,
    readyPlayerIds:        room.readyPlayerIds,
    players:               gamePlayers,
    turnOrder,
    currentPlayerIndex:    0,
    turnDirection:         1,
    drawPile,
    discardPile,
    season:                null,
    drawPhaseSeason:       null,
    seasonTurnsRemaining:  0,
    godsFavouritePlayerId: null,
    phase:                 'draw', // first player skips blessing (no one has card yet)
    movesRemaining:        3,
    pendingAction:         null,
    blessingState:         null,
    turnStartedAt:         room.startedAt,
    turnTimeLimitSec:      60,
    winner:                null,
    matchResult:           null,
    log:                   ['Game started!'],
  };
}

// ── State Helpers ─────────────────────────────────────────────

export function getCurrentPlayer(state: GameState): Player {
  const id = state.turnOrder[state.currentPlayerIndex];
  const p  = state.players.find(p => p.id === id);
  if (!p) throw new Error(`Player ${id} not found`);
  return p;
}

export function getPlayer(state: GameState, id: string): Player {
  const p = state.players.find(p => p.id === id);
  if (!p) throw new Error(`Player ${id} not found`);
  return p;
}

export function updatePlayer(state: GameState, updated: Player): GameState {
  return {
    ...state,
    players: state.players.map(p => p.id === updated.id ? updated : p),
  };
}

export function incrementPlayerFlowersPlanted(state: GameState, playerId: string, amount = 1): GameState {
  if (amount <= 0) return state;
  const player = getPlayer(state, playerId);
  return updatePlayer(state, {
    ...player,
    matchStats: {
      flowersPlanted: (player.matchStats?.flowersPlanted ?? 0) + amount,
    },
  });
}

export function addLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

/**
 * Advance to the next player's turn.
 * Handles turn direction (normal / reversed after Eclipse).
 * Decrements season counter.
 */
export function advanceTurn(state: GameState): GameState {
  const count     = state.turnOrder.length;
  const nextIndex = (state.currentPlayerIndex + state.turnDirection + count) % count;

  // Decrement season turns
  let season               = state.season;
  let seasonTurnsRemaining = state.seasonTurnsRemaining;

  if (season !== null) {
    seasonTurnsRemaining -= 1;
    if (seasonTurnsRemaining <= 0) {
      season               = null;
      seasonTurnsRemaining = 0;
    }
  }

  const nextPlayer = state.players.find(p => p.id === state.turnOrder[nextIndex])!;
  // Determine starting phase: blessing if player is God's Favourite, else draw
  const phase = state.godsFavouritePlayerId === nextPlayer.id ? 'blessing' : 'draw';

  return {
    ...state,
    currentPlayerIndex:   nextIndex,
    season,
    drawPhaseSeason:       season,
    seasonTurnsRemaining,
    phase,
    movesRemaining:       3,
    pendingAction:        null,
    blessingState:        null,
    turnStartedAt:         Date.now(),
  };
}

/**
 * Update God's Favourite when a set is completed/extended.
 * Only triggers on BUILD — never on destruction.
 *
 * @param gardenOwnerId  The player whose garden the set belongs to
 */
export function updateGodsFavourite(
  state: GameState,
  gardenOwnerId: string
): { state: GameState; transferred: boolean } {
  if (state.godsFavouritePlayerId === gardenOwnerId) {
    return { state, transferred: false }; // already holds it
  }
  const newState = addLog(
    { ...state, godsFavouritePlayerId: gardenOwnerId },
    `👑 ${getPlayer(state, gardenOwnerId).name} is now God's Favourite!`
  );
  return { state: newState, transferred: true };
}
