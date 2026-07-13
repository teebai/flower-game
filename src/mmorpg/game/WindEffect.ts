/**
 * WindEffect.ts — Full Perimeter Wind Tour
 *
 * A smooth clockwise flight around the entire map perimeter, covering
 * all 9 zones, then landing at spawn. No entry blend, no teleport.
 *
 * How it works:
 *   - Waypoint 0 is dynamically set to the character's EXACT entry position
 *   - Catmull-Rom spline traces a clean clockwise loop: left → top → right
 *     → bottom → center
 *   - Height follows a parabolic arc (sin(t * PI)): lift off → cruise → land
 *   - Camera uses tighter lerp (0.06) so the character stays on-screen
 *   - 12 second duration for a comfortable tour of all zones
 *
 * Zone coverage (in order):
 *   Wind(left) → Reserved(top-left) → Gallery(top) → Shop(top-right)
 *   → Minigame(right) → Artists(bottom-right) → Community(bottom)
 *   → Spawn(center)
 *
 * The Hot Spring zone (bottom-left) is visible during the bottom edge
 * segment between Artists and Community.
 */

import { Character } from '../entities/Character';

/** Read-only snapshot of the wind effect's current state. */
export interface WindState {
  active: boolean;
  t: number;
  duration: number;
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
  };

  private character: Character | null = null;
  private onComplete: (() => void) | null = null;

  /**
   * Fixed waypoints for the clockwise perimeter tour.
   * Waypoint 0 (the entry point) is injected dynamically in trigger()
   * so the spline starts exactly where the player entered — no blend needed.
   */
  private readonly WAYPOINTS: Point2[] = [
    { x: 200,  y: 1200 },  // 0: Up along left edge (WIND)
    { x: 200,  y: 500  },  // 1: Top-left corner (RESERVED)
    { x: 800,  y: 300  },  // 2: Top edge (GALLERY)
    { x: 1500, y: 300  },  // 3: Top center — massive flower (GALLERY)
    { x: 2500, y: 300  },  // 4: Top-right (SHOP)
    { x: 2800, y: 800  },  // 5: Right edge upper
    { x: 2800, y: 1500 },  // 6: Right middle — minigame portal (MINIGAME)
    { x: 2800, y: 2400 },  // 7: Right edge lower
    { x: 2500, y: 2700 },  // 8: Bottom-right (ARTISTS)
    { x: 1500, y: 2700 },  // 9: Bottom center (COMMUNITY)
    { x: 500,  y: 2400 },  // 10: Bottom-left — hot spring visible (HOT SPRING)
    { x: 800,  y: 2000 },  // 11: Curving inward
    { x: 1500, y: 1500 },  // 12: Spawn center — LAND
  ];

  /** The dynamically-built waypoint list (entry point + fixed waypoints). */
  private activeWaypoints: Point2[] = [];

  // ── Flight tuning ───────────────────────────────────────────────────────

  /** Peak height above ground (parabolic arc via sin(t * PI)). */
  private readonly MAX_HEIGHT = 200;

  /** Full barrel rolls during the flight. */
  private readonly SPIN_ROUNDS = 2;

  /** Flight duration in milliseconds. */
  private readonly DURATION_MS = 12000;

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
    };
    this.character = character;
    this.onComplete = onComplete ?? null;

    // Build the waypoint list starting from the EXACT entry position.
    // This eliminates any entry blend — the spline starts right where
    // the player is standing.
    this.activeWaypoints = [
      { x: startX, y: startY }, // 0: player's exact entry position
      ...this.WAYPOINTS,         // 1..13: fixed perimeter waypoints
    ];
  }

  tick(deltaMS: number): boolean {
    if (!this.state.active || !this.character) return false;

    // Advance linear time
    this.state.t += deltaMS / this.state.duration;

    if (this.state.t >= 1) {
      this.finish();
      return false;
    }

    const t = this.state.t;

    // ── Position from spline tour ──
    const pos = this.getSplinePosition(t);

    // ── Height arc: 0 → peak → 0 (parabolic via sine) ──
    const heightFactor = Math.sin(t * Math.PI);
    const targetZ = heightFactor * this.MAX_HEIGHT;

    // ── Scale: slight shrink at peak for depth feel ──
    const targetScale = 1.0 - heightFactor * 0.25;

    // ── Rotation: barrel roll ──
    const targetRotation = t * Math.PI * 2 * this.SPIN_ROUNDS;

    // ── Apply ──
    this.character.x = pos.x;
    this.character.y = pos.y;
    this.character.z = targetZ;
    this.character.scale.set(targetScale);
    this.character.rotation = targetRotation;
    this.character.setFlyBlend(heightFactor);

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

  private finish(): void {
    if (!this.character) return;

    // Spline naturally ends at spawn (1500, 1500).
    // Just reset flight visuals — NO position teleport.
    this.character.z = 0;
    this.character.scale.set(1);
    this.character.rotation = 0;
    this.character.setFlyBlend(0);

    this.state.active = false;
    this.onComplete?.();
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
