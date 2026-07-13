/**
 * WindEffect.ts — Map Tour Wind Blow
 *
 * When the player enters the wind zone, they are swept on a smooth tour
 * around the entire map — flying through ALL 9 zones before gently
 * landing back at the spawn area.
 *
 * Flight path: Catmull-Rom spline through 14 waypoints tracing the map
 * perimeter — left edge up, across the top, down the right, across the
 * bottom, then curving inward to spawn. Single continuous smooth curve.
 *
 *   Wind(Left) → Reserved(Top-Left) → Gallery(Top) → Shop(Top-Right)
 *   → Minigame(Right) → Artists(Bottom-Right) → Community/HotSpring(Bottom)
 *   → Spawn(Center)
 *
 * The character lifts off from exactly where they entered the wind zone
 * (seamless entry blend) and the position every frame is 100% driven by
 * the spline — no teleport at any point.
 */

import { Character } from '../entities/Character';

/** Read-only snapshot of the wind effect's current state. */
export interface WindState {
  active: boolean;
  t: number;
  startX: number;
  startY: number;
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
    startX: 0,
    startY: 0,
    duration: 12000,
  };

  private character: Character | null = null;
  private onComplete: (() => void) | null = null;

  // ── Tour waypoints (map perimeter → inward spiral to spawn) ─────────────

  /** 14 waypoints tracing a tour around all 9 zones. */
  private readonly WAYPOINTS: Point2[] = [
    { x: 350,  y: 1500 },  // 0:  Wind zone entry (left middle)
    { x: 200,  y: 1200 },  // 1:  Moving up left edge
    { x: 200,  y: 500  },  // 2:  Top-left corner (Reserved)
    { x: 800,  y: 300  },  // 3:  Top edge (Gallery)
    { x: 1500, y: 300  },  // 4:  Top center (Gallery flower)
    { x: 2500, y: 300  },  // 5:  Top-right (Shop)
    { x: 2800, y: 800  },  // 6:  Right edge upper
    { x: 2800, y: 1500 },  // 7:  Right middle (Minigame portal)
    { x: 2800, y: 2500 },  // 8:  Right edge lower
    { x: 2500, y: 2700 },  // 9:  Bottom-right (Artists)
    { x: 1500, y: 2700 },  // 10: Bottom center (Community/HotSpring)
    { x: 400,  y: 2500 },  // 11: Bottom-left (Hot Spring)
    { x: 800,  y: 1800 },  // 12: Curving inward
    { x: 1500, y: 1500 },  // 13: Spawn center — LAND
  ];

  // ── Flight tuning ───────────────────────────────────────────────────────

  /** Peak height above ground (parabolic arc via sin(t * PI)). */
  private readonly MAX_HEIGHT = 220;

  /** Full barrel rolls during the 12-second flight. */
  private readonly SPIN_ROUNDS = 2.5;

  /** Flight duration in milliseconds. */
  private readonly DURATION_MS = 12000;

  /** First N% of flight blends from entry position to spline path. */
  private readonly ENTRY_BLEND = 0.05;

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
      startX,
      startY,
      duration: this.DURATION_MS,
    };
    this.character = character;
    this.onComplete = onComplete ?? null;
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
    const splinePos = this.getSplinePosition(t);

    // ── Entry blend: first 5% blends from actual entry point to spline ──
    const entryProgress = Math.min(1, t / this.ENTRY_BLEND);
    const entryBlend = this.easeOutCubic(entryProgress);
    const finalX = this.state.startX + (splinePos.x - this.state.startX) * entryBlend;
    const finalY = this.state.startY + (splinePos.y - this.state.startY) * entryBlend;

    // ── Height arc: 0 → peak → 0 (parabolic via sine) ──
    const heightFactor = Math.sin(t * Math.PI);
    const targetZ = heightFactor * this.MAX_HEIGHT;

    // ── Scale: shrink at peak for depth/perspective feel ──
    const targetScale = 1.0 - heightFactor * 0.3;

    // ── Rotation: barrel roll ──
    const targetRotation = t * Math.PI * 2 * this.SPIN_ROUNDS;

    // ── Apply ──
    this.character.x = finalX;
    this.character.y = finalY;
    this.character.z = targetZ;
    this.character.scale.set(targetScale);
    this.character.rotation = targetRotation;
    this.character.setFlyBlend(heightFactor);

    return true;
  }

  // ── Spline math ─────────────────────────────────────────────────────────

  /**
   * Catmull-Rom spline interpolation through waypoints.
   * Creates a single smooth curve that passes through every waypoint.
   */
  private getSplinePosition(t: number): Point2 {
    const n = this.WAYPOINTS.length;
    const segments = n - 1;

    // Map t (0→1) to segment index + local t
    const globalT = t * segments;
    const segIdx = Math.min(segments - 1, Math.max(0, Math.floor(globalT)));
    const segT = globalT - segIdx;

    // Get 4 control points for Catmull-Rom (with clamping at ends)
    const p0 = this.WAYPOINTS[Math.max(0, segIdx - 1)];
    const p1 = this.WAYPOINTS[segIdx];
    const p2 = this.WAYPOINTS[Math.min(n - 1, segIdx + 1)];
    const p3 = this.WAYPOINTS[Math.min(n - 1, segIdx + 2)];

    return {
      x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, segT),
      y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, segT),
    };
  }

  /** Catmull-Rom spline: smooth curve passing through p1→p2. */
  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    );
  }

  /** easeOutCubic — used only for entry blend. NOT on the time parameter. */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  }

  // ── Finish ──────────────────────────────────────────────────────────────

  private finish(): void {
    if (!this.character) return;

    // The spline naturally ends at spawn (1500, 1500).
    // Just reset flight visual properties — no position teleport.
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
