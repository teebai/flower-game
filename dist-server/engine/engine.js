"use strict";
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
exports.FlowerGameEngine = void 0;
var gameState_1 = require("./gameState");
var effects_1 = require("./effects");
var deck_1 = require("../cards/deck");
var winCondition_1 = require("./winCondition");
var garden_1 = require("./garden");
function normalizeGameStateGardens(state) {
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
function finalizeGameState(state) {
    return (0, winCondition_1.checkWinner)(normalizeGameStateGardens(state));
}
function finalizeActionResult(result) {
    if (!result.success || !result.state)
        return result;
    return __assign(__assign({}, result), { state: finalizeGameState(result.state) });
}
function getTurnLimitMs(state) {
    var _a;
    return Math.max(1, (_a = state.turnTimeLimitSec) !== null && _a !== void 0 ? _a : 60) * 1000;
}
function clampTurnElapsedMs(state, now) {
    var _a;
    if (now === void 0) { now = Date.now(); }
    var startedAt = Number((_a = state.turnStartedAt) !== null && _a !== void 0 ? _a : 0);
    if (!startedAt)
        return 0;
    return Math.max(0, Math.min(getTurnLimitMs(state), now - startedAt));
}
function resumeTurnClock(state, pausedTurnElapsedMs) {
    if (pausedTurnElapsedMs == null)
        return state;
    return __assign(__assign({}, state), { turnStartedAt: Date.now() - Math.max(0, pausedTurnElapsedMs) });
}
var FlowerGameEngine = /** @class */ (function () {
    function FlowerGameEngine() {
    }
    // ── Game Creation ───────────────────────────────────────────
    FlowerGameEngine.prototype.createGame = function (players) {
        return (0, gameState_1.createGame)(players);
    };
    // ── Main Action Dispatcher ──────────────────────────────────
    FlowerGameEngine.prototype.applyAction = function (state, action) {
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
            var currentPlayer = (0, gameState_1.getCurrentPlayer)(state);
            if (currentPlayer.id !== action.playerId) {
                return { success: false, error: 'Not your turn' };
            }
            // Route by phase
            if (state.phase === 'blessing')
                return finalizeActionResult(this.handleBlessing(state, action));
            if (state.phase === 'draw')
                return finalizeActionResult(this.handleDraw(state, action));
            if (state.phase === 'action')
                return finalizeActionResult(this.handleAction(state, action));
            if (state.phase === 'counter')
                return finalizeActionResult(this.handleCounter(state, action));
            return { success: false, error: "Unknown phase: ".concat(state.phase) };
        }
        catch (err) {
            var message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    };
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
    FlowerGameEngine.prototype.handleBlessing = function (state, action) {
        var _a, _b, _c;
        var player = (0, gameState_1.getCurrentPlayer)(state);
        var drawPhaseSeason = (_a = state.drawPhaseSeason) !== null && _a !== void 0 ? _a : state.season;
        if (drawPhaseSeason === 'winter') {
            if (action.type !== 'blessing_flip' && action.type !== 'pass') {
                return { success: false, error: 'Winter blocks Blessing — proceed to draw phase.' };
            }
            var s = (0, gameState_1.addLog)(state, "Winter blocks ".concat(player.name, "'s Blessing."));
            s = __assign(__assign({}, s), { phase: 'draw', blessingState: null, turnStartedAt: 0 });
            return { success: true, state: s, events: [] };
        }
        // ── Step 1: flip the coin ──────────────────────────────────
        if (action.type === 'blessing_flip') {
            var coin = Math.random() < 0.5 ? 'heads' : 'tails';
            var emptyHand = player.hand.length === 0;
            var s = (0, gameState_1.addLog)(state, "\uD83D\uDC51 ".concat(player.name, " flips the blessing coin: ").concat(coin.toUpperCase(), "!"));
            if (coin === 'tails') {
                // Nothing extra — proceed to normal draw phase
                s = (0, gameState_1.addLog)(s, 'Tails — proceed to draw phase.');
                s = __assign(__assign({}, s), { phase: 'draw', blessingState: null, turnStartedAt: 0 });
                return { success: true, state: s, events: [] };
            }
            // Heads — handle empty hand first
            if (emptyHand) {
                // Draw 7 cards as the empty-hand override
                var _d = (0, deck_1.drawCards)(7, s.drawPile, s.discardPile), drawn = _d.drawn, drawPile = _d.drawPile, discardPile = _d.discardPile;
                s = (0, gameState_1.updatePlayer)(__assign(__assign({}, s), { drawPile: drawPile, discardPile: discardPile }), __assign(__assign({}, player), { hand: __spreadArray(__spreadArray([], player.hand, true), drawn, true) }));
                s = (0, gameState_1.addLog)(s, "".concat(player.name, " had an empty hand \u2014 drew 7 cards first."));
            }
            // Reveal top 7 from draw pile (after any empty-hand draw)
            var revealedCards = s.drawPile.slice(0, 7);
            if (revealedCards.length === 0) {
                // No cards to reveal — skip blessing pick, go to action
                s = (0, gameState_1.addLog)(s, 'Draw pile too small to reveal cards — blessing skipped.');
                var movesAllowed = 3;
                s = __assign(__assign({}, s), { phase: 'action', movesRemaining: movesAllowed, blessingState: null, turnStartedAt: state.turnStartedAt || Date.now() });
                return { success: true, state: s, events: [] };
            }
            // Remove revealed cards from draw pile temporarily
            s = __assign(__assign({}, s), { drawPile: s.drawPile.slice(revealedCards.length) });
            s = __assign(__assign({}, s), { blessingState: { revealedCards: revealedCards, emptyHandMode: emptyHand, coinResult: 'heads' } });
            s = (0, gameState_1.addLog)(s, "Heads! ".concat(player.name, " sees the top ").concat(revealedCards.length, " card(s) and chooses ").concat(emptyHand ? '0 (rearrange only)' : '2', " to keep."));
            // Stay in blessing phase — waiting for blessing_choose
            return { success: true, state: s, events: [] };
        }
        // ── Step 2: player picks cards ─────────────────────────────
        if (action.type === 'blessing_choose') {
            if (!state.blessingState) {
                return { success: false, error: 'No blessing reveal in progress' };
            }
            var _e = state.blessingState, revealedCards_1 = _e.revealedCards, emptyHandMode = _e.emptyHandMode;
            var pickedIds_1 = (_b = action.blessingPickedIds) !== null && _b !== void 0 ? _b : [];
            var arrangedIds = (_c = action.blessingArrangedIds) !== null && _c !== void 0 ? _c : [];
            if (emptyHandMode) {
                // In empty hand mode: no picking (pickedIds must be empty),
                // arrangedIds contains all 7 revealed cards in desired order.
                if (pickedIds_1.length !== 0) {
                    return { success: false, error: 'In empty-hand blessing mode: do not pick cards, only rearrange.' };
                }
                if (arrangedIds.length !== revealedCards_1.length) {
                    return { success: false, error: "Must provide all ".concat(revealedCards_1.length, " cards in arranged order.") };
                }
                // Validate all IDs belong to revealed cards
                var revealedIds_1 = new Set(revealedCards_1.map(function (c) { return c.id; }));
                if (!arrangedIds.every(function (id) { return revealedIds_1.has(id); })) {
                    return { success: false, error: 'Arranged card IDs do not match revealed cards.' };
                }
                var arranged_1 = arrangedIds.map(function (id) { return revealedCards_1.find(function (c) { return c.id === id; }); });
                var s_1 = __assign(__assign({}, state), { drawPile: __spreadArray(__spreadArray([], arranged_1, true), state.drawPile, true), blessingState: null });
                s_1 = (0, gameState_1.addLog)(s_1, "".concat(player.name, " rearranged the top ").concat(arranged_1.length, " card(s) on the draw pile."));
                // Blessing replaced draw — go straight to action phase
                var movesAllowed_1 = 3;
                s_1 = __assign(__assign({}, s_1), { phase: 'action', movesRemaining: movesAllowed_1, turnStartedAt: state.turnStartedAt || Date.now() });
                return { success: true, state: s_1, events: [] };
            }
            // Normal mode: pick 2, arrange remaining 5
            if (pickedIds_1.length !== 2) {
                return { success: false, error: 'Must pick exactly 2 cards to keep.' };
            }
            var revealedIdSet_1 = new Set(revealedCards_1.map(function (c) { return c.id; }));
            if (!pickedIds_1.every(function (id) { return revealedIdSet_1.has(id); })) {
                return { success: false, error: 'Picked card IDs do not match revealed cards.' };
            }
            var remaining_1 = revealedCards_1.filter(function (c) { return !pickedIds_1.includes(c.id); });
            if (arrangedIds.length !== remaining_1.length) {
                return { success: false, error: "Must arrange exactly ".concat(remaining_1.length, " remaining cards.") };
            }
            var remainingIdSet_1 = new Set(remaining_1.map(function (c) { return c.id; }));
            if (!arrangedIds.every(function (id) { return remainingIdSet_1.has(id); })) {
                return { success: false, error: 'Arranged card IDs do not match remaining revealed cards.' };
            }
            var pickedCards = pickedIds_1.map(function (id) { return revealedCards_1.find(function (c) { return c.id === id; }); });
            var arranged = arrangedIds.map(function (id) { return remaining_1.find(function (c) { return c.id === id; }); });
            // Give picked cards to player, put arranged back on top of draw pile
            var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, player), { hand: __spreadArray(__spreadArray([], player.hand, true), pickedCards, true) }));
            s = __assign(__assign({}, s), { drawPile: __spreadArray(__spreadArray([], arranged, true), s.drawPile, true), blessingState: null });
            s = (0, gameState_1.addLog)(s, "".concat(player.name, " took 2 cards from the blessing and rearranged the top ").concat(arranged.length, " on the draw pile."));
            // Blessing replaced draw — go straight to action phase
            var movesAllowed = 3;
            s = __assign(__assign({}, s), { phase: 'action', movesRemaining: movesAllowed, turnStartedAt: state.turnStartedAt || Date.now() });
            return { success: true, state: s, events: [] };
        }
        return { success: false, error: 'In blessing phase: send blessing_flip first, then blessing_choose.' };
    };
    // ── Draw Phase ──────────────────────────────────────────────
    FlowerGameEngine.prototype.handleDraw = function (state, action) {
        var _a;
        var drawPhaseSeason = (_a = state.drawPhaseSeason) !== null && _a !== void 0 ? _a : state.season;
        if (action.type !== 'pass') {
            // Draw is automatic — pass is used to trigger it
            return { success: false, error: 'Use "pass" action to draw cards' };
        }
        var player = (0, gameState_1.getCurrentPlayer)(state);
        var emptyHand = player.hand.length === 0;
        var isWinter = drawPhaseSeason === 'winter';
        // Empty hand always draws 7 (even in Winter)
        // Winter (non-empty hand): no draw
        var drawCount = emptyHand ? 7 : (isWinter ? 0 : (drawPhaseSeason === 'summer' ? 3 : 2));
        var s = state;
        if (drawCount > 0) {
            var _b = (0, deck_1.drawCards)(drawCount, state.drawPile, state.discardPile), drawn = _b.drawn, drawPile = _b.drawPile, discardPile = _b.discardPile;
            var updatedPlayer = __assign(__assign({}, player), { hand: __spreadArray(__spreadArray([], player.hand, true), drawn, true) });
            s = (0, gameState_1.updatePlayer)(__assign(__assign({}, state), { drawPile: drawPile, discardPile: discardPile }), updatedPlayer);
            s = (0, gameState_1.addLog)(s, "".concat(player.name, " drew ").concat(drawn.length, " card(s)."));
        }
        else {
            s = (0, gameState_1.addLog)(s, "".concat(player.name, " draws no cards (Winter)."));
        }
        var movesAllowed = isWinter ? 1 : 3;
        s = __assign(__assign({}, s), { phase: 'action', movesRemaining: movesAllowed, turnStartedAt: state.turnStartedAt || Date.now() });
        return { success: true, state: s, events: [] };
    };
    // ── Action Phase ─────────────────────────────────────────────
    FlowerGameEngine.prototype.handleAction = function (state, action) {
        var _a;
        var isSpringFreePlant = state.season === 'spring' &&
            (action.type === 'plant_own' || action.type === 'plant_opponent');
        var isPass = action.type === 'pass';
        if (state.movesRemaining <= 0 && !isSpringFreePlant && !isPass) {
            return { success: false, error: 'No moves remaining' };
        }
        // Discard validation
        if (action.type === 'discard_flower' && state.season !== 'autumn') {
            return { success: false, error: 'Discard is only allowed during Autumn' };
        }
        var events = [];
        var result;
        switch (action.type) {
            case 'plant_own':
                result = (0, effects_1.resolvePlant)(state, action, false);
                break;
            case 'plant_opponent':
                result = (0, effects_1.resolvePlant)(state, action, true);
                break;
            case 'play_wind_single':
            case 'play_wind_double': {
                if (!action.targetPlayerId)
                    return { success: false, error: 'No target player specified' };
                if (!action.targetSetId)
                    return { success: false, error: 'Wind requires a target set' };
                if (!action.cardIds || action.cardIds.length !== (action.type === 'play_wind_double' ? 2 : 1)) {
                    return { success: false, error: action.type === 'play_wind_double' ? 'Double Wind requires 2 Wind cards' : 'Wind requires 1 Wind card' };
                }
                var windCount = action.type === 'play_wind_double' ? 2 : 1;
                var windTarget = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
                var windSet = windTarget.garden.sets.find(function (s) { return s.id === action.targetSetId; });
                if (!windSet)
                    return { success: false, error: 'Target set not found' };
                if (windSet.isDivine)
                    return { success: false, error: 'Divine sets are invulnerable' };
                if (windSet.isSolid)
                    return { success: false, error: 'Solid sets are immune to Wind' };
                if (windSet.containsTripleRainbow && windCount !== 2) {
                    return { success: false, error: 'Triple Rainbow requires Double Wind' };
                }
                // Wind now resolves immediately (no counter window)
                var actor = (0, gameState_1.getPlayer)(state, action.playerId);
                var cardIds_1 = (_a = action.cardIds) !== null && _a !== void 0 ? _a : [];
                var playedCards = actor.hand.filter(function (c) { return cardIds_1.includes(c.id); });
                var updatedHand = actor.hand.filter(function (c) { return !cardIds_1.includes(c.id); });
                var windState = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: updatedHand }));
                windState = __assign(__assign({}, windState), { discardPile: __spreadArray(__spreadArray([], windState.discardPile, true), playedCards, true) });
                result = (0, effects_1.resolveWind)(windState, action, windCount);
                break;
            }
            case 'play_bug': {
                // Validate target before opening counter window — prevents unsolvable freeze
                if (!action.targetPlayerId || !action.targetSetId) {
                    return { success: false, error: 'Bug requires a target player and set' };
                }
                var bugTarget = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
                var bugSet = bugTarget.garden.sets.find(function (s) { return s.id === action.targetSetId; });
                if (!bugSet)
                    return { success: false, error: 'Target set not found' };
                if (bugSet.isDivine)
                    return { success: false, error: 'Divine sets are invulnerable' };
                if (bugSet.isSolid && state.season !== 'autumn') {
                    return { success: false, error: 'Cannot target a Solid Set with Bug outside Autumn' };
                }
                // Autumn Bug: validate specific flower targets if provided
                if (state.season === 'autumn' && action.targetCardIds) {
                    if (action.targetCardIds.length !== 2) {
                        return { success: false, error: 'Autumn Bug requires exactly 2 target flowers' };
                    }
                    var setFlowerIds_1 = new Set(bugSet.flowers.map(function (f) { return f.id; }));
                    if (!action.targetCardIds.every(function (id) { return setFlowerIds_1.has(id); })) {
                        return { success: false, error: 'Target flowers must be in the selected set' };
                    }
                }
                return { success: true, state: this.openCounterWindow(state, action), events: [] };
            }
            case 'play_bee':
                result = (0, effects_1.resolveBee)(state, action);
                break;
            case 'play_double_happiness_take': {
                if (!action.targetPlayerId)
                    return { success: false, error: 'Double Happiness requires a target player' };
                if ((0, gameState_1.getPlayer)(state, action.targetPlayerId).hand.length === 0)
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
                if ((0, gameState_1.getPlayer)(state, action.targetPlayerId).hand.length === 0)
                    return { success: false, error: 'Target player has no cards to trade' };
                var s_2 = this.openCounterWindow(state, action);
                return { success: true, state: s_2, events: [] };
            }
            case 'play_trade_fate': {
                var s_3 = this.openCounterWindow(state, action);
                return { success: true, state: s_3, events: [] };
            }
            // ── Global cards (no target required) ────────────────────
            case 'play_let_go': {
                if (!action.cardIds || action.cardIds.length !== 1) {
                    return { success: false, error: 'Let Go requires 1 card' };
                }
                result = (0, effects_1.resolveLetGo)(state, action);
                break;
            }
            case 'play_season': {
                if (!action.cardIds || action.cardIds.length !== 1) {
                    return { success: false, error: 'Season requires 1 card' };
                }
                result = (0, effects_1.resolveSeason)(state, action);
                break;
            }
            case 'play_eclipse': {
                if (!action.cardIds || action.cardIds.length !== 1) {
                    return { success: false, error: 'Eclipse requires 1 card' };
                }
                result = (0, effects_1.resolveEclipse)(state, action);
                break;
            }
            case 'play_great_reset': {
                if (!action.cardIds || action.cardIds.length !== 1) {
                    return { success: false, error: 'Great Reset requires 1 card' };
                }
                result = (0, effects_1.resolveGreatReset)(state, action);
                break;
            }
            // ── Targeted cards ───────────────────────────────────────
            case 'play_natural_disaster': {
                // Validate BEFORE opening counter window — prevents unsolvable freeze
                if (!action.targetPlayerId || !action.targetSetId) {
                    return { success: false, error: 'Natural Disaster requires a target player and set' };
                }
                var ndTarget = (0, gameState_1.getPlayer)(state, action.targetPlayerId);
                var ndSet = ndTarget.garden.sets.find(function (s) { return s.id === action.targetSetId; });
                if (!ndSet)
                    return { success: false, error: 'Target set not found' };
                if (ndSet.isDivine)
                    return { success: false, error: 'Divine sets are invulnerable' };
                return { success: true, state: this.openCounterWindow(state, action), events: [] };
            }
            case 'discard_flower':
                result = (0, effects_1.resolveDiscardFlower)(state, action);
                break;
            case 'pass':
                result = { state: state, events: [] };
                break;
            default:
                return { success: false, error: "Unknown action: ".concat(action.type) };
        }
        // Decrement moves / end turn
        var s = result.state;
        var movesCost = isSpringFreePlant ? 0 : 1;
        var movesPerTurn = function (season) { return season === 'winter' ? 1 : 3; };
        var movesLeft = state.movesRemaining - movesCost;
        if (action.type === 'play_season') {
            var usedMovesBefore = movesPerTurn(state.season) - state.movesRemaining;
            var usedMovesAfter = usedMovesBefore + movesCost;
            movesLeft = movesPerTurn(s.season) - usedMovesAfter;
        }
        movesLeft = Math.max(0, movesLeft);
        var springActive = s.season === 'spring';
        if (action.type === 'pass' || ((movesCost > 0 && movesLeft <= 0) && !springActive) || s.phase === 'game_over') {
            s = s.phase === 'game_over' ? s : (0, gameState_1.advanceTurn)(s);
        }
        else {
            s = __assign(__assign({}, s), { movesRemaining: movesLeft });
        }
        return { success: true, state: s, events: result.events };
    };
    // ── Counter Window ───────────────────────────────────────────
    FlowerGameEngine.prototype.openCounterWindow = function (state, action, windCount) {
        var _a, _b;
        var now = Date.now();
        var actor = (0, gameState_1.getPlayer)(state, action.playerId);
        var offeredCard = action.offeredCardId
            ? actor.hand.find(function (c) { return c.id === action.offeredCardId; })
            : undefined;
        // Separate played cards from the rest of the hand
        var cardIds = (_a = action.cardIds) !== null && _a !== void 0 ? _a : [];
        var playedCards = actor.hand.filter(function (c) { return cardIds.includes(c.id); });
        var updatedHand = actor.hand.filter(function (c) { return !cardIds.includes(c.id); });
        // Remove from hand; add to discard immediately — they are spent regardless of outcome
        var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, actor), { hand: updatedHand }));
        s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), playedCards, true) });
        s = __assign(__assign({}, s), { phase: 'counter', pendingAction: {
                original: action,
                windCount: windCount,
                targetPlayerId: action.targetPlayerId,
                responded: false,
                offeredCard: offeredCard,
                pausedTurnElapsedMs: clampTurnElapsedMs(state, now),
                playedCards: playedCards,
                startedAt: now,
                responseTimeLimitSec: 14,
            } });
        var actionLabel = (_b = {
            play_wind_single: 'Wind',
            play_wind_double: 'Double Wind',
            play_bug: 'Bug',
            play_double_happiness_take: 'Double Happiness',
            play_double_happiness_give: 'Double Happiness',
            play_trade_present: 'Trade Present',
            play_trade_fate: 'Trade Fate',
            play_natural_disaster: 'Natural Disaster',
        }[action.type]) !== null && _b !== void 0 ? _b : action.type.replace(/^play_/, '').replace(/_/g, ' ');
        s = (0, gameState_1.addLog)(s, "".concat(actor.name, " played ").concat(actionLabel, " on ").concat((0, gameState_1.getPlayer)(state, action.targetPlayerId).name, " \u2014 counter window open."));
        return s;
    };
    // ── Counter Resolution ────────────────────────────────────────
    FlowerGameEngine.prototype.handleCounter = function (state, action) {
        var _a, _b, _c, _d;
        if (!state.pendingAction) {
            return { success: false, error: 'No pending action to counter' };
        }
        var pending = state.pendingAction;
        var target = (0, gameState_1.getPlayer)(state, pending.targetPlayerId);
        if (action.playerId !== pending.targetPlayerId) {
            return { success: false, error: 'Only the targeted player can counter' };
        }
        var events = [];
        // ── Divine Protection ──────────────────────────────────────
        if (action.type === 'counter_divine') {
            var dpCardId_1 = action.cardIds[0];
            var dpCard = target.hand.find(function (c) { return c.id === dpCardId_1; });
            if (!dpCard)
                return { success: false, error: 'Divine Protection card not found in hand' };
            // Check if original action is blockable
            var originalCard = (_a = pending.original.cardIds) === null || _a === void 0 ? void 0 : _a[0];
            // (Wind is Blockable = true; we re-use the card's isBlockable flag stored at play time)
            // For simplicity we check by action type
            var unstoppableActions = [
                'play_bee', 'play_let_go', 'play_season', 'play_eclipse', 'play_great_reset'
            ];
            if (unstoppableActions.includes(pending.original.type)) {
                return { success: false, error: 'That action cannot be countered by Divine Protection' };
            }
            var coin = Math.random() < 0.5 ? 'heads' : 'tails';
            // Remove DP card from target's hand
            var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { hand: target.hand.filter(function (c) { return c.id !== dpCardId_1; }) }));
            s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), [dpCard], false) });
            s = (0, gameState_1.addLog)(s, "".concat(target.name, " uses Divine Protection \u2014 coin flip: ").concat(coin.toUpperCase(), "!"));
            if (coin === 'heads') {
                // Block the action entirely
                s = resumeTurnClock(__assign(__assign({}, s), { phase: 'action', pendingAction: null }), pending.pausedTurnElapsedMs);
                s = (0, gameState_1.addLog)(s, 'Blocked! The action is cancelled.');
                s = (0, winCondition_1.checkWinner)(s);
                if (s.phase === 'game_over') {
                    return { success: true, state: s, events: events };
                }
                // Move doesn't cost them anything (counter is free), but original action move is consumed
                var movesLeft = state.movesRemaining - 1;
                s = movesLeft <= 0 ? (0, gameState_1.advanceTurn)(s) : __assign(__assign({}, s), { movesRemaining: movesLeft });
            }
            else {
                // Tails — action proceeds
                s = (0, gameState_1.addLog)(s, 'Tails — the action proceeds!');
                if (pending.original.type === 'play_double_happiness_take' || pending.original.type === 'play_trade_present') {
                    var allowResult = this.allowAction(s, target.id);
                    if (!allowResult.success || !allowResult.state)
                        return allowResult;
                    s = allowResult.state;
                    events.push.apply(events, ((_b = allowResult.events) !== null && _b !== void 0 ? _b : []));
                }
                else {
                    var resolveResult = this.resolveAfterCounter(s, pending, pending.windCount);
                    s = resolveResult.state;
                    events.push.apply(events, resolveResult.events);
                }
            }
            return { success: true, state: s, events: events };
        }
        // ── Wind Counter ────────────────────────────────────────────
        if (action.type === 'counter_wind') {
            if (pending.original.type !== 'play_wind_single' && pending.original.type !== 'play_wind_double') {
                return { success: false, error: 'Wind counter only works against Wind cards' };
            }
            var windCardIds_1 = action.cardIds; // 1 or 2 wind cards
            var counterCount = windCardIds_1.length;
            var attackingCount = (_c = pending.windCount) !== null && _c !== void 0 ? _c : 1;
            var remaining = Math.max(0, attackingCount - counterCount);
            // Remove counter wind cards from target's hand
            var s = (0, gameState_1.updatePlayer)(state, __assign(__assign({}, target), { hand: target.hand.filter(function (c) { return !windCardIds_1.includes(c.id); }) }));
            var discardedCounters = target.hand.filter(function (c) { return windCardIds_1.includes(c.id); });
            s = __assign(__assign({}, s), { discardPile: __spreadArray(__spreadArray([], s.discardPile, true), discardedCounters, true) });
            s = (0, gameState_1.addLog)(s, "".concat(target.name, " counters with ").concat(counterCount, " Wind card(s). Remaining attack: ").concat(remaining));
            if (remaining === 0) {
                // Fully blocked
                s = resumeTurnClock(__assign(__assign({}, s), { phase: 'action', pendingAction: null }), pending.pausedTurnElapsedMs);
                s = (0, gameState_1.addLog)(s, 'Wind fully blocked!');
                s = (0, winCondition_1.checkWinner)(s);
                if (s.phase === 'game_over') {
                    return { success: true, state: s, events: events };
                }
                var movesLeft = state.movesRemaining - 1;
                s = movesLeft <= 0 ? (0, gameState_1.advanceTurn)(s) : __assign(__assign({}, s), { movesRemaining: movesLeft });
            }
            else {
                // Partial block — resolve with remaining wind count
                var resolveResult = this.resolveAfterCounter(s, pending, remaining);
                s = resolveResult.state;
                events.push.apply(events, resolveResult.events);
            }
            return { success: true, state: s, events: events };
        }
        // ── Target card selection after allowing the action ─────────
        if (action.type === 'counter_select_cards') {
            if (!pending.selectionKind) {
                return { success: false, error: 'No card selection is pending' };
            }
            var selectedIds = (_d = action.cardIds) !== null && _d !== void 0 ? _d : [];
            var requiredCount = pending.selectionKind === 'trade_present'
                ? 1
                : Math.min(2, target.hand.length);
            if (selectedIds.length !== requiredCount) {
                return { success: false, error: "Select exactly ".concat(requiredCount, " card(s)") };
            }
            if (!selectedIds.every(function (id) { return target.hand.some(function (card) { return card.id === id; }); })) {
                return { success: false, error: 'Selected card not found in your hand' };
            }
            var updatedOriginal = pending.selectionKind === 'trade_present'
                ? __assign(__assign({}, pending.original), { requestedCardId: selectedIds[0] }) : __assign(__assign({}, pending.original), { targetCardIds: selectedIds });
            var s = (0, gameState_1.addLog)(state, pending.selectionKind === 'trade_present'
                ? "".concat(target.name, " chose a card to exchange.")
                : "".concat(target.name, " chose ").concat(selectedIds.length, " card(s) to give."));
            var resolveResult = this.resolveAfterCounter(s, __assign(__assign({}, pending), { original: updatedOriginal }), pending.windCount);
            s = resolveResult.state;
            events.push.apply(events, resolveResult.events);
            return { success: true, state: s, events: events };
        }
        return { success: false, error: 'Unknown counter action' };
    };
    // ── Allow (target passes counter window) ──────────────────────
    /** Called when the target explicitly allows the action (no counter). */
    FlowerGameEngine.prototype.allowAction = function (state, targetPlayerId) {
        if (!state.pendingAction) {
            return { success: false, error: 'No pending action' };
        }
        if (state.pendingAction.targetPlayerId !== targetPlayerId) {
            return { success: false, error: 'Not the target player' };
        }
        if (state.pendingAction.original.type === 'play_double_happiness_take') {
            var s = (0, gameState_1.addLog)(__assign(__assign({}, state), { pendingAction: __assign(__assign({}, state.pendingAction), { responded: true, response: 'allow', selectionKind: 'double_happiness_take' }) }), "".concat((0, gameState_1.getPlayer)(state, targetPlayerId).name, " is choosing 2 card(s) to give."));
            return { success: true, state: s, events: [] };
        }
        if (state.pendingAction.original.type === 'play_trade_present') {
            var s = (0, gameState_1.addLog)(__assign(__assign({}, state), { pendingAction: __assign(__assign({}, state.pendingAction), { responded: true, response: 'allow', selectionKind: 'trade_present' }) }), "".concat((0, gameState_1.getPlayer)(state, targetPlayerId).name, " is choosing a card to exchange."));
            return { success: true, state: s, events: [] };
        }
        var events = [];
        var _a = this.resolveAfterCounter(state, state.pendingAction, state.pendingAction.windCount), resolved = _a.state, ev = _a.events;
        events.push.apply(events, ev);
        return { success: true, state: resolved, events: events };
    };
    // ── Resolve after counter window closes ───────────────────────
    FlowerGameEngine.prototype.resolveAfterCounter = function (state, pending, remainingWind) {
        var result;
        var action = pending.original;
        switch (action.type) {
            case 'play_wind_single':
            case 'play_wind_double':
                result = (0, effects_1.resolveWind)(state, action, remainingWind !== null && remainingWind !== void 0 ? remainingWind : 1);
                break;
            case 'play_bug':
                result = (0, effects_1.resolveBug)(state, action);
                break;
            case 'play_trade_present':
                result = (0, effects_1.resolveTradePresent)(state, action);
                break;
            case 'play_trade_fate':
                result = (0, effects_1.resolveTradeFate)(state, action);
                break;
            case 'play_natural_disaster':
                result = (0, effects_1.resolveNaturalDisaster)(state, action);
                break;
            case 'play_double_happiness_take':
                result = (0, effects_1.resolveDoubleHappiness)(state, action, true);
                break;
            case 'play_double_happiness_give':
                result = (0, effects_1.resolveDoubleHappiness)(state, action, false);
                break;
            default:
                throw new Error("No resolver for ".concat(action.type));
        }
        // Preserve game_over phase if checkWinner fired inside the resolver
        // NOTE: played cards were already moved to discard in openCounterWindow —
        // individual resolvers must NOT try to remove/discard them again.
        var resolvedPhase = result.state.phase === 'game_over' ? 'game_over' : 'action';
        var s = resumeTurnClock(__assign(__assign({}, result.state), { phase: resolvedPhase, pendingAction: null }), pending.pausedTurnElapsedMs);
        var movesLeft = state.movesRemaining - 1;
        if (s.phase === 'game_over') {
            // Game ended inside the resolver — don't advance turn
        }
        else if (movesLeft <= 0) {
            s = (0, gameState_1.advanceTurn)(s);
        }
        else {
            s = __assign(__assign({}, s), { movesRemaining: movesLeft });
        }
        return { state: s, events: result.events };
    };
    // ── Timeout auto-skip ─────────────────────────────────────────
    FlowerGameEngine.prototype.autoTimeout = function (state, actorPlayerId) {
        var _a, _b, _c;
        if (state.phase === 'game_over') {
            return { success: false, error: 'Game is already over' };
        }
        var events = [];
        var timedOutPlayer = (0, gameState_1.getPlayer)(state, actorPlayerId);
        var timeoutMessage = state.phase === 'counter' && ((_a = state.pendingAction) === null || _a === void 0 ? void 0 : _a.selectionKind) === 'trade_present'
            ? "\u23F1\uFE0F ".concat(timedOutPlayer.name, " ran out of time \u2014 a random trade card was selected.")
            : "\u23F1\uFE0F ".concat(timedOutPlayer.name, " ran out of time \u2014 auto-skip.");
        var s = (0, gameState_1.addLog)(state, timeoutMessage);
        var absorb = function (result) {
            var _a;
            if (!result.success || !result.state)
                return result;
            s = result.state;
            events.push.apply(events, ((_a = result.events) !== null && _a !== void 0 ? _a : []));
            return null;
        };
        if (s.phase === 'counter') {
            if (!s.pendingAction || s.pendingAction.targetPlayerId !== actorPlayerId) {
                return { success: false, error: 'Only the counter target can timeout here' };
            }
            if (s.pendingAction.selectionKind) {
                var target = (0, gameState_1.getPlayer)(s, actorPlayerId);
                var requiredCount = s.pendingAction.selectionKind === 'trade_present'
                    ? 1
                    : Math.min(2, target.hand.length);
                var cardIds = s.pendingAction.selectionKind === 'trade_present'
                    ? (target.hand.length > 0
                        ? [target.hand[Math.floor(Math.random() * target.hand.length)].id]
                        : [])
                    : target.hand.slice(0, requiredCount).map(function (card) { return card.id; });
                var result_1 = this.handleCounter(s, { type: 'counter_select_cards', playerId: actorPlayerId, cardIds: cardIds });
                return finalizeActionResult((_b = absorb(result_1)) !== null && _b !== void 0 ? _b : { success: true, state: s, events: events });
            }
            var result = this.allowAction(s, actorPlayerId);
            return finalizeActionResult((_c = absorb(result)) !== null && _c !== void 0 ? _c : { success: true, state: s, events: events });
        }
        var currentPlayer = (0, gameState_1.getCurrentPlayer)(s);
        if (currentPlayer.id !== actorPlayerId) {
            return { success: false, error: 'Only the active player can timeout on their turn' };
        }
        if (s.phase === 'blessing') {
            if (!s.blessingState) {
                var flipped = this.handleBlessing(s, { type: 'blessing_flip', playerId: actorPlayerId });
                var failure = absorb(flipped);
                if (failure)
                    return finalizeActionResult(failure);
            }
            if (s.phase === 'blessing' && s.blessingState) {
                var revealed = s.blessingState.revealedCards;
                var pickedIds = s.blessingState.emptyHandMode ? [] : revealed.slice(0, 2).map(function (card) { return card.id; });
                var arrangedIds = s.blessingState.emptyHandMode
                    ? revealed.map(function (card) { return card.id; })
                    : revealed.slice(2).map(function (card) { return card.id; });
                var chosen = this.handleBlessing(s, {
                    type: 'blessing_choose',
                    playerId: actorPlayerId,
                    blessingPickedIds: pickedIds,
                    blessingArrangedIds: arrangedIds,
                });
                var failure = absorb(chosen);
                if (failure)
                    return finalizeActionResult(failure);
            }
        }
        if (s.phase === 'draw') {
            var drawn = this.handleDraw(s, { type: 'pass', playerId: actorPlayerId });
            var failure = absorb(drawn);
            if (failure)
                return finalizeActionResult(failure);
        }
        if (s.phase === 'action') {
            var passed = this.handleAction(s, { type: 'pass', playerId: actorPlayerId });
            var failure = absorb(passed);
            if (failure)
                return finalizeActionResult(failure);
        }
        return finalizeActionResult({ success: true, state: s, events: events });
    };
    // ── Query Helpers ─────────────────────────────────────────────
    FlowerGameEngine.prototype.getState = function (state) {
        return state;
    };
    FlowerGameEngine.prototype.isGameOver = function (state) {
        return state.phase === 'game_over';
    };
    FlowerGameEngine.prototype.getWinner = function (state) {
        return state.winner;
    };
    return FlowerGameEngine;
}());
exports.FlowerGameEngine = FlowerGameEngine;
exports.default = FlowerGameEngine;
