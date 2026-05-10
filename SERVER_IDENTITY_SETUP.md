# Flower Server Identity Setup

This is now the first trusted backend slice between Supabase login and game seats.

## What it does

- verifies a Supabase access token on the server
- resolves a stable app-owned `account_id` for that authenticated player
- creates and joins matches on behalf of signed-in users
- records which authenticated account owns which `match_id` + `player_id`
- records finished matches from the game server and rolls them into leaderboard stats
- keeps the current guest flow working even if the identity service is offline

## Files

- [server/identity-server/identityServer.mjs](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/identityServer.mjs)
- [server/identity-server/supabase/accounts.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/accounts.sql)
- [server/identity-server/supabase/match_seat_claims.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/match_seat_claims.sql)
- [server/identity-server/supabase/match_results.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/match_results.sql)
- [server/identity-server/.env.local.example](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/.env.local.example)

## Supabase setup

Run the SQL in:

- [server/identity-server/supabase/accounts.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/accounts.sql)
- [server/identity-server/supabase/match_seat_claims.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/match_seat_claims.sql)
- [server/identity-server/supabase/match_results.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/match_results.sql)

This creates:

- `public.accounts`
- `public.identity_links`
- `public.match_seat_claims`
- `public.match_results`
- `public.player_stats_summary`

The `public.accounts` row is the app-wide username record. The identity server owns the 90-day rename rule: once a username is set, the next change unlocks after 90 days. The client should not write usernames directly to Supabase.

`match_seat_claims` stores one row per claimed seat:

- `match_id`
- `player_id`
- `user_id`
- `account_id`
- `display_name`
- `provider`
- `is_guest`
- timestamps

## Local server setup

1. Add values to `server/identity-server/.env.local`:
   - `GAME_SERVER_URL`
   - `GAME_SERVER_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - optional `ALLOWED_ORIGINS`
2. Start the service:

```bash
npm run server:identity
```

3. Point the client to it:

```env
VITE_IDENTITY_SERVER_URL=http://127.0.0.1:8787
```

## Current client behavior

When a signed-in user creates or joins, the client now:

1. sends the Supabase bearer token to the identity server
2. asks the identity server to create or join the match
3. lets the identity server call the boardgame.io server
4. upserts the seat claim and `account_id` mapping in Supabase
5. receives the match credentials back from the identity server

Guest users still work through the legacy direct flow, but they do not create durable account-linked seat claims yet.

## Match-end reporting

When the boardgame.io server sees a finished match, it should call:

- `POST /internal/matches/:matchId/results`

with the shared `GAME_SERVER_SECRET` in the `x-flower-server-secret` header.

That internal endpoint:

1. looks up the claimed seats for that match
2. resolves the winner to `winner_account_id`
3. inserts one row into `public.match_results`
4. lets the database trigger update `public.player_stats_summary`

`match_results.match_id` is unique, so duplicate reports stay idempotent and won't double-count leaderboard stats.

## Why this is the right first backend slice

This gives us a trusted bridge:

`Supabase user -> app account -> match seat`

That is the missing prerequisite for:

- match-end win recording
- player stats
- real leaderboards
- account-based reconnect and moderation
