"use strict";
// @ts-nocheck
// ============================================================
// FLOWER GAME — boardgame.io SERVER
// ============================================================
// Starts a boardgame.io server with Express.
// The same process serves both the game API and static
// React client files (from ../client/build).
//
// Environment variables:
//   PORT        — HTTP port (default 8000)
//   ALLOW_BOTS  — set to "true" to enable bot/AI players
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
Object.defineProperty(exports, "__esModule", { value: true });
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var server_js_1 = require("boardgame.io/dist/cjs/server.js");
var FlowerGame_js_1 = require("../game/FlowerGame.js");
var package_json_1 = __importDefault(require("../package.json"));
var Master = require('boardgame.io/dist/cjs/master.js').Master;
var makeMove = require('boardgame.io/dist/cjs/turn-order-4ab12333.js').makeMove;
var PORT = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 8000);
var LIVE_VERSION = (_b = process.env.FLOWER_GAME_VERSION) !== null && _b !== void 0 ? _b : 'flower-game-v6';
var GAME_ID = FlowerGame_js_1.FlowerGame.name;
var HISTORY_DB_DIR = (_c = process.env.FLOWER_HISTORY_DB_DIR) !== null && _c !== void 0 ? _c : path_1.default.resolve(process.cwd(), 'data/boardgameio-db');
var FLOWER_ADMIN_KEY = process.env.FLOWER_ADMIN_KEY || (function () { throw new Error('FLOWER_ADMIN_KEY env var required'); })();
var MAX_CHAT_MESSAGES = 100;
var MAX_CHAT_LENGTH = 400;
var TURN_TIMEOUT_SEC = Number((_d = process.env.FLOWER_TURN_TIMEOUT_SEC) !== null && _d !== void 0 ? _d : 60);
var COUNTER_RESPONSE_TIMEOUT_SEC = Number((_e = process.env.FLOWER_COUNTER_TIMEOUT_SEC) !== null && _e !== void 0 ? _e : 14);
var TURN_TIMEOUT_POLL_MS = Number((_f = process.env.FLOWER_TURN_TIMEOUT_POLL_MS) !== null && _f !== void 0 ? _f : 2000);
var LOBBY_STALE_MIN = Number((_g = process.env.FLOWER_LOBBY_STALE_MIN) !== null && _g !== void 0 ? _g : 10);
var LOBBY_STALE_MS = LOBBY_STALE_MIN * 60 * 1000;
var FLOWER_IDENTITY_SERVER_URL = (_j = (_h = process.env.FLOWER_IDENTITY_SERVER_URL) === null || _h === void 0 ? void 0 : _h.trim()) !== null && _j !== void 0 ? _j : '';
var FLOWER_IDENTITY_SERVER_SECRET = (_l = (_k = process.env.FLOWER_IDENTITY_SERVER_SECRET) === null || _k === void 0 ? void 0 : _k.trim()) !== null && _l !== void 0 ? _l : '';
// ── Presence (connected users) history ──────────────────────
// Records connection state changes forever in JSONL + a compact summary JSON.
var PRESENCE_DIR = (_m = process.env.FLOWER_PRESENCE_DIR) !== null && _m !== void 0 ? _m : path_1.default.resolve(process.cwd(), 'data/presence');
var PRESENCE_EVENTS_PATH = path_1.default.join(PRESENCE_DIR, 'events.jsonl');
var PRESENCE_SUMMARY_PATH = path_1.default.join(PRESENCE_DIR, 'summary.json');
function safeMkdirp(dir) {
    try {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    catch ( /* ignore */_a) { /* ignore */ }
}
function loadPresenceSummary() {
    try {
        if (!fs_1.default.existsSync(PRESENCE_SUMMARY_PATH))
            return { updatedAt: Date.now(), seats: {} };
        var raw = fs_1.default.readFileSync(PRESENCE_SUMMARY_PATH, 'utf8');
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            throw new Error('bad summary');
        var seats = parsed.seats;
        return {
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
            seats: typeof seats === 'object' && seats ? seats : {},
        };
    }
    catch (_a) {
        return { updatedAt: Date.now(), seats: {} };
    }
}
function savePresenceSummary(summary) {
    try {
        summary.updatedAt = Date.now();
        fs_1.default.writeFileSync(PRESENCE_SUMMARY_PATH, JSON.stringify(summary));
    }
    catch (_a) {
        // ignore
    }
}
function appendPresenceEvent(evt) {
    try {
        fs_1.default.appendFileSync(PRESENCE_EVENTS_PATH, JSON.stringify(evt) + '\n');
    }
    catch (_a) {
        // ignore
    }
}
safeMkdirp(PRESENCE_DIR);
var presenceSummary = loadPresenceSummary();
var lastPresenceByMatch = new Map();
function normalizePresencePlayers(metadata) {
    var rawPlayers = metadata === null || metadata === void 0 ? void 0 : metadata.players;
    var out = [];
    if (Array.isArray(rawPlayers)) {
        rawPlayers.forEach(function (p, idx) {
            var _a;
            var pid = String((_a = p === null || p === void 0 ? void 0 : p.id) !== null && _a !== void 0 ? _a : idx);
            var name = typeof (p === null || p === void 0 ? void 0 : p.name) === 'string' ? String(p.name).trim() : '';
            if (!name)
                return;
            out.push({ playerID: pid, name: name, connected: !!(p === null || p === void 0 ? void 0 : p.isConnected) });
        });
        return out;
    }
    if (rawPlayers && typeof rawPlayers === 'object') {
        for (var _i = 0, _a = Object.entries(rawPlayers); _i < _a.length; _i++) {
            var _b = _a[_i], playerID = _b[0], p = _b[1];
            var name_1 = typeof (p === null || p === void 0 ? void 0 : p.name) === 'string' ? String(p.name).trim() : '';
            if (!name_1)
                continue;
            out.push({ playerID: String(playerID), name: name_1, connected: !!(p === null || p === void 0 ? void 0 : p.isConnected) });
        }
    }
    return out;
}
function recordPresenceFromMetadata(matchID, metadata, now) {
    var _a;
    var players = normalizePresencePlayers(metadata);
    if (!players.length)
        return;
    var prevBySeat = (_a = lastPresenceByMatch.get(matchID)) !== null && _a !== void 0 ? _a : {};
    var nextBySeat = __assign({}, prevBySeat);
    var dirty = false;
    for (var _i = 0, players_1 = players; _i < players_1.length; _i++) {
        var p = players_1[_i];
        var seatKey = matchID + ':' + p.playerID;
        var prevConnected = prevBySeat[p.playerID];
        var existing = presenceSummary.seats[seatKey];
        var entry = existing !== null && existing !== void 0 ? existing : {
            seatKey: seatKey,
            matchID: matchID,
            playerID: p.playerID,
            name: p.name,
            firstSeenAt: now,
            lastSeenAt: now,
            connectedNow: p.connected,
        };
        entry.name = p.name;
        entry.lastSeenAt = now;
        entry.connectedNow = p.connected;
        if (prevConnected === undefined) {
            if (p.connected) {
                entry.lastConnectedAt = now;
                // first time we observe this seat and it is already connected: record an initial connect event
                appendPresenceEvent({ ts: now, type: 'connect', matchID: matchID, playerID: p.playerID, name: p.name });
            }
            dirty = true;
        }
        else if (prevConnected !== p.connected) {
            if (p.connected)
                entry.lastConnectedAt = now;
            else
                entry.lastDisconnectedAt = now;
            appendPresenceEvent({
                ts: now,
                type: p.connected ? 'connect' : 'disconnect',
                matchID: matchID,
                playerID: p.playerID,
                name: p.name,
            });
            dirty = true;
        }
        presenceSummary.seats[seatKey] = entry;
        nextBySeat[p.playerID] = p.connected;
    }
    lastPresenceByMatch.set(matchID, nextBySeat);
    if (dirty)
        savePresenceSummary(presenceSummary);
}
function purgePresenceMatch(matchID) {
    var _a;
    var changed = false;
    for (var _i = 0, _b = Object.keys(presenceSummary.seats); _i < _b.length; _i++) {
        var key = _b[_i];
        if (((_a = presenceSummary.seats[key]) === null || _a === void 0 ? void 0 : _a.matchID) === matchID) {
            delete presenceSummary.seats[key];
            changed = true;
        }
    }
    if (lastPresenceByMatch.has(matchID)) {
        lastPresenceByMatch.delete(matchID);
        changed = true;
    }
    if (changed)
        savePresenceSummary(presenceSummary);
}
var chatByMatch = new Map();
function uid() {
    return "".concat(Date.now().toString(36), "-").concat(Math.random().toString(36).slice(2, 10));
}
function readJsonBody(req) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks, chunk, e_1_1, raw;
        var _a, req_1, req_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    chunks = [];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, req_1 = __asyncValues(req);
                    _e.label = 2;
                case 2: return [4 /*yield*/, req_1.next()];
                case 3:
                    if (!(req_1_1 = _e.sent(), _b = req_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = req_1_1.value;
                    _a = false;
                    chunk = _d;
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = req_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(req_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    raw = Buffer.concat(chunks).toString('utf8').trim();
                    if (!raw)
                        return [2 /*return*/, {}];
                    return [2 /*return*/, JSON.parse(raw)];
            }
        });
    });
}
function extractWinnerPlayerId(gameover, fallbackWinner) {
    var _a;
    var candidate = (_a = gameover === null || gameover === void 0 ? void 0 : gameover.winner) !== null && _a !== void 0 ? _a : fallbackWinner;
    if (typeof candidate === 'string' && candidate.trim())
        return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate))
        return String(candidate);
    return null;
}
function toIsoTimestamp(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return null;
    return new Date(numeric).toISOString();
}
function getRoomStateSnapshot(state) {
    var _a;
    return (_a = state === null || state === void 0 ? void 0 : state.G) !== null && _a !== void 0 ? _a : {};
}
function listRoomPlayers(metadata, roomState) {
    var _a;
    var readyPlayerIds = new Set(Array.isArray(roomState.readyPlayerIds)
        ? roomState.readyPlayerIds
            .map(function (value) { return (typeof value === 'string' || typeof value === 'number') ? String(value) : ''; })
            .filter(Boolean)
        : []);
    var metadataPlayers = (_a = metadata.players) !== null && _a !== void 0 ? _a : {};
    var playerIds = Object.keys(metadataPlayers).sort(function (a, b) { return Number(a) - Number(b); });
    return playerIds.map(function (playerId) {
        var metadataPlayer = metadataPlayers[playerId];
        var livePlayer = Array.isArray(roomState.players)
            ? roomState.players.find(function (player) { var _a; return String((_a = player === null || player === void 0 ? void 0 : player.id) !== null && _a !== void 0 ? _a : '') === playerId; })
            : null;
        var name = typeof (metadataPlayer === null || metadataPlayer === void 0 ? void 0 : metadataPlayer.name) === 'string' && metadataPlayer.name.trim()
            ? metadataPlayer.name.trim()
            : typeof (livePlayer === null || livePlayer === void 0 ? void 0 : livePlayer.name) === 'string' && livePlayer.name.trim()
                ? livePlayer.name.trim()
                : '';
        return {
            id: playerId,
            isReady: readyPlayerIds.has(playerId),
            name: name,
        };
    });
}
function buildRoomSummary(matchID, state, metadata) {
    var _a, _b, _c;
    var roomState = getRoomStateSnapshot(state);
    var players = listRoomPlayers(metadata, roomState);
    var maxPlayersRaw = Number(roomState.maxPlayers);
    var minPlayersRaw = Number(roomState.minPlayers);
    var maxPlayers = Number.isFinite(maxPlayersRaw) && maxPlayersRaw > 0
        ? Math.max(3, Math.min(6, Math.floor(maxPlayersRaw)))
        : Math.max(3, players.length || 6);
    var minPlayers = Number.isFinite(minPlayersRaw) && minPlayersRaw > 0
        ? Math.max(3, Math.min(maxPlayers, Math.floor(minPlayersRaw)))
        : 3;
    var joinedCount = players.filter(function (player) { return player.name.trim(); }).length;
    var started = roomState.phase !== 'waiting';
    var winner = extractWinnerPlayerId(metadata.gameover, roomState.winner);
    var ownerPlayerId = typeof roomState.ownerPlayerId === 'string' && roomState.ownerPlayerId.trim()
        ? roomState.ownerPlayerId.trim()
        : '0';
    return {
        createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : null,
        gameover: (_a = metadata.gameover) !== null && _a !== void 0 ? _a : null,
        joinedCount: joinedCount,
        matchID: matchID,
        maxPlayers: maxPlayers,
        minPlayers: minPlayers,
        openSeatCount: Math.max(0, maxPlayers - joinedCount),
        ownerPlayerId: ownerPlayerId,
        players: players,
        readyPlayerIds: players.filter(function (player) { return player.isReady; }).map(function (player) { return player.id; }),
        roomName: typeof roomState.roomName === 'string' && roomState.roomName.trim()
            ? roomState.roomName.trim()
            : "".concat(((_c = (_b = players[0]) === null || _b === void 0 ? void 0 : _b.name) === null || _c === void 0 ? void 0 : _c.trim()) || 'Flower', "'s room"),
        started: started,
        updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : null,
        winner: winner,
    };
}
function fetchRoomSummary(matchID) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, state, metadata;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db.fetch(matchID, { state: true, metadata: true })];
                case 1:
                    _a = _b.sent(), state = _a.state, metadata = _a.metadata;
                    if (!metadata)
                        return [2 /*return*/, null];
                    return [2 /*return*/, buildRoomSummary(matchID, state, metadata)];
            }
        });
    });
}
function reportMatchResult(matchID, state, metadata) {
    return __awaiter(this, void 0, void 0, function () {
        var gameover, winnerPlayerId, gameState, players, participants, playerCount, startedAt, flowersPlantedTotal, response, text;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    if (!FLOWER_IDENTITY_SERVER_URL || !FLOWER_IDENTITY_SERVER_SECRET) {
                        return [2 /*return*/, false];
                    }
                    gameover = (_c = (_b = (_a = state.ctx) === null || _a === void 0 ? void 0 : _a.gameover) !== null && _b !== void 0 ? _b : metadata.gameover) !== null && _c !== void 0 ? _c : null;
                    winnerPlayerId = extractWinnerPlayerId(gameover, (_d = state.G) === null || _d === void 0 ? void 0 : _d.winner);
                    gameState = (_e = state.G) !== null && _e !== void 0 ? _e : {};
                    players = Array.isArray(gameState.players) ? gameState.players : [];
                    participants = players.map(function (player) {
                        var _a;
                        var flowersPlantedRaw = Number((_a = player.matchStats) === null || _a === void 0 ? void 0 : _a.flowersPlanted);
                        return {
                            flowersPlanted: Number.isFinite(flowersPlantedRaw) && flowersPlantedRaw > 0
                                ? Math.floor(flowersPlantedRaw)
                                : 0,
                            playerId: typeof player.id === 'string' || typeof player.id === 'number' ? String(player.id) : '',
                            playerName: typeof player.name === 'string' ? player.name : '',
                        };
                    });
                    playerCount = players.length || Object.keys((_f = metadata.players) !== null && _f !== void 0 ? _f : {}).length;
                    startedAt = toIsoTimestamp(gameState.gameStartedAt);
                    flowersPlantedTotal = participants.reduce(function (sum, participant) { return sum + participant.flowersPlanted; }, 0);
                    return [4 /*yield*/, fetch("".concat(FLOWER_IDENTITY_SERVER_URL.replace(/\/$/, ''), "/internal/matches/").concat(encodeURIComponent(matchID), "/results"), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-flower-server-secret': FLOWER_IDENTITY_SERVER_SECRET,
                            },
                            body: JSON.stringify({
                                finishedAt: new Date().toISOString(),
                                playerCount: playerCount,
                                resultPayload: {
                                    ctxGameover: gameover,
                                    flowersPlantedTotal: flowersPlantedTotal,
                                    participants: participants,
                                    winnerPlayerId: winnerPlayerId,
                                },
                                source: 'flower_game_server',
                                startedAt: startedAt,
                                winnerPlayerId: winnerPlayerId,
                            }),
                        })];
                case 1:
                    response = _g.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, response.text()];
                case 2:
                    text = _g.sent();
                    throw new Error(text || "Identity server result sync failed (".concat(response.status, ")"));
                case 3: return [2 /*return*/, true];
            }
        });
    });
}
// ── Create boardgame.io server ───────────────────────────────
var db = new server_js_1.FlatFile({ dir: HISTORY_DB_DIR });
var server = (0, server_js_1.Server)({
    games: [FlowerGame_js_1.FlowerGame],
    db: db,
    // Allow all origins in development.
    // Restrict this to your domain in production.
    origins: function (ctx) {
        var allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
        var origin = ctx.get('origin') || '';
        return allowed.includes(origin) ? origin : allowed[0];
    },
});
server.app.use(function (ctx, next) { return __awaiter(void 0, void 0, void 0, function () {
    var matchID, body, playerName, text, playerID, message, existing, nextMessages, _a, matchIDs, rooms, matchID, room, joinPathMatch, matchID, room, kickPathMatch, matchID, body, playerID, targetPlayerID_1, credentials, _b, state, metadata, lobbyMetadata, roomState, requesterMeta, targetMeta, nextPlayers, gPlayers, gReady, gTurnOrder, nextGPlayers, nextGReady, nextGTurnOrder, targetName, nextG, nextState, error_1, message, startPathMatch, matchID, body, playerID, credentials, _c, state, metadata, lobbyMetadata, roomState_1, requesterMeta, joinedCount, readyCount, result, error_2, message, seats, PRESENCE_LIVE_STALE_MS, presenceNow, byName, _i, seats_1, seat, name_2, existing, seatLive, users, connectedUsers, limitRaw, limit, raw, lines, tail, events, adminKey, matchID, body, reason, existing;
    var _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
    return __generator(this, function (_3) {
        switch (_3.label) {
            case 0:
                ctx.set('X-Flower-Game-Version', LIVE_VERSION);
                if (!ctx.path.startsWith('/chat/')) return [3 /*break*/, 5];
                ctx.set('Access-Control-Allow-Origin', '*');
                ctx.set('Access-Control-Allow-Headers', 'Content-Type');
                ctx.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
                if (ctx.method === 'OPTIONS') {
                    ctx.status = 204;
                    return [2 /*return*/];
                }
                matchID = decodeURIComponent(ctx.path.replace(/^\/chat\//, '').trim());
                if (!matchID) {
                    ctx.status = 400;
                    ctx.body = { error: 'matchID is required' };
                    return [2 /*return*/];
                }
                if (ctx.method === 'GET') {
                    ctx.type = 'application/json';
                    ctx.body = { messages: (_d = chatByMatch.get(matchID)) !== null && _d !== void 0 ? _d : [] };
                    return [2 /*return*/];
                }
                if (!(ctx.method === 'POST')) return [3 /*break*/, 4];
                _3.label = 1;
            case 1:
                _3.trys.push([1, 3, , 4]);
                return [4 /*yield*/, readJsonBody(ctx.req)];
            case 2:
                body = _3.sent();
                playerName = typeof body.playerName === 'string' ? body.playerName.trim() : '';
                text = typeof body.text === 'string' ? body.text.trim() : '';
                playerID = typeof body.playerID === 'string' ? body.playerID.trim() : undefined;
                if (!playerName) {
                    ctx.status = 400;
                    ctx.body = { error: 'playerName is required' };
                    return [2 /*return*/];
                }
                if (!text) {
                    ctx.status = 400;
                    ctx.body = { error: 'text is required' };
                    return [2 /*return*/];
                }
                message = {
                    id: uid(),
                    matchID: matchID,
                    playerID: playerID,
                    playerName: playerName.slice(0, 40),
                    text: text.slice(0, MAX_CHAT_LENGTH),
                    createdAt: Date.now(),
                };
                existing = (_e = chatByMatch.get(matchID)) !== null && _e !== void 0 ? _e : [];
                nextMessages = __spreadArray(__spreadArray([], existing, true), [message], false).slice(-MAX_CHAT_MESSAGES);
                chatByMatch.set(matchID, nextMessages);
                ctx.status = 201;
                ctx.type = 'application/json';
                ctx.body = { ok: true, message: message, messages: nextMessages };
                return [2 /*return*/];
            case 3:
                _a = _3.sent();
                ctx.status = 400;
                ctx.body = { error: 'Invalid JSON body' };
                return [2 /*return*/];
            case 4:
                ctx.status = 405;
                ctx.body = { error: 'Method not allowed' };
                return [2 /*return*/];
            case 5:
                if (ctx.path === '/version') {
                    ctx.type = 'text/plain; charset=utf-8';
                    ctx.body = LIVE_VERSION;
                    return [2 /*return*/];
                }
                if (!(ctx.path === '/rooms')) return [3 /*break*/, 8];
                ctx.set('Access-Control-Allow-Origin', '*');
                if (ctx.method !== 'GET') {
                    ctx.status = 405;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Method not allowed' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, db.listMatches({ gameName: GAME_ID })];
            case 6:
                matchIDs = _3.sent();
                return [4 /*yield*/, Promise.all(matchIDs.map(function (matchID) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, fetchRoomSummary(matchID)];
                    }); }); }))];
            case 7:
                rooms = (_3.sent())
                    .filter(function (room) { return Boolean(room); })
                    .sort(function (a, b) { var _a, _b, _c, _d; return ((_b = (_a = b.updatedAt) !== null && _a !== void 0 ? _a : b.createdAt) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = a.updatedAt) !== null && _c !== void 0 ? _c : a.createdAt) !== null && _d !== void 0 ? _d : 0); });
                ctx.type = 'application/json';
                ctx.body = { rooms: rooms };
                return [2 /*return*/];
            case 8:
                if (!ctx.path.startsWith('/rooms/')) return [3 /*break*/, 10];
                ctx.set('Access-Control-Allow-Origin', '*');
                if (ctx.method !== 'GET') {
                    ctx.status = 405;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Method not allowed' };
                    return [2 /*return*/];
                }
                matchID = decodeURIComponent(ctx.path.replace(/^\/rooms\//, '').trim());
                if (!matchID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'matchID is required' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, fetchRoomSummary(matchID)];
            case 9:
                room = _3.sent();
                if (!room) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Match not found' };
                    return [2 /*return*/];
                }
                ctx.type = 'application/json';
                ctx.body = room;
                return [2 /*return*/];
            case 10:
                joinPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/join$/);
                if (!joinPathMatch) return [3 /*break*/, 12];
                matchID = decodeURIComponent((_f = joinPathMatch[1]) !== null && _f !== void 0 ? _f : '').trim();
                if (!matchID) return [3 /*break*/, 12];
                return [4 /*yield*/, fetchRoomSummary(matchID)];
            case 11:
                room = _3.sent();
                if (!room) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Match not found' };
                    return [2 /*return*/];
                }
                if (room.started) {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'That room has already started.' };
                    return [2 /*return*/];
                }
                if (room.joinedCount >= room.maxPlayers) {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'No open seats in that match' };
                    return [2 /*return*/];
                }
                _3.label = 12;
            case 12:
                kickPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/kick$/);
                if (!kickPathMatch) return [3 /*break*/, 19];
                ctx.set('Access-Control-Allow-Origin', '*');
                ctx.set('Access-Control-Allow-Headers', 'Content-Type');
                ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
                if (ctx.method === 'OPTIONS') {
                    ctx.status = 204;
                    return [2 /*return*/];
                }
                if (ctx.method !== 'POST') {
                    ctx.status = 405;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Method not allowed' };
                    return [2 /*return*/];
                }
                matchID = decodeURIComponent((_g = kickPathMatch[1]) !== null && _g !== void 0 ? _g : '').trim();
                if (!matchID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'matchID is required' };
                    return [2 /*return*/];
                }
                _3.label = 13;
            case 13:
                _3.trys.push([13, 18, , 19]);
                return [4 /*yield*/, readJsonBody(ctx.req)];
            case 14:
                body = _3.sent();
                playerID = typeof body.playerID === 'string' ? body.playerID.trim() : '';
                targetPlayerID_1 = typeof body.targetPlayerID === 'string' ? body.targetPlayerID.trim() : '';
                credentials = typeof body.credentials === 'string' ? body.credentials.trim() : '';
                if (!playerID || !targetPlayerID_1) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'playerID and targetPlayerID are required' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, db.fetch(matchID, { state: true, metadata: true })];
            case 15:
                _b = _3.sent(), state = _b.state, metadata = _b.metadata;
                if (!state || !metadata) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Match not found' };
                    return [2 /*return*/];
                }
                lobbyMetadata = metadata;
                roomState = getRoomStateSnapshot(state);
                if (roomState.phase !== 'waiting') {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Game has already started' };
                    return [2 /*return*/];
                }
                if (roomState.ownerPlayerId !== playerID) {
                    ctx.status = 403;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Only the room owner can kick players' };
                    return [2 /*return*/];
                }
                requesterMeta = (_h = lobbyMetadata.players) === null || _h === void 0 ? void 0 : _h[playerID];
                if (!requesterMeta || requesterMeta.credentials !== credentials) {
                    ctx.status = 403;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Invalid credentials' };
                    return [2 /*return*/];
                }
                if (targetPlayerID_1 === playerID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'You cannot kick yourself' };
                    return [2 /*return*/];
                }
                targetMeta = (_j = lobbyMetadata.players) === null || _j === void 0 ? void 0 : _j[targetPlayerID_1];
                if (!targetMeta || !targetMeta.name) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Target player not found' };
                    return [2 /*return*/];
                }
                nextPlayers = __assign({}, lobbyMetadata.players);
                delete nextPlayers[targetPlayerID_1];
                return [4 /*yield*/, db.setMetadata(matchID, __assign(__assign({}, lobbyMetadata), { players: nextPlayers, updatedAt: Date.now() }))];
            case 16:
                _3.sent();
                gPlayers = ((_l = (_k = state.G) === null || _k === void 0 ? void 0 : _k.players) !== null && _l !== void 0 ? _l : []);
                gReady = ((_o = (_m = state.G) === null || _m === void 0 ? void 0 : _m.readyPlayerIds) !== null && _o !== void 0 ? _o : []);
                gTurnOrder = ((_q = (_p = state.G) === null || _p === void 0 ? void 0 : _p.turnOrder) !== null && _q !== void 0 ? _q : []);
                nextGPlayers = gPlayers.filter(function (p) { return p.id !== targetPlayerID_1; });
                nextGReady = gReady.filter(function (id) { return id !== targetPlayerID_1; });
                nextGTurnOrder = gTurnOrder.filter(function (id) { return id !== targetPlayerID_1; });
                targetName = (_s = (_r = gPlayers.find(function (p) { return p.id === targetPlayerID_1; })) === null || _r === void 0 ? void 0 : _r.name) !== null && _s !== void 0 ? _s : targetPlayerID_1;
                nextG = __assign(__assign({}, state.G), { players: nextGPlayers, readyPlayerIds: nextGReady, turnOrder: nextGTurnOrder, log: __spreadArray(__spreadArray([], ((_u = (_t = state.G) === null || _t === void 0 ? void 0 : _t.log) !== null && _u !== void 0 ? _u : []), true), ["".concat(targetName, " was kicked from the room.")], false) });
                nextState = __assign(__assign({}, state), { G: nextG });
                return [4 /*yield*/, db.setState(matchID, nextState, [])];
            case 17:
                _3.sent();
                ctx.type = 'application/json';
                ctx.body = { ok: true, matchID: matchID, kickedPlayerID: targetPlayerID_1 };
                return [2 /*return*/];
            case 18:
                error_1 = _3.sent();
                message = error_1 instanceof Error ? error_1.message : 'Unknown kick error';
                console.warn("[FlowerGame] kick failed for ".concat(matchID, ":"), message);
                ctx.status = 500;
                ctx.type = 'application/json';
                ctx.body = { error: message };
                return [2 /*return*/];
            case 19:
                startPathMatch = ctx.path.match(/^\/games\/flower-game\/([^/]+)\/start$/);
                if (!startPathMatch) return [3 /*break*/, 25];
                ctx.set('Access-Control-Allow-Origin', '*');
                ctx.set('Access-Control-Allow-Headers', 'Content-Type');
                ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
                if (ctx.method === 'OPTIONS') {
                    ctx.status = 204;
                    return [2 /*return*/];
                }
                if (ctx.method !== 'POST') {
                    ctx.status = 405;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Method not allowed' };
                    return [2 /*return*/];
                }
                matchID = decodeURIComponent((_v = startPathMatch[1]) !== null && _v !== void 0 ? _v : '').trim();
                if (!matchID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'matchID is required' };
                    return [2 /*return*/];
                }
                _3.label = 20;
            case 20:
                _3.trys.push([20, 24, , 25]);
                return [4 /*yield*/, readJsonBody(ctx.req)];
            case 21:
                body = _3.sent();
                playerID = typeof body.playerID === 'string' ? body.playerID.trim() : '';
                credentials = typeof body.credentials === 'string' ? body.credentials.trim() : '';
                if (!playerID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'playerID is required' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, db.fetch(matchID, { state: true, metadata: true })];
            case 22:
                _c = _3.sent(), state = _c.state, metadata = _c.metadata;
                if (!state || !metadata) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Match not found' };
                    return [2 /*return*/];
                }
                lobbyMetadata = metadata;
                roomState_1 = getRoomStateSnapshot(state);
                if (roomState_1.phase !== 'waiting') {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Game has already started' };
                    return [2 /*return*/];
                }
                if (roomState_1.ownerPlayerId !== playerID) {
                    ctx.status = 403;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Only the room owner can start the game' };
                    return [2 /*return*/];
                }
                requesterMeta = (_w = lobbyMetadata.players) === null || _w === void 0 ? void 0 : _w[playerID];
                if (!requesterMeta || requesterMeta.credentials !== credentials) {
                    ctx.status = 403;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Invalid credentials' };
                    return [2 /*return*/];
                }
                joinedCount = ((_x = roomState_1.players) !== null && _x !== void 0 ? _x : []).filter(function (p) { var _a; return (_a = p.name) === null || _a === void 0 ? void 0 : _a.trim(); }).length;
                readyCount = ((_y = roomState_1.readyPlayerIds) !== null && _y !== void 0 ? _y : []).filter(function (id) { var _a; return ((_a = roomState_1.players) !== null && _a !== void 0 ? _a : []).some(function (p) { var _a; return p.id === id && ((_a = p.name) === null || _a === void 0 ? void 0 : _a.trim()); }); }).length;
                if (joinedCount < ((_z = roomState_1.minPlayers) !== null && _z !== void 0 ? _z : 2)) {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: "Need at least ".concat(roomState_1.minPlayers, " players to start") };
                    return [2 /*return*/];
                }
                if (readyCount < joinedCount) {
                    ctx.status = 409;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'All joined players must be ready' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, timeoutMaster.onUpdate(makeMove('startGame', [], playerID, credentials), (_0 = state._stateID) !== null && _0 !== void 0 ? _0 : 0, matchID, playerID)];
            case 23:
                result = _3.sent();
                if (result && 'error' in result && result.error) {
                    ctx.status = 500;
                    ctx.type = 'application/json';
                    ctx.body = { error: result.error };
                    return [2 /*return*/];
                }
                ctx.type = 'application/json';
                ctx.body = { ok: true, matchID: matchID, started: true };
                return [2 /*return*/];
            case 24:
                error_2 = _3.sent();
                message = error_2 instanceof Error ? error_2.message : 'Unknown start error';
                console.warn("[FlowerGame] start failed for ".concat(matchID, ":"), message);
                ctx.status = 500;
                ctx.type = 'application/json';
                ctx.body = { error: message };
                return [2 /*return*/];
            case 25:
                if (ctx.path.startsWith('/presence/')) {
                    ctx.set('Access-Control-Allow-Origin', '*');
                    if (ctx.path === '/presence/summary') {
                        ctx.type = 'application/json';
                        seats = Object.values(presenceSummary.seats);
                        PRESENCE_LIVE_STALE_MS = Number((_1 = process.env.FLOWER_PRESENCE_LIVE_STALE_MS) !== null && _1 !== void 0 ? _1 : 30000);
                        presenceNow = Date.now();
                        byName = new Map();
                        for (_i = 0, seats_1 = seats; _i < seats_1.length; _i++) {
                            seat = seats_1[_i];
                            name_2 = seat.name;
                            existing = byName.get(name_2);
                            if (!existing) {
                                byName.set(name_2, {
                                    name: name_2,
                                    connectedNow: (seat.connectedNow && (presenceNow - seat.lastSeenAt) < PRESENCE_LIVE_STALE_MS),
                                    firstSeenAt: seat.firstSeenAt,
                                    lastSeenAt: seat.lastSeenAt,
                                    lastConnectedAt: seat.lastConnectedAt,
                                    lastDisconnectedAt: seat.lastDisconnectedAt,
                                    seats: [seat],
                                });
                                continue;
                            }
                            seatLive = seat.connectedNow && (presenceNow - seat.lastSeenAt) < PRESENCE_LIVE_STALE_MS;
                            existing.connectedNow = existing.connectedNow || seatLive;
                            existing.firstSeenAt = Math.min(existing.firstSeenAt, seat.firstSeenAt);
                            existing.lastSeenAt = Math.max(existing.lastSeenAt, seat.lastSeenAt);
                            if (typeof seat.lastConnectedAt === 'number') {
                                existing.lastConnectedAt = typeof existing.lastConnectedAt === 'number'
                                    ? Math.max(existing.lastConnectedAt, seat.lastConnectedAt)
                                    : seat.lastConnectedAt;
                            }
                            if (typeof seat.lastDisconnectedAt === 'number') {
                                existing.lastDisconnectedAt = typeof existing.lastDisconnectedAt === 'number'
                                    ? Math.max(existing.lastDisconnectedAt, seat.lastDisconnectedAt)
                                    : seat.lastDisconnectedAt;
                            }
                            existing.seats.push(seat);
                        }
                        users = Array.from(byName.values()).sort(function (a, b) {
                            var _a, _b;
                            var ak = ((_a = a.lastConnectedAt) !== null && _a !== void 0 ? _a : a.lastSeenAt) || 0;
                            var bk = ((_b = b.lastConnectedAt) !== null && _b !== void 0 ? _b : b.lastSeenAt) || 0;
                            return bk - ak;
                        });
                        connectedUsers = users.filter(function (u) { return u.connectedNow; });
                        ctx.body = {
                            updatedAt: presenceSummary.updatedAt,
                            totalSeats: seats.length,
                            totalUsers: users.length,
                            connectedUserCount: connectedUsers.length,
                            connectedUsers: connectedUsers.map(function (u) {
                                var _a;
                                return ({
                                    name: u.name,
                                    lastConnectedAt: (_a = u.lastConnectedAt) !== null && _a !== void 0 ? _a : null,
                                    lastSeenAt: u.lastSeenAt,
                                    seats: u.seats.map(function (s) { return ({ matchID: s.matchID, playerID: s.playerID }); }),
                                });
                            }),
                            users: users.map(function (u) {
                                var _a, _b;
                                return ({
                                    name: u.name,
                                    connectedNow: u.connectedNow,
                                    firstSeenAt: u.firstSeenAt,
                                    lastSeenAt: u.lastSeenAt,
                                    lastConnectedAt: (_a = u.lastConnectedAt) !== null && _a !== void 0 ? _a : null,
                                    lastDisconnectedAt: (_b = u.lastDisconnectedAt) !== null && _b !== void 0 ? _b : null,
                                    seatCount: u.seats.length,
                                });
                            }),
                        };
                        return [2 /*return*/];
                    }
                    if (ctx.path === '/presence/events') {
                        limitRaw = typeof ((_2 = ctx.query) === null || _2 === void 0 ? void 0 : _2.limit) === 'string' ? ctx.query.limit : '';
                        limit = Math.max(0, Math.min(5000, Number(limitRaw || 200) || 200));
                        try {
                            if (!fs_1.default.existsSync(PRESENCE_EVENTS_PATH)) {
                                ctx.type = 'application/json';
                                ctx.body = { events: [] };
                                return [2 /*return*/];
                            }
                            raw = fs_1.default.readFileSync(PRESENCE_EVENTS_PATH, 'utf8').trim();
                            lines = raw ? raw.split(/\n/g) : [];
                            tail = lines.slice(-limit);
                            events = tail.map(function (l) {
                                try {
                                    return JSON.parse(l);
                                }
                                catch (_a) {
                                    return null;
                                }
                            }).filter(Boolean);
                            ctx.type = 'application/json';
                            ctx.body = { events: events };
                            return [2 /*return*/];
                        }
                        catch (_4) {
                            ctx.status = 500;
                            ctx.type = 'application/json';
                            ctx.body = { error: 'failed to read presence events' };
                            return [2 /*return*/];
                        }
                    }
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Not Found' };
                    return [2 /*return*/];
                }
                if (!(ctx.path.startsWith('/admin/rooms/') && ctx.path.endsWith('/kill'))) return [3 /*break*/, 29];
                ctx.set('Access-Control-Allow-Origin', '*');
                ctx.set('Access-Control-Allow-Headers', 'Content-Type, x-flower-admin-key');
                ctx.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
                if (ctx.method === 'OPTIONS') {
                    ctx.status = 204;
                    return [2 /*return*/];
                }
                adminKey = String(ctx.get('x-flower-admin-key') || '').trim();
                if (adminKey !== FLOWER_ADMIN_KEY) {
                    ctx.status = 401;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Unauthorized' };
                    return [2 /*return*/];
                }
                matchID = decodeURIComponent(ctx.path.replace(/^\/admin\/rooms\//, '').replace(/\/kill$/, '').trim());
                if (!matchID) {
                    ctx.status = 400;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'matchID is required' };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, readJsonBody(ctx.req).catch(function () { return ({}); })];
            case 26:
                body = (_3.sent());
                reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : 'manual-kill';
                return [4 /*yield*/, db.fetch(matchID, { state: true, metadata: true })];
            case 27:
                existing = _3.sent();
                if (!(existing === null || existing === void 0 ? void 0 : existing.state) && !(existing === null || existing === void 0 ? void 0 : existing.metadata)) {
                    ctx.status = 404;
                    ctx.type = 'application/json';
                    ctx.body = { error: 'Match not found', matchID: matchID };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, db.wipe(matchID)];
            case 28:
                _3.sent();
                chatByMatch.delete(matchID);
                purgePresenceMatch(matchID);
                console.log("[FlowerGame] killed room ".concat(matchID, " (").concat(reason, ")"));
                ctx.type = 'application/json';
                ctx.body = { ok: true, matchID: matchID, deleted: true, reason: reason };
                return [2 /*return*/];
            case 29:
                if (ctx.path === '/health') {
                    ctx.type = 'application/json';
                    ctx.body = {
                        ok: true,
                        game: GAME_ID,
                        version: LIVE_VERSION,
                        packageVersion: package_json_1.default.version,
                    };
                    return [2 /*return*/];
                }
                return [4 /*yield*/, next()];
            case 30:
                _3.sent();
                return [2 /*return*/];
        }
    });
}); });
// ── Serve built React client ────────────────────────────────
var distDir = path_1.default.join(__dirname, '..');
if (fs_1.default.existsSync(distDir)) {
    server.app.use(function (ctx, next) { return __awaiter(void 0, void 0, void 0, function () {
        var filePath, sanitized, resolved, ext, mimeTypes;
        return __generator(this, function (_a) {
            if (ctx.path.startsWith('/games/') || ctx.path.startsWith('/lobby') || ctx.path === '/version') {
                return [2 /*return*/, next()];
            }
            filePath = ;
            sanitized = path_1.default.normalize(ctx.path).replace(/^(\.\.(\/|\\|$))+/, '');
            resolved = path_1.default.join(distDir, sanitized);
            if (!resolved.startsWith(path_1.default.resolve(distDir))) {
                ctx.status = 403;
                ctx.body = 'Forbidden';
                return [2 /*return*/];
            }
            if (!fs_1.default.existsSync(filePath) || fs_1.default.statSync(filePath).isDirectory()) {
                filePath = path_1.default.join(distDir, 'index.html');
            }
            ext = path_1.default.extname(filePath);
            mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2',
                '.woff': 'font/woff',
            };
            ctx.type = mimeTypes[ext] || 'application/octet-stream';
            ctx.body = fs_1.default.createReadStream(filePath);
            return [2 /*return*/];
        });
    }); });
}
// ── Turn timeout sweeper ─────────────────────────────────────
var timeoutMaster = new Master(FlowerGame_js_1.FlowerGame, db, {
    sendAll: function (payload) {
        var _a;
        var args = typeof payload === 'object' && payload && 'args' in payload
            ? payload.args
            : undefined;
        var matchID = Array.isArray(args) ? String((_a = args[0]) !== null && _a !== void 0 ? _a : '') : '';
        if (matchID) {
            server.transport.pubSub.publish("MATCH-".concat(matchID), payload);
        }
    },
}, server.auth);
var timeoutSweepRunning = false;
function getLobbyOccupancy(metadata) {
    var _a;
    var players = Object.values((_a = metadata.players) !== null && _a !== void 0 ? _a : {});
    var namedCount = players.filter(function (player) { var _a; return !!((_a = player.name) === null || _a === void 0 ? void 0 : _a.trim()); }).length;
    return { namedCount: namedCount, totalSeats: players.length };
}
function getLobbyCleanupAction(metadata, now, joinedCount) {
    var _a;
    var _b = getLobbyOccupancy(metadata), namedCount = _b.namedCount, totalSeats = _b.totalSeats;
    if (totalSeats === 0)
        return 'keep';
    var needsCleanupTimer = namedCount <= 1 && joinedCount <= 1;
    var markedAt = (_a = metadata.lobbyCleanupMarkedAt) !== null && _a !== void 0 ? _a : null;
    if (!needsCleanupTimer) {
        return markedAt ? 'clear' : 'keep';
    }
    if (!markedAt) {
        return 'mark';
    }
    return now - markedAt >= LOBBY_STALE_MS ? 'delete' : 'keep';
}
function runMaintenanceSweep() {
    return __awaiter(this, void 0, void 0, function () {
        var matchIDs, now_1, _loop_1, _i, matchIDs_1, matchID, error_3;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (timeoutSweepRunning)
                        return [2 /*return*/];
                    timeoutSweepRunning = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, 8, 9]);
                    return [4 /*yield*/, db.listMatches({ gameName: GAME_ID })];
                case 2:
                    matchIDs = _a.sent();
                    now_1 = Date.now();
                    _loop_1 = function (matchID) {
                        var queue;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    queue = server.transport.getMatchQueue(matchID);
                                    return [4 /*yield*/, queue.add(function () { return __awaiter(_this, void 0, void 0, function () {
                                            var _a, state, metadata, lobbyMetadata, gameover, recorded, error_4, message, roomState, roomSummary, joinedCount, lobbyCleanupAction, lobbyCleanupMarkedAt, rest, initializedState, initializedState, phase, initializedState, startedAt, limitSec, actorId, credentials, result;
                                            var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
                                            return __generator(this, function (_0) {
                                                switch (_0.label) {
                                                    case 0: return [4 /*yield*/, db.fetch(matchID, { state: true, metadata: true })];
                                                    case 1:
                                                        _a = _0.sent(), state = _a.state, metadata = _a.metadata;
                                                        // Update presence history (connected users) from lobby metadata.
                                                        try {
                                                            if (metadata)
                                                                recordPresenceFromMetadata(matchID, metadata, now_1);
                                                        }
                                                        catch (_1) {
                                                            // ignore
                                                        }
                                                        if (!state || !metadata)
                                                            return [2 /*return*/];
                                                        lobbyMetadata = metadata;
                                                        gameover = (_c = (_b = lobbyMetadata.gameover) !== null && _b !== void 0 ? _b : state.ctx.gameover) !== null && _c !== void 0 ? _c : null;
                                                        if (!(gameover != null)) return [3 /*break*/, 9];
                                                        if (!!lobbyMetadata.statsRecordedAt) return [3 /*break*/, 8];
                                                        _0.label = 2;
                                                    case 2:
                                                        _0.trys.push([2, 6, , 8]);
                                                        return [4 /*yield*/, reportMatchResult(matchID, state, lobbyMetadata)];
                                                    case 3:
                                                        recorded = _0.sent();
                                                        if (!recorded) return [3 /*break*/, 5];
                                                        return [4 /*yield*/, db.setMetadata(matchID, __assign(__assign({}, lobbyMetadata), { statsRecordedAt: now_1, statsRecordingError: undefined }))];
                                                    case 4:
                                                        _0.sent();
                                                        _0.label = 5;
                                                    case 5: return [3 /*break*/, 8];
                                                    case 6:
                                                        error_4 = _0.sent();
                                                        message = error_4 instanceof Error ? error_4.message : 'Unknown stats sync error';
                                                        return [4 /*yield*/, db.setMetadata(matchID, __assign(__assign({}, lobbyMetadata), { statsRecordingError: message }))];
                                                    case 7:
                                                        _0.sent();
                                                        console.warn("[FlowerGame] stats sync failed for ".concat(matchID, ":"), message);
                                                        return [3 /*break*/, 8];
                                                    case 8: return [2 /*return*/];
                                                    case 9:
                                                        roomState = getRoomStateSnapshot(state);
                                                        roomSummary = buildRoomSummary(matchID, state, lobbyMetadata);
                                                        joinedCount = roomSummary.joinedCount;
                                                        lobbyCleanupAction = getLobbyCleanupAction(lobbyMetadata, now_1, joinedCount);
                                                        if (!(lobbyCleanupAction === 'mark')) return [3 /*break*/, 11];
                                                        return [4 /*yield*/, db.setMetadata(matchID, __assign(__assign({}, lobbyMetadata), { lobbyCleanupMarkedAt: now_1 }))];
                                                    case 10:
                                                        _0.sent();
                                                        return [2 /*return*/];
                                                    case 11:
                                                        if (!(lobbyCleanupAction === 'clear')) return [3 /*break*/, 13];
                                                        lobbyCleanupMarkedAt = lobbyMetadata.lobbyCleanupMarkedAt, rest = __rest(lobbyMetadata, ["lobbyCleanupMarkedAt"]);
                                                        return [4 /*yield*/, db.setMetadata(matchID, rest)];
                                                    case 12:
                                                        _0.sent();
                                                        lobbyMetadata.lobbyCleanupMarkedAt = undefined;
                                                        _0.label = 13;
                                                    case 13:
                                                        if (!(lobbyCleanupAction === 'delete')) return [3 /*break*/, 15];
                                                        return [4 /*yield*/, db.wipe(matchID)];
                                                    case 14:
                                                        _0.sent();
                                                        chatByMatch.delete(matchID);
                                                        console.log("[FlowerGame] deleted stale lobby room ".concat(matchID, " (").concat(joinedCount, "/").concat(roomSummary.maxPlayers, " seats filled)"));
                                                        return [2 /*return*/];
                                                    case 15:
                                                        if (roomState.phase === 'waiting')
                                                            return [2 /*return*/];
                                                        if (!(((_d = state._stateID) !== null && _d !== void 0 ? _d : 0) === 0 && !((_e = state.G) === null || _e === void 0 ? void 0 : _e.turnStartedAt))) return [3 /*break*/, 17];
                                                        initializedState = __assign(__assign({}, state), { G: __assign(__assign({}, state.G), { turnStartedAt: now_1, gameStartedAt: now_1 }) });
                                                        return [4 /*yield*/, db.setState(matchID, initializedState, [])];
                                                    case 16:
                                                        _0.sent();
                                                        console.log("[FlowerGame] initialized timer for ready match ".concat(matchID));
                                                        return [2 /*return*/];
                                                    case 17:
                                                        if (!(((_f = state.G) === null || _f === void 0 ? void 0 : _f.turnStartedAt) && !((_g = state.G) === null || _g === void 0 ? void 0 : _g.gameStartedAt))) return [3 /*break*/, 19];
                                                        initializedState = __assign(__assign({}, state), { G: __assign(__assign({}, state.G), { gameStartedAt: Number(state.G.turnStartedAt) || now_1 }) });
                                                        return [4 /*yield*/, db.setState(matchID, initializedState, [])];
                                                    case 18:
                                                        _0.sent();
                                                        return [2 /*return*/];
                                                    case 19:
                                                        phase = (_h = state.G) === null || _h === void 0 ? void 0 : _h.phase;
                                                        if (!(phase === 'counter' && !((_k = (_j = state.G) === null || _j === void 0 ? void 0 : _j.pendingAction) === null || _k === void 0 ? void 0 : _k.startedAt))) return [3 /*break*/, 21];
                                                        initializedState = __assign(__assign({}, state), { G: __assign(__assign({}, state.G), { pendingAction: __assign(__assign({}, state.G.pendingAction), { startedAt: now_1, responseTimeLimitSec: COUNTER_RESPONSE_TIMEOUT_SEC }) }) });
                                                        return [4 /*yield*/, db.setState(matchID, initializedState, [])];
                                                    case 20:
                                                        _0.sent();
                                                        return [2 /*return*/];
                                                    case 21:
                                                        startedAt = phase === 'counter'
                                                            ? Number((_o = (_m = (_l = state.G) === null || _l === void 0 ? void 0 : _l.pendingAction) === null || _m === void 0 ? void 0 : _m.startedAt) !== null && _o !== void 0 ? _o : 0)
                                                            : Number((_q = (_p = state.G) === null || _p === void 0 ? void 0 : _p.turnStartedAt) !== null && _q !== void 0 ? _q : 0);
                                                        limitSec = phase === 'counter'
                                                            ? Number((_t = (_s = (_r = state.G) === null || _r === void 0 ? void 0 : _r.pendingAction) === null || _s === void 0 ? void 0 : _s.responseTimeLimitSec) !== null && _t !== void 0 ? _t : COUNTER_RESPONSE_TIMEOUT_SEC)
                                                            : Math.max(TURN_TIMEOUT_SEC, (_v = (_u = state.G) === null || _u === void 0 ? void 0 : _u.turnTimeLimitSec) !== null && _v !== void 0 ? _v : 0);
                                                        if (!startedAt || startedAt + (limitSec * 1000) > now_1)
                                                            return [2 /*return*/];
                                                        actorId = phase === 'counter'
                                                            ? (_x = (_w = state.G) === null || _w === void 0 ? void 0 : _w.pendingAction) === null || _x === void 0 ? void 0 : _x.targetPlayerId
                                                            : state.ctx.currentPlayer;
                                                        if (!actorId)
                                                            return [2 /*return*/];
                                                        credentials = (_z = (_y = lobbyMetadata.players) === null || _y === void 0 ? void 0 : _y[String(actorId)]) === null || _z === void 0 ? void 0 : _z.credentials;
                                                        if (!credentials) {
                                                            console.warn("[FlowerGame] timeout sweep skipped for ".concat(matchID, ": no credentials for player ").concat(actorId));
                                                            return [2 /*return*/];
                                                        }
                                                        return [4 /*yield*/, timeoutMaster.onUpdate(makeMove('timeoutAuto', [], String(actorId), credentials), state._stateID, matchID, String(actorId))];
                                                    case 22:
                                                        result = _0.sent();
                                                        if (result && 'error' in result && result.error) {
                                                            console.warn("[FlowerGame] timeout sweep failed for ".concat(matchID, ":"), result.error);
                                                            return [2 /*return*/];
                                                        }
                                                        console.log("[FlowerGame] auto-skipped expired timer for match ".concat(matchID, " (").concat(actorId, ")"));
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); })];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, matchIDs_1 = matchIDs;
                    _a.label = 3;
                case 3:
                    if (!(_i < matchIDs_1.length)) return [3 /*break*/, 6];
                    matchID = matchIDs_1[_i];
                    return [5 /*yield**/, _loop_1(matchID)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 9];
                case 7:
                    error_3 = _a.sent();
                    console.error('[FlowerGame] maintenance sweep error:', error_3);
                    return [3 /*break*/, 9];
                case 8:
                    timeoutSweepRunning = false;
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
// ── Start ────────────────────────────────────────────────────
server.run({ port: PORT, callback: function () {
        console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n\u2551  \uD83C\uDF38 Flower Game Server                 \u2551\n\u2551                                        \u2551\n\u2551  Lobby   \u2192 http://localhost:".concat(PORT, "/lobby \u2551\n\u2551  API     \u2192 http://localhost:").concat(PORT, "       \u2551\n\u2551  Version \u2192 http://localhost:").concat(PORT, "/version \u2551\n\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\nVersion: ").concat(LIVE_VERSION, "\nHistory DB: ").concat(HISTORY_DB_DIR, "\nTurn timeout: ").concat(TURN_TIMEOUT_SEC, "s\nLobby cleanup: ").concat(LOBBY_STALE_MIN, " min\n"));
        void runMaintenanceSweep();
        setInterval(function () {
            void runMaintenanceSweep();
        }, TURN_TIMEOUT_POLL_MS);
    } });
// Keep Node.js process alive
setInterval(function () { }, 60000);
