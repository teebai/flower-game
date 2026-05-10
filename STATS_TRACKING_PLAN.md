# Flower Game Stats Tracking Plan

This plan comes after the login system. Login gives us stable player identity; stats tracking should not be built seriously until each player action can be attached to an authenticated user.

## Goal

Track durable player stats such as:

- total wins
- total games played
- winning amount or reward amount
- cards played by card type
- flowers planted
- flowers planted in own garden versus opponent garden
- flowers stolen, discarded, traded, or reset
- season cards played
- special actions used, such as Bug, Bee, Wind, Eclipse, Great Reset, and Natural Disaster

## Key Decision

Stats must be recorded from the trusted game server/engine path, not from the React client.

The client can show stats, but it should not be the source of truth. If the browser reports "I played 10 cards" directly, players can spoof that. The server already decides whether an action succeeds, so the stats layer should only count successful actions after the engine accepts them.

## Recommended Architecture

Use a small server-side stats recorder that runs after every successful game action:

1. Player sends a game action.
2. Server verifies the match, player seat, and credentials.
3. Engine applies the action.
4. If the action succeeds, server writes one or more stat events.
5. If the action ends the game, server writes final match results.
6. Client reads profile and stats summaries from the database.

## Data Model

### `player_stats_summary`

One row per user. This is the fast table for profile pages, leaderboards, and lobby badges.

- `user_id uuid primary key`
- `games_played integer default 0`
- `games_won integer default 0`
- `total_win_amount numeric default 0`
- `flowers_planted integer default 0`
- `own_flowers_planted integer default 0`
- `opponent_flowers_planted integer default 0`
- `cards_played integer default 0`
- `cards_drawn integer default 0`
- `flowers_stolen integer default 0`
- `flowers_discarded integer default 0`
- `last_played_at timestamptz`
- `updated_at timestamptz default now()`

### `player_card_stats`

One row per user and card/action type. This answers questions like "how many times did this player play Bug?"

- `user_id uuid`
- `card_type text`
- `times_played integer default 0`
- `times_countered integer default 0`
- `times_successful integer default 0`
- `updated_at timestamptz default now()`

Primary key: `(user_id, card_type)`.

Example `card_type` values:

- `flower`
- `wind`
- `bug`
- `bee`
- `double_happiness`
- `trade_present`
- `trade_fate`
- `let_go`
- `season`
- `natural_disaster`
- `eclipse`
- `great_reset`

### `match_results`

One row per completed match.

- `match_id text primary key`
- `winner_user_id uuid`
- `winner_player_id text`
- `win_amount numeric default 0`
- `player_count integer`
- `started_at timestamptz`
- `ended_at timestamptz default now()`

### `match_players`

One row per player seat per match.

- `match_id text`
- `player_id text`
- `user_id uuid`
- `display_name text`
- `joined_at timestamptz default now()`
- `finished_place integer`
- `is_winner boolean default false`

Primary key: `(match_id, player_id)`.

### `stat_events`

Append-only audit log for debugging, replaying, and fixing stats later.

- `id bigint generated always as identity primary key`
- `match_id text`
- `user_id uuid`
- `player_id text`
- `action_type text`
- `event_type text`
- `amount numeric default 1`
- `metadata jsonb default '{}'::jsonb`
- `created_at timestamptz default now()`

This table is not required for every UI query, but it is very useful because summary counters can be rebuilt if a bug is found.

## Event Sources

The current engine already returns action results and some events, including:

- `flower_planted`
- `flower_stolen`
- `gods_favourite_transferred`

We should extend this pattern so every successful card/action can produce normalized events.

Useful event types:

- `card_played`
- `flower_planted_own`
- `flower_planted_opponent`
- `flower_stolen`
- `flower_discarded`
- `cards_drawn`
- `cards_traded`
- `season_played`
- `counter_played`
- `match_started`
- `match_completed`
- `win_recorded`

## Implementation Phases

### Phase 1: Finish Login

- Add Supabase Auth.
- Add durable `profiles`.
- Link each boardgame.io seat to a Supabase `user_id`.
- Keep guest players supported, but only permanent stats for signed-in users at first.

### Phase 2: Fork and Prepare Server/Engine

- Fork the engine/server snapshot into a proper backend workspace.
- Identify the exact boardgame.io move handlers that call `FlowerGameEngine.applyAction`.
- Add a `user_id` mapping to match seats.
- Make sure the server can verify Supabase JWTs.

### Phase 3: Add Stat Events

- Add a `StatsRecorder` module on the server.
- After each successful action, convert the original action plus engine events into `stat_events`.
- Keep writes idempotent using an action id or server-generated move id so browser retries do not double-count.
- Start with simple counters: wins, games played, cards played, flowers planted.

### Phase 4: Add Summary Tables

- Update `player_stats_summary` and `player_card_stats` from each accepted stat event.
- Use database transactions so event log and summary counters stay consistent.
- Add admin repair scripts that can rebuild summary tables from `stat_events`.

### Phase 5: Add Match Results

- When `state.phase === 'game_over'` and `state.winner` is present, write `match_results`.
- Increment `games_played` for all signed-in match players.
- Increment `games_won` and `total_win_amount` for the winner.
- Store `win_amount` only after we decide what it means: coins, points, ranked score, or cash-equivalent rewards.

### Phase 6: Display Stats

- Add a player profile panel in the lobby.
- Show lifetime wins, games played, and favorite card.
- Add a post-match results screen with stats earned this match.
- Add leaderboards only after we have moderation and anti-abuse rules.

## MVP Stats

Track these first:

- games played
- games won
- flowers planted
- cards played by type
- Bug, Bee, Wind, Season, Eclipse, Great Reset usage

Defer these until the system is stable:

- ranked score
- win amount
- achievements
- public leaderboards
- daily/weekly quests
- detailed per-color flower analytics

## Important Rules

- Only count successful actions.
- Do not trust the client for stat increments.
- Keep raw `stat_events` even if summary counters exist.
- Make every stat write idempotent.
- Treat guest stats as temporary until the guest links a social login.
- Do not store sensitive OAuth tokens in stats tables.

## Open Product Questions

- What exactly is "winning amount": points, coins, ranking score, or money-related prize?
- Should guest games count after the player links an account?
- Should private/friendly games count toward public stats?
- Should surrendered or abandoned games count as played?
- Do we need anti-farming rules before leaderboards?

## Recommended Build Order

1. Build login.
2. Add profile table.
3. Link match seats to authenticated users.
4. Fork and wire the server/engine workspace.
5. Add event logging for successful actions.
6. Add summary counters.
7. Add profile and post-match stat UI.
