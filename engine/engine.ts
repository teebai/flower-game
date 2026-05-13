// ============================================================
// FLOWER GAME — MAIN ENGINE
// ============================================================
// This is the single entry point for all game actions.
// The engine is stateless — it receives a GameState,
// applies an action, and returns a new GameState.
//
// Usage:
//   const engine = new FlowerGameEngine();
//   let state    = engine.createGame([...players]);
//   let result   = engine.applyAction(state, action);
//   if (result.success) state = result.state!;
// ============================================================

import { GameState, GameAction, ActionResult, GameEvent } from '../types';
import { createGame, getCurrentPlayer, getPlayer, updatePlayer, addLog, advanceTurn, updateGodsFavourite } from './gameState';
import {
  resolvePlant, resolveWind, resolveBug, resolveBee,
  resolveDoubleHappiness, resolveTradePresent, resolveTradeFate,
  resolveLetGo, resolveSeason, resolveNaturalDisaster,
  resolveEclipse, resolveGreatReset, resolveDiscardFlower,
} from './effects';
import { drawCards } from '../cards/deck';
import { checkWinner } from './winCondition';
import { normalizeGardenTokens } from './garden';
import { PlayerSetup } from './gameState';

function normalizeGameStateGardens(state: GameState): GameState {
  let nextState = state;

  for (const player of [...nextState.players]) {
    const normalized = normalizeGardenTokens(player.garden);
    if (!normalized.affectedSetId) continue;

    nextState = updatePlayer(nextState, { ...player, garden: normalized.garden });
    if (normalized.discardedFlowers?.length) {
      nextState = {
        ...nextState,
        discardPile: [...nextState.discardPile, ...normalized.discardedFlowers],
      };
      nextState = addLog(nextState, `${player.name}'s 7 different flowers became a token and returned to discard.`);
    }
    nextState = updateGodsFavourite(nextState, player.id).state;
  }

  return nextState;
}

function finalizeGameState(state: GameState): GameState {
  return checkWinner(normalizeGameStateGardens(state));
}

function finalizeActionResult(result: ActionResult): ActionResult {
  if (!result.success || !result.state) return result;
  return { ...result, state: finalizeGameState(result.state) };
}

function getTurnLimitMs(state: GameState): number {
  return Math.max(1, state.turnTimeLimitSec ?? 60) * 1000;
}

function clampTurnElapsedMs(state: GameState, now = Date.now()): number {
  const startedAt = Number(state.turnStartedAt ?? 0);
  if (!startedAt) return 0;
  return Math.max(0, Math.min(getTurnLimitMs(state), now - startedAt));
}

function resumeTurnClock(state: GameState, pausedTurnElapsedMs?: number): GameState {
  if (pausedTurnElapsedMs == null) return state;
  return {
    ...state,
    turnStartedAt: Date.now() - Math.max(0, pausedTurnElapsedMs),
  };
}

export class FlowerGameEngine {

  // ── Game Creation ───────────────────────────────────────────

  createGame(players: PlayerSetup[]): GameState {
    return createGame(players);
  }

  // ── Main Action Dispatcher ──────────────────────────────────

  applyAction(state: GameState, action: GameAction): ActionResult {
    try {
      // Block actions in game_over or waiting phase
      if (state.phase === 'game_over') {
        return { success: false, error: 'Game is already over' };
      }
      if (state.phase === 'waiting') {
        return { success: false, error: 'Game has not started yet' };
      }

      // Route counter actions (free, no move cost)
      if (action.type === 'counter_wind' || action.type === 'counter_divine' || action.type === 'counter_select_cards') {
        return finalizeActionResult(this.handleCounter(state, action));
      }

      // Validate it's this player's turn for non-counter actions
      const currentPlayer = getCurrentPlayer(state);
      if (currentPlayer.id !== action.playerId) {
        return { success: false, error: 'Not your turn' };
      }

      // Route by phase
      if (state.phase === 'blessing')  return finalizeActionResult(this.handleBlessing(state, action));
      if (state.phase === 'draw')      return finalizeActionResult(this.handleDraw(state, action));
      if (state.phase === 'action')    return finalizeActionResult(this.handleAction(state, action));
      if (state.phase === 'counter')   return finalizeActionResult(this.handleCounter(state, action));

      return { success: false, error: `Unknown phase: ${state.phase}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // ── Blessing Phase ──────────────────────────────────────────
  //
  // Two-step flow:
  //   Step 1: player sends `blessing_flip` → engine flips coin.
  //           Tails → advance to draw phase.
  //           Heads → reveal top 7, store in blessingState, stay in blessing phase.
  //   Step 2 (heads only): player sends `blessing_choose` with blessingPickedIds (2)
  //           and blessingArrangedIds (remaining 5 in desired order).
  //           Engine gives player the 2 picked cards, puts arranged 5 back on top.
  //           Then advances to action phase (draw replaced by blessing).
  //
  // Empty-hand + Heads special case:
  //   Engine draws 7 for the player first (empty-hand override), THEN reveals
  //   the next 7 for rearranging only (emptyHandMode=true → no picking 2,
  //   blessingPickedIds must be empty, blessingArrangedIds holds the order of 7).

  private handleBlessing(state: GameState, action: GameAction): ActionResult {
    const player = getCurrentPlayer(state);
    const drawPhaseSeason = state.drawPhaseSeason ?? state.season;

    if (drawPhaseSeason === 'winter') {
      if (action.type !== 'blessing_flip' && action.type !== 'pass') {
        return { success: false, error: 'Winter blocks Blessing — proceed to draw phase.' };
      }

      let s = addLog(state, `Winter blocks ${player.name}'s Blessing.`);
      s = { ...s, phase: 'draw', blessingState: null, turnStartedAt: 0 };
      return { success: true, state: s, events: [] };
    }

    // ── Step 1: flip the coin ──────────────────────────────────
    if (action.type === 'blessing_flip') {
      const coin: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
      const emptyHand = player.hand.length === 0;

      let s = addLog(state, `👑 ${player.name} flips the blessing coin: ${coin.toUpperCase()}!`);

      if (coin === 'tails') {
        // Nothing extra — proceed to normal draw phase
        s = addLog(s, 'Tails — proceed to draw phase.');
        s = { ...s, phase: 'draw', blessingState: null, turnStartedAt: 0 };
        return { success: true, state: s, events: [] };
      }

      // Heads — handle empty hand first
      if (emptyHand) {
        // Draw 7 cards as the empty-hand override
        const { drawn, drawPile, discardPile } = drawCards(7, s.drawPile, s.discardPile);
        s = updatePlayer({ ...s, drawPile, discardPile }, { ...player, hand: [...player.hand, ...drawn] });
        s = addLog(s, `${player.name} had an empty hand — drew 7 cards first.`);
      }

      // Reveal top 7 from draw pile (after any empty-hand draw)
      const revealedCards = s.drawPile.slice(0, 7);
      if (revealedCards.length === 0) {
        // No cards to reveal — skip blessing pick, go to action
        s = addLog(s, 'Draw pile too small to reveal cards — blessing skipped.');
        const movesAllowed = 3;
        s = { ...s, phase: 'action', movesRemaining: movesAllowed, blessingState: null, turnStartedAt: state.turnStartedAt || Date.now() };
        return { success: true, state: s, events: [] };
      }

      // Remove revealed cards from draw pile temporarily
      s = { ...s, drawPile: s.drawPile.slice(revealedCards.length) };
      s = {
        ...s,
        blessingState: { revealedCards, emptyHandMode: emptyHand, coinResult: 'heads' },
      };
      s = addLog(s, `Heads! ${player.name} sees the top ${revealedCards.length} card(s) and chooses ${emptyHand ? '0 (rearrange only)' : '2'} to keep.`);
      // Stay in blessing phase — waiting for blessing_choose
      return { success: true, state: s, events: [] };
    }

    // ── Step 2: player picks cards ─────────────────────────────
    if (action.type === 'blessing_choose') {
      if (!state.blessingState) {
        return { success: false, error: 'No blessing reveal in progress' };
      }

      const { revealedCards, emptyHandMode } = state.blessingState;
      const pickedIds   = action.blessingPickedIds   ?? [];
      const arrangedIds = action.blessingArrangedIds ?? [];

      if (emptyHandMode) {
        // In empty hand mode: no picking (pickedIds must be empty),
        // arrangedIds contains all 7 revealed cards in desired order.
        if (pickedIds.length !== 0) {
          return { success: false, error: 'In empty-hand blessing mode: do not pick cards, only rearrange.' };
        }
        if (arrangedIds.length !== revealedCards.length) {
          return { success: false, error: `Must provide all ${revealedCards.length} cards in arranged order.` };
        }
        // Validate all IDs belong to revealed cards
        const revealedIds = new Set(revealedCards.map(c => c.id));
        if (!arrangedIds.every(id => revealedIds.has(id))) {
          return { success: false, error: 'Arranged card IDs do not match revealed cards.' };
        }
        const arranged = arrangedIds.map(id => revealedCards.find(c => c.id === id)!);
        let s: GameState = { ...state, drawPile: [...arranged, ...state.drawPile], blessingState: null };
        s = addLog(s, `${player.name} rearranged the top ${arranged.length} card(s) on the draw pile.`);
        // Blessing replaced draw — go straight to action phase
        const movesAllowed = 3;
        s = { ...s, phase: 'action', movesRemaining: movesAllowed, turnStartedAt: state.turnStartedAt || Date.now() };
        return { success: true, state: s, events: [] };
      }

      // Normal mode: pick 2, arrange remaining 5
      if (pickedIds.length !== 2) {
        return { success: false, error: 'Must pick exactly 2 cards to keep.' };
      }
      const revealedIdSet = new Set(revealedCards.map(c => c.id));
      if (!pickedIds.every(id => revealedIdSet.has(id))) {
        return { success: false, error: 'Picked card IDs do not match revealed cards.' };
      }
      const remaining = revealedCards.filter(c => !pickedIds.includes(c.id));
      if (arrangedIds.length !== remaining.length) {
        return { success: false, error: `Must arrange exactly ${remaining.length} remaining cards.` };
      }
      const remainingIdSet = new Set(remaining.map(c => c.id));
      if (!arrangedIds.every(id => remainingIdSet.has(id))) {
        return { success: false, error: 'Arranged card IDs do not match remaining revealed cards.' };
      }

      const pickedCards = pickedIds.map(id => revealedCards.find(c => c.id === id)!);
      const arranged    = arrangedIds.map(id => remaining.find(c => c.id === id)!);

      // Give picked cards to player, put arranged back on top of draw pile
      let s = updatePlayer(state, { ...player, hand: [...player.hand, ...pickedCards] });
      s = { ...s, drawPile: [...arranged, ...s.drawPile], blessingState: null };
      s = addLog(s, `${player.name} took 2 cards from the blessing and rearranged the top ${arranged.length} on the draw pile.`);
      // Blessing replaced draw — go straight to action phase
      const movesAllowed = 3;
      s = { ...s, phase: 'action', movesRemaining: movesAllowed, turnStartedAt: state.turnStartedAt || Date.now() };
      return { success: true, state: s, events: [] };
    }

    return { success: false, error: 'In blessing phase: send blessing_flip first, then blessing_choose.' };
  }

  // ── Draw Phase ──────────────────────────────────────────────

  private handleDraw(state: GameState, action: GameAction): ActionResult {
    const drawPhaseSeason = state.drawPhaseSeason ?? state.season;
    if (action.type !== 'pass') {
      // Draw is automatic — pass is used to trigger it
      return { success: false, error: 'Use "pass" action to draw cards' };
    }

    const player    = getCurrentPlayer(state);
    const emptyHand = player.hand.length === 0;
    const isWinter  = drawPhaseSeason === 'winter';

    // Empty hand always draws 7 (even in Winter)
    // Winter (non-empty hand): no draw
    const drawCount = emptyHand ? 7 : (isWinter ? 0 : (drawPhaseSeason === 'summer' ? 3 : 2));

    let s = state;

    if (drawCount > 0) {
      const { drawn, drawPile, discardPile } = drawCards(drawCount, state.drawPile, state.discardPile);
      const updatedPlayer = { ...player, hand: [...player.hand, ...drawn] };
      s = updatePlayer({ ...state, drawPile, discardPile }, updatedPlayer);
      s = addLog(s, `${player.name} drew ${drawn.length} card(s).`);
    } else {
      s = addLog(s, `${player.name} draws no cards (Winter).`);
    }

    const movesAllowed = isWinter ? 1 : 3;
    s = { ...s, phase: 'action', movesRemaining: movesAllowed, turnStartedAt: state.turnStartedAt || Date.now() };

    return { success: true, state: s, events: [] };
  }

  // ── Action Phase ─────────────────────────────────────────────

  private handleAction(state: GameState, action: GameAction): ActionResult {
    const isSpringFreePlant =
      state.season === 'spring' &&
      (action.type === 'plant_own' || action.type === 'plant_opponent');
    const isPass = action.type === 'pass';

    if (state.movesRemaining <= 0 && !isSpringFreePlant && !isPass) {
      return { success: false, error: 'No moves remaining' };
    }

    // Discard validation
    if (action.type === 'discard_flower' && state.season !== 'autumn') {
      return { success: false, error: 'Discard is only allowed during Autumn' };
    }

    let result: { state: GameState; events: GameEvent[] };

    switch (action.type) {
      case 'plant_own':
        result = resolvePlant(state, action, false);
        break;
      case 'plant_opponent':
        result = resolvePlant(state, action, true);
        break;
      case 'play_wind_single':
      case 'play_wind_double': {
        if (!action.targetPlayerId) return { success: false, error: 'No target player specified' };
        if (!action.targetSetId) return { success: false, error: 'Wind requires a target set' };
        if (!action.cardIds || action.cardIds.length !== (action.type === 'play_wind_double' ? 2 : 1)) {
          return { success: false, error: action.type === 'play_wind_double' ? 'Double Wind requires 2 Wind cards' : 'Wind requires 1 Wind card' };
        }
        const windCount = action.type === 'play_wind_double' ? 2 : 1;
        const windTarget = getPlayer(state, action.targetPlayerId);
        const windSet    = windTarget.garden.sets.find(s => s.id === action.targetSetId);
        if (!windSet) return { success: false, error: 'Target set not found' };
        if (windSet.isDivine) return { success: false, error: 'Divine sets are invulnerable' };
        if (windSet.isSolid) return { success: false, error: 'Solid sets are immune to Wind' };
        if (windSet.containsTripleRainbow && windCount !== 2) {
          return { success: false, error: 'Triple Rainbow requires Double Wind' };
        }

        // Wind now resolves immediately (no counter window)
        const actor = getPlayer(state, action.playerId);
        const cardIds = action.cardIds ?? [];
        const playedCards = actor.hand.filter(c => cardIds.includes(c.id));
        const updatedHand = actor.hand.filter(c => !cardIds.includes(c.id));
        let windState = updatePlayer(state, { ...actor, hand: updatedHand });
        windState = { ...windState, discardPile: [...windState.discardPile, ...playedCards] };
        result = resolveWind(windState, action, windCount);
        break;
      }
      case 'play_bug': {
        // Validate target before opening counter window — prevents unsolvable freeze
        if (!action.targetPlayerId || !action.targetSetId) {
          return { success: false, error: 'Bug requires a target player and set' };
        }
        const bugTarget = getPlayer(state, action.targetPlayerId);
        const bugSet    = bugTarget.garden.sets.find(s => s.id === action.targetSetId);
        if (!bugSet)   return { success: false, error: 'Target set not found' };
        if (bugSet.isDivine) return { success: false, error: 'Divine sets are invulnerable' };
        if (bugSet.isSolid && state.season !== 'autumn') {
          return { success: false, error: 'Cannot target a Solid Set with Bug outside Autumn' };
        }
        // Autumn Bug: validate specific flower targets if provided
        if (state.season === 'autumn' && action.targetCardIds) {
          if (action.targetCardIds.length !== 2) {
            return { success: false, error: 'Autumn Bug requires exactly 2 target flowers' };
          }
          const setFlowerIds = new Set(bugSet.flowers.map(f => f.id));
          if (!action.targetCardIds.every(id => setFlowerIds.has(id))) {
            return { success: false, error: 'Target flowers must be in the selected set' };
          }
        }
        return { success: true, state: this.openCounterWindow(state, action), events: [] };
      }
      case 'play_bee':
        result = resolveBee(state, action);
        break;
      case 'play_double_happiness_take': {
        if (!action.targetPlayerId)
          return { success: false, error: 'Double Happiness requires a target player' };
        if (getPlayer(state, action.targetPlayerId).hand.length === 0)
          return { success: false, error: 'Target player has no cards to take' };
        return { success: true, state: this.openCounterWindow(state, action), events: [] };
      }
      case 'play_double_happiness_give': {
        if (!action.targetPlayerId)
          return { success: false, error: 'Double Happiness requires a target player' };
        if (!action.targetCardIds || action.targetCardIds.length < 2)
          return { success: false, error: 'Double Happiness (give) requires 2 cards to give' };
        return { success: true, state: this.openCounterWindow(state, action), events: [] };
      }
      case 'play_trade_present': {
        if (!action.targetPlayerId)
          return { success: false, error: 'Trade Present requires a target player' };
        if (!action.offeredCardId)
          return { success: false, error: 'Trade Present requires a card to offer' };
        if (getPlayer(state, action.targetPlayerId).hand.length === 0)
          return { success: false, error: 'Target player has no cards to trade' };
        const s = this.openCounterWindow(state, action);
        return { success: true, state: s, events: [] };
      }
      case 'play_trade_fate': {
        const s = this.openCounterWindow(state, action);
        return { success: true, state: s, events: [] };
      }
      // ── Global cards (no target required) ────────────────────
      case 'play_let_go': {
        if (!action.cardIds || action.cardIds.length !== 1) {
          return { success: false, error: 'Let Go requires 1 card' };
        }
        result = resolveLetGo(state, action);
        break;
      }
      case 'play_season': {
        if (!action.cardIds || action.cardIds.length !== 1) {
          return { success: false, error: 'Season requires 1 card' };
        }
        result = resolveSeason(state, action);
        break;
      }
      case 'play_eclipse': {
        if (!action.cardIds || action.cardIds.length !== 1) {
          return { success: false, error: 'Eclipse requires 1 card' };
        }
        result = resolveEclipse(state, action);
        break;
      }
      case 'play_great_reset': {
        if (!action.cardIds || action.cardIds.length !== 1) {
          return { success: false, error: 'Great Reset requires 1 card' };
        }
        result = resolveGreatReset(state, action);
        break;
      }

      // ── Targeted cards ───────────────────────────────────────
      case 'play_natural_disaster': {
        // Validate BEFORE opening counter window — prevents unsolvable freeze
        if (!action.targetPlayerId || !action.targetSetId) {
          return { success: false, error: 'Natural Disaster requires a target player and set' };
        }
        const ndTarget = getPlayer(state, action.targetPlayerId);
        const ndSet    = ndTarget.garden.sets.find(s => s.id === action.targetSetId);
        if (!ndSet)         return { success: false, error: 'Target set not found' };
        if (ndSet.isDivine) return { success: false, error: 'Divine sets are invulnerable' };
        return { success: true, state: this.openCounterWindow(state, action), events: [] };
      }
      case 'discard_flower':
        result = resolveDiscardFlower(state, action);
        break;
      case 'pass':
        result = { state, events: [] };
        break;
      default:
        return { success: false, error: `Unknown action: ${action.type}` };
    }

    // Decrement moves / end turn
    let s = result.state;
    const movesCost = isSpringFreePlant ? 0 : 1;
    const movesPerTurn = (season: GameState['season']) => season === 'winter' ? 1 : 3;

    let movesLeft = state.movesRemaining - movesCost;
    if (action.type === 'play_season') {
      const usedMovesBefore = movesPerTurn(state.season) - state.movesRemaining;
      const usedMovesAfter  = usedMovesBefore + movesCost;
      movesLeft = movesPerTurn(s.season) - usedMovesAfter;
    }

    movesLeft = Math.max(0, movesLeft);
    const springActive = s.season === 'spring';

    if (action.type === 'pass' || ((movesCost > 0 && movesLeft <= 0) && !springActive) || s.phase === 'game_over') {
      s = s.phase === 'game_over' ? s : advanceTurn(s);
    } else {
      s = { ...s, movesRemaining: movesLeft };
    }

    return { success: true, state: s, events: result.events };
  }

  // ── Counter Window ───────────────────────────────────────────

  private openCounterWindow(
    state: GameState,
    action: GameAction,
    windCount?: number
  ): GameState {
    const now = Date.now();
    const actor = getPlayer(state, action.playerId);
    const offeredCard = action.offeredCardId
      ? actor.hand.find(c => c.id === action.offeredCardId)
      : undefined;

    // Separate played cards from the rest of the hand
    const cardIds     = action.cardIds ?? [];
    const playedCards = actor.hand.filter(c => cardIds.includes(c.id));
    const updatedHand = actor.hand.filter(c => !cardIds.includes(c.id));

    // Remove from hand; add to discard immediately — they are spent regardless of outcome
    let s = updatePlayer(state, { ...actor, hand: updatedHand });
    s = { ...s, discardPile: [...s.discardPile, ...playedCards] };

    s = {
      ...s,
      phase: 'counter',
      pendingAction: {
        original:       action,
        windCount,
        targetPlayerId: action.targetPlayerId!,
        responded:      false,
        offeredCard,
        pausedTurnElapsedMs: clampTurnElapsedMs(state, now),
        playedCards,
        startedAt:      now,
        responseTimeLimitSec: 14,
      },
    };
    const actionLabel = ({
      play_wind_single: 'Wind',
      play_wind_double: 'Double Wind',
      play_bug: 'Bug',
      play_double_happiness_take: 'Double Happiness',
      play_double_happiness_give: 'Double Happiness',
      play_trade_present: 'Trade Present',
      play_trade_fate: 'Trade Fate',
      play_natural_disaster: 'Natural Disaster',
    } as Record<string, string>)[action.type] ?? action.type.replace(/^play_/, '').replace(/_/g, ' ');
    s = addLog(s, `${actor.name} played ${actionLabel} on ${getPlayer(state, action.targetPlayerId!).name} — counter window open.`);
    return s;
  }

  // ── Counter Resolution ────────────────────────────────────────

  private handleCounter(state: GameState, action: GameAction): ActionResult {
    if (!state.pendingAction) {
      return { success: false, error: 'No pending action to counter' };
    }

    const pending = state.pendingAction;
    const target  = getPlayer(state, pending.targetPlayerId);

    if (action.playerId !== pending.targetPlayerId) {
      return { success: false, error: 'Only the targeted player can counter' };
    }

    const events: GameEvent[] = [];

    // ── Divine Protection ──────────────────────────────────────
    if (action.type === 'counter_divine') {
      const dpCardId = action.cardIds![0];
      const dpCard   = target.hand.find(c => c.id === dpCardId);
      if (!dpCard) return { success: false, error: 'Divine Protection card not found in hand' };

      // Check if original action is blockable
      // (Wind is Blockable = true; we re-use the card's isBlockable flag stored at play time)
      // For simplicity we check by action type
      const unstoppableActions = [
        'play_bee', 'play_let_go', 'play_season', 'play_eclipse', 'play_great_reset'
      ];
      if (unstoppableActions.includes(pending.original.type)) {
        return { success: false, error: 'That action cannot be countered by Divine Protection' };
      }

      const coin: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';

      // Remove DP card from target's hand
      let s = updatePlayer(state, {
        ...target,
        hand: target.hand.filter(c => c.id !== dpCardId),
      });
      s = { ...s, discardPile: [...s.discardPile, dpCard] };
      s = addLog(s, `${target.name} uses Divine Protection — coin flip: ${coin.toUpperCase()}!`);

      if (coin === 'heads') {
        // Block the action entirely
        s = resumeTurnClock({ ...s, phase: 'action', pendingAction: null }, pending.pausedTurnElapsedMs);
        s = addLog(s, 'Blocked! The action is cancelled.');
        s = checkWinner(s);
        if (s.phase === 'game_over') {
          return { success: true, state: s, events };
        }

        // Move doesn't cost them anything (counter is free), but original action move is consumed
        const movesLeft = state.movesRemaining - 1;
        s = movesLeft <= 0 ? advanceTurn(s) : { ...s, movesRemaining: movesLeft };
      } else {
        // Tails — action proceeds
        s = addLog(s, 'Tails — the action proceeds!');
        if (pending.original.type === 'play_double_happiness_take' || pending.original.type === 'play_trade_present') {
          const allowResult = this.allowAction(s, target.id);
          if (!allowResult.success || !allowResult.state) return allowResult;
          s = allowResult.state;
          events.push(...(allowResult.events ?? []));
        } else {
          const resolveResult = this.resolveAfterCounter(s, pending, pending.windCount);
          s = resolveResult.state;
          events.push(...resolveResult.events);
        }
      }

      return { success: true, state: s, events };
    }

    // ── Wind Counter ────────────────────────────────────────────
    if (action.type === 'counter_wind') {
      if (pending.original.type !== 'play_wind_single' && pending.original.type !== 'play_wind_double') {
        return { success: false, error: 'Wind counter only works against Wind cards' };
      }

      const windCardIds    = action.cardIds!; // 1 or 2 wind cards
      const counterCount   = windCardIds.length;
      const attackingCount = pending.windCount ?? 1;
      const remaining      = Math.max(0, attackingCount - counterCount);

      // Remove counter wind cards from target's hand
      let s = updatePlayer(state, {
        ...target,
        hand: target.hand.filter(c => !windCardIds.includes(c.id)),
      });
      const discardedCounters = target.hand.filter(c => windCardIds.includes(c.id));
      s = { ...s, discardPile: [...s.discardPile, ...discardedCounters] };
      s = addLog(s, `${target.name} counters with ${counterCount} Wind card(s). Remaining attack: ${remaining}`);

      if (remaining === 0) {
        // Fully blocked
        s = resumeTurnClock({ ...s, phase: 'action', pendingAction: null }, pending.pausedTurnElapsedMs);
        s = addLog(s, 'Wind fully blocked!');
        s = checkWinner(s);
        if (s.phase === 'game_over') {
          return { success: true, state: s, events };
        }

        const movesLeft = state.movesRemaining - 1;
        s = movesLeft <= 0 ? advanceTurn(s) : { ...s, movesRemaining: movesLeft };
      } else {
        // Partial block — resolve with remaining wind count
        const resolveResult = this.resolveAfterCounter(s, pending, remaining);
        s = resolveResult.state;
        events.push(...resolveResult.events);
      }

      return { success: true, state: s, events };
    }

    // ── Target card selection after allowing the action ─────────
    if (action.type === 'counter_select_cards') {
      if (!pending.selectionKind) {
        return { success: false, error: 'No card selection is pending' };
      }

      const selectedIds = action.cardIds ?? [];
      const requiredCount = pending.selectionKind === 'trade_present'
        ? 1
        : Math.min(2, target.hand.length);

      if (selectedIds.length !== requiredCount) {
        return { success: false, error: `Select exactly ${requiredCount} card(s)` };
      }
      if (!selectedIds.every(id => target.hand.some(card => card.id === id))) {
        return { success: false, error: 'Selected card not found in your hand' };
      }

      const updatedOriginal = pending.selectionKind === 'trade_present'
        ? { ...pending.original, requestedCardId: selectedIds[0] }
        : { ...pending.original, targetCardIds: selectedIds };

      let s = addLog(
        state,
        pending.selectionKind === 'trade_present'
          ? `${target.name} chose a card to exchange.`
          : `${target.name} chose ${selectedIds.length} card(s) to give.`
      );
      const resolveResult = this.resolveAfterCounter(s, { ...pending, original: updatedOriginal }, pending.windCount);
      s = resolveResult.state;
      events.push(...resolveResult.events);
      return { success: true, state: s, events };
    }

    return { success: false, error: 'Unknown counter action' };
  }

  // ── Allow (target passes counter window) ──────────────────────

  /** Called when the target explicitly allows the action (no counter). */
  allowAction(state: GameState, targetPlayerId: string): ActionResult {
    if (!state.pendingAction) {
      return { success: false, error: 'No pending action' };
    }
    if (state.pendingAction.targetPlayerId !== targetPlayerId) {
      return { success: false, error: 'Not the target player' };
    }

    if (state.pendingAction.original.type === 'play_double_happiness_take') {
      const s = addLog(
        {
          ...state,
          pendingAction: {
            ...state.pendingAction,
            responded: true,
            response: 'allow',
            selectionKind: 'double_happiness_take',
          },
        },
        `${getPlayer(state, targetPlayerId).name} is choosing 2 card(s) to give.`
      );
      return { success: true, state: s, events: [] };
    }

    if (state.pendingAction.original.type === 'play_trade_present') {
      const s = addLog(
        {
          ...state,
          pendingAction: {
            ...state.pendingAction,
            responded: true,
            response: 'allow',
            selectionKind: 'trade_present',
          },
        },
        `${getPlayer(state, targetPlayerId).name} is choosing a card to exchange.`
      );
      return { success: true, state: s, events: [] };
    }

    const events: GameEvent[] = [];
    const { state: resolved, events: ev } = this.resolveAfterCounter(
      state,
      state.pendingAction,
      state.pendingAction.windCount
    );
    events.push(...ev);
    return { success: true, state: resolved, events };
  }

  // ── Resolve after counter window closes ───────────────────────

  private resolveAfterCounter(
    state: GameState,
    pending: import('../types').PendingAction,
    remainingWind?: number
  ): { state: GameState; events: GameEvent[] } {
    let result: { state: GameState; events: GameEvent[] };
    const action = pending.original;

    switch (action.type) {
      case 'play_wind_single':
      case 'play_wind_double':
        result = resolveWind(state, action, remainingWind ?? 1);
        break;
      case 'play_bug':
        result = resolveBug(state, action);
        break;
      case 'play_trade_present':
        result = resolveTradePresent(state, action);
        break;
      case 'play_trade_fate':
        result = resolveTradeFate(state, action);
        break;
      case 'play_natural_disaster':
        result = resolveNaturalDisaster(state, action);
        break;
      case 'play_double_happiness_take':
        result = resolveDoubleHappiness(state, action, true);
        break;
      case 'play_double_happiness_give':
        result = resolveDoubleHappiness(state, action, false);
        break;
      default:
        throw new Error(`No resolver for ${action.type}`);
    }

    // Preserve game_over phase if checkWinner fired inside the resolver
    // NOTE: played cards were already moved to discard in openCounterWindow —
    // individual resolvers must NOT try to remove/discard them again.
    const resolvedPhase = result.state.phase === 'game_over' ? 'game_over' : 'action';
    let s: GameState = resumeTurnClock(
      { ...result.state, phase: resolvedPhase, pendingAction: null },
      pending.pausedTurnElapsedMs,
    );
    const movesLeft = state.movesRemaining - 1;

    if (s.phase === 'game_over') {
      // Game ended inside the resolver — don't advance turn
    } else if (movesLeft <= 0) {
      s = advanceTurn(s);
    } else {
      s = { ...s, movesRemaining: movesLeft };
    }

    return { state: s, events: result.events };
  }

  // ── Timeout auto-skip ─────────────────────────────────────────

  autoTimeout(state: GameState, actorPlayerId: string): ActionResult {
    if (state.phase === 'game_over') {
      return { success: false, error: 'Game is already over' };
    }

    const events: GameEvent[] = [];
    const timedOutPlayer = getPlayer(state, actorPlayerId);
    const timeoutMessage = state.phase === 'counter' && state.pendingAction?.selectionKind === 'trade_present'
      ? `⏱️ ${timedOutPlayer.name} ran out of time — a random trade card was selected.`
      : `⏱️ ${timedOutPlayer.name} ran out of time — auto-skip.`;
    let s = addLog(state, timeoutMessage);

    const absorb = (result: ActionResult): ActionResult | null => {
      if (!result.success || !result.state) return result;
      s = result.state;
      events.push(...(result.events ?? []));
      return null;
    };

    if (s.phase === 'counter') {
      if (!s.pendingAction || s.pendingAction.targetPlayerId !== actorPlayerId) {
        return { success: false, error: 'Only the counter target can timeout here' };
      }

      if (s.pendingAction.selectionKind) {
        const target = getPlayer(s, actorPlayerId);
        const requiredCount = s.pendingAction.selectionKind === 'trade_present'
          ? 1
          : Math.min(2, target.hand.length);
        const cardIds = s.pendingAction.selectionKind === 'trade_present'
          ? (target.hand.length > 0
              ? [target.hand[Math.floor(Math.random() * target.hand.length)].id]
              : [])
          : target.hand.slice(0, requiredCount).map(card => card.id);
        const result = this.handleCounter(s, { type: 'counter_select_cards', playerId: actorPlayerId, cardIds });
        return finalizeActionResult(absorb(result) ?? { success: true, state: s, events });
      }

      const result = this.allowAction(s, actorPlayerId);
      return finalizeActionResult(absorb(result) ?? { success: true, state: s, events });
    }

    const currentPlayer = getCurrentPlayer(s);
    if (currentPlayer.id !== actorPlayerId) {
      return { success: false, error: 'Only the active player can timeout on their turn' };
    }

    if (s.phase === 'blessing') {
      if (!s.blessingState) {
        const flipped = this.handleBlessing(s, { type: 'blessing_flip', playerId: actorPlayerId });
        const failure = absorb(flipped);
        if (failure) return finalizeActionResult(failure);
      }

      if (s.phase === 'blessing' && s.blessingState) {
        const revealed = s.blessingState.revealedCards;
        const pickedIds = s.blessingState.emptyHandMode ? [] : revealed.slice(0, 2).map(card => card.id);
        const arrangedIds = s.blessingState.emptyHandMode
          ? revealed.map(card => card.id)
          : revealed.slice(2).map(card => card.id);
        const chosen = this.handleBlessing(s, {
          type: 'blessing_choose',
          playerId: actorPlayerId,
          blessingPickedIds: pickedIds,
          blessingArrangedIds: arrangedIds,
        });
        const failure = absorb(chosen);
        if (failure) return finalizeActionResult(failure);
      }
    }

    if (s.phase === 'draw') {
      const drawn = this.handleDraw(s, { type: 'pass', playerId: actorPlayerId });
      const failure = absorb(drawn);
      if (failure) return finalizeActionResult(failure);
    }

    if (s.phase === 'action') {
      const passed = this.handleAction(s, { type: 'pass', playerId: actorPlayerId });
      const failure = absorb(passed);
      if (failure) return finalizeActionResult(failure);
    }

    return finalizeActionResult({ success: true, state: s, events });
  }

  // ── Query Helpers ─────────────────────────────────────────────

  getState(state: GameState): GameState {
    return state;
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'game_over';
  }

  getWinner(state: GameState): string | null {
    return state.winner;
  }
}

export default FlowerGameEngine;
