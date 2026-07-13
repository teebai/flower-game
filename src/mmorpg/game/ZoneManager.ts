/**
 * ZoneManager.ts
 *
 * Detects which of the 9 world zones a player is currently in and triggers
 * zone-specific entry/exit callbacks.
 *
 * Zone layout (3000x3000 map):
 *   y: 0-600    → Gallery (top strip)
 *   y: 600-1000 → Gallery / Wind / Community (top row, 3-column split)
 *   y: 1000-2000→ Hot Spring / Artists / Shop (middle row, 3-column split)
 *   y: 2000-2400→ Minigame / Spawn / Reserved (bottom row, 3-column split)
 *   y: 2400-3000→ Community (bottom strip)
 *   Center      → Spawn (circular zone at 1500,1500, radius 200)
 *
 * Detection order matters: more specific zones are checked before general
 * strip-based zones. The reserved block is checked first so it overrides
 * any strip classification.
 */

import { ZONES, SPAWN_ZONE } from '../utils/constants';
import { pointInRect } from '../utils/math2d';
import { Character } from '../entities/Character';

/** All possible zone identifiers, including special cases. */
export type ZoneName =
  | 'gallery'
  | 'community'
  | 'wind'
  | 'hotspring'
  | 'artists'
  | 'minigame'
  | 'shop'
  | 'reserved'
  | 'spawn'
  | 'none';

/** Callbacks invoked when the player enters specific zones. */
export interface ZoneCallbacks {
  /** Wind zone: character is launched across the map. */
  onEnterWind: (character: Character, x: number, y: number) => void;
  /** Hot spring zone: visual soak effect, gradual HP regen. */
  onEnterHotSpring: () => void;
  /** Minigame zone: opens the mini-game UI. */
  onEnterMinigame: () => void;
  /** Shop zone: opens the merchant UI. */
  onEnterShop: () => void;
  /** Gallery zone: shows the community art gallery. */
  onEnterGallery: () => void;
  /** Community zone: enables chat bubbles / social features. */
  onEnterCommunity: () => void;
  /** Artists zone: shows featured creator profiles. */
  onEnterArtists: () => void;
}

export class ZoneManager {
  /** The zone the player was in during the last update. */
  private currentZone: ZoneName = 'none';

  /** Callbacks registered by the game layer. */
  private callbacks: Partial<ZoneCallbacks> = {};

  /**
   * One-shot gate for the wind zone.
   * Prevents re-triggering while the player remains inside the wind zone.
   * Reset to `false` when the player leaves.
   */
  private windTriggered: boolean = false;

  /** Debounce timer to prevent rapid enter/exit spam at zone edges. */
  private edgeCooldown: number = 0;

  /** Cooldown duration in ms before a zone re-entry can fire callbacks. */
  private readonly EDGE_COOLDOWN_MS = 300;

  // ── Configuration ───────────────────────────────────────────────────────

  /**
   * Register zone entry callbacks.
   * Pass a partial object — only the callbacks you care about.
   */
  setCallbacks(callbacks: Partial<ZoneCallbacks>): void {
    this.callbacks = callbacks;
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  /**
   * Check which zone the given world position falls into and fire
   * enter/exit callbacks if the zone changed.
   *
   * @param x         World X coordinate of the player.
   * @param y         World Y coordinate of the player.
   * @param character The player's character entity (passed to callbacks).
   * @returns         The current zone name.
   */
  update(x: number, y: number, character: Character): ZoneName {
    // Decrement edge cooldown
    if (this.edgeCooldown > 0) {
      this.edgeCooldown = Math.max(0, this.edgeCooldown - 16); // ~1 frame at 60fps
    }

    const detected = this.detectZone(x, y);

    if (detected !== this.currentZone) {
      // ── Zone transition ──
      this.onExitZone(this.currentZone);
      const previousZone = this.currentZone;
      this.currentZone = detected;

      // Only fire enter if cooldown has elapsed
      if (this.edgeCooldown <= 0) {
        this.onEnterZone(detected, character, x, y);
        this.edgeCooldown = this.EDGE_COOLDOWN_MS;
      }
    }

    // Reset wind trigger when leaving wind zone
    if (detected !== 'wind') {
      this.windTriggered = false;
    }

    return this.currentZone;
  }

  // ── Detection ───────────────────────────────────────────────────────────

  /**
   * Determine which zone a point falls into.
   *
   * Order is critical: specific rectangle zones are checked first,
   * then the general top/bottom strips, then spawn.
   */
  private detectZone(x: number, y: number): ZoneName {
    // 1. Reserved block (bottom-right — check first, it's specific)
    if (
      pointInRect(
        x,
        y,
        ZONES.reserved.x,
        ZONES.reserved.y,
        ZONES.reserved.w,
        ZONES.reserved.h,
      )
    ) {
      return 'reserved';
    }

    // 2. Shop (middle-right)
    if (
      pointInRect(
        x,
        y,
        ZONES.shop.x,
        ZONES.shop.y,
        ZONES.shop.w,
        ZONES.shop.h,
      )
    ) {
      return 'shop';
    }

    // 3. Minigame (bottom-left)
    if (
      pointInRect(
        x,
        y,
        ZONES.minigame.x,
        ZONES.minigame.y,
        ZONES.minigame.w,
        ZONES.minigame.h,
      )
    ) {
      return 'minigame';
    }

    // 4. Artists (middle-center)
    if (
      pointInRect(
        x,
        y,
        ZONES.artists.x,
        ZONES.artists.y,
        ZONES.artists.w,
        ZONES.artists.h,
      )
    ) {
      return 'artists';
    }

    // 5. Hot Spring (middle-left)
    if (
      pointInRect(
        x,
        y,
        ZONES.hotspring.x,
        ZONES.hotspring.y,
        ZONES.hotspring.w,
        ZONES.hotspring.h,
      )
    ) {
      return 'hotspring';
    }

    // 6. Wind (middle-left strip, x:0-400, y:600-2400)
    if (
      pointInRect(
        x,
        y,
        ZONES.wind.x,
        ZONES.wind.y,
        ZONES.wind.w,
        ZONES.wind.h,
      )
    ) {
      return 'wind';
    }

    // 7. Gallery (top strip — y < 600)
    if (y < 600) {
      return 'gallery';
    }

    // 8. Community (bottom strip — y > 2400)
    if (y > 2400) {
      return 'community';
    }

    // 9. Spawn (circular zone at center)
    if (
      pointInRect(
        x,
        y,
        SPAWN_ZONE.x,
        SPAWN_ZONE.y,
        SPAWN_ZONE.w,
        SPAWN_ZONE.h,
      )
    ) {
      return 'spawn';
    }

    // 10. Fallback — not in any defined zone
    return 'none';
  }

  // ── Enter / Exit handlers ───────────────────────────────────────────────

  private onEnterZone(
    zone: ZoneName,
    character: Character,
    x: number,
    y: number,
  ): void {
    switch (zone) {
      case 'wind':
        if (!this.windTriggered) {
          this.windTriggered = true;
          this.callbacks.onEnterWind?.(character, x, y);
        }
        break;
      case 'hotspring':
        this.callbacks.onEnterHotSpring?.();
        break;
      case 'minigame':
        this.callbacks.onEnterMinigame?.();
        break;
      case 'shop':
        this.callbacks.onEnterShop?.();
        break;
      case 'gallery':
        this.callbacks.onEnterGallery?.();
        break;
      case 'community':
        this.callbacks.onEnterCommunity?.();
        break;
      case 'artists':
        this.callbacks.onEnterArtists?.();
        break;
      // 'spawn', 'reserved', 'none' — no special entry behaviour
    }
  }

  private onExitZone(zone: ZoneName): void {
    // Reserved for future cleanup: stop ambient sounds, remove temporary
    // visual effects, save zone-specific state, etc.
    switch (zone) {
      case 'hotspring':
        // Stop HP regen tick
        break;
      case 'minigame':
        // Close minigame UI if open
        break;
      case 'shop':
        // Close merchant UI if open
        break;
    }
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** Get the zone the player is currently in. */
  getCurrentZone(): ZoneName {
    return this.currentZone;
  }

  /** Whether the player is currently inside the wind zone. */
  isInWindZone(): boolean {
    return this.currentZone === 'wind';
  }

  /** Whether the wind effect has already fired for the current visit. */
  hasWindTriggered(): boolean {
    return this.windTriggered;
  }

  /** Reset all internal state (e.g., on player respawn). */
  reset(): void {
    this.currentZone = 'none';
    this.windTriggered = false;
    this.edgeCooldown = 0;
  }
}
