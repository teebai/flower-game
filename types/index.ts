// ============================================================
// FLOWER GAME — TYPE DEFINITIONS
// ============================================================

export type FlowerColor =
  | 'blue' | 'purple' | 'red' | 'orange'
  | 'yellow' | 'green' | 'black'
  | 'rainbow' | 'triple_rainbow' | 'divine';

export type PowerCardName =
  | 'wind' | 'divine_protection' | 'bug' | 'bee'
  | 'double_happiness' | 'trade_present' | 'trade_fate'
  | 'let_go' | 'spring' | 'summer' | 'autumn' | 'winter'
  | 'natural_disaster' | 'eclipse' | 'great_reset';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | null;

export type GamePhase =
  | 'waiting'     // lobby, not started
  | 'blessing'    // God's Favourite coin flip
  | 'draw'        // draw phase
  | 'action'      // player has moves remaining
  | 'counter'     // waiting for counter response from target
  | 'game_over';

// ── Cards ────────────────────────────────────────────────────

export interface BaseCard {
  id: string;
}

export interface FlowerCard extends BaseCard {
  kind: 'flower';
  color: FlowerColor;
  /** True for rainbow, triple_rainbow, bee-placed wildcards */
  isWildcard: boolean;
  /** The persisted color this wildcard is representing after placement. */
  representedColor?: FlowerColor;
}

export interface PowerCard extends BaseCard {
  kind: 'power';
  name: PowerCardName;
  isBlockable: boolean;   // can be countered by Divine Protection or Wind
}

export type Card = FlowerCard | PowerCard;

// ── Garden ───────────────────────────────────────────────────

export interface GardenSet {
  id: string;
  flowers: FlowerCard[];
  /** True once 3+ flowers of matching colour are present */
  isComplete: boolean;
  /** 5+ flowers, OR any set containing a combined Triple Rainbow */
  isSolid: boolean;
  /** Contains a Triple Rainbow card combined with other flowers */
  containsTripleRainbow: boolean;
  /** Contains a Divine Flower or an invulnerable token */
  isDivine: boolean;
  /** Placeholder token formed when one of each normal flower color returns to discard */
  isToken?: boolean;
}

export interface Garden {
  sets: GardenSet[];
}

// ── Player ───────────────────────────────────────────────────

export interface PlayerMatchStats {
  flowersPlanted: number;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  garden: Garden;
  matchStats: PlayerMatchStats;
}

export interface MatchResultPlayerSummary {
  playerId: string;
  playerName: string;
  won: boolean;
  handCount: number;
  gardenSetCount: number;
  completeSetCount: number;
  solidSetCount: number;
  divineSetCount: number;
  totalFlowers: number;
  flowersPlanted: number;
  isGodsFavourite: boolean;
}

export interface MatchResultSummary {
  finishedAt: number;
  durationSec: number;
  winnerPlayerId: string | null;
  winnerName: string | null;
  seasonAtFinish: Season;
  drawPileCount: number;
  discardPileCount: number;
  players: MatchResultPlayerSummary[];
}

// ── Actions ──────────────────────────────────────────────────

export type ActionType =
  | 'plant_own'                    // plant flower into own garden
  | 'plant_opponent'               // plant flower into opponent's garden
  | 'play_wind_single'             // 1 Wind card → steal 1 flower
  | 'play_wind_double'             // 2 Wind cards → steal 4 flowers
  | 'counter_wind'                 // free: defend with own Wind card(s)
  | 'counter_divine'               // free: defend with Divine Protection
  | 'counter_select_cards'         // free: target chooses cards for DH Take / Trade Present
  | 'play_bug'                     // Bug card
  | 'play_bee'                     // Bee card
  | 'play_double_happiness_take'   // take 2 hand cards from opponent
  | 'play_double_happiness_give'   // give 2 hand cards to opponent
  | 'play_trade_present'           // exchange 1 hand card
  | 'play_trade_fate'              // swap entire hands
  | 'play_let_go'                  // discard own hand
  | 'play_season'                  // Spring/Summer/Autumn/Winter
  | 'play_natural_disaster'        // destroy a completed set
  | 'play_eclipse'                 // reverse order + redistribute hands
  | 'play_great_reset'             // discard all hands, redraw 5 each
  | 'discard_flower'               // Autumn only: discard flower from garden
  | 'blessing_flip'               // trigger coin flip in blessing phase
  | 'blessing_choose'             // pick 2 cards + arrange remaining 5
  | 'pass';                       // end turn early

export interface GameAction {
  type: ActionType;
  playerId: string;
  /** Target player for attacks, trades, plant-in-opponent, etc. */
  targetPlayerId?: string;
  /** Card IDs being played from hand */
  cardIds?: string[];
  /** Card IDs or set IDs being targeted in gardens */
  targetCardIds?: string[];
  /** Target garden set ID */
  targetSetId?: string;
  /** Additional target garden set IDs (used by Double Wind follow-up steals) */
  targetSetIds?: string[];
  /** For wildcard colour resolution (bee, rainbow) */
  chosenColor?: FlowerColor;
  /** For Trade Present: the card the acting player is offering */
  offeredCardId?: string;
  /** For Trade Present: the card the target player is offering */
  requestedCardId?: string;
  /** For blessing_choose: IDs of the 2 cards to keep */
  blessingPickedIds?: string[];
  /** For blessing_choose: remaining cards in desired order to put back on top */
  blessingArrangedIds?: string[];
}

// ── Blessing State ────────────────────────────────────────────

export interface BlessingState {
  /** The 7 cards revealed from the top of the draw pile */
  revealedCards: Card[];
  /** True if empty-hand override applied first (player drew 7, now just rearranging) */
  emptyHandMode: boolean;
  /** Coin flip result */
  coinResult: 'heads' | 'tails';
}

// ── Pending Action (Counter Window) ──────────────────────────

export interface PendingAction {
  /** The original action waiting to resolve */
  original: GameAction;
  /** Number of attacking Wind cards (for partial block calculation) */
  windCount?: number;
  /** The single player who can respond (the target) */
  targetPlayerId: string;
  /** Has the target responded yet? */
  responded: boolean;
  /** What the target chose */
  response?: 'counter_wind' | 'counter_divine' | 'allow';
  /** Wind card IDs used to counter (if any) */
  counterCardIds?: string[];
  /** Remaining wind after partial counter */
  remainingWindCount?: number;
  /** Divine Protection coin flip result */
  coinFlipResult?: 'heads' | 'tails';
  /** If set, the target must choose card(s) before the action resolves. */
  selectionKind?: 'double_happiness_take' | 'trade_present';
  /** Trade Present temporarily reveals the offered card to the target. */
  offeredCard?: Card;
  /** Milliseconds elapsed on the acting player's turn when the counter window opened. */
  pausedTurnElapsedMs?: number;
  /**
   * The actual card objects removed from the attacker's hand when the counter
   * window opened. Stored here so they can be added to the discard pile after
   * the window resolves (whether the action lands, is blocked, or is countered).
   */
  playedCards?: Card[];
  /** Millisecond timestamp when the counter / trade response window opened. */
  startedAt?: number;
  /** Response window limit in seconds (counter/trade prompt). */
  responseTimeLimitSec?: number;
}

// ── Game State ───────────────────────────────────────────────

export interface GameState {
  id: string;
  /** Millisecond timestamp when the match became active */
  gameStartedAt: number;
  roomName: string;
  ownerPlayerId: string | null;
  minPlayers: number;
  maxPlayers: number;
  readyPlayerIds: string[];
  players: Player[];
  /** Ordered list of player IDs for turn management */
  turnOrder: string[];
  /** Index into turnOrder for the current player */
  currentPlayerIndex: number;
  /** 1 = normal, -1 = reversed (after Eclipse) */
  turnDirection: 1 | -1;
  drawPile: Card[];
  discardPile: Card[];
  season: Season;
  /** Season snapshot used for this turn's draw / blessing flow */
  drawPhaseSeason: Season;
  /** Turns remaining before season expires (resets to 3 on new season) */
  seasonTurnsRemaining: number;
  /** Player ID currently holding God's Favourite, or null at game start */
  godsFavouritePlayerId: string | null;
  phase: GamePhase;
  /** Moves remaining in the current action phase (max 3) */
  movesRemaining: number;
  /** Set when a blockable card is played and we await a counter response */
  pendingAction: PendingAction | null;
  /** Set during the blessing pick step (heads result) */
  blessingState: BlessingState | null;
  /** Millisecond timestamp when the current turn began */
  turnStartedAt: number;
  /** Server-enforced timer limit in seconds for turns / response windows */
  turnTimeLimitSec: number;
  /** Set when the game ends */
  winner: string | null;
  /** Frozen end-of-match snapshot used by the UI and result pipelines */
  matchResult: MatchResultSummary | null;
  /** Human-readable event log */
  log: string[];
}

// ── Engine Result ─────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  error?: string;
  /** Updated game state (only present on success) */
  state?: GameState;
  /** Events that occurred (for UI animations) */
  events?: GameEvent[];
}

export type GameEventType =
  | 'card_played'
  | 'flower_planted'
  | 'flower_stolen'
  | 'flower_destroyed'
  | 'hand_swapped'
  | 'cards_transferred'
  | 'gods_favourite_transferred'
  | 'season_changed'
  | 'turn_order_reversed'
  | 'hands_redistributed'
  | 'counter_attempted'
  | 'win';

export interface GameEvent {
  type: GameEventType;
  playerId: string;
  targetPlayerId?: string;
  data?: Record<string, unknown>;
}
