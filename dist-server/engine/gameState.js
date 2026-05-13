"use strict";
// ============================================================
// FLOWER GAME — GAME STATE INITIALISATION
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
exports.updateGodsFavourite = exports.advanceTurn = exports.addLog = exports.incrementPlayerFlowersPlanted = exports.updatePlayer = exports.getPlayer = exports.getCurrentPlayer = exports.createGame = exports.createWaitingRoom = void 0;
var deck_1 = require("../cards/deck");
var shuffle_1 = require("../utils/shuffle");
function normalizeRoomConfig(players, config) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var ownerPlayerId = (_c = (_a = config === null || config === void 0 ? void 0 : config.ownerPlayerId) !== null && _a !== void 0 ? _a : (_b = players[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null;
    return {
        roomName: ((_d = config === null || config === void 0 ? void 0 : config.roomName) === null || _d === void 0 ? void 0 : _d.trim()) || 'Flower Room',
        ownerPlayerId: ownerPlayerId,
        minPlayers: Math.max(2, Math.min(6, (_e = config === null || config === void 0 ? void 0 : config.minPlayers) !== null && _e !== void 0 ? _e : 3)),
        maxPlayers: Math.max(2, Math.min(6, (_f = config === null || config === void 0 ? void 0 : config.maxPlayers) !== null && _f !== void 0 ? _f : 6)),
        readyPlayerIds: __spreadArray([], new Set(((_g = config === null || config === void 0 ? void 0 : config.readyPlayerIds) !== null && _g !== void 0 ? _g : []).filter(Boolean)), true),
        startedAt: Math.max(0, (_h = config === null || config === void 0 ? void 0 : config.startedAt) !== null && _h !== void 0 ? _h : 0),
    };
}
function createWaitingRoom(players, config) {
    if (players.length < 2 || players.length > 6) {
        throw new Error('Flower Game waiting rooms support 2–6 seats');
    }
    var room = normalizeRoomConfig(players, config);
    var gamePlayers = players.map(function (p) { return ({
        id: p.id,
        name: p.name,
        hand: [],
        garden: { sets: [] },
        matchStats: {
            flowersPlanted: 0,
        },
    }); });
    return {
        id: (0, shuffle_1.uid)(),
        gameStartedAt: 0,
        roomName: room.roomName,
        ownerPlayerId: room.ownerPlayerId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        readyPlayerIds: room.ownerPlayerId
            ? __spreadArray([], new Set(__spreadArray(__spreadArray([], room.readyPlayerIds, true), [room.ownerPlayerId], false)), true) : room.readyPlayerIds,
        players: gamePlayers,
        turnOrder: gamePlayers.map(function (player) { return player.id; }),
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
exports.createWaitingRoom = createWaitingRoom;
/**
 * Create a fresh GameState for a new game.
 * Deals 5 cards to each player, rest goes to draw pile.
 */
function createGame(players, config) {
    if (players.length < 2 || players.length > 6) {
        throw new Error('Flower Game requires 2–6 players');
    }
    var drawPile = (0, deck_1.buildDeck)();
    var discardPile = [];
    // Deal 5 cards to each player
    var gamePlayers = players.map(function (p) {
        var _a = (0, deck_1.drawCards)(5, drawPile, discardPile), drawn = _a.drawn, newPile = _a.drawPile, newDiscard = _a.discardPile;
        drawPile = newPile;
        discardPile = newDiscard;
        return {
            id: p.id,
            name: p.name,
            hand: drawn,
            garden: { sets: [] },
            matchStats: {
                flowersPlanted: 0,
            },
        };
    });
    var turnOrder = gamePlayers.map(function (p) { return p.id; });
    var room = normalizeRoomConfig(players, config);
    return {
        id: (0, shuffle_1.uid)(),
        gameStartedAt: room.startedAt,
        roomName: room.roomName,
        ownerPlayerId: room.ownerPlayerId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        readyPlayerIds: room.readyPlayerIds,
        players: gamePlayers,
        turnOrder: turnOrder,
        currentPlayerIndex: 0,
        turnDirection: 1,
        drawPile: drawPile,
        discardPile: discardPile,
        season: null,
        drawPhaseSeason: null,
        seasonTurnsRemaining: 0,
        godsFavouritePlayerId: null,
        phase: 'draw', // first player skips blessing (no one has card yet)
        movesRemaining: 3,
        pendingAction: null,
        blessingState: null,
        turnStartedAt: room.startedAt,
        turnTimeLimitSec: 60,
        winner: null,
        matchResult: null,
        log: ['Game started!'],
    };
}
exports.createGame = createGame;
// ── State Helpers ─────────────────────────────────────────────
function getCurrentPlayer(state) {
    var id = state.turnOrder[state.currentPlayerIndex];
    var p = state.players.find(function (p) { return p.id === id; });
    if (!p)
        throw new Error("Player ".concat(id, " not found"));
    return p;
}
exports.getCurrentPlayer = getCurrentPlayer;
function getPlayer(state, id) {
    var p = state.players.find(function (p) { return p.id === id; });
    if (!p)
        throw new Error("Player ".concat(id, " not found"));
    return p;
}
exports.getPlayer = getPlayer;
function updatePlayer(state, updated) {
    return __assign(__assign({}, state), { players: state.players.map(function (p) { return p.id === updated.id ? updated : p; }) });
}
exports.updatePlayer = updatePlayer;
function incrementPlayerFlowersPlanted(state, playerId, amount) {
    var _a, _b;
    if (amount === void 0) { amount = 1; }
    if (amount <= 0)
        return state;
    var player = getPlayer(state, playerId);
    return updatePlayer(state, __assign(__assign({}, player), { matchStats: {
            flowersPlanted: ((_b = (_a = player.matchStats) === null || _a === void 0 ? void 0 : _a.flowersPlanted) !== null && _b !== void 0 ? _b : 0) + amount,
        } }));
}
exports.incrementPlayerFlowersPlanted = incrementPlayerFlowersPlanted;
function addLog(state, msg) {
    return __assign(__assign({}, state), { log: __spreadArray(__spreadArray([], state.log, true), [msg], false) });
}
exports.addLog = addLog;
/**
 * Advance to the next player's turn.
 * Handles turn direction (normal / reversed after Eclipse).
 * Decrements season counter.
 */
function advanceTurn(state) {
    var count = state.turnOrder.length;
    var nextIndex = (state.currentPlayerIndex + state.turnDirection + count) % count;
    // Decrement season turns
    var season = state.season;
    var seasonTurnsRemaining = state.seasonTurnsRemaining;
    if (season !== null) {
        seasonTurnsRemaining -= 1;
        if (seasonTurnsRemaining <= 0) {
            season = null;
            seasonTurnsRemaining = 0;
        }
    }
    var nextPlayer = state.players.find(function (p) { return p.id === state.turnOrder[nextIndex]; });
    // Determine starting phase: blessing if player is God's Favourite, else draw
    var phase = state.godsFavouritePlayerId === nextPlayer.id ? 'blessing' : 'draw';
    return __assign(__assign({}, state), { currentPlayerIndex: nextIndex, season: season, drawPhaseSeason: season, seasonTurnsRemaining: seasonTurnsRemaining, phase: phase, movesRemaining: 3, pendingAction: null, blessingState: null, turnStartedAt: Date.now() });
}
exports.advanceTurn = advanceTurn;
/**
 * Update God's Favourite when a set is completed/extended.
 * Only triggers on BUILD — never on destruction.
 *
 * @param gardenOwnerId  The player whose garden the set belongs to
 */
function updateGodsFavourite(state, gardenOwnerId) {
    if (state.godsFavouritePlayerId === gardenOwnerId) {
        return { state: state, transferred: false }; // already holds it
    }
    var newState = addLog(__assign(__assign({}, state), { godsFavouritePlayerId: gardenOwnerId }), "\uD83D\uDC51 ".concat(getPlayer(state, gardenOwnerId).name, " is now God's Favourite!"));
    return { state: newState, transferred: true };
}
exports.updateGodsFavourite = updateGodsFavourite;
