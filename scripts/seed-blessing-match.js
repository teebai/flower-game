/**
 * Seed a match directly into the blessing phase for UI testing.
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

const matchID = 'test-blessing-01';
const now = Date.now();
const future = now + 3600000; // 1 hour in the future

// Build a minimal deck
function makeDeck() {
  const colors = ['red', 'green', 'blue', 'yellow', 'black'];
  const deck = [];
  let idCounter = 0;
  for (let i = 0; i < 5; i++) {
    for (let c = 0; c < colors.length; c++) {
      deck.push({ id: `f${idCounter++}`, kind: 'flower', color: colors[c], isWildcard: false });
    }
  }
  // Add some wildcards
  deck.push({ id: `f${idCounter++}`, kind: 'flower', color: 'rainbow', isWildcard: true });
  deck.push({ id: `f${idCounter++}`, kind: 'flower', color: 'rainbow', isWildcard: true });
  // Add power cards
  const powers = ['wind', 'bug', 'bee', 'divine_protection', 'eclipse', 'natural_disaster', 'season', 'double_happiness', 'trade_present', 'trade_fate', 'let_go', 'great_reset'];
  for (const name of powers) {
    for (let i = 0; i < 3; i++) {
      deck.push({ id: `p${idCounter++}`, kind: 'power', name, isBlockable: !['eclipse', 'divine_protection', 'natural_disaster', 'great_reset'].includes(name) });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const deck = makeDeck();
const revealedCards = deck.slice(0, 7);
const drawPile = deck.slice(7);

function makePlayer(id, name) {
  return {
    id: String(id),
    name,
    hand: [],
    garden: { sets: [] },
    matchStats: { flowersPlanted: 0 },
  };
}

const players = [
  makePlayer(0, 'TestPlayer'),
  makePlayer(1, 'TestPlayer2'),
];

const G = {
  id: matchID,
  gameStartedAt: now,
  roomName: 'Flower Room',
  ownerPlayerId: '0',
  minPlayers: 2,
  maxPlayers: 2,
  readyPlayerIds: ['0', '1'],
  players,
  turnOrder: ['0', '1'],
  currentPlayerIndex: 0,
  turnDirection: 1,
  drawPile,
  discardPile: [],
  season: 'spring',
  drawPhaseSeason: 'spring',
  seasonTurnsRemaining: 3,
  godsFavouritePlayerId: null,
  phase: 'blessing',
  movesRemaining: 0,
  pendingAction: null,
  blessingState: {
    revealedCards,
    emptyHandMode: false,
    coinResult: 'heads',
  },
  coinFlip: null,
  turnStartedAt: future,
  turnTimeLimitSec: 60,
  winner: null,
  matchResult: null,
  log: ['Game started!', 'TestPlayer goes first.', '👑 TestPlayer flips the blessing coin: HEADS!', 'Heads! TestPlayer sees the top 7 card(s) and chooses 2 to keep.'],
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
  _stateID: 5,
  deltalog: [],
  plugins: {},
  _undo: [{ G, ctx, plugins: {} }],
  _redo: [],
};

const metadata = {
  gameName: 'flower-game',
  unlisted: false,
  players: {
    '0': { id: '0', name: 'TestPlayer', credentials: 'secret-0', isConnected: true },
    '1': { id: '1', name: 'TestPlayer2', credentials: 'secret-1', isConnected: true },
  },
  createdAt: now,
  updatedAt: now,
  setupData: { names: ['TestPlayer'], maxPlayers: 2, minPlayers: 2, roomName: 'testblessing' },
};

// Write the DB entries
writeEntry(matchID, state);
writeEntry(`${matchID}:initial`, state);
writeEntry(`${matchID}:metadata`, metadata);
writeEntry(`${matchID}:log`, []);

console.log('\nMatch seeded:', matchID);
console.log('Player 0 credentials: secret-0');
console.log('Player 1 credentials: secret-1');
console.log('Current player: 0');
console.log('Phase: blessing');
console.log('Turn starts at:', new Date(future).toISOString());
