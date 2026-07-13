/**
 * WindEffect.ts — Steerable Perimeter Wind Tour (v2)
 *
 * A smooth clockwise flight around the entire map perimeter, covering
 * all 9 zones, then landing at spawn — OR landing early wherever the
 * player chooses by braking against the wind.
 *
 * State machine:
 *   idle → cruise → descend → settle → idle (onComplete fires after settle)
 *   - cruise:  spline tour + steering + with-wind boost + brake detection
 *   - descend: triggered by a charged brake OR by reaching the tour end.
 *              ~800ms drop to the ground with a short decelerating drift
 *              and a decaying spin.
 *   - settle:  ~550ms at the final ground position — squash (Character)
 *              + tiny rotation wobble (here), then finish.
 *
 * How cruise works:
 *   - Waypoint 0 is dynamically set to the character's EXACT entry position
 *   - Catmull-Rom spline traces a clean clockwise loop: left → top → right
 *     → bottom → gentle spiral-in to spawn (no sharp final turn)
 *   - Time is eased (easeInOutSine) so takeoff and arrival are gentle —
 *     travel speed and spin speed both ease to 0 at the ends
 *   - The player steers with WASD/arrows or touch-drag; holding input
 *     AGAINST the flight heading charges a brake that lands on the spot
 *   - Camera uses tighter lerp (0.1) so the character stays on-screen
 *
 * Zone coverage (in order):
 *   Wind(left) → Reserved(top-left) → Gallery(top) → Shop(top-right)
 *   → Minigame(right) → Artists(bottom-right) → Community(bottom)
 *   → spiral-in → Spawn(center)
 *
 * The Hot Spring zone (bottom-left) is visible during the bottom edge
 * segment between Artists and Community.
 */

import { Character } from '../entities/Character';
import { easeInOutSine, easeOutCubic, clamp, lerp } from '../utils/math2d';

/** Flight phases of the wind state machine. */
export type WindPhase = 'idle' | 'cruise' | 'descend' | 'settle';

/** Read-only snapshot of the wind effect's current state. */
export interface WindState {
  active: boolean;
  t: number;
  duration: number;
  phase: WindPhase;
  /** True while the player is holding against the wind (HUD hint). */
  braking: boolean;
}

/** 2D point */
interface Point2 {
  x: number;
  y: number;
}

export class WindEffect {
  private state: WindState = {
    active: false,
    t: 0,
    duration: 12000,
    phase: 'idle',
    braking: false,
  };

  private character: Character | null = null;
  private onComplete: (() => void) | null = null;

  /**
   * Fixed waypoints for the clockwise perimeter tour.
   * Waypoint 0 (the entry point) is injected dynamically in trigger()
   * so the spline starts exactly where the player entered — no blend needed.
   *
   * v2: the bottom-left → spawn section is a wide gentle spiral instead of
   * the old sharp 2-point cut (was a ~104° heading change; now ≤ ~36° per
   * segment).
   */
  private readonly WAYPOINTS: Point2[] = [
    { x: 200,  y: 1200 },  // up along left edge (WIND)
    { x: 200,  y: 500  },  // top-left corner (RESERVED)
    { x: 800,  y: 300  },  // top edge (GALLERY)
    { x: 1500, y: 300  },  // top center — massive flower
    { x: 2500, y: 300  },  // top-right (SHOP)
    { x: 2800, y: 800  },  // right edge upper
    { x: 2800, y: 1500 },  // right middle (MINIGAME)
    { x: 2800, y: 2400 },  // right edge lower
    { x: 2500, y: 2700 },  // bottom-right (ARTISTS)
    { x: 1500, y: 2700 },  // bottom center (COMMUNITY)
    // ── gentle spiral-in to spawn (replaces the sharp 2-point cut) ──
    { x: 950,  y: 2700 },  // continue west along bottom
    { x: 600,  y: 2550 },  // begin turning up
    { x: 420,  y: 2250 },  // up along left side
    { x: 450,  y: 1900 },  // slight right
    { x: 650,  y: 1650 },  // turning right
    { x: 950,  y: 1520 },  // easing toward spawn
    { x: 1500, y: 1500 },  // SPAWN — land
  ];

  /** The dynamically-built waypoint list (entry point + fixed waypoints). */
  private activeWaypoints: Point2[] = [];

  // ── Flight tuning ───────────────────────────────────────────────────────

  /** Peak height above ground (arc via sin(te * PI)). */
  private readonly MAX_HEIGHT = 200;

  /** Full barrel rolls during the flight. */
  private readonly SPIN_ROUNDS = 2;

  /** Cruise duration in milliseconds. */
  private readonly DURATION_MS = 12000;

  /** Steering acceleration in px/s². */
  private readonly STEER_ACCEL = 1400;

  /** Max distance the player can drift off the spline, in px. */
  private readonly MAX_STEER_OFFSET = 260;

  /** Time-rate multiplier when steering along the heading (with-wind boost). */
  private readonly WITH_WIND_BOOST = 1.35;

  /** How long input must oppose the heading to trigger an early landing. */
  private readonly BRAKE_HOLD_MS = 450;

  /** Descend phase duration in milliseconds. */
  private readonly DESCEND_MS = 800;

  /** Settle phase duration in milliseconds. */
  private readonly SETTLE_MS = 550;

  /** Drift distance on landing = clamp(speed * factor, min, max) px. */
  private readonly DRIFT_SPEED_FACTOR = 0.35;
  private readonly MIN_DRIFT = 20;
  private readonly MAX_DRIFT = 90;

  /** Playable-area clamp for all flight + landing positions. */
  private readonly MIN_POS = 60;
  private readonly MAX_POS = 2940;

  // ── Cruise runtime state ────────────────────────────────────────────────

  /** Latest steer input from the app (roughly -1..1 per axis, {0,0} = none). */
  private steerInput: Point2 = { x: 0, y: 0 };

  /** Accumulated drift away from the spline, integrated from steer input. */
  private steerOffset: Point2 = { x: 0, y: 0 };

  /** Previous frame's final position — used to derive heading + speed. */
  private lastPos: Point2 | null = null;

  /** Last non-zero movement direction (unit vector, zero-length guarded). */
  private heading: Point2 = { x: 1, y: 0 };

  /** Frame-to-frame speed estimate in px/s (drives landing drift distance). */
  private currentSpeed = 0;

  /** Milliseconds the player has held against the wind. */
  private brakeTimer = 0;

  // ── Descend runtime state ───────────────────────────────────────────────

  private descendStart: Point2 = { x: 0, y: 0 };
  private descendEnd: Point2 = { x: 0, y: 0 };
  private descendStartZ = 0;
  private descendStartScale = 1;
  private descendStartBlend = 0;
  private descendT = 0;

  /** Angular velocity (rad/s) carried into the descend, then decayed. */
  private spinVel = 0;

  // ── Settle runtime state ────────────────────────────────────────────────

  private settleT = 0;

  // ── Public API ──────────────────────────────────────────────────────────

  trigger(
    character: Character,
    startX: number,
    startY: number,
    onComplete?: () => void,
  ): void {
    this.state = {
      active: true,
      t: 0,
      duration: this.DURATION_MS,
      phase: 'cruise',
      braking: false,
    };
    this.character = character;
    this.onComplete = onComplete ?? null;

    // Reset all cruise runtime state.
    this.steerInput = { x: 0, y: 0 };
    this.steerOffset = { x: 0, y: 0 };
    this.lastPos = null;
    this.heading = { x: 1, y: 0 };
    this.currentSpeed = 0;
    this.brakeTimer = 0;

    // Build the waypoint list starting from the EXACT entry position.
    // This eliminates any entry blend — the spline starts right where
    // the player is standing.
    this.activeWaypoints = [
      { x: startX, y: startY }, // 0: player's exact entry position
      ...this.WAYPOINTS,         // 1..17: fixed perimeter waypoints
    ];
  }

  /**
   * Per-frame steer input (roughly -1..1 per axis; {0,0} = no input).
   * Safe to call any time — while idle it is simply stored and ignored.
   */
  setSteerInput(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return; // never let NaN in
    this.steerInput.x = x;
    this.steerInput.y = y;
  }

  tick(deltaMS: number): boolean {
    if (!this.state.active || !this.character) return false;

    switch (this.state.phase) {
      case 'cruise':  return this.tickCruise(deltaMS);
      case 'descend': return this.tickDescend(deltaMS);
      case 'settle':  return this.tickSettle(deltaMS);
      default:        return false;
    }
  }

  // ── Cruise phase ────────────────────────────────────────────────────────

  /** Spline tour + steering + brake detection. */
  private tickCruise(deltaMS: number): boolean {
    const ch = this.character;
    if (!ch) return false;
    const dtSec = Math.max(0, deltaMS / 1000);

    // ── Steering: integrate input into a drift offset ──
    // Frame-rate independent decay so feel is identical at 30/60/144fps.
    const decay = Math.pow(0.90, deltaMS / 16.67);
    this.steerOffset.x = (this.steerOffset.x + this.steerInput.x * this.STEER_ACCEL * dtSec) * decay;
    this.steerOffset.y = (this.steerOffset.y + this.steerInput.y * this.STEER_ACCEL * dtSec) * decay;
    const offLen = Math.hypot(this.steerOffset.x, this.steerOffset.y);
    if (offLen > this.MAX_STEER_OFFSET) {
      const k = this.MAX_STEER_OFFSET / offLen; // offLen > 0 here (it's > MAX)
      this.steerOffset.x *= k;
      this.steerOffset.y *= k;
    }

    // Normalized steer input for the boost/brake dot products.
    const inLen = Math.hypot(this.steerInput.x, this.steerInput.y);
    const steerNorm: Point2 = inLen > 0.001
      ? { x: this.steerInput.x / inLen, y: this.steerInput.y / inLen }
      : { x: 0, y: 0 };
    const dot = steerNorm.x * this.heading.x + steerNorm.y * this.heading.y;

    // ── Advance linear time — with-wind boost when leaning along heading ──
    let rate = deltaMS / this.state.duration;
    if (dot > 0.6) rate *= this.WITH_WIND_BOOST;
    this.state.t += rate;
    const t = Math.min(1, this.state.t);

    // ── Eased time mapping: soft takeoff, soft arrival ──
    const te = easeInOutSine(t);

    // ── Position: spline(te) + steer offset, clamped to the playable area ──
    const base = this.getSplinePosition(te);
    const pos: Point2 = {
      x: clamp(base.x + this.steerOffset.x, this.MIN_POS, this.MAX_POS),
      y: clamp(base.y + this.steerOffset.y, this.MIN_POS, this.MAX_POS),
    };

    // ── Heading + speed from frame-to-frame movement (zero-length guarded) ──
    if (this.lastPos && dtSec > 0) {
      const dx = pos.x - this.lastPos.x;
      const dy = pos.y - this.lastPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001) {
        this.heading = { x: dx / dist, y: dy / dist };
        this.currentSpeed = dist / dtSec;
      }
    }
    this.lastPos = { x: pos.x, y: pos.y };

    // ── Height arc, depth scale, barrel roll — all from eased time ──
    const heightFactor = Math.sin(te * Math.PI);
    ch.x = pos.x;
    ch.y = pos.y;
    ch.z = heightFactor * this.MAX_HEIGHT;
    // setFlyScale (NOT scale.set) so the direction-flip sign on the outer
    // container is preserved for mirrored facings.
    ch.setFlyScale(1 - heightFactor * 0.25);
    ch.rotation = te * Math.PI * 2 * this.SPIN_ROUNDS;
    ch.setFlyBlend(heightFactor);

    // ── Brake detection: holding against the flight heading charges it ──
    if (dot < -0.6) {
      this.brakeTimer += deltaMS;
    } else {
      this.brakeTimer = Math.max(0, this.brakeTimer - deltaMS * 2);
    }
    this.state.braking = this.brakeTimer > 0;

    // Brake charged → land right here. Tour end → land at spawn.
    if (this.brakeTimer >= this.BRAKE_HOLD_MS || t >= 1) {
      this.enterDescend();
    }

    return true;
  }

  // ── Descend phase ───────────────────────────────────────────────────────

  /** Snapshot the current flight state and pick a safe landing spot. */
  private enterDescend(): void {
    const ch = this.character;
    if (!ch) return;

    this.descendStart = { x: ch.x, y: ch.y };
    this.descendStartZ = ch.z;
    // Current fly-scale / blend at this point of the eased arc, so the
    // descend can lerp them smoothly back to grounded values.
    const te = easeInOutSine(Math.min(1, this.state.t));
    const heightFactor = Math.sin(te * Math.PI);
    this.descendStartScale = 1 - heightFactor * 0.25;
    this.descendStartBlend = heightFactor;

    // Drift forward along the last heading; distance scales with speed.
    const drift = clamp(this.currentSpeed * this.DRIFT_SPEED_FACTOR, this.MIN_DRIFT, this.MAX_DRIFT);
    let endX = this.descendStart.x + this.heading.x * drift;
    let endY = this.descendStart.y + this.heading.y * drift;

    // Safety: never land outside the playable area.
    endX = clamp(endX, this.MIN_POS, this.MAX_POS);
    endY = clamp(endY, this.MIN_POS, this.MAX_POS);
    // Wind-zone re-trigger guard: landing inside the wind corridor would
    // instantly re-trigger the wind — shove the landing just east of it.
    if (endX < 460 && endY >= 550 && endY <= 2450) endX = 480;

    this.descendEnd = { x: endX, y: endY };
    this.descendT = 0;

    // Continue the barrel roll at its current eased velocity, then decay it.
    const t = Math.min(1, this.state.t);
    const dtePerSec = (Math.PI / 2) * Math.sin(Math.PI * t) / (this.state.duration / 1000);
    this.spinVel = dtePerSec * Math.PI * 2 * this.SPIN_ROUNDS;

    this.state.braking = false;
    this.state.phase = 'descend';
  }

  /** Drop to the ground: decelerating drift, bounce, decaying spin. */
  private tickDescend(deltaMS: number): boolean {
    const ch = this.character;
    if (!ch) return false;
    const dtSec = Math.max(0, deltaMS / 1000);

    this.descendT += deltaMS / this.DESCEND_MS;
    const p = Math.min(1, this.descendT);
    const e = easeOutCubic(p);

    // Position: decelerating drift toward the landing spot.
    ch.x = lerp(this.descendStart.x, this.descendEnd.x, e);
    ch.y = lerp(this.descendStart.y, this.descendEnd.y, e);

    // Height: ease to the ground with a tiny bounce near touchdown.
    ch.z = this.descendStartZ * (1 - e) - Math.sin(p * Math.PI * 2) * 6 * (1 - p);

    // Rotation: keep spinning with a decaying velocity.
    this.spinVel *= Math.pow(0.92, deltaMS / 16.67);
    ch.rotation += this.spinVel * dtSec;

    // Scale + fly blend return to grounded values.
    ch.setFlyScale(lerp(this.descendStartScale, 1, p));
    ch.setFlyBlend(this.descendStartBlend * (1 - p));

    if (p >= 1) {
      // Touchdown — snap to final values and hand the squash to Character.
      ch.x = this.descendEnd.x;
      ch.y = this.descendEnd.y;
      ch.z = 0;
      ch.rotation = 0;
      ch.setFlyBlend(0);
      ch.setFlyScale(1);
      ch.playLanding();

      this.settleT = 0;
      this.state.phase = 'settle';
    }

    return true;
  }

  // ── Settle phase ────────────────────────────────────────────────────────

  /** Brief post-touchdown settle: rotation wobble only, then finish. */
  private tickSettle(deltaMS: number): boolean {
    const ch = this.character;
    if (!ch) return false;

    this.settleT += deltaMS / this.SETTLE_MS;
    const p = Math.min(1, this.settleT);

    // Position is final — only a tiny decaying rotation wobble remains.
    ch.rotation = 0.05 * Math.sin(p * Math.PI * 4) * (1 - p);

    if (p >= 1) {
      this.finish();
      return false;
    }
    return true;
  }

  // ── Spline math ─────────────────────────────────────────────────────────

  /**
   * Catmull-Rom spline interpolation through the active waypoints.
   * The spline passes through every waypoint, creating a single smooth
   * C1-continuous curve with no jumps or direction reversals.
   */
  private getSplinePosition(t: number): Point2 {
    const n = this.activeWaypoints.length;
    const segments = n - 1;

    // Map t (0→1) to segment index + local t within that segment
    const globalT = t * segments;
    const segIdx = Math.min(segments - 1, Math.max(0, Math.floor(globalT)));
    const segT = globalT - segIdx;

    // Get 4 control points for Catmull-Rom (clamp at boundaries)
    const p0 = this.activeWaypoints[Math.max(0, segIdx - 1)];
    const p1 = this.activeWaypoints[segIdx];
    const p2 = this.activeWaypoints[Math.min(n - 1, segIdx + 1)];
    const p3 = this.activeWaypoints[Math.min(n - 1, segIdx + 2)];

    return {
      x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, segT),
      y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, segT),
    };
  }

  /** Catmull-Rom spline: smooth curve passing through control points p1 and p2. */
  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    );
  }

  // ── Finish ──────────────────────────────────────────────────────────────

  /** Called exactly once, at the end of the settle phase. */
  private finish(): void {
    if (!this.character) return;

    // Flight visuals already reset at touchdown — just clear the wobble.
    this.character.rotation = 0;

    this.state.active = false;
    this.state.phase = 'idle';
    this.state.braking = false;
    this.onComplete?.();
    this.onComplete = null;
    this.character = null;
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  isActive(): boolean {
    return this.state.active;
  }

  getState(): Readonly<WindState> {
    return this.state;
  }
}
