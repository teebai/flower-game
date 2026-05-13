"use strict";
// ============================================================
// FLOWER GAME — DECK BUILDER (122 cards)
// ============================================================
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawCards = exports.reshuffleDiscard = exports.buildDeck = void 0;
var shuffle_1 = require("../utils/shuffle");
// ── Helpers ──────────────────────────────────────────────────
function flower(color, isWildcard) {
    if (isWildcard === void 0) { isWildcard = false; }
    return { id: (0, shuffle_1.uid)(), kind: 'flower', color: color, isWildcard: isWildcard };
}
function power(name, isBlockable) {
    return { id: (0, shuffle_1.uid)(), kind: 'power', name: name, isBlockable: isBlockable };
}
function repeat(fn, n) {
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
function buildDeck() {
    var cards = __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], repeat(function () { return flower('blue'); }, 9), true), repeat(function () { return flower('purple'); }, 9), true), repeat(function () { return flower('red'); }, 7), true), repeat(function () { return flower('orange'); }, 7), true), repeat(function () { return flower('yellow'); }, 7), true), repeat(function () { return flower('green'); }, 6), true), repeat(function () { return flower('black'); }, 6), true), repeat(function () { return flower('rainbow', true); }, 2), true), [
        flower('triple_rainbow', true), // standalone = normal set, combined = Solid Set
        flower('divine')
    ], false), repeat(function () { return power('wind', true); }, 20), true), repeat(function () { return power('divine_protection', false); }, 9), true), repeat(function () { return power('bug', true); }, 5), true), repeat(function () { return power('bee', false); }, 4), true), repeat(function () { return power('double_happiness', true); }, 4), true), repeat(function () { return power('trade_present', true); }, 3), true), repeat(function () { return power('trade_fate', true); }, 2), true), repeat(function () { return power('let_go', false); }, 2), true), repeat(function () { return power('spring', false); }, 3), true), repeat(function () { return power('summer', false); }, 3), true), repeat(function () { return power('autumn', false); }, 3), true), repeat(function () { return power('winter', false); }, 3), true), repeat(function () { return power('natural_disaster', true); }, 2), true), repeat(function () { return power('eclipse', false); }, 2), true), [
        power('great_reset', false),
    ], false);
    // Sanity check — 121 cards go into the draw pile.
    // The 122nd card (God's Favourite tracking card) is held aside separately.
    if (cards.length !== 121) {
        throw new Error("Deck has ".concat(cards.length, " cards, expected 121 (God's Favourite is held aside)"));
    }
    return (0, shuffle_1.shuffle)(cards);
}
exports.buildDeck = buildDeck;
/**
 * Reshuffles the discard pile into a new draw pile.
 * Called when draw pile reaches ≤9 cards.
 */
function reshuffleDiscard(drawPile, discardPile) {
    var newDrawPile = __spreadArray(__spreadArray([], drawPile, true), (0, shuffle_1.shuffle)(discardPile), true);
    return { drawPile: newDrawPile, discardPile: [] };
}
exports.reshuffleDiscard = reshuffleDiscard;
/**
 * Draw `n` cards from the draw pile, reshuffling if needed.
 * Returns the drawn cards and the updated piles.
 */
function drawCards(n, drawPile, discardPile) {
    var pile = __spreadArray([], drawPile, true);
    var discard = __spreadArray([], discardPile, true);
    // Reshuffle if we are at or below 9 cards
    if (pile.length <= 9) {
        var reshuffled = reshuffleDiscard(pile, discard);
        pile = reshuffled.drawPile;
        discard = reshuffled.discardPile;
    }
    var drawn = pile.splice(0, n);
    return { drawn: drawn, drawPile: pile, discardPile: discard };
}
exports.drawCards = drawCards;
