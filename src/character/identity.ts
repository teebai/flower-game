/**
 * identity.ts — Identity-stable character seeds.
 *
 * A player's character is locked to their identity:
 * - Signed-in users → their account id (profile.id).
 * - Guests → a guest id persisted in localStorage (created once, reused
 *   forever) so the same browser always gets the same character.
 *
 * Used by BOTH the landing preview and the world spawn (App.tsx → MmorpgApp)
 * so the character you see before entering is exactly the one that lands.
 */

const GUEST_ID_KEY = 'flower-game:guest-id';

/** In-memory fallback when localStorage is unavailable (private mode, etc.). */
let ephemeralGuestId: string | null = null;

function newGuestId(): string {
  return 'guest_' + Math.random().toString(36).substring(2, 10);
}

/** Get (or create once) the persistent guest id for this browser. */
export function getOrCreateGuestId(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = newGuestId();
    window.localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    if (!ephemeralGuestId) ephemeralGuestId = newGuestId();
    return ephemeralGuestId;
  }
}

/**
 * Resolve the character seed for a session: the signed-in account id when
 * present, otherwise the persistent guest id.
 */
export function getCharacterSeed(profileId: string | null | undefined): string {
  return profileId || getOrCreateGuestId();
}

/**
 * Resolve the character seed from an auth profile.
 *
 * Only genuinely signed-in accounts (non-guest) seed from their account id.
 * Anonymous / local guest profiles deliberately keep the persistent guest
 * id: the guest id exists BEFORE sign-in (landing preview) and stays the
 * same AFTER `continueAsGuest` creates an anonymous session, so the preview
 * character and the world-spawned character can never fork apart.
 */
export function getSessionCharacterSeed(
  profile: { id: string; isGuest: boolean } | null | undefined,
): string {
  if (profile && !profile.isGuest) return profile.id;
  return getOrCreateGuestId();
}
