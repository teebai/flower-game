// ============================================================
// FLOWER GAME — WIN CONDITION CHECKER
// ============================================================

import { GameState, MatchResultPlayerSummary, MatchResultSummary, Player } from '../types';
import { hasWinningSetCount } from './garden';

function summarizePlayer(state: GameState, player: Player): MatchResultPlayerSummary {
  const gardenSetCount = player.garden.sets.length;
  const completeSetCount = player.garden.sets.filter(set => set.isComplete).length;
  const solidSetCount = player.garden.sets.filter(set => set.isSolid).length;
  const divineSetCount = player.garden.sets.filter(set => set.isDivine).length;
  const totalFlowers = player.garden.sets.reduce((sum, set) => sum + set.flowers.length, 0);

  return {
    playerId: player.id,
    playerName: player.name,
    won: state.winner === player.id,
    handCount: player.hand.length,
    gardenSetCount,
    completeSetCount,
    solidSetCount,
    divineSetCount,
    totalFlowers,
    flowersPlanted: player.matchStats?.flowersPlanted ?? 0,
    isGodsFavourite: state.godsFavouritePlayerId === player.id,
  };
}

function buildMatchResult(state: GameState, winnerPlayerId: string): MatchResultSummary {
  const finishedAt = Date.now();
  const startedAt = state.gameStartedAt > 0 ? state.gameStartedAt : finishedAt;
  const durationSec = Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
  const resultState = { ...state, winner: winnerPlayerId };
  const winner = resultState.players.find(player => player.id === winnerPlayerId) ?? null;

  return {
    finishedAt,
    durationSec,
    winnerPlayerId,
    winnerName: winner?.name ?? null,
    seasonAtFinish: resultState.season,
    drawPileCount: resultState.drawPile.length,
    discardPileCount: resultState.discardPile.length,
    players: resultState.players.map(player => summarizePlayer(resultState, player)),
  };
}

/**
 * Check all players for a win condition after every state change.
 *
 * Win requires ALL THREE simultaneously:
 *  1. 3 completed sets in garden
 *  2. Empty hand (0 cards)
 *  3. Not currently God's Favourite
 */
export function checkWinner(state: GameState): GameState {
  for (const player of state.players) {
    if (isWinner(state, player)) {
      const matchResult = buildMatchResult(state, player.id);
      return {
        ...state,
        winner: player.id,
        phase:  'game_over',
        matchResult,
        log:    [...state.log, `🌸 ${player.name} wins the game!`],
      };
    }
  }
  return state;
}

export function isWinner(state: GameState, player: Player): boolean {
  const hasThreeSets    = hasWinningSetCount(player.garden);
  const hasEmptyHand    = player.hand.length === 0;
  const isNotGodsFav    = state.godsFavouritePlayerId !== player.id;

  return hasThreeSets && hasEmptyHand && isNotGodsFav;
}
