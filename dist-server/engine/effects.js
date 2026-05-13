"use strict";
// ============================================================
// FLOWER GAME — CARD EFFECT RESOLVERS
// ============================================================
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.resolveDiscardFlower = exports.resolveGreatReset = exports.resolveEclipse = exports.resolveNaturalDisaster = exports.resolveSeason = exports.resolveLetGo = exports.resolveTradeFate = exports.resolveTradePresent = exports.resolveDoubleHappiness = exports.resolveBee = exports.resolveBug = exports.resolveWind = exports.resolvePlant = void 0;
var gameState_1 = require("./gameState");
var garden_1 = require("./garden");
var deck_1 = require("../cards/deck");
var shuffle_1 = require("../utils/shuffle");
var winCondition_1 = require("./winCondition");
// ── Shared helpers ────────────────────────────────────────────
function removeCardsFromHand(hand, cardIds) {
    return hand.filter(function (c) { return !cardIds.includes(c.id); });
}
function getFlowersFromDiscard(state) {
    return state.discardPile.filter(function (c) { return c.kind === 'flower'; });
}
function normalizeStateGardenTokens(state) {
    var _a;
    var nextState = state;
    for (var _i = 0, _b = __spreadArray([], nextState.players, true); _i < _b.length; _i++) {
        var player = _b[_i];
        var normalized = (0, garden_1.normalizeGardenTokens)(player.garden);
        if (!normalized.affectedSetId)
            continue;
        nextState = (0, gameState_1.updatePlayer)(nextState, __assign(__assign({}, player), { garden: normalized.garden }));
        if ((_a = normalized.discardedFlowers) === null || _a === void 0 ? void 0 : _a.length) {
            nextState = __assign(__assign({}, nextState), { discardPile: __spreadArray(__spreadArray([], nextState.discardPile, true), normalized.discardedFlowers, true) });
            nextState = (0, gameState_1.addLog)(nextState, "".concat(player.name, "'s 7 different flowers became a token and returned to discard."));
        }
        nextState = (0, gameState_1.updateGodsFavourite)(nextState, player.id).state;
    }
    return nextState;
}
function finalizeEffectState(state, events) {
    var normalized = normalizeStateGardenTokens(state);
    return { state: (0, winCondition_1.checkWinner)(normalized), events: events };
}
// ── Plant ─────────────────────────────────────────────────────
/**
 * Plant a flower into a player's garden (own or opponent's).
 * - If own garden: just plant
 * - If opponent's garden: actor draws 2 cards as reward
 */
function resolvePlant(state, action, isOpponent) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var targetId = isOpponent ? action.targetPlayerId : action.playerId;
    var target = (0, gameState_1.getPlayer)(state, targetId);
    // Find the flower card in actor's hand
    var flowerCardId = action.cardIds[0];
    var selectedCard = actor.hand.find(function (c) { return c.id === flowerCardId; });
    if (!selectedCard)
        throw new Error('Flower card not found in hand');
    if (selectedCard.kind !== 'flower')
        throw new Error('Only flower cards can be planted');
    var flowerCard = selectedCard;
    // Plant the flower
    var _a = (0, garden_1.plantFlower)(target.garden, flowerCard, action.targetSetId, action.chosenColor, 'explicit'), garden = _a.garden, triggersGodsFavourite = _a.triggersGodsFavourite, discardedFlowers = _a.discardedFlowers;
    var s;
    if (isOpponent) {
        // Update target's garden first, then update actor's hand separately
        s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { garden: garden }));
        var newHand = removeCardsFromHand(actor.hand, [flowerCardId]);
        var _b = (0, deck_1.drawCards)(2, s.drawPile, s.discardPile), drawn = _b.drawn, drawPile = _b.drawPile, discardPile = _b.discardPile;
        newHand = __spreadArray(__spreadArray([], newHand, true), drawn, true);
        s = __assign(__assign({}, s), { drawPile: drawPile, discardPile: discardPile });
        s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, actor), { hand: newHand }));
        s = (0, gameState_1.addLog)(s, "".concat(actor.name, " planted in ").concat(target.name, "'s garden and drew 2 cards."));
    }
    else {
        // Same player — update garden AND hand together in one call to avoid overwrite
        var newHand = removeCardsFromHand(actor.hand, [flowerCardId]);
        s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { garden: garden, hand: newHand }));
        s = (0, gameState_1.addLog)(s, "".concat(actor.name, " planted a ").concat(flowerCard.color, " flower."));
    }
    s = (0, gameState_1.incrementPlayerFlowersPlanted)(s, actor.id);
    if (discardedFlowers === null || discardedFlowers === void 0 ? void 0 : discardedFlowers.length) {
        s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), discardedFlowers, true) });
        s = (0, gameState_1.addLog)(s, "".concat(target.name, "'s 7 different flowers became a token and returned to discard."));
    }
    events.push({ type: 'flower_planted', playerId: targetId, data: { color: flowerCard.color } });
    // God's Favourite — garden OWNER gets the status
    if (triggersGodsFavourite) {
        var _c = (0, gameState_1.updateGodsFavourite)(s, targetId), ns = _c.state, transferred = _c.transferred;
        s = ns;
        if (transferred) {
            events.push({ type: 'gods_favourite_transferred', playerId: targetId });
        }
    }
    return finalizeEffectState(s, events);
}
exports.resolvePlant = resolvePlant;
// ── Wind ──────────────────────────────────────────────────────
/**
 * Resolve Wind after counter window (no counter, or partial counter).
 * remainingWindCount: 1 = steal 1 flower, 2 = steal 4 flowers.
 */
function resolveWind(state, action, remainingWindCount) {
    var _a, _b, _c, _d, _e, _f;
    var events = [];
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    var stealCount = remainingWindCount === 2 ? 4 : 1;
    var isDouble = remainingWindCount === 2;
    var requestedSetIds = __spreadArray([
        action.targetSetId
    ], (isDouble ? ((_a = action.targetSetIds) !== null && _a !== void 0 ? _a : []) : []), true).filter(function (setId) { return !!setId; });
    var fallbackSetIds = target.garden.sets
        .filter(function (set) { return (0, garden_1.canWindTarget)(set, isDouble) && set.flowers.length > 0; })
        .map(function (set) { return set.id; });
    var orderedSetIds = [];
    for (var _i = 0, _g = __spreadArray(__spreadArray([], requestedSetIds, true), fallbackSetIds, true); _i < _g.length; _i++) {
        var setId = _g[_i];
        if (!orderedSetIds.includes(setId))
            orderedSetIds.push(setId);
    }
    var stolenChunks = [];
    var targetGarden = target.garden;
    var _loop_1 = function (setId) {
        var remainingToSteal = stealCount - stolenChunks.reduce(function (sum, chunk) { return sum + chunk.removedFlowers.length; }, 0);
        if (remainingToSteal <= 0)
            return "break";
        var currentSet = targetGarden.sets.find(function (set) { return set.id === setId; });
        if (!currentSet || !(0, garden_1.canWindTarget)(currentSet, isDouble) || currentSet.flowers.length === 0)
            return "continue";
        var actualSteal = Math.min(remainingToSteal, currentSet.flowers.length);
        var sourceSetColor = (0, garden_1.resolveSetColor)(currentSet);
        var removal = (0, garden_1.removeFromSet)(targetGarden, currentSet.id, actualSteal);
        targetGarden = removal.garden;
        stolenChunks.push({ removedFlowers: removal.removedFlowers, sourceSetColor: sourceSetColor });
    };
    for (var _h = 0, orderedSetIds_1 = orderedSetIds; _h < orderedSetIds_1.length; _h++) {
        var setId = orderedSetIds_1[_h];
        var state_1 = _loop_1(setId);
        if (state_1 === "break")
            break;
    }
    var totalStolen = stolenChunks.reduce(function (sum, chunk) { return sum + chunk.removedFlowers.length; }, 0);
    if (totalStolen === 0) {
        var s_1 = (0, gameState_1.addLog)(state, "Wind had no valid target in ".concat(target.name, "'s garden."));
        return { state: s_1, events: events };
    }
    var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { garden: targetGarden }));
    // Stolen flowers blow into the actor's garden. Preserve the source set's
    // effective colour for Bee / Rainbow wildcards so mixed sets stay grouped.
    var actor = (0, gameState_1.getPlayer)(s, action.playerId);
    var actorGarden = actor.garden;
    var shouldCheckGodsFavourite = false;
    var discardedDuringWind = [];
    var _loop_2 = function (chunk) {
        var removedFlowers = chunk.removedFlowers, sourceSetColor = chunk.sourceSetColor;
        var followSetId = void 0;
        var orderedRemovedFlowers = sourceSetColor
            ? __spreadArray(__spreadArray(__spreadArray([], removedFlowers.filter(function (f) { return !f.isWildcard && f.color === sourceSetColor; }), true), removedFlowers.filter(function (f) { return f.isWildcard || f.color === 'triple_rainbow'; }), true), removedFlowers.filter(function (f) { return !(!f.isWildcard && f.color === sourceSetColor) && !(f.isWildcard || f.color === 'triple_rainbow'); }), true) : removedFlowers;
        for (var _k = 0, orderedRemovedFlowers_1 = orderedRemovedFlowers; _k < orderedRemovedFlowers_1.length; _k++) {
            var flower = orderedRemovedFlowers_1[_k];
            var preservedColor = (_d = (_c = (_b = flower.representedColor) !== null && _b !== void 0 ? _b : (flower.kind === 'flower' && !flower.isWildcard && flower.color !== 'rainbow' && flower.color !== 'triple_rainbow' && flower.color !== 'divine'
                ? flower.color
                : undefined)) !== null && _c !== void 0 ? _c : sourceSetColor) !== null && _d !== void 0 ? _d : undefined;
            var chosenColor = (flower.isWildcard || flower.color === 'triple_rainbow')
                ? preservedColor
                : undefined;
            var targetSetId = preservedColor
                ? followSetId !== null && followSetId !== void 0 ? followSetId : (_e = (0, garden_1.findTargetSet)(actorGarden, preservedColor, false)) === null || _e === void 0 ? void 0 : _e.id
                : undefined;
            var planted = (0, garden_1.plantFlower)(actorGarden, flower, targetSetId, chosenColor, 'auto');
            actorGarden = planted.garden;
            shouldCheckGodsFavourite = shouldCheckGodsFavourite || planted.triggersGodsFavourite;
            if ((_f = planted.discardedFlowers) === null || _f === void 0 ? void 0 : _f.length)
                discardedDuringWind.push.apply(discardedDuringWind, planted.discardedFlowers);
            if (sourceSetColor && preservedColor === sourceSetColor) {
                followSetId = planted.affectedSetId;
            }
        }
    };
    for (var _j = 0, stolenChunks_1 = stolenChunks; _j < stolenChunks_1.length; _j++) {
        var chunk = stolenChunks_1[_j];
        _loop_2(chunk);
    }
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, actor), { garden: actorGarden }));
    if (discardedDuringWind.length) {
        s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), discardedDuringWind, true) });
        s = (0, gameState_1.addLog)(s, "".concat(actor.name, "'s 7 different flowers became a token and returned to discard."));
    }
    if (shouldCheckGodsFavourite) {
        s = (0, gameState_1.updateGodsFavourite)(s, action.playerId).state;
    }
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " blew ").concat(totalStolen, " flower(s) from ").concat(target.name, "'s garden into their own garden with Wind."));
    events.push({ type: 'flower_stolen', playerId: action.playerId, targetPlayerId: action.targetPlayerId, data: { count: totalStolen } });
    return finalizeEffectState(s, events);
}
exports.resolveWind = resolveWind;
// ── Bug ───────────────────────────────────────────────────────
function resolveBug(state, action) {
    var events = [];
    var isAutumn = state.season === 'autumn';
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    var targetSet = target.garden.sets.find(function (s) { return s.id === action.targetSetId; });
    if (!targetSet)
        throw new Error('Target set not found');
    if (!(0, garden_1.canBugTarget)(targetSet, isAutumn))
        throw new Error('Set is immune to Bug');
    var s;
    var removedFlowers;
    if (isAutumn && action.targetCardIds && action.targetCardIds.length > 0) {
        // Autumn with specific flower targets: remove exactly those flowers
        var idsToRemove_1 = new Set(action.targetCardIds);
        removedFlowers = targetSet.flowers.filter(function (f) { return idsToRemove_1.has(f.id); });
        var remainingFlowers_1 = targetSet.flowers.filter(function (f) { return !idsToRemove_1.has(f.id); });
        var updatedSets = target.garden.sets.map(function (set) {
            return set.id === targetSet.id ? __assign(__assign({}, set), { flowers: remainingFlowers_1 }) : set;
        });
        s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { garden: { sets: updatedSets } }));
    }
    else {
        // Normal: auto-remove 1 (or 2 in Autumn without specific targets)
        var discardCount = isAutumn ? 2 : 1;
        var result = (0, garden_1.removeFromSet)(target.garden, targetSet.id, discardCount);
        s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { garden: result.garden }));
        removedFlowers = result.removedFlowers;
    }
    s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), removedFlowers, true) });
    var actor = (0, gameState_1.getPlayer)(s, action.playerId);
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " used Bug on ").concat(target.name, " \u2014 discarded ").concat(removedFlowers.length, " flower(s)."));
    events.push({ type: 'flower_destroyed', playerId: action.targetPlayerId, data: { count: removedFlowers.length } });
    return finalizeEffectState(s, events);
}
exports.resolveBug = resolveBug;
// ── Bee ───────────────────────────────────────────────────────
function resolveBee(state, action) {
    var _a;
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var targetId = (_a = action.targetPlayerId) !== null && _a !== void 0 ? _a : action.playerId;
    var target = (0, gameState_1.getPlayer)(state, targetId);
    var flowers = getFlowersFromDiscard(state);
    if (flowers.length === 0)
        throw new Error('No flowers in discard pile');
    // Find the chosen flower from discard
    var flowerCardId = action.cardIds[1]; // [0] = bee card, [1] = chosen discard flower
    var flowerCard = flowers.find(function (f) { return f.id === flowerCardId; });
    if (!flowerCard)
        throw new Error('Chosen flower not in discard pile');
    if (flowerCard.color === 'triple_rainbow') {
        throw new Error('Bee cannot take Triple Rainbow from discard');
    }
    // Bee flower acts as a wildcard
    var wildcardFlower = __assign(__assign({}, flowerCard), { isWildcard: true, representedColor: undefined });
    // Remove from discard
    var s = __assign(__assign({}, state), { discardPile: state.discardPile.filter(function (c) { return c.id !== flowerCard.id; }) });
    // Plant into target garden
    var _b = (0, garden_1.plantFlower)(target.garden, wildcardFlower, action.targetSetId, action.chosenColor, 'explicit'), garden = _b.garden, triggersGodsFavourite = _b.triggersGodsFavourite, discardedFlowers = _b.discardedFlowers;
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, target), { garden: garden }));
    // Remove Bee card from actor's hand.
    // If Bee targets the acting player's own garden, merge the updated hand with
    // the already-updated garden instead of overwriting that garden state.
    var beeCardId = action.cardIds[0];
    if (actor.id === target.id) {
        var updatedSelf = (0, gameState_1.getPlayer)(s, actor.id);
        s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, updatedSelf), { hand: removeCardsFromHand(updatedSelf.hand, [beeCardId]) }));
    }
    else {
        var actorUpdated = __assign(__assign({}, actor), { hand: removeCardsFromHand(actor.hand, [beeCardId]) });
        s = (0, gameState_1.updatePlayer)(s, actorUpdated);
    }
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " used Bee \u2014 planted a wildcard flower from discard into ").concat(target.name, "'s garden."));
    s = (0, gameState_1.incrementPlayerFlowersPlanted)(s, actor.id);
    if (discardedFlowers === null || discardedFlowers === void 0 ? void 0 : discardedFlowers.length) {
        s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), discardedFlowers, true) });
        s = (0, gameState_1.addLog)(s, "".concat(target.name, "'s 7 single flowers became a token and returned to discard."));
    }
    events.push({ type: 'flower_planted', playerId: targetId, data: { source: 'bee' } });
    if (triggersGodsFavourite) {
        var _c = (0, gameState_1.updateGodsFavourite)(s, targetId), ns = _c.state, transferred = _c.transferred;
        s = ns;
        if (transferred)
            events.push({ type: 'gods_favourite_transferred', playerId: targetId });
    }
    return finalizeEffectState(s, events);
}
exports.resolveBee = resolveBee;
// ── Double Happiness ──────────────────────────────────────────
function resolveDoubleHappiness(state, action, isTake) {
    var _a, _b;
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    // DH card already removed by openCounterWindow
    var actorHand = __spreadArray([], actor.hand, true);
    var targetHand = __spreadArray([], target.hand, true);
    if (isTake) {
        // Hidden hands in the client mean the acting player cannot choose exact cards.
        // If specific target IDs are not provided, take up to 2 random cards.
        var takenIds_1 = (action.targetCardIds && action.targetCardIds.length > 0)
            ? action.targetCardIds.slice(0, 2)
            : (0, shuffle_1.shuffle)(__spreadArray([], targetHand, true)).slice(0, Math.min(2, targetHand.length)).map(function (c) { return c.id; });
        var taken = targetHand.filter(function (c) { return takenIds_1.includes(c.id); });
        targetHand = removeCardsFromHand(targetHand, takenIds_1);
        actorHand = __spreadArray(__spreadArray([], actorHand, true), taken, true);
    }
    else {
        // Give 2 chosen hand cards to target.
        var givenIds_1 = (_b = (_a = action.targetCardIds) === null || _a === void 0 ? void 0 : _a.slice(0, 2)) !== null && _b !== void 0 ? _b : action.cardIds.slice(1, 3);
        var given = actorHand.filter(function (c) { return givenIds_1.includes(c.id); });
        actorHand = removeCardsFromHand(actorHand, givenIds_1);
        targetHand = __spreadArray(__spreadArray([], targetHand, true), given, true);
    }
    var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: actorHand }));
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, target), { hand: targetHand }));
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " used Double Happiness (").concat(isTake ? 'took' : 'gave', " 2 cards)."));
    events.push({ type: 'cards_transferred', playerId: action.playerId, targetPlayerId: action.targetPlayerId });
    return finalizeEffectState(s, events);
}
exports.resolveDoubleHappiness = resolveDoubleHappiness;
// ── Trade Present ─────────────────────────────────────────────
function resolveTradePresent(state, action) {
    var _a;
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    // NOTE: The Trade Present card (action.cardIds[0]) was already removed from
    // actor's hand and added to discard in openCounterWindow. Only remove the
    // offered card from the actor's hand here.
    var actorOfferId = action.offeredCardId;
    var actorCard = actor.hand.find(function (c) { return c.id === actorOfferId; });
    if (!actorCard)
        throw new Error('Trade Present: offered card not found');
    var targetOfferId = action.requestedCardId && target.hand.some(function (c) { return c.id === action.requestedCardId; })
        ? action.requestedCardId
        : (_a = (0, shuffle_1.shuffle)(__spreadArray([], target.hand, true))[0]) === null || _a === void 0 ? void 0 : _a.id;
    var targetCard = target.hand.find(function (c) { return c.id === targetOfferId; });
    if (!targetCard)
        throw new Error('Trade Present: target has no card to trade');
    var actorHand = __spreadArray(__spreadArray([], removeCardsFromHand(actor.hand, [actorOfferId]), true), [targetCard], false);
    var targetHand = __spreadArray(__spreadArray([], removeCardsFromHand(target.hand, [targetOfferId]), true), [actorCard], false);
    var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: actorHand }));
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, target), { hand: targetHand }));
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " and ").concat(target.name, " exchanged 1 card (Trade Present)."));
    events.push({ type: 'cards_transferred', playerId: action.playerId, targetPlayerId: action.targetPlayerId });
    return finalizeEffectState(s, events);
}
exports.resolveTradePresent = resolveTradePresent;
// ── Trade Fate ────────────────────────────────────────────────
function resolveTradeFate(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    // NOTE: The Trade Fate card was already removed from actor's hand and
    // added to discard in openCounterWindow. actor.hand here is already
    // the hand WITHOUT the TF card — swap it directly with target's hand.
    var actorHand = __spreadArray([], target.hand, true); // actor gets target's full hand
    var targetHand = __spreadArray([], actor.hand, true); // target gets actor's hand (TF already removed)
    var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: actorHand }));
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, target), { hand: targetHand }));
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " swapped entire hand with ").concat(target.name, " (Trade Fate)."));
    events.push({ type: 'hand_swapped', playerId: action.playerId, targetPlayerId: action.targetPlayerId });
    return finalizeEffectState(s, events);
}
exports.resolveTradeFate = resolveTradeFate;
// ── Let Go ────────────────────────────────────────────────────
function resolveLetGo(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var lgCardId = action.cardIds[0];
    // Discard entire hand (excluding Let Go itself, which was played)
    var toDiscard = removeCardsFromHand(actor.hand, [lgCardId]);
    var actorUpdated = __assign(__assign({}, actor), { hand: [] });
    var s = __assign(__assign({}, state), { discardPile: __spreadArray(__spreadArray([], state.discardPile, true), toDiscard, true) });
    s = (0, gameState_1.updatePlayer)(s, actorUpdated);
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " played Let Go \u2014 discarded their entire hand!"));
    events.push({ type: 'card_played', playerId: action.playerId, data: { card: 'let_go' } });
    return finalizeEffectState(s, events);
}
exports.resolveLetGo = resolveLetGo;
// ── Season ────────────────────────────────────────────────────
function resolveSeason(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var cardId = action.cardIds[0];
    var card = actor.hand.find(function (c) { return c.id === cardId; });
    var newSeason = card.name;
    var previousSeason = state.season;
    var leavingWinterForAnotherSeason = previousSeason === 'winter' && newSeason !== 'winter';
    var immediateDrawCount = leavingWinterForAnotherSeason
        ? (newSeason === 'summer' ? 3 : 2)
        : (newSeason === 'summer' ? 1 : 0);
    var s = __assign(__assign({}, state), { season: newSeason, seasonTurnsRemaining: 3, discardPile: __spreadArray(__spreadArray([], state.discardPile, true), [card], false) });
    var updatedActor = __assign(__assign({}, actor), { hand: removeCardsFromHand(actor.hand, [cardId]) });
    if (immediateDrawCount > 0) {
        var _a = (0, deck_1.drawCards)(immediateDrawCount, s.drawPile, s.discardPile), drawn = _a.drawn, drawPile = _a.drawPile, discardPile = _a.discardPile;
        updatedActor = __assign(__assign({}, updatedActor), { hand: __spreadArray(__spreadArray([], updatedActor.hand, true), drawn, true) });
        s = __assign(__assign({}, s), { drawPile: drawPile, discardPile: discardPile });
    }
    s = (0, gameState_1.updatePlayer)(s, updatedActor);
    var drawNote = leavingWinterForAnotherSeason
        ? " (+".concat(immediateDrawCount, " immediate draw").concat(immediateDrawCount === 1 ? '' : 's', " after leaving Winter)")
        : newSeason === 'summer'
            ? ' (+1 immediate draw)'
            : '';
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " played ").concat(newSeason, " \u2014 season changes!").concat(drawNote));
    events.push({ type: 'season_changed', playerId: action.playerId, data: { season: newSeason } });
    return finalizeEffectState(s, events);
}
exports.resolveSeason = resolveSeason;
// ── Natural Disaster ──────────────────────────────────────────
function resolveNaturalDisaster(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var target = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
    var setId = action.targetSetId;
    // These checks already passed in handleAction before openCounterWindow,
    // but we validate again here as a safety net.
    var set = target.garden.sets.find(function (s) { return s.id === setId; });
    if (!set)
        throw new Error('Target set not found');
    if (set.isDivine)
        throw new Error('Divine sets are invulnerable');
    // Destroy entire set — flowers go to discard
    var _a = (0, garden_1.removeFromSet)(target.garden, setId, -1), garden = _a.garden, removedFlowers = _a.removedFlowers;
    // NOTE: The Natural Disaster card itself was already removed from actor's hand
    // and added to the discard pile inside openCounterWindow. Do NOT try to
    // remove or discard it again here — the card is already gone from hand.
    var s = __assign(__assign({}, state), { discardPile: __spreadArray(__spreadArray([], state.discardPile, true), removedFlowers, true) });
    s = (0, gameState_1.updatePlayer)(s, __assign(__assign({}, target), { garden: garden }));
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " unleashed Natural Disaster on ").concat(target.name, "'s set! (God's Favourite status unchanged)"));
    // NOTE: God's Favourite is NOT transferred on set destruction
    events.push({ type: 'flower_destroyed', playerId: action.targetPlayerId, data: { count: removedFlowers.length } });
    return finalizeEffectState(s, events);
}
exports.resolveNaturalDisaster = resolveNaturalDisaster;
// ── Eclipse ───────────────────────────────────────────────────
function resolveEclipse(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var eclipseCardId = action.cardIds[0];
    var eclipseCard = actor.hand.find(function (c) { return c.id === eclipseCardId; });
    // Reverse only the direction. Keeping the canonical turnOrder intact makes
    // advanceTurn() reliably move to the previous player on subsequent turns.
    var newDirection = state.turnDirection === 1 ? -1 : 1;
    // Collect all hands
    var allCards = [];
    var playerCount = state.players.length;
    for (var _i = 0, _a = state.players; _i < _a.length; _i++) {
        var p = _a[_i];
        allCards = __spreadArray(__spreadArray([], allCards, true), p.hand, true);
    }
    // Remove Eclipse card from pool (it was played, goes to discard)
    allCards = allCards.filter(function (c) { return c.id !== eclipseCardId; });
    // Shuffle collected cards
    var shuffled = (0, shuffle_1.shuffle)(allCards);
    // Distribute evenly in the new reversed order.
    var dealOrder = newDirection === -1 ? __spreadArray([], state.turnOrder, true).reverse() : __spreadArray([], state.turnOrder, true);
    var perPlayer = Math.floor(shuffled.length / playerCount);
    var leftoverCount = shuffled.length % playerCount;
    var leftover = shuffled.slice(shuffled.length - leftoverCount);
    var toDistribute = shuffled.slice(0, shuffled.length - leftoverCount);
    var handsByPlayerId = new Map();
    dealOrder.forEach(function (playerId, i) {
        var start = i * perPlayer;
        handsByPlayerId.set(playerId, toDistribute.slice(start, start + perPlayer));
    });
    var s = __assign(__assign({}, state), { turnDirection: newDirection, discardPile: __spreadArray(__spreadArray(__spreadArray([], state.discardPile, true), (eclipseCard ? [eclipseCard] : []), true), leftover, true), players: state.players.map(function (p) { var _a; return (__assign(__assign({}, p), { hand: (_a = handsByPlayerId.get(p.id)) !== null && _a !== void 0 ? _a : [] })); }) });
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " played Eclipse \u2014 turn direction reversed, hands redistributed!"));
    events.push({ type: 'turn_order_reversed', playerId: action.playerId });
    events.push({ type: 'hands_redistributed', playerId: action.playerId });
    return finalizeEffectState(s, events);
}
exports.resolveEclipse = resolveEclipse;
// ── Great Reset ───────────────────────────────────────────────
function resolveGreatReset(state, action) {
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var grCardId = action.cardIds[0];
    // All players discard their hands
    var allDiscarded = [];
    for (var _i = 0, _a = state.players; _i < _a.length; _i++) {
        var p = _a[_i];
        allDiscarded = __spreadArray(__spreadArray([], allDiscarded, true), p.hand.filter(function (c) { return c.id !== grCardId; }), true);
    }
    var s = __assign(__assign({}, state), { season: null, seasonTurnsRemaining: 0, discardPile: __spreadArray(__spreadArray([], state.discardPile, true), allDiscarded, true), players: state.players.map(function (p) { return (__assign(__assign({}, p), { hand: [] })); }) });
    var _loop_3 = function (p) {
        var _d = (0, deck_1.drawCards)(5, s.drawPile, s.discardPile), drawn = _d.drawn, drawPile = _d.drawPile, discardPile = _d.discardPile;
        s = __assign(__assign({}, s), { drawPile: drawPile, discardPile: discardPile, players: s.players.map(function (pl) { return pl.id === p.id ? __assign(__assign({}, pl), { hand: drawn }) : pl; }) });
    };
    // Each player draws 5 from the main draw pile
    for (var _b = 0, _c = s.players; _b < _c.length; _b++) {
        var p = _c[_b];
        _loop_3(p);
    }
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " triggered Great Reset \u2014 all hands discarded, 5 drawn each, season reset!"));
    events.push({ type: 'hands_redistributed', playerId: action.playerId, data: { type: 'great_reset' } });
    return finalizeEffectState(s, events);
}
exports.resolveGreatReset = resolveGreatReset;
// ── Discard Flower (Autumn) ───────────────────────────────────
function resolveDiscardFlower(state, action) {
    if (state.season !== 'autumn')
        throw new Error('Discard is only allowed during Autumn');
    var events = [];
    var actor = (0, gameState_1.getPlayer)(state, action.playerId);
    var cardId = action.cardIds[0];
    var flower = actor.hand.find(function (c) { return c.id === cardId; });
    if (!flower || flower.kind !== 'flower')
        throw new Error('Card is not a flower');
    var updatedHand = removeCardsFromHand(actor.hand, [cardId]);
    var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: updatedHand }));
    s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), [flower], false) });
    s = (0, gameState_1.addLog)(s, "".concat(actor.name, " discarded a ").concat(flower.color, " flower (Autumn)."));
    return finalizeEffectState(s, events);
}
exports.resolveDiscardFlower = resolveDiscardFlower;
