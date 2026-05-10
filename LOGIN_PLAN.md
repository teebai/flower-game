# Flower Game Login Plan

## Current State

- The app is a Vite + React client that talks directly to the boardgame.io lobby/game server at `https://flower.a133.mov`.
- Match reconnect is currently stored in `localStorage` under `flower-game:match`.
- Players identify themselves by typing a display name when creating or joining rooms.
- There is no durable account, profile, friend, moderation, or account recovery layer yet.

## Recommended Login Approach

Use managed social auth with a guest-first path:

1. Let players enter immediately as a guest.
2. Offer "Continue with Google" and "Continue with Apple" from the lobby.
3. Link guest progress/current match to the social account after login.
4. Store only the app profile we need: auth user id, display name, avatar URL, provider, created timestamp, and last seen timestamp.

This keeps the game fast for casual play while giving returning players a reliable account.

## Best Provider Options

### Option A: Supabase Auth

Best fit if we want simple account management plus a real database for profiles, match history, reports, cosmetics, friends, or leaderboards.

Pros:
- Google, Apple, Discord, GitHub, email magic links, and anonymous auth are supported.
- Built-in Postgres makes profile and game metadata easy to manage.
- Good admin dashboard and exportability.
- Works cleanly with Vite using `@supabase/supabase-js`.

Cons:
- We need to configure OAuth apps and Supabase URL/anon key.
- Some backend policies must be designed carefully.

Recommendation: strongest long-term choice.

### Option B: Firebase Authentication

Best fit if we want the fastest managed social login setup and minimal backend thinking.

Pros:
- Very easy Google and Apple sign-in.
- Anonymous auth and account linking are first-class.
- Very reliable on web and mobile PWA flows.
- Easy admin console for users.

Cons:
- App data usually goes into Firestore/Realtime Database, which can be less pleasant than SQL for reporting and admin workflows.
- Vendor lock-in is stronger.

Recommendation: easiest implementation choice.

### Option C: Clerk

Best fit if we want the most polished drop-in hosted auth UI.

Pros:
- Excellent social login UX.
- Very fast to implement.
- Good user management dashboard.
- Handles account linking, sessions, and profile UI well.

Cons:
- More productized and pricing-sensitive.
- We still need our own app database for durable game data.

Recommendation: best UX shortcut if paid SaaS dependency is acceptable.

## Suggested Decision

Start with Supabase Auth using:

- Guest mode through Supabase anonymous auth.
- Social login with Google first.
- Apple login second, especially because this is a PWA and iOS users expect it.
- Optional Discord login later if the game community gathers there.

## Implementation Plan

### Phase 1: Auth Foundation

- Create a Supabase project.
- Enable anonymous sign-ins.
- Enable Google OAuth.
- Add Apple OAuth after the app domain and redirect URLs are stable.
- Add environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### Phase 2: Client Auth State

- Add `@supabase/supabase-js`.
- Create `src/auth/supabaseClient.ts`.
- Create `src/auth/AuthProvider.tsx` to expose:
  - current user
  - profile
  - sign in with Google
  - sign in with Apple
  - continue as guest
  - sign out
- Replace free-text name as the primary identity with profile display name, while still allowing players to edit their in-game display name.

### Phase 3: Profile Storage

Create a `profiles` table:

- `id uuid primary key references auth.users(id)`
- `display_name text`
- `avatar_url text`
- `provider text`
- `created_at timestamptz default now()`
- `last_seen_at timestamptz`

Use row-level security so players can read public profile basics and update only their own profile.

### Phase 4: Lobby Integration

- Show login buttons in the lobby header or player identity area.
- Preserve the current fast room creation flow.
- Use the profile display name as the default room/player name.
- Save match reconnect data per auth user when signed in.
- Keep `localStorage` fallback for guests.

### Phase 5: Server Integration

The current boardgame.io lobby accepts player names and credentials but does not verify app accounts. For the first pass, use login for identity/profile UX only.

Later, add a small API layer to:

- Verify Supabase JWTs.
- Associate boardgame.io match seats with auth user ids.
- Prevent impersonation by requiring a valid session when joining ranked/private/account-bound rooms.
- Store match history outside boardgame.io metadata.

## UX Details

- Default primary action: `Continue as guest`.
- Secondary social actions: `Continue with Google`, `Continue with Apple`.
- Never block casual room joining behind login during the first release.
- After a guest finishes or joins a match, show a lightweight prompt to save progress with Google or Apple.
- Let players choose one username for the account and reuse it across all games.
- Show avatar/name in the lobby once signed in.

## First Build Slice

Implement Supabase Auth in the fork with guest, Google, and session persistence first. Do not touch boardgame.io server rules yet. Once login state is stable in the lobby, add profile storage and account-linked reconnect.

## Later Plans

Player stats, match results, win amounts, and card/flower counters are tracked separately in `STATS_TRACKING_PLAN.md`. Build that after login because stats need stable user identity and server-side action recording.

## Implemented In This Fork

- Guest sessions and local fallback auth.
- Google and Apple OAuth entry points through Supabase.
- Account sync against `public.accounts`.
- One account-wide username in the lobby. Once it is set, the next rename unlocks after 90 days.
- Reconnect storage that is saved by device and copied to the signed-in user on this browser.
- Unique fallback guest identities instead of every guest starting as the same `Garden Guest`.
- Social login buttons stay visible in the lobby even before Supabase keys are configured.
