// ============================================================
// FLOWER GAME — boardgame.io GAME DEFINITION
// ============================================================

import type { Game } from 'boardgame.io';
import { INVALID_MOVE, Stage } from 'boardgame.io/core';
import { FlowerGameEngine } from '../engine/engine';
import { GameState, GameAction } from '../types';
import { createGame as createStartedGame, createWaitingRoom, addLog, type PlayerSetup } from '../engine/gameState';
import { shuffle } from '../utils/shuffle';

const engine = new FlowerGameEngine();

// ── Core helper ───────────────────────────────────────────────
//
// Applies an engine action, mutates G (boardgame.io Immer draft),
// and — if the engine advanced to a different player — fires
// endTurn so boardgame.io's current-player matches the engine.
//
// This is the ONLY place we call endTurn, keeping all turn logic
// inside the engine rather than scattered across hooks.

interface MoveCtx {
  G: GameState;
  ctx: {
    currentPlayer: string;
    activePlayers?: Record<string, string> | null;
  };
  // playerID = the authenticated player who made the move.
  // For regular moves this equals ctx.currentPlayer.
  // For STAGE moves this is the stage player (e.g. the counter target),
  // which is DIFFERENT from ctx.currentPlayer (the turn player).
  playerID?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events?: any;
}

/** Resolve the acting player: prefer playerID (stage-aware), fall back to currentPlayer. */
function actingPlayer({ ctx, playerID }: MoveCtx): string {
  return (playerID != null && playerID !== '') ? playerID : ctx.currentPlayer;
}

function finalizeMoveResult(
  ctx: MoveCtx,
  result: ReturnType<typeof engine.applyAction> | ReturnType<typeof engine.allowAction> | ReturnType<typeof engine.autoTimeout>,
  prevIndex: number,
  _rejectLabel: string,
  shouldEndStage = false
): typeof INVALID_MOVE | void {
  const { G, events } = ctx;

  if (!result.success || !result.state) {
    return INVALID_MOVE;
  }

  Object.assign(G, result.state);

  if (!events) return;

  // Counter window opened → activate only the target player
  if (G.phase === 'counter' && G.pendingAction) {
    events.setActivePlayers({
      value: { [G.pendingAction.targetPlayerId]: 'counterStage' },
      moveLimit: 1,
    });
    return;
  }

  if (shouldEndStage) {
    events.endStage();
  }

  if (G.currentPlayerIndex !== prevIndex && G.phase !== 'game_over') {
    events.endTurn({ next: G.turnOrder[G.currentPlayerIndex] });
  }
}

function applyMove(
  ctx: MoveCtx,
  action: GameAction
): typeof INVALID_MOVE | void {
  const prevIndex = ctx.G.currentPlayerIndex;
  const result = engine.applyAction(ctx.G, action);
  return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] move rejected:');
}

function applyCounterMove(
  ctx: MoveCtx,
  action: GameAction | null   // null = allowAction path
): typeof INVALID_MOVE | void {
  const { G } = ctx;
  if (!G.pendingAction) return INVALID_MOVE;

  // The player in the counter stage — NOT ctx.currentPlayer (the turn player)
  const stagePlayer = actingPlayer(ctx);
  const prevIndex   = G.currentPlayerIndex;

  let result: ReturnType<typeof engine.applyAction> | ReturnType<typeof engine.allowAction>;
  if (action) {
    result = engine.applyAction(G, { ...action, playerId: stagePlayer });
  } else {
    result = engine.allowAction(G, stagePlayer);
  }

  return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] counter move rejected:', true);
}

function applyTimeoutMove(ctx: MoveCtx): typeof INVALID_MOVE | void {
  const actorId = ctx.G.phase === 'counter'
    ? (ctx.G.pendingAction?.targetPlayerId ?? actingPlayer(ctx))
    : actingPlayer(ctx);
  const prevIndex = ctx.G.currentPlayerIndex;
  const shouldEndStage = !!(ctx.ctx.activePlayers && actorId && ctx.ctx.activePlayers[actorId]);
  const result = engine.autoTimeout(ctx.G, actorId);
  return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] timeout auto-move rejected:', shouldEndStage);
}

function getJoinedPlayers(G: GameState): PlayerSetup[] {
  return G.players
    .filter(player => player.name.trim())
    .map(player => ({ id: player.id, name: player.name.trim() }));
}

function toggleReadyState(G: GameState, playerID: string): GameState | null {
  if (G.phase !== 'waiting') return null;

  const player = G.players.find(entry => entry.id === playerID);
  if (!player || !player.name.trim()) return null;

  // Owner is always ready — cannot toggle off
  if (playerID === G.ownerPlayerId) return null;

  const ready = new Set(G.readyPlayerIds);
  const isReady = ready.has(playerID);
  if (isReady) {
    ready.delete(playerID);
  } else {
    ready.add(playerID);
  }

  return addLog(
    { ...G, readyPlayerIds: [...ready] },
    `${player.name} is ${isReady ? 'not ready' : 'ready'}.`
  );
}

function buildStartedGame(waitingState: GameState, startedByPlayerId: string): GameState | null {
  if (waitingState.phase !== 'waiting') return null;
  if (waitingState.ownerPlayerId !== startedByPlayerId) return null;

  const joinedPlayers = getJoinedPlayers(waitingState);
  if (joinedPlayers.length < waitingState.minPlayers || joinedPlayers.length > waitingState.maxPlayers) {
    return null;
  }

  // Enough players must be ready (owner is always ready)
  const readyJoinedCount = joinedPlayers.filter(p => waitingState.readyPlayerIds.includes(p.id)).length;
  if (readyJoinedCount < waitingState.minPlayers) return null;

  const shuffledPlayers = shuffle(joinedPlayers);
  const startedAt = Date.now();
  const startedState = createStartedGame(shuffledPlayers, {
    roomName: waitingState.roomName,
    ownerPlayerId: waitingState.ownerPlayerId,
    minPlayers: waitingState.minPlayers,
    maxPlayers: waitingState.maxPlayers,
    readyPlayerIds: waitingState.readyPlayerIds.filter(playerId => shuffledPlayers.some(player => player.id === playerId)),
    startedAt,
  });

  const starter = joinedPlayers.find(player => player.id === startedByPlayerId)?.name ?? 'Room owner';
  const firstPlayer = startedState.players[startedState.currentPlayerIndex]?.name ?? 'Unknown';
  startedState.log = [
    ...waitingState.log,
    `${starter} started the game with ${joinedPlayers.length} players.`,
    `Seats shuffled. ${firstPlayer} goes first.`,
    ...startedState.log,
  ];
  return startedState;
}

function kickPlayerState(G: GameState, playerID: string, targetPlayerID: string): GameState | null {
  if (G.phase !== 'waiting') return null;
  if (playerID !== G.ownerPlayerId) return null;
  if (targetPlayerID === G.ownerPlayerId) return null;

  const target = G.players.find(p => p.id === targetPlayerID);
  if (!target) return null;

  const nextPlayers = G.players.filter(p => p.id !== targetPlayerID);
  const nextReady = G.readyPlayerIds.filter(id => id !== targetPlayerID);
  const nextTurnOrder = G.turnOrder.filter(id => id !== targetPlayerID);

  return addLog(
    { ...G, players: nextPlayers, readyPlayerIds: nextReady, turnOrder: nextTurnOrder },
    `${target.name} was kicked from the room.`
  );
}

// ── Game Definition ───────────────────────────────────────────

export const FlowerGame: Game<GameState> = {
  name: 'flower-game',

  setup: ({ ctx }, setupData?: { names?: string[]; roomName?: string; minPlayers?: number; maxPlayers?: number }) => {
    const names = setupData?.names ?? [];
    const players = ctx.playOrder.map((id, i) => ({
      id,
      name: names[i] ?? '',
    }));
    return createWaitingRoom(players, {
      roomName: setupData?.roomName,
      ownerPlayerId: ctx.playOrder[0] ?? null,
      minPlayers: setupData?.minPlayers ?? 3,
      maxPlayers: setupData?.maxPlayers ?? players.length,
    });
  },

  turn: {
    // boardgame.io turn management:
    // - No move limit (our engine decides when a turn ends via advanceTurn)
    // - endTurn is called explicitly inside applyMove when the engine advances
    activePlayers: { all: Stage.NULL },

    stages: {
      // Counter window: only the targeted player can act here.
      // IMPORTANT: use `playerID` (who clicked), NOT `ctx.currentPlayer`
      // (the turn player who played the card).
      counterStage: {
        moves: {
          counterWind({ G, ctx, playerID, events }, ...windCardIds: string[]) {
            return applyCounterMove(
              { G, ctx, playerID, events },
              { type: 'counter_wind', playerId: playerID ?? ctx.currentPlayer, cardIds: windCardIds }
            );
          },
          counterDivine({ G, ctx, playerID, events }, cardId: string) {
            return applyCounterMove(
              { G, ctx, playerID, events },
              { type: 'counter_divine', playerId: playerID ?? ctx.currentPlayer, cardIds: [cardId] }
            );
          },
          allowAction({ G, ctx, playerID, events }) {
            return applyCounterMove({ G, ctx, playerID, events }, null);
          },
          selectResponseCards({ G, ctx, playerID, events }, ...cardIds: string[]) {
            return applyCounterMove(
              { G, ctx, playerID, events },
              { type: 'counter_select_cards', playerId: playerID ?? ctx.currentPlayer, cardIds }
            );
          },
          timeoutAuto({ G, ctx, playerID, events }) {
            return applyTimeoutMove({ G, ctx, playerID, events });
          },
        },
      },
    },
  },

  moves: {
    toggleReady({ G, playerID }) {
      if (!playerID) return INVALID_MOVE;
      const nextState = toggleReadyState(G, playerID);
      if (!nextState) return INVALID_MOVE;
      Object.assign(G, nextState);
    },

    startGame({ G, playerID, events }) {
      if (!playerID) return INVALID_MOVE;
      const nextState = buildStartedGame(G, playerID);
      if (!nextState) return INVALID_MOVE;
      Object.assign(G, nextState);
      if (events) {
        events.endTurn({ next: G.turnOrder[G.currentPlayerIndex] });
      }
    },

    kickPlayer({ G, playerID }, targetPlayerID: string) {
      if (!playerID || !targetPlayerID) return INVALID_MOVE;
      const nextState = kickPlayerState(G, playerID, targetPlayerID);
      if (!nextState) return INVALID_MOVE;
      Object.assign(G, nextState);
    },

    // ── Blessing ──────────────────────────────────────────────
    blessingFlip({ G, ctx, playerID, events }) {
      return applyMove({ G, ctx, playerID, events }, { type: 'blessing_flip', playerId: ctx.currentPlayer });
    },

    blessingChoose({ G, ctx, playerID, events }, pickedIds: string[], arrangedIds: string[]) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'blessing_choose', playerId: ctx.currentPlayer,
        blessingPickedIds: pickedIds, blessingArrangedIds: arrangedIds,
      });
    },

    // ── Draw ───────────────────────────────────────────────────
    pass({ G, ctx, playerID, events }) {
      return applyMove({ G, ctx, playerID, events }, { type: 'pass', playerId: ctx.currentPlayer });
    },

    timeoutAuto({ G, ctx, playerID, events }) {
      return applyTimeoutMove({ G, ctx, playerID, events });
    },

    // ── Planting ───────────────────────────────────────────────
    plantOwn({ G, ctx, playerID, events }, cardId: string, targetSetId?: string, chosenColor?: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'plant_own', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetSetId,
        chosenColor: chosenColor as GameAction['chosenColor'],
      });
    },

    plantOpponent({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, targetSetId?: string, chosenColor?: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'plant_opponent', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, targetSetId,
        chosenColor: chosenColor as GameAction['chosenColor'],
      });
    },

    // ── Wind ──────────────────────────────────────────────────
    playWindSingle({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, targetSetId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_wind_single', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, targetSetId,
      });
    },

    playWindDouble(
      { G, ctx, playerID, events },
      cardId1: string,
      cardId2: string,
      targetPlayerId: string,
      targetSetId: string,
      targetSetIds?: string[]
    ) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_wind_double', playerId: ctx.currentPlayer,
        cardIds: [cardId1, cardId2], targetPlayerId, targetSetId, targetSetIds,
      });
    },

    // ── Bug / Bee ─────────────────────────────────────────────
    playBug({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, targetSetId: string, targetCardIds?: string[]) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_bug', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, targetSetId, targetCardIds,
      });
    },

    playBee({ G, ctx, playerID, events }, beeCardId: string, discardFlowerId: string, targetPlayerId: string, targetSetId?: string, chosenColor?: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_bee', playerId: ctx.currentPlayer,
        cardIds: [beeCardId, discardFlowerId], targetPlayerId, targetSetId,
        chosenColor: chosenColor as GameAction['chosenColor'],
      });
    },

    // ── Double Happiness ──────────────────────────────────────
    doubleHappinessTake({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_double_happiness_take', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId,
      });
    },

    doubleHappinessGive({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, give1: string, give2: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_double_happiness_give', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, targetCardIds: [give1, give2],
      });
    },

    // ── Trade ─────────────────────────────────────────────────
    tradePresent({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, offeredCardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_trade_present', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, offeredCardId,
      });
    },

    tradeFate({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_trade_fate', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId,
      });
    },

    // ── Hand management ───────────────────────────────────────
    letGo({ G, ctx, playerID, events }, cardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_let_go', playerId: ctx.currentPlayer, cardIds: [cardId],
      });
    },

    // ── Season cards ──────────────────────────────────────────
    playSeason({ G, ctx, playerID, events }, cardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_season', playerId: ctx.currentPlayer, cardIds: [cardId],
      });
    },

    // ── Power cards ───────────────────────────────────────────
    naturalDisaster({ G, ctx, playerID, events }, cardId: string, targetPlayerId: string, targetSetId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_natural_disaster', playerId: ctx.currentPlayer,
        cardIds: [cardId], targetPlayerId, targetSetId,
      });
    },

    playEclipse({ G, ctx, playerID, events }, cardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_eclipse', playerId: ctx.currentPlayer, cardIds: [cardId],
      });
    },

    playGreatReset({ G, ctx, playerID, events }, cardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'play_great_reset', playerId: ctx.currentPlayer, cardIds: [cardId],
      });
    },

    // ── Autumn discard ────────────────────────────────────────
    discardFlower({ G, ctx, playerID, events }, cardId: string) {
      return applyMove({ G, ctx, playerID, events }, {
        type: 'discard_flower', playerId: ctx.currentPlayer, cardIds: [cardId],
      });
    },
  },

  // ── Win condition ─────────────────────────────────────────────
  endIf({ G }) {
    if (G.phase === 'game_over' && G.winner) {
      return { winner: G.winner };
    }
  },

  // ── Player view (hide draw pile only) ──
  // Card-hiding disabled for hands — this is a real-time social game
  // where cards are played openly. Hiding causes bugs when playerID
  // type mismatches (string vs number) or arrives undefined.
  playerView({ G, playerID }) {
    if (!playerID) return G; // spectator
    const currentTurnPlayerId = G.turnOrder[G.currentPlayerIndex];
    const blessingState = playerID === currentTurnPlayerId ? G.blessingState : null;
    const isTradePresentWindow = G.pendingAction?.original.type === 'play_trade_present';
    const canSeeTradeOffer = isTradePresentWindow && (
      playerID === G.pendingAction?.original.playerId
      || (playerID === G.pendingAction?.targetPlayerId && G.pendingAction?.selectionKind === 'trade_present')
    );
    const pendingAction = G.pendingAction
      ? {
          ...G.pendingAction,
          offeredCard: canSeeTradeOffer ? G.pendingAction.offeredCard : undefined,
        }
      : null;
    return {
      ...G,
      blessingState,
      pendingAction,
      drawPile: [],
    };
  },
};

export default FlowerGame;
