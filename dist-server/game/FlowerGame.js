"use strict";
// ============================================================
// FLOWER GAME — boardgame.io GAME DEFINITION
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
exports.FlowerGame = void 0;
var core_1 = require("boardgame.io/core");
var engine_1 = require("../engine/engine");
var gameState_1 = require("../engine/gameState");
var shuffle_1 = require("../utils/shuffle");
var engine = new engine_1.FlowerGameEngine();
/** Resolve the acting player: prefer playerID (stage-aware), fall back to currentPlayer. */
function actingPlayer(_a) {
    var ctx = _a.ctx, playerID = _a.playerID;
    return (playerID != null && playerID !== '') ? playerID : ctx.currentPlayer;
}
function finalizeMoveResult(ctx, result, prevIndex, rejectLabel, shouldEndStage) {
    var _a;
    if (shouldEndStage === void 0) { shouldEndStage = false; }
    var G = ctx.G, events = ctx.events;
    if (!result.success || !result.state) {
        return core_1.INVALID_MOVE;
    }
    Object.assign(G, result.state);
    if (!events)
        return;
    // Counter window opened → activate only the target player
    if (G.phase === 'counter' && G.pendingAction) {
        events.setActivePlayers({
            value: (_a = {}, _a[G.pendingAction.targetPlayerId] = 'counterStage', _a),
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
function applyMove(ctx, action) {
    var prevIndex = ctx.G.currentPlayerIndex;
    var result = engine.applyAction(ctx.G, action);
    return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] move rejected:');
}
function applyCounterMove(ctx, action // null = allowAction path
) {
    var G = ctx.G;
    if (!G.pendingAction)
        return core_1.INVALID_MOVE;
    // The player in the counter stage — NOT ctx.currentPlayer (the turn player)
    var stagePlayer = actingPlayer(ctx);
    var prevIndex = G.currentPlayerIndex;
    var result;
    if (action) {
        result = engine.applyAction(G, __assign(__assign({}, action), { playerId: stagePlayer }));
    }
    else {
        result = engine.allowAction(G, stagePlayer);
    }
    return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] counter move rejected:', true);
}
function applyTimeoutMove(ctx) {
    var _a, _b;
    var actorId = ctx.G.phase === 'counter'
        ? ((_b = (_a = ctx.G.pendingAction) === null || _a === void 0 ? void 0 : _a.targetPlayerId) !== null && _b !== void 0 ? _b : actingPlayer(ctx))
        : actingPlayer(ctx);
    var prevIndex = ctx.G.currentPlayerIndex;
    var shouldEndStage = !!(ctx.ctx.activePlayers && actorId && ctx.ctx.activePlayers[actorId]);
    var result = engine.autoTimeout(ctx.G, actorId);
    return finalizeMoveResult(ctx, result, prevIndex, '[FlowerGame] timeout auto-move rejected:', shouldEndStage);
}
function getJoinedPlayers(G) {
    return G.players
        .filter(function (player) { return player.name.trim(); })
        .map(function (player) { return ({ id: player.id, name: player.name.trim() }); });
}
function toggleReadyState(G, playerID) {
    if (G.phase !== 'waiting')
        return null;
    var player = G.players.find(function (entry) { return entry.id === playerID; });
    if (!player || !player.name.trim())
        return null;
    // Owner is always ready — cannot toggle off
    if (playerID === G.ownerPlayerId)
        return null;
    var ready = new Set(G.readyPlayerIds);
    var isReady = ready.has(playerID);
    if (isReady) {
        ready.delete(playerID);
    }
    else {
        ready.add(playerID);
    }
    return (0, gameState_1.addLog)(__assign(__assign({}, G), { readyPlayerIds: __spreadArray([], ready, true) }), "".concat(player.name, " is ").concat(isReady ? 'not ready' : 'ready', "."));
}
function buildStartedGame(waitingState, startedByPlayerId) {
    var _a, _b, _c, _d;
    if (waitingState.phase !== 'waiting')
        return null;
    if (waitingState.ownerPlayerId !== startedByPlayerId)
        return null;
    var joinedPlayers = getJoinedPlayers(waitingState);
    if (joinedPlayers.length < waitingState.minPlayers || joinedPlayers.length > waitingState.maxPlayers) {
        return null;
    }
    // Enough players must be ready (owner is always ready)
    var readyJoinedCount = joinedPlayers.filter(function (p) { return waitingState.readyPlayerIds.includes(p.id); }).length;
    if (readyJoinedCount < waitingState.minPlayers)
        return null;
    var shuffledPlayers = (0, shuffle_1.shuffle)(joinedPlayers);
    var startedAt = Date.now();
    var startedState = (0, gameState_1.createGame)(shuffledPlayers, {
        roomName: waitingState.roomName,
        ownerPlayerId: waitingState.ownerPlayerId,
        minPlayers: waitingState.minPlayers,
        maxPlayers: waitingState.maxPlayers,
        readyPlayerIds: waitingState.readyPlayerIds.filter(function (playerId) { return shuffledPlayers.some(function (player) { return player.id === playerId; }); }),
        startedAt: startedAt,
    });
    var starter = (_b = (_a = joinedPlayers.find(function (player) { return player.id === startedByPlayerId; })) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Room owner';
    var firstPlayer = (_d = (_c = startedState.players[startedState.currentPlayerIndex]) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : 'Unknown';
    startedState.log = __spreadArray(__spreadArray(__spreadArray([], waitingState.log, true), [
        "".concat(starter, " started the game with ").concat(joinedPlayers.length, " players."),
        "Seats shuffled. ".concat(firstPlayer, " goes first.")
    ], false), startedState.log, true);
    return startedState;
}
function kickPlayerState(G, playerID, targetPlayerID) {
    if (G.phase !== 'waiting')
        return null;
    if (playerID !== G.ownerPlayerId)
        return null;
    if (targetPlayerID === G.ownerPlayerId)
        return null;
    var target = G.players.find(function (p) { return p.id === targetPlayerID; });
    if (!target)
        return null;
    var nextPlayers = G.players.filter(function (p) { return p.id !== targetPlayerID; });
    var nextReady = G.readyPlayerIds.filter(function (id) { return id !== targetPlayerID; });
    var nextTurnOrder = G.turnOrder.filter(function (id) { return id !== targetPlayerID; });
    return (0, gameState_1.addLog)(__assign(__assign({}, G), { players: nextPlayers, readyPlayerIds: nextReady, turnOrder: nextTurnOrder }), "".concat(target.name, " was kicked from the room."));
}
// ── Game Definition ───────────────────────────────────────────
exports.FlowerGame = {
    name: 'flower-game',
    setup: function (_a, setupData) {
        var _b, _c, _d, _e;
        var ctx = _a.ctx;
        var names = (_b = setupData === null || setupData === void 0 ? void 0 : setupData.names) !== null && _b !== void 0 ? _b : [];
        var players = ctx.playOrder.map(function (id, i) {
            var _a;
            return ({
                id: id,
                name: (_a = names[i]) !== null && _a !== void 0 ? _a : '',
            });
        });
        return (0, gameState_1.createWaitingRoom)(players, {
            roomName: setupData === null || setupData === void 0 ? void 0 : setupData.roomName,
            ownerPlayerId: (_c = ctx.playOrder[0]) !== null && _c !== void 0 ? _c : null,
            minPlayers: (_d = setupData === null || setupData === void 0 ? void 0 : setupData.minPlayers) !== null && _d !== void 0 ? _d : 3,
            maxPlayers: (_e = setupData === null || setupData === void 0 ? void 0 : setupData.maxPlayers) !== null && _e !== void 0 ? _e : players.length,
        });
    },
    turn: {
        // boardgame.io turn management:
        // - No move limit (our engine decides when a turn ends via advanceTurn)
        // - endTurn is called explicitly inside applyMove when the engine advances
        activePlayers: { all: core_1.Stage.NULL },
        stages: {
            // Counter window: only the targeted player can act here.
            // IMPORTANT: use `playerID` (who clicked), NOT `ctx.currentPlayer`
            // (the turn player who played the card).
            counterStage: {
                moves: {
                    counterWind: function (_a) {
                        var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
                        var windCardIds = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            windCardIds[_i - 1] = arguments[_i];
                        }
                        return applyCounterMove({ G: G, ctx: ctx, playerID: playerID, events: events }, { type: 'counter_wind', playerId: playerID !== null && playerID !== void 0 ? playerID : ctx.currentPlayer, cardIds: windCardIds });
                    },
                    counterDivine: function (_a, cardId) {
                        var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
                        return applyCounterMove({ G: G, ctx: ctx, playerID: playerID, events: events }, { type: 'counter_divine', playerId: playerID !== null && playerID !== void 0 ? playerID : ctx.currentPlayer, cardIds: [cardId] });
                    },
                    allowAction: function (_a) {
                        var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
                        return applyCounterMove({ G: G, ctx: ctx, playerID: playerID, events: events }, null);
                    },
                    selectResponseCards: function (_a) {
                        var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
                        var cardIds = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            cardIds[_i - 1] = arguments[_i];
                        }
                        return applyCounterMove({ G: G, ctx: ctx, playerID: playerID, events: events }, { type: 'counter_select_cards', playerId: playerID !== null && playerID !== void 0 ? playerID : ctx.currentPlayer, cardIds: cardIds });
                    },
                    timeoutAuto: function (_a) {
                        var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
                        return applyTimeoutMove({ G: G, ctx: ctx, playerID: playerID, events: events });
                    },
                },
            },
        },
    },
    moves: {
        toggleReady: function (_a) {
            var G = _a.G, playerID = _a.playerID;
            if (!playerID)
                return core_1.INVALID_MOVE;
            var nextState = toggleReadyState(G, playerID);
            if (!nextState)
                return core_1.INVALID_MOVE;
            Object.assign(G, nextState);
        },
        startGame: function (_a) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            if (!playerID)
                return core_1.INVALID_MOVE;
            var nextState = buildStartedGame(G, playerID);
            if (!nextState)
                return core_1.INVALID_MOVE;
            Object.assign(G, nextState);
            if (events) {
                events.endTurn({ next: G.turnOrder[G.currentPlayerIndex] });
            }
        },
        kickPlayer: function (_a, targetPlayerID) {
            var G = _a.G, playerID = _a.playerID;
            if (!playerID || !targetPlayerID)
                return core_1.INVALID_MOVE;
            var nextState = kickPlayerState(G, playerID, targetPlayerID);
            if (!nextState)
                return core_1.INVALID_MOVE;
            Object.assign(G, nextState);
        },
        // ── Blessing ──────────────────────────────────────────────
        blessingFlip: function (_a) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, { type: 'blessing_flip', playerId: ctx.currentPlayer });
        },
        blessingChoose: function (_a, pickedIds, arrangedIds) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'blessing_choose', playerId: ctx.currentPlayer,
                blessingPickedIds: pickedIds, blessingArrangedIds: arrangedIds,
            });
        },
        // ── Draw ───────────────────────────────────────────────────
        pass: function (_a) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, { type: 'pass', playerId: ctx.currentPlayer });
        },
        timeoutAuto: function (_a) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyTimeoutMove({ G: G, ctx: ctx, playerID: playerID, events: events });
        },
        // ── Planting ───────────────────────────────────────────────
        plantOwn: function (_a, cardId, targetSetId, chosenColor) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'plant_own', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetSetId: targetSetId,
                chosenColor: chosenColor,
            });
        },
        plantOpponent: function (_a, cardId, targetPlayerId, targetSetId, chosenColor) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'plant_opponent', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
                chosenColor: chosenColor,
            });
        },
        // ── Wind ──────────────────────────────────────────────────
        playWindSingle: function (_a, cardId, targetPlayerId, targetSetId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_wind_single', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
            });
        },
        playWindDouble: function (_a, cardId1, cardId2, targetPlayerId, targetSetId, targetSetIds) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_wind_double', playerId: ctx.currentPlayer,
                cardIds: [cardId1, cardId2],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
                targetSetIds: targetSetIds,
            });
        },
        // ── Bug / Bee ─────────────────────────────────────────────
        playBug: function (_a, cardId, targetPlayerId, targetSetId, targetCardIds) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_bug', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
                targetCardIds: targetCardIds,
            });
        },
        playBee: function (_a, beeCardId, discardFlowerId, targetPlayerId, targetSetId, chosenColor) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_bee', playerId: ctx.currentPlayer,
                cardIds: [beeCardId, discardFlowerId],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
                chosenColor: chosenColor,
            });
        },
        // ── Double Happiness ──────────────────────────────────────
        doubleHappinessTake: function (_a, cardId, targetPlayerId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_double_happiness_take', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
            });
        },
        doubleHappinessGive: function (_a, cardId, targetPlayerId, give1, give2) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_double_happiness_give', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                targetCardIds: [give1, give2],
            });
        },
        // ── Trade ─────────────────────────────────────────────────
        tradePresent: function (_a, cardId, targetPlayerId, offeredCardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_trade_present', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                offeredCardId: offeredCardId,
            });
        },
        tradeFate: function (_a, cardId, targetPlayerId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_trade_fate', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
            });
        },
        // ── Hand management ───────────────────────────────────────
        letGo: function (_a, cardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_let_go', playerId: ctx.currentPlayer, cardIds: [cardId],
            });
        },
        // ── Season cards ──────────────────────────────────────────
        playSeason: function (_a, cardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_season', playerId: ctx.currentPlayer, cardIds: [cardId],
            });
        },
        // ── Power cards ───────────────────────────────────────────
        naturalDisaster: function (_a, cardId, targetPlayerId, targetSetId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_natural_disaster', playerId: ctx.currentPlayer,
                cardIds: [cardId],
                targetPlayerId: targetPlayerId,
                targetSetId: targetSetId,
            });
        },
        playEclipse: function (_a, cardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_eclipse', playerId: ctx.currentPlayer, cardIds: [cardId],
            });
        },
        playGreatReset: function (_a, cardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'play_great_reset', playerId: ctx.currentPlayer, cardIds: [cardId],
            });
        },
        // ── Autumn discard ────────────────────────────────────────
        discardFlower: function (_a, cardId) {
            var G = _a.G, ctx = _a.ctx, playerID = _a.playerID, events = _a.events;
            return applyMove({ G: G, ctx: ctx, playerID: playerID, events: events }, {
                type: 'discard_flower', playerId: ctx.currentPlayer, cardIds: [cardId],
            });
        },
    },
    // ── Win condition ─────────────────────────────────────────────
    endIf: function (_a) {
        var G = _a.G;
        if (G.phase === 'game_over' && G.winner) {
            return { winner: G.winner };
        }
    },
    // ── Player view (hide draw pile only) ──
    // Card-hiding disabled for hands — this is a real-time social game
    // where cards are played openly. Hiding causes bugs when playerID
    // type mismatches (string vs number) or arrives undefined.
    playerView: function (_a) {
        var _b, _c, _d, _e;
        var G = _a.G, playerID = _a.playerID;
        if (!playerID)
            return G; // spectator
        var currentTurnPlayerId = G.turnOrder[G.currentPlayerIndex];
        var blessingState = playerID === currentTurnPlayerId ? G.blessingState : null;
        var isTradePresentWindow = ((_b = G.pendingAction) === null || _b === void 0 ? void 0 : _b.original.type) === 'play_trade_present';
        var canSeeTradeOffer = isTradePresentWindow && (playerID === ((_c = G.pendingAction) === null || _c === void 0 ? void 0 : _c.original.playerId)
            || (playerID === ((_d = G.pendingAction) === null || _d === void 0 ? void 0 : _d.targetPlayerId) && ((_e = G.pendingAction) === null || _e === void 0 ? void 0 : _e.selectionKind) === 'trade_present'));
        var pendingAction = G.pendingAction
            ? __assign(__assign({}, G.pendingAction), { offeredCard: canSeeTradeOffer ? G.pendingAction.offeredCard : undefined }) : null;
        return __assign(__assign({}, G), { blessingState: blessingState, pendingAction: pendingAction, drawPile: [] });
    },
};
exports.default = exports.FlowerGame;
