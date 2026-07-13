/**
 * WindEffect.ts
 *
 * Handles the wind zone's signature "blow across the map" effect.
 *
 * ARCHITECTURE — Single Parametric Curve (no state machine):
 *   t: 0 → 1  (pure linear, driven by elapsed time)
 *   x(t) = startX + t * ARC_DISTANCE
 *   y(t) = startY  (constant horizontal trajectory)
 *   z(t) = sin(t * PI) * ARC_HEIGHT  (parabolic arc via sine, naturally 0→peak→0)
 *   scale(t) = 1 - sin(t * PI) * 0.5  (shrinks to 0.5 at peak, returns to 1.0)
 *   rotation(t) = t * 2PI * SPIN_ROUNDS  (2 full barrel rolls)
 *
 * CRITICAL FIX — Previous versions applied easeOutCubic to rawT *before*
 * the parametric sin() calculation. This corrupted the arc curve and
 * created a jerky, non-physical bounce. The fix is:
 *   1. rawT is advanced linearly:  rawT += deltaMS / duration
 *   2. NO easing function touches rawT
 *   3. All "smoothness" comes from the parametric sin() curve itself
 *
 * The character enters near the wind zone's western edge (~x=400) and is
 * swept smoothly across to the far eastern side of the map (~x=2600),
 * following a graceful arc, before landing softly near the spawn area.
 */

import { Character } from '../entities/Character';

/** Read-only snapshot of the wind effect's current state. */
export interface WindState {
  /** Whether the wind blow is currently in progress. */
  active: boolean;
  /** Linear progress from 0 (start) → 1 (end). NEVER eased. */
  t: number;
  /** World X where the character was when the wind triggered. */
  startX: number;
  /** World Y where the character was when the wind triggered. */
  startY: number;
  /** Total duration of the wind flight in milliseconds. */
  duration: number;
}

/**
 * WindEffect drives a seamless, single-phase parametric flight across the map.
 *
 * Usage:
 *   const wind = new WindEffect();
 *   wind.trigger(character, char.x, char.y, () => console.log('Landed!'));
 *   // In your game loop:
 *   if (wind.tick(deltaMS)) { /* still flying */ }
 */
export class WindEffect {
  /** Internal mutable state. Externally, treat as read-only. */
  private state: WindState = {
    active: false,
    t: 0,
    startX: 0,
    startY: 0,
    duration: 8000,
  };

  /** The character being blown. Set on trigger, cleared on finish. */
  private character: Character | null = null;

  /** Optional callback invoked once when the flight completes. */
  private onComplete: (() => void) | null = null;

  // ── Arc tuning constants ────────────────────────────────────────────────

  /** Peak height of the arc in world units (character appears to lift off). */
  private readonly ARC_HEIGHT = 200;

  /**
   * Total horizontal distance swept during the flight.
   * Starting near x≈400, this carries the character across to x≈2600,
   * letting the player see the full breadth of the world map.
   */
  private readonly ARC_DISTANCE = 2200;

  /** Number of full 360-degree spins the character performs during flight. */
  private readonly SPIN_ROUNDS = 2;

  /** Default flight duration in milliseconds. */
  private readonly DEFAULT_DURATION_MS = 8000;

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the wind blow effect.
   *
   * @param character  The character to launch.
   * @param startX     Current world X (typically near the wind zone edge, ~400).
   * @param startY     Current world Y.
   * @param onComplete Optional callback fired when the character lands.
   */
  trigger(
    character: Character,
    startX: number,
    startY: number,
    onComplete?: () => void,
  ): void {
    this.state = {
      active: true,
      t: 0,
      startX,
      startY,
      duration: this.DEFAULT_DURATION_MS,
    };
    this.character = character;
    this.onComplete = onComplete ?? null;

    // Face east — the wind always blows toward the right side of the map.
    character.setDirection(0);
  }

  /**
   * Advance the wind simulation by one frame.
   *
   * @param deltaMS  Milliseconds since the last tick (use actual elapsed time).
   * @returns `true` if the wind effect is still active this frame.
   */
  tick(deltaMS: number): boolean {
    if (!this.state.active || !this.character) return false;

    // ── Step 1: Advance linear t ──
    //    CRITICAL: No easing function is applied here. rawT must stay
    //    perfectly linear so the parametric sin() curve below produces
    //    a single, smooth, physically consistent arc.
    this.state.t += deltaMS / this.state.duration;

    // ── Step 2: Check completion ──
    if (this.state.t >= 1) {
      this.finish();
      return false;
    }

    // ── Step 3: Parametric evaluation (PURE LINEAR t) ──
    const t = this.state.t; // <── NO EASING. Ever.

    // Arc envelope: 0 at t=0, peaks at 1 when t=0.5, returns to 0 at t=1.
    // This single sine wave IS the smoothness — no separate ease needed.
    const arcFactor = Math.sin(t * Math.PI);

    // X: sweep steadily from the wind zone edge across the full map width.
    //    t goes 0→1 linearly, so x moves at constant horizontal speed.
    const targetX = this.state.startX + t * this.ARC_DISTANCE;

    // Y: hold the original row so the flight stays on a clean horizontal line.
    const targetY = this.state.startY;

    // Z: lift derived from the arc sine — natural take-off and landing.
    const targetZ = arcFactor * this.ARC_HEIGHT;

    // Scale: shrink to 0.5 at the apex (perspective "far away" feel),
    //        return to 1.0 at start and end.
    const targetScale = 1.0 - arcFactor * 0.5;

    // Rotation: barrel-roll SPIN_ROUNDS times over the full duration.
    const targetRotation = t * Math.PI * 2 * this.SPIN_ROUNDS;

    // ── Step 4: Apply transforms to character ──
    this.character.x = targetX;
    this.character.y = targetY;
    this.character.z = targetZ;
    this.character.scale.set(targetScale);
    this.character.rotation = targetRotation;
    this.character.setFlyBlend(arcFactor);

    return true;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /** Cleanly land the character and fire completion callback. */
  private finish(): void {
    if (!this.character) return;

    // Reset all flight-modified properties to grounded defaults.
    this.character.z = 0;
    this.character.scale.set(1);
    this.character.rotation = 0;
    this.character.setFlyBlend(0);

    // Land somewhere near the spawn area with a little random scatter
    // so repeated wind trips don't pile up on the exact same pixel.
    this.character.x = 500 + Math.random() * 200;
    this.character.y =
      this.state.startY + (Math.random() - 0.5) * 100;

    this.state.active = false;
    this.onComplete?.();
    this.character = null;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** Whether a wind flight is currently in progress. */
  isActive(): boolean {
    return this.state.active;
  }

  /** Get the current read-only wind state (for UI/debug). */
  getState(): Readonly<WindState> {
    return this.state;
  }

  /**
   * Predict the approximate landing position.
   * Useful for camera pre-positioning or spawning effects at the destination.
   */
  getLandingPosition(): { x: number; y: number } {
    return {
      x: 500 + Math.random() * 200,
      y: this.state.startY,
    };
  }
}
