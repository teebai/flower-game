/**
 * Seed a match with flowers already planted for layout testing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.resolve(process.cwd(), 'data/boardgameio-db');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function writeEntry(key, value) {
  const file = path.join(DB_DIR, hashKey(key));
  fs.writeFileSync(file, JSON.stringify({ key, value }) + '\n');
  console.log('Wrote:', key, '->', file);
}

const matchID = 'test-flowers-01';
const now = Date.now();

function makeFlower(id, color, isDivine = false) {
  return { id, kind: 'flower', color, isWildcard: false, isDivine };
}

function makeSet(flowers, isDivine = false, isSolid = false, isMegaComplete = false, isComplete = false) {
  return { id: `set-${Math.random().toString(36).slice(2,8)}`, flowers, isDivine, isSolid, isMegaComplete, isComplete };
}

// Player 0: 4 sets, 6 flowers each (24 flowers)
const p0Sets = [
  makeSet([
    makeFlower('p0s0f0', 'red'),
    makeFlower('p0s0f1', 'red'),
    makeFlower('p0s0f2', 'red'),
    makeFlower('p0s0f3', 'red'),
    makeFlower('p0s0f4', 'red'),
    makeFlower('p0s0f5', 'red'),
  ]),
  makeSet([
    makeFlower('p0s1f0', 'blue'),
    makeFlower('p0s1f1', 'blue'),
    makeFlower('p0s1f2', 'blue'),
    makeFlower('p0s1f3', 'blue'),
    makeFlower('p0s1f4', 'blue'),
    makeFlower('p0s1f5', 'blue'),
  ]),
  makeSet([
    makeFlower('p0s2f0', 'green'),
    makeFlower('p0s2f1', 'green'),
    makeFlower('p0s2f2', 'green'),
    makeFlower('p0s2f3', 'green'),
    makeFlower('p0s2f4', 'green'),
    makeFlower('p0s2f5', 'green'),
  ]),
  makeSet([
    makeFlower('p0s3f0', 'yellow'),
    makeFlower('p0s3f1', 'yellow'),
    makeFlower('p0s3f2', 'yellow'),
    makeFlower('p0s3f3', 'yellow'),
    makeFlower('p0s3f4', 'yellow'),
    makeFlower('p0s3f5', 'yellow'),
  ]),
];

// Player 1: 3 sets with varying sizes
const p1Sets = [
  makeSet([
    makeFlower('p1s0f0', 'purple'),
    makeFlower('p1s0f1', 'purple'),
    makeFlower('p1s0f2', 'purple'),
    makeFlower('p1s0f3', 'purple'),
    makeFlower('p1s0f4', 'purple'),
    makeFlower('p1s0f5', 'purple'),
    makeFlower('p1s0f6', 'purple'), // 7 flowers = 2 rings
  ]),
  makeSet([
    makeFlower('p1s1f0', 'orange'),
    makeFlower('p1s1f1', 'orange'),
    makeFlower('p1s1f2', 'orange'),
  ]),
  makeSet([
    makeFlower('p1s2f0', 'black'),
    makeFlower('p1s2f1', 'black'),
    makeFlower('p1s2f2', 'black'),
    makeFlower('p1s2f3', 'black'),
    makeFlower('p1s2f4', 'black'),
    makeFlower('p1s2f5', 'black'),
    makeFlower('p1s2f6', 'black'),
    makeFlower('p1s2f7', 'black'),
    makeFlower('p1s2f8', 'black'),
    makeFlower('p1s2f9', 'black'),
    makeFlower('p1s2f10', 'black'),
    makeFlower('p1s2f11', 'black'), // 12 flowers = 3 rings
  ]),
];

function makePlayer(id, name, sets) {
  return {
    id: String(id),
    name,
    hand: [],
    garden: { sets },
    matchStats: { flowersPlanted: sets.reduce((a, s) => a + s.flowers.length, 0) },
  };
}

const players = [
  makePlayer(0, 'FlowerTester', p0Sets),
  makePlayer(1, 'FlowerTester2', p1Sets),
];

const G = {
  id: matchID,
  gameStartedAt: now,
  roomName: 'Flower Layout Test',
  ownerPlayerId: '0',
  minPlayers: 2,
  maxPlayers: 2,
  readyPlayerIds: ['0', '1'],
  players,
  turnOrder: ['0', '1'],
  currentPlayerIndex: 0,
  turnDirection: 1,
  drawPile: [],
  discardPile: [],
  season: 'spring',
  drawPhaseSeason: 'spring',
  seasonTurnsRemaining: 3,
  godsFavouritePlayerId: null,
  phase: 'action',
  movesRemaining: 3,
  pendingAction: null,
  blessingState: null,
  coinFlip: null,
  turnStartedAt: now,
  turnTimeLimitSec: 60,
  winner: null,
  matchResult: null,
  log: ['Game started!', 'Flower layout test match.'],
};

const ctx = {
  numPlayers: 2,
  playOrder: ['0', '1'],
  playOrderPos: 0,
  activePlayers: null,
  currentPlayer: '0',
  numMoves: 0,
  turn: 1,
  phase: '',
  gameover: undefined,
};

const state = {
  G,
  ctx,
  _stateID: 1,
  deltalog: [],
  plugins: {},
  _undo: [{ G, ctx, plugins: {} }],
  _redo: [],
};

const metadata = {
  gameName: 'flower-game',
  unlisted: false,
  players: {
    '0': { id: '0', name: 'FlowerTester', credentials: 'secret-0', isConnected: true },
    '1': { id: '1', name: 'FlowerTester2', credentials: 'secret-1', isConnected: true },
  },
  createdAt: now,
  updatedAt: now,
  setupData: { names: ['FlowerTester'], maxPlayers: 2, minPlayers: 2, roomName: 'flower-layout-test' },
};

writeEntry(matchID, state);
writeEntry(`${matchID}:initial`, state);
writeEntry(`${matchID}:metadata`, metadata);
writeEntry(`${matchID}:log`, []);

console.log('\nMatch seeded:', matchID);
console.log('Player 0 credentials: secret-0');
console.log('Player 1 credentials: secret-1');
console.log('Player 0:', p0Sets.length, 'sets,', p0Sets.reduce((a,s)=>a+s.flowers.length,0), 'flowers');
console.log('Player 1:', p1Sets.length, 'sets,', p1Sets.reduce((a,s)=>a+s.flowers.length,0), 'flowers');
