// ============================================================
// FLOWER GAME — DECK BUILDER (122 cards)
// ============================================================

import { Card, FlowerCard, PowerCard, FlowerColor, PowerCardName } from '../types';
import { shuffle, uid } from '../utils/shuffle';

// ── Helpers ──────────────────────────────────────────────────

function flower(color: FlowerColor, isWildcard = false): FlowerCard {
  return { id: uid(), kind: 'flower', color, isWildcard };
}

function power(name: PowerCardName, isBlockable: boolean): PowerCard {
  return { id: uid(), kind: 'power', name, isBlockable };
}

function repeat<T>(fn: () => T, n: number): T[] {
  return Array.from({ length: n }, fn);
}

// ── Deck Definition ──────────────────────────────────────────

/**
 * Creates a fresh, shuffled 122-card deck.
 *
 * Flower Cards (55):
 *   Blue x9, Purple x9, Red x7, Orange x7, Yellow x7,
 *   Green x6, Black x6, Rainbow x2, Triple Rainbow x1, Divine x1
 *
 * Power Cards (66):
 *   Wind x20, Divine Protection x9, Bug x5, Bee x4,
 *   Double Happiness x4, Trade Present x3, Trade Fate x2,
 *   Let Go x2, Spring x3, Summer x3, Autumn x3, Winter x3,
 *   Natural Disaster x2, Eclipse x2, Great Reset x1
 *
 * Tracking (1):
 *   God's Favourite — kept separate, NOT in draw pile
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [
    // ── Flower Cards ────────────────────────────────────────
    ...repeat(() => flower('blue'),   9),
    ...repeat(() => flower('purple'), 9),
    ...repeat(() => flower('red'),    7),
    ...repeat(() => flower('orange'), 7),
    ...repeat(() => flower('yellow'), 7),
    ...repeat(() => flower('green'),  6),
    ...repeat(() => flower('black'),  6),
    ...repeat(() => flower('rainbow', true), 2),
    flower('triple_rainbow', true),   // standalone = normal set, combined = Solid Set
    flower('divine'),                 // plants as its own invulnerable complete set

    // ── Power Cards ─────────────────────────────────────────
    // isBlockable = true  → can be countered by Wind or Divine Protection
    // isBlockable = false → Unstoppable (except Wind, which is Blockable)
    ...repeat(() => power('wind',              true),  20),
    ...repeat(() => power('divine_protection', false),  9),
    ...repeat(() => power('bug',               true),   5),
    ...repeat(() => power('bee',               false),  4),
    ...repeat(() => power('double_happiness',  true),   4),
    ...repeat(() => power('trade_present',     true),   3),
    ...repeat(() => power('trade_fate',        true),   2),
    ...repeat(() => power('let_go',            false),  2),
    ...repeat(() => power('spring',            false),  3),
    ...repeat(() => power('summer',            false),  3),
    ...repeat(() => power('autumn',            false),  3),
    ...repeat(() => power('winter',            false),  3),
    ...repeat(() => power('natural_disaster',  true),   2),
    ...repeat(() => power('eclipse',           false),  2),
    power('great_reset', false),
  ];

  // Sanity check — 121 cards go into the draw pile.
  // The 122nd card (God's Favourite tracking card) is held aside separately.
  if (cards.length !== 121) {
    throw new Error(`Deck has ${cards.length} cards, expected 121 (God's Favourite is held aside)`);
  }

  return shuffle(cards);
}

/**
 * Reshuffles the discard pile into a new draw pile.
 * Called when draw pile reaches ≤9 cards.
 */
export function reshuffleDiscard(
  drawPile: Card[],
  discardPile: Card[]
): { drawPile: Card[]; discardPile: Card[] } {
  const newDrawPile = [...drawPile, ...shuffle(discardPile)];
  return { drawPile: newDrawPile, discardPile: [] };
}

/**
 * Draw `n` cards from the draw pile, reshuffling if needed.
 * Returns the drawn cards and the updated piles.
 */
export function drawCards(
  n: number,
  drawPile: Card[],
  discardPile: Card[]
): { drawn: Card[]; drawPile: Card[]; discardPile: Card[] } {
  let pile = [...drawPile];
  let discard = [...discardPile];

  // Reshuffle if we are at or below 9 cards
  if (pile.length <= 9) {
    const reshuffled = reshuffleDiscard(pile, discard);
    pile    = reshuffled.drawPile;
    discard = reshuffled.discardPile;
  }

  const drawn = pile.splice(0, n);
  return { drawn, drawPile: pile, discardPile: discard };
}
