// ============================================================
// FLOWER GAME — CARD EFFECT RESOLVERS
// ============================================================

import {
  GameState, GameAction, GameEvent,
  FlowerCard, Card, Player,
} from '../types';
import {
  getPlayer, updatePlayer, addLog, updateGodsFavourite, incrementPlayerFlowersPlanted,
} from './gameState';
import {
  plantFlower, removeFromSet, canBugTarget, canWindTarget, findTargetSet, resolveSetColor, normalizeGardenTokens,
} from './garden';
import { drawCards, reshuffleDiscard } from '../cards/deck';
import { shuffle } from '../utils/shuffle';
import { checkWinner } from './winCondition';

export interface EffectResult {
  state: GameState;
  events: GameEvent[];
}

// ── Shared helpers ────────────────────────────────────────────

function removeCardsFromHand(hand: Card[], cardIds: string[]): Card[] {
  return hand.filter(c => !cardIds.includes(c.id));
}

function getFlowersFromDiscard(state: GameState): FlowerCard[] {
  return state.discardPile.filter(
    (c): c is FlowerCard => c.kind === 'flower'
  );
}

function normalizeStateGardenTokens(state: GameState): GameState {
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

function finalizeEffectState(state: GameState, events: GameEvent[]): EffectResult {
  const normalized = normalizeStateGardenTokens(state);
  return { state: checkWinner(normalized), events };
}

// ── Plant ─────────────────────────────────────────────────────

/**
 * Plant a flower into a player's garden (own or opponent's).
 * - If own garden: just plant
 * - If opponent's garden: actor draws 2 cards as reward
 */
export function resolvePlant(
  state: GameState,
  action: GameAction,
  isOpponent: boolean
): EffectResult {
  const events: GameEvent[] = [];
  const actor    = getPlayer(state, action.playerId);
  const targetId = isOpponent ? action.targetPlayerId! : action.playerId;
  const target   = getPlayer(state, targetId);

  // Find the flower card in actor's hand
  const flowerCardId = action.cardIds![0];
  const selectedCard = actor.hand.find(c => c.id === flowerCardId);
  if (!selectedCard) throw new Error('Flower card not found in hand');
  if (selectedCard.kind !== 'flower') throw new Error('Only flower cards can be planted');
  const flowerCard = selectedCard as FlowerCard;

  // Plant the flower
  const { garden, triggersGodsFavourite, discardedFlowers } = plantFlower(
    target.garden,
    flowerCard,
    action.targetSetId,
    action.chosenColor,
    'explicit'
  );

  let s: GameState;

  if (isOpponent) {
    // Update target's garden first, then update actor's hand separately
    s = updatePlayer(state, { ...target, garden });
    let newHand = removeCardsFromHand(actor.hand, [flowerCardId]);
    const { drawn, drawPile, discardPile } = drawCards(2, s.drawPile, s.discardPile);
    newHand = [...newHand, ...drawn];
    s = { ...s, drawPile, discardPile };
    s = updatePlayer(s, { ...actor, hand: newHand });
    s = addLog(s, `${actor.name} planted in ${target.name}'s garden and drew 2 cards.`);
  } else {
    // Same player — update garden AND hand together in one call to avoid overwrite
    const newHand = removeCardsFromHand(actor.hand, [flowerCardId]);
    s = updatePlayer(state, { ...actor, garden, hand: newHand });
    s = addLog(s, `${actor.name} planted a ${flowerCard.color} flower.`);
  }

  s = incrementPlayerFlowersPlanted(s, actor.id);

  if (discardedFlowers?.length) {
    s = { ...s, discardPile: [...s.discardPile, ...discardedFlowers] };
    s = addLog(s, `${target.name}'s 7 different flowers became a token and returned to discard.`);
  }

  events.push({ type: 'flower_planted', playerId: targetId, data: { color: flowerCard.color } });

  // God's Favourite — garden OWNER gets the status
  if (triggersGodsFavourite) {
    const { state: ns, transferred } = updateGodsFavourite(s, targetId);
    s = ns;
    if (transferred) {
      events.push({ type: 'gods_favourite_transferred', playerId: targetId });
    }
  }

  return finalizeEffectState(s, events);
}

// ── Wind ──────────────────────────────────────────────────────

/**
 * Resolve Wind after counter window (no counter, or partial counter).
 * remainingWindCount: 1 = steal 1 flower, 2 = steal 4 flowers.
 */
export function resolveWind(
  state: GameState,
  action: GameAction,
  remainingWindCount: number
): EffectResult {
  const events: GameEvent[] = [];
  const target  = getPlayer(state, action.targetPlayerId!);
  const stealCount = remainingWindCount === 2 ? 4 : 1;
  const isDouble   = remainingWindCount === 2;

  const requestedSetIds = [
    action.targetSetId,
    ...(isDouble ? (action.targetSetIds ?? []) : []),
  ].filter((setId): setId is string => !!setId);

  const fallbackSetIds = target.garden.sets
    .filter(set => canWindTarget(set, isDouble) && set.flowers.length > 0)
    .map(set => set.id);

  const orderedSetIds: string[] = [];
  for (const setId of [...requestedSetIds, ...fallbackSetIds]) {
    if (!orderedSetIds.includes(setId)) orderedSetIds.push(setId);
  }

  const stolenChunks: Array<{ removedFlowers: FlowerCard[]; sourceSetColor: ReturnType<typeof resolveSetColor> }> = [];
  let targetGarden = target.garden;

  for (const setId of orderedSetIds) {
    const remainingToSteal = stealCount - stolenChunks.reduce((sum, chunk) => sum + chunk.removedFlowers.length, 0);
    if (remainingToSteal <= 0) break;

    const currentSet = targetGarden.sets.find(set => set.id === setId);
    if (!currentSet || !canWindTarget(currentSet, isDouble) || currentSet.flowers.length === 0) continue;

    const actualSteal = Math.min(remainingToSteal, currentSet.flowers.length);
    const sourceSetColor = resolveSetColor(currentSet);
    const removal = removeFromSet(targetGarden, currentSet.id, actualSteal);
    targetGarden = removal.garden;
    stolenChunks.push({ removedFlowers: removal.removedFlowers, sourceSetColor });
  }

  const totalStolen = stolenChunks.reduce((sum, chunk) => sum + chunk.removedFlowers.length, 0);
  if (totalStolen === 0) {
    const s = addLog(state, `Wind had no valid target in ${target.name}'s garden.`);
    return { state: s, events };
  }

  let s = updatePlayer(state, { ...target, garden: targetGarden });

  // Stolen flowers blow into the actor's garden. Preserve the source set's
  // effective colour for Bee / Rainbow wildcards so mixed sets stay grouped.
  const actor = getPlayer(s, action.playerId);
  let actorGarden = actor.garden;
  let shouldCheckGodsFavourite = false;
  const discardedDuringWind: FlowerCard[] = [];

  for (const chunk of stolenChunks) {
    const { removedFlowers, sourceSetColor } = chunk;
    let followSetId: string | undefined;

    const orderedRemovedFlowers = sourceSetColor
      ? [
          ...removedFlowers.filter(f => !f.isWildcard && f.color === sourceSetColor),
          ...removedFlowers.filter(f => f.isWildcard || f.color === 'triple_rainbow'),
          ...removedFlowers.filter(f => !(!f.isWildcard && f.color === sourceSetColor) && !(f.isWildcard || f.color === 'triple_rainbow')),
        ]
      : removedFlowers;

    for (const flower of orderedRemovedFlowers) {
      const preservedColor = flower.representedColor
        ?? (flower.kind === 'flower' && !flower.isWildcard && flower.color !== 'rainbow' && flower.color !== 'triple_rainbow' && flower.color !== 'divine'
          ? flower.color
          : undefined)
        ?? sourceSetColor
        ?? undefined;
      const chosenColor = (flower.isWildcard || flower.color === 'triple_rainbow')
        ? preservedColor
        : undefined;
      const targetSetId = preservedColor
        ? followSetId ?? findTargetSet(actorGarden, preservedColor, false)?.id
        : undefined;

      const planted = plantFlower(actorGarden, flower, targetSetId, chosenColor, 'auto');
      actorGarden = planted.garden;
      shouldCheckGodsFavourite = shouldCheckGodsFavourite || planted.triggersGodsFavourite;
      if (planted.discardedFlowers?.length) discardedDuringWind.push(...planted.discardedFlowers);

      if (sourceSetColor && preservedColor === sourceSetColor) {
        followSetId = planted.affectedSetId;
      }
    }
  }

  s = updatePlayer(s, { ...actor, garden: actorGarden });
  if (discardedDuringWind.length) {
    s = { ...s, discardPile: [...s.discardPile, ...discardedDuringWind] };
    s = addLog(s, `${actor.name}'s 7 different flowers became a token and returned to discard.`);
  }
  if (shouldCheckGodsFavourite) {
    s = updateGodsFavourite(s, action.playerId).state;
  }
  s = addLog(s, `${actor.name} blew ${totalStolen} flower(s) from ${target.name}'s garden into their own garden with Wind.`);

  events.push({ type: 'flower_stolen', playerId: action.playerId, targetPlayerId: action.targetPlayerId, data: { count: totalStolen } });

  return finalizeEffectState(s, events);
}

// ── Bug ───────────────────────────────────────────────────────

export function resolveBug(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const isAutumn   = state.season === 'autumn';
  const discardCount = isAutumn ? 2 : 1;
  const target     = getPlayer(state, action.targetPlayerId!);
  const targetSet  = target.garden.sets.find(s => s.id === action.targetSetId);

  if (!targetSet) throw new Error('Target set not found');
  if (!canBugTarget(targetSet, isAutumn)) throw new Error('Set is immune to Bug');

  // During Autumn, Bug avoids the Triple Rainbow card automatically
  const { garden, removedFlowers } = removeFromSet(
    target.garden,
    targetSet.id,
    discardCount
  );

  let s = updatePlayer(state, { ...target, garden });
  s = { ...s, discardPile: [...s.discardPile, ...removedFlowers] };

  const actor = getPlayer(s, action.playerId);
  s = addLog(s, `${actor.name} used Bug on ${target.name} — discarded ${removedFlowers.length} flower(s).`);
  events.push({ type: 'flower_destroyed', playerId: action.targetPlayerId!, data: { count: removedFlowers.length } });

  return finalizeEffectState(s, events);
}

// ── Bee ───────────────────────────────────────────────────────

export function resolveBee(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor    = getPlayer(state, action.playerId);
  const targetId = action.targetPlayerId ?? action.playerId;
  const target   = getPlayer(state, targetId);

  const flowers = getFlowersFromDiscard(state);
  if (flowers.length === 0) throw new Error('No flowers in discard pile');

  // Find the chosen flower from discard
  const flowerCardId = action.cardIds![1]; // [0] = bee card, [1] = chosen discard flower
  const flowerCard   = flowers.find(f => f.id === flowerCardId);
  if (!flowerCard) throw new Error('Chosen flower not in discard pile');
  if (flowerCard.color === 'triple_rainbow') {
    throw new Error('Bee cannot take Triple Rainbow from discard');
  }

  // Bee flower acts as a wildcard
  const wildcardFlower: FlowerCard = {
    ...flowerCard,
    isWildcard: true,
    representedColor: undefined,
  };

  // Remove from discard
  let s: GameState = {
    ...state,
    discardPile: state.discardPile.filter(c => c.id !== flowerCard.id),
  };

  // Plant into target garden
  const { garden, triggersGodsFavourite, discardedFlowers } = plantFlower(
    target.garden,
    wildcardFlower,
    action.targetSetId,
    action.chosenColor,
    'explicit'
  );

  s = updatePlayer(s, { ...target, garden });

  // Remove Bee card from actor's hand.
  // If Bee targets the acting player's own garden, merge the updated hand with
  // the already-updated garden instead of overwriting that garden state.
  const beeCardId = action.cardIds![0];
  if (actor.id === target.id) {
    const updatedSelf = getPlayer(s, actor.id);
    s = updatePlayer(s, {
      ...updatedSelf,
      hand: removeCardsFromHand(updatedSelf.hand, [beeCardId]),
    });
  } else {
    const actorUpdated = { ...actor, hand: removeCardsFromHand(actor.hand, [beeCardId]) };
    s = updatePlayer(s, actorUpdated);
  }
  s = addLog(s, `${actor.name} used Bee — planted a wildcard flower from discard into ${target.name}'s garden.`);
  s = incrementPlayerFlowersPlanted(s, actor.id);
  if (discardedFlowers?.length) {
    s = { ...s, discardPile: [...s.discardPile, ...discardedFlowers] };
    s = addLog(s, `${target.name}'s 7 single flowers became a token and returned to discard.`);
  }

  events.push({ type: 'flower_planted', playerId: targetId, data: { source: 'bee' } });

  if (triggersGodsFavourite) {
    const { state: ns, transferred } = updateGodsFavourite(s, targetId);
    s = ns;
    if (transferred) events.push({ type: 'gods_favourite_transferred', playerId: targetId });
  }

  return finalizeEffectState(s, events);
}

// ── Double Happiness ──────────────────────────────────────────

export function resolveDoubleHappiness(
  state: GameState,
  action: GameAction,
  isTake: boolean
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const target = getPlayer(state, action.targetPlayerId!);

  // DH card already removed by openCounterWindow
  let actorHand  = [...actor.hand];
  let targetHand = [...target.hand];

  if (isTake) {
    // Hidden hands in the client mean the acting player cannot choose exact cards.
    // If specific target IDs are not provided, take up to 2 random cards.
    const takenIds = (action.targetCardIds && action.targetCardIds.length > 0)
      ? action.targetCardIds.slice(0, 2)
      : shuffle([...targetHand]).slice(0, Math.min(2, targetHand.length)).map(c => c.id);
    const taken    = targetHand.filter(c => takenIds.includes(c.id));
    targetHand     = removeCardsFromHand(targetHand, takenIds);
    actorHand      = [...actorHand, ...taken];
  } else {
    // Give 2 chosen hand cards to target.
    const givenIds = action.targetCardIds?.slice(0, 2) ?? action.cardIds!.slice(1, 3);
    const given    = actorHand.filter(c => givenIds.includes(c.id));
    actorHand      = removeCardsFromHand(actorHand, givenIds);
    targetHand     = [...targetHand, ...given];
  }

  let s = updatePlayer(state,  { ...actor,  hand: actorHand });
      s = updatePlayer(s,       { ...target, hand: targetHand });
  s = addLog(s, `${actor.name} used Double Happiness (${isTake ? 'took' : 'gave'} 2 cards).`);
  events.push({ type: 'cards_transferred', playerId: action.playerId, targetPlayerId: action.targetPlayerId });

  return finalizeEffectState(s, events);
}

// ── Trade Present ─────────────────────────────────────────────

export function resolveTradePresent(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const target = getPlayer(state, action.targetPlayerId!);

  // NOTE: The Trade Present card (action.cardIds[0]) was already removed from
  // actor's hand and added to discard in openCounterWindow. Only remove the
  // offered card from the actor's hand here.
  const actorOfferId  = action.offeredCardId!;
  const actorCard  = actor.hand.find(c => c.id === actorOfferId);
  if (!actorCard) throw new Error('Trade Present: offered card not found');

  const targetOfferId = action.requestedCardId && target.hand.some(c => c.id === action.requestedCardId)
    ? action.requestedCardId
    : shuffle([...target.hand])[0]?.id;
  const targetCard = target.hand.find(c => c.id === targetOfferId);
  if (!targetCard) throw new Error('Trade Present: target has no card to trade');

  const actorHand  = [...removeCardsFromHand(actor.hand, [actorOfferId]),  targetCard];
  const targetHand = [...removeCardsFromHand(target.hand, [targetOfferId]), actorCard];

  let s = updatePlayer(state, { ...actor,  hand: actorHand });
      s = updatePlayer(s,     { ...target, hand: targetHand });
  s = addLog(s, `${actor.name} and ${target.name} exchanged 1 card (Trade Present).`);
  events.push({ type: 'cards_transferred', playerId: action.playerId, targetPlayerId: action.targetPlayerId });

  return finalizeEffectState(s, events);
}

// ── Trade Fate ────────────────────────────────────────────────

export function resolveTradeFate(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const target = getPlayer(state, action.targetPlayerId!);

  // NOTE: The Trade Fate card was already removed from actor's hand and
  // added to discard in openCounterWindow. actor.hand here is already
  // the hand WITHOUT the TF card — swap it directly with target's hand.
  const actorHand  = [...target.hand]; // actor gets target's full hand
  const targetHand = [...actor.hand];  // target gets actor's hand (TF already removed)

  let s = updatePlayer(state, { ...actor,  hand: actorHand });
      s = updatePlayer(s,     { ...target, hand: targetHand });
  s = addLog(s, `${actor.name} swapped entire hand with ${target.name} (Trade Fate).`);
  events.push({ type: 'hand_swapped', playerId: action.playerId, targetPlayerId: action.targetPlayerId });

  return finalizeEffectState(s, events);
}

// ── Let Go ────────────────────────────────────────────────────

export function resolveLetGo(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const lgCardId = action.cardIds![0];

  // Discard entire hand (excluding Let Go itself, which was played)
  const toDiscard = removeCardsFromHand(actor.hand, [lgCardId]);
  const actorUpdated = { ...actor, hand: [] };

  let s: GameState = {
    ...state,
    discardPile: [...state.discardPile, ...toDiscard],
  };
  s = updatePlayer(s, actorUpdated);
  s = addLog(s, `${actor.name} played Let Go — discarded their entire hand!`);

  events.push({ type: 'card_played', playerId: action.playerId, data: { card: 'let_go' } });

  return finalizeEffectState(s, events);
}

// ── Season ────────────────────────────────────────────────────

export function resolveSeason(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor     = getPlayer(state, action.playerId);
  const cardId    = action.cardIds![0];
  const card      = actor.hand.find(c => c.id === cardId) as import('../types').PowerCard;
  const newSeason = card.name as import('../types').Season;
  const previousSeason = state.season;
  const leavingWinterForAnotherSeason = previousSeason === 'winter' && newSeason !== 'winter';
  const immediateDrawCount = leavingWinterForAnotherSeason
    ? (newSeason === 'summer' ? 3 : 2)
    : (newSeason === 'summer' ? 1 : 0);

  let s: GameState = {
    ...state,
    season:               newSeason,
    seasonTurnsRemaining: 3,
    discardPile:          [...state.discardPile, card],
  };

  let updatedActor = { ...actor, hand: removeCardsFromHand(actor.hand, [cardId]) };
  if (immediateDrawCount > 0) {
    const { drawn, drawPile, discardPile } = drawCards(immediateDrawCount, s.drawPile, s.discardPile);
    updatedActor = { ...updatedActor, hand: [...updatedActor.hand, ...drawn] };
    s = { ...s, drawPile, discardPile };
  }

  s = updatePlayer(s, updatedActor);
  const drawNote = leavingWinterForAnotherSeason
    ? ` (+${immediateDrawCount} immediate draw${immediateDrawCount === 1 ? '' : 's'} after leaving Winter)`
    : newSeason === 'summer'
      ? ' (+1 immediate draw)'
      : '';
  s = addLog(s, `${actor.name} played ${newSeason} — season changes!${drawNote}`);
  events.push({ type: 'season_changed', playerId: action.playerId, data: { season: newSeason } });

  return finalizeEffectState(s, events);
}

// ── Natural Disaster ──────────────────────────────────────────

export function resolveNaturalDisaster(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const target = getPlayer(state, action.targetPlayerId!);
  const setId  = action.targetSetId!;

  // These checks already passed in handleAction before openCounterWindow,
  // but we validate again here as a safety net.
  const set = target.garden.sets.find(s => s.id === setId);
  if (!set)         throw new Error('Target set not found');
  if (set.isDivine) throw new Error('Divine sets are invulnerable');

  // Destroy entire set — flowers go to discard
  const { garden, removedFlowers } = removeFromSet(target.garden, setId, -1);

  // NOTE: The Natural Disaster card itself was already removed from actor's hand
  // and added to the discard pile inside openCounterWindow. Do NOT try to
  // remove or discard it again here — the card is already gone from hand.
  let s: GameState = {
    ...state,
    discardPile: [...state.discardPile, ...removedFlowers],
  };
  s = updatePlayer(s, { ...target, garden });
  s = addLog(s, `${actor.name} unleashed Natural Disaster on ${target.name}'s set! (God's Favourite status unchanged)`);

  // NOTE: God's Favourite is NOT transferred on set destruction
  events.push({ type: 'flower_destroyed', playerId: action.targetPlayerId!, data: { count: removedFlowers.length } });

  return finalizeEffectState(s, events);
}

// ── Eclipse ───────────────────────────────────────────────────

export function resolveEclipse(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor    = getPlayer(state, action.playerId);
  const eclipseCardId = action.cardIds![0];
  const eclipseCard = actor.hand.find(c => c.id === eclipseCardId);

  // Reverse only the direction. Keeping the canonical turnOrder intact makes
  // advanceTurn() reliably move to the previous player on subsequent turns.
  const newDirection: 1 | -1 = state.turnDirection === 1 ? -1 : 1;

  // Collect all hands
  let allCards: Card[] = [];
  const playerCount    = state.players.length;

  for (const p of state.players) {
    allCards = [...allCards, ...p.hand];
  }
  // Remove Eclipse card from pool (it was played, goes to discard)
  allCards = allCards.filter(c => c.id !== eclipseCardId);

  // Shuffle collected cards
  const shuffled = shuffle(allCards);

  // Distribute evenly in the new reversed order.
  const dealOrder = newDirection === -1 ? [...state.turnOrder].reverse() : [...state.turnOrder];
  const perPlayer     = Math.floor(shuffled.length / playerCount);
  const leftoverCount = shuffled.length % playerCount;
  const leftover      = shuffled.slice(shuffled.length - leftoverCount);
  const toDistribute  = shuffled.slice(0, shuffled.length - leftoverCount);

  const handsByPlayerId = new Map<string, Card[]>();
  dealOrder.forEach((playerId, i) => {
    const start = i * perPlayer;
    handsByPlayerId.set(playerId, toDistribute.slice(start, start + perPlayer));
  });

  let s: GameState = {
    ...state,
    turnDirection: newDirection,
    discardPile: [...state.discardPile, ...(eclipseCard ? [eclipseCard] : []), ...leftover],
    players: state.players.map(p => ({ ...p, hand: handsByPlayerId.get(p.id) ?? [] })),
  };

  s = addLog(s, `${actor.name} played Eclipse — turn direction reversed, hands redistributed!`);
  events.push({ type: 'turn_order_reversed', playerId: action.playerId });
  events.push({ type: 'hands_redistributed', playerId: action.playerId });

  return finalizeEffectState(s, events);
}

// ── Great Reset ───────────────────────────────────────────────

export function resolveGreatReset(
  state: GameState,
  action: GameAction
): EffectResult {
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const grCardId = action.cardIds![0];

  // All players discard their hands
  let allDiscarded: Card[] = [];
  for (const p of state.players) {
    allDiscarded = [...allDiscarded, ...p.hand.filter(c => c.id !== grCardId)];
  }

  let s: GameState = {
    ...state,
    season:               null,
    seasonTurnsRemaining: 0,
    discardPile:          [...state.discardPile, ...allDiscarded],
    players:              state.players.map(p => ({ ...p, hand: [] })),
  };

  // Each player draws 5 from the main draw pile
  for (const p of s.players) {
    const { drawn, drawPile, discardPile } = drawCards(5, s.drawPile, s.discardPile);
    s = {
      ...s,
      drawPile,
      discardPile,
      players: s.players.map(pl => pl.id === p.id ? { ...pl, hand: drawn } : pl),
    };
  }

  s = addLog(s, `${actor.name} triggered Great Reset — all hands discarded, 5 drawn each, season reset!`);
  events.push({ type: 'hands_redistributed', playerId: action.playerId, data: { type: 'great_reset' } });

  return finalizeEffectState(s, events);
}

// ── Discard Flower (Autumn) ───────────────────────────────────

export function resolveDiscardFlower(
  state: GameState,
  action: GameAction
): EffectResult {
  if (state.season !== 'autumn') throw new Error('Discard is only allowed during Autumn');
  const events: GameEvent[] = [];
  const actor  = getPlayer(state, action.playerId);
  const cardId = action.cardIds![0];

  const flower = actor.hand.find(c => c.id === cardId) as FlowerCard;
  if (!flower || flower.kind !== 'flower') throw new Error('Card is not a flower');

  const updatedHand = removeCardsFromHand(actor.hand, [cardId]);
  let s = updatePlayer(state, { ...actor, hand: updatedHand });
  s = { ...s, discardPile: [...s.discardPile, flower] };
  s = addLog(s, `${actor.name} discarded a ${flower.color} flower (Autumn).`);

  return finalizeEffectState(s, events);
}
