"use strict";
// ============================================================
// FLOWER GAME — WIN CONDITION CHECKER
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
exports.isWinner = exports.checkWinner = void 0;
var garden_1 = require("./garden");
function summarizePlayer(state, player) {
    var _a, _b;
    var gardenSetCount = player.garden.sets.length;
    var completeSetCount = player.garden.sets.filter(function (set) { return set.isComplete; }).length;
    var solidSetCount = player.garden.sets.filter(function (set) { return set.isSolid; }).length;
    var divineSetCount = player.garden.sets.filter(function (set) { return set.isDivine; }).length;
    var totalFlowers = player.garden.sets.reduce(function (sum, set) { return sum + set.flowers.length; }, 0);
    return {
        playerId: player.id,
        playerName: player.name,
        won: state.winner === player.id,
        handCount: player.hand.length,
        gardenSetCount: gardenSetCount,
        completeSetCount: completeSetCount,
        solidSetCount: solidSetCount,
        divineSetCount: divineSetCount,
        totalFlowers: totalFlowers,
        flowersPlanted: (_b = (_a = player.matchStats) === null || _a === void 0 ? void 0 : _a.flowersPlanted) !== null && _b !== void 0 ? _b : 0,
        isGodsFavourite: state.godsFavouritePlayerId === player.id,
    };
}
function buildMatchResult(state, winnerPlayerId) {
    var _a, _b;
    var finishedAt = Date.now();
    var startedAt = state.gameStartedAt > 0 ? state.gameStartedAt : finishedAt;
    var durationSec = Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
    var resultState = __assign(__assign({}, state), { winner: winnerPlayerId });
    var winner = (_a = resultState.players.find(function (player) { return player.id === winnerPlayerId; })) !== null && _a !== void 0 ? _a : null;
    return {
        finishedAt: finishedAt,
        durationSec: durationSec,
        winnerPlayerId: winnerPlayerId,
        winnerName: (_b = winner === null || winner === void 0 ? void 0 : winner.name) !== null && _b !== void 0 ? _b : null,
        seasonAtFinish: resultState.season,
        drawPileCount: resultState.drawPile.length,
        discardPileCount: resultState.discardPile.length,
        players: resultState.players.map(function (player) { return summarizePlayer(resultState, player); }),
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
function checkWinner(state) {
    for (var _i = 0, _a = state.players; _i < _a.length; _i++) {
        var player = _a[_i];
        if (isWinner(state, player)) {
            var matchResult = buildMatchResult(state, player.id);
            return __assign(__assign({}, state), { winner: player.id, phase: 'game_over', matchResult: matchResult, log: __spreadArray(__spreadArray([], state.log, true), ["\uD83C\uDF38 ".concat(player.name, " wins the game!")], false) });
        }
    }
    return state;
}
exports.checkWinner = checkWinner;
function isWinner(state, player) {
    var hasThreeSets = (0, garden_1.hasWinningSetCount)(player.garden);
    var hasEmptyHand = player.hand.length === 0;
    var isNotGodsFav = state.godsFavouritePlayerId !== player.id;
    return hasThreeSets && hasEmptyHand && isNotGodsFav;
}
exports.isWinner = isWinner;
