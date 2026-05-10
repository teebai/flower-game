# Supabase Setup

The fork now includes a client auth layer that can use Supabase Auth for:

- anonymous guest sessions
- Google login
- Apple login
- basic profile persistence
- one account-wide username across all games
- once a username is set, the next change is locked until 90 days later
- reconnect data that stays on the device and is copied onto the signed-in user on this browser
- unique default guest names so anonymous players do not all appear as the same fallback identity
- guest-to-social identity linking so a guest session can be upgraded instead of split into a different account

## Environment Variables

Add these values to your local `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GAME_SERVER_URL`
- `VITE_AUTH_REDIRECT_URL` (optional, useful for preview/staging domains)

If you only have the older naming from a Supabase export, `VITE_SUPABASE_ANON_KEY` also works in this fork.

## Auth Providers

In Supabase Auth:

1. Enable Anonymous Sign-Ins.
2. Enable Google.
3. Enable Apple.
4. Enable Manual Linking.
5. Add your local and production redirect URLs.
6. Set the Auth `Site URL` to your active app URL, not `localhost`.

Useful redirect URLs:

- `http://localhost:5173`
- `https://flowergamebeta.vercel.app`
- `https://flower.a133.mov`
- your production app URL

If Google login lands on `http://localhost:3000`, Supabase Auth is still falling back to an old `Site URL` or the current app URL is missing from the redirect allow list.

## Profiles Table

Run the SQL in [server/identity-server/supabase/accounts.sql](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/server/identity-server/supabase/accounts.sql), or paste the equivalent below into Supabase:

```sql
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  avatar_url text,
  display_name_last_changed_at timestamptz,
  display_name_locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

drop policy if exists "authenticated users can create accounts" on public.accounts;
drop policy if exists "users can read their own account" on public.accounts;
drop policy if exists "users can update their own account" on public.accounts;
```

## Current Behavior

- When Supabase is configured, the lobby can create guest sessions and start OAuth flows.
- When a guest user chooses Google or Apple, the app attempts to link that provider onto the existing guest account.
- When Supabase is not configured, the lobby falls back to a local guest identity so the fork still runs.
- Signed-in players choose a single username that is used across all games.
- The username editor is routed through the identity server. Once a username is set, the next change is locked until 90 days later.
- Match reconnect data is always saved on this device and is also keyed by user id when available.
- The lobby always shows the Google and Apple entry points. If env vars are still blank, the buttons stay visible but disabled with a setup hint.

See [AUTH_PIPELINE.md](/Users/lohkeryi/Documents/Projects/-backup-flowerGame/client/AUTH_PIPELINE.md) for the end-to-end flow and launch checklist.
