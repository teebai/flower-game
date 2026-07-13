/**
 * EarlobeSim.ts — Momentum-reactive earlobe physics for teebai.flowers.
 *
 * One instance simulates ONE earlobe as a pinned Verlet point-chain
 * (Jakobsen / Position-Based Dynamics, Alan Wake cloth form):
 *
 *   points[0]  ← ROOT, hard-pinned to the ear socket every substep
 *   points[1..5] ← free points with implicit Verlet velocity (pos - prev)
 *
 * Momentum comes from two channels:
 *   1. CONSTRAINT PROPAGATION — the root is re-pinned to the (possibly moved)
 *      anchor each substep while free points keep their implicit velocity,
 *      so fast anchor motion naturally lags down the chain.
 *   2. INERTIA INJECTION — smoothed character velocity/acceleration in
 *      BODY-LOCAL space is applied as opposing acceleration on the free
 *      points: a sustained push against motion (wind feel) plus a punch on
 *      starts/stops.
 *
 * Integration runs at a FIXED 1/120 s step via a remainder-safe accumulator
 * inside step() (Fiedler pattern, max 4 substeps/frame — anti-spiral).
 * Constraints: 3 soft passes root→tip + 1 hard pass (same child-full-
 * correction formula) so the chain is inextensible regardless of violence.
 *
 * Rendering is a tapered ribbon (polygon strip with perpendicular offsets
 * and a round tip cap) drawn into a caller-owned PixiJS Graphics.
 *
 * All coordinates are BODY-LOCAL (bodyContainer space): +y is body-down,
 * gravity always points to body-down so lobes stay attached to the head
 * when the whole character spins (wind flight).
 *
 * References: Jakobsen GDC'01, Remedy "Secrets of Cloth in Alan Wake",
 * toqoz.fyi/game-rope, Spine physics constraints (Inertia/Limit).
 */

import type { Graphics } from 'pixi.js';

// ── Tuning constants ──────────────────────────────────────────────────────
/** Points per chain: 1 pinned root + 5 free points. */
const POINTS = 6;
/** Fixed simulation substep (s). */
const FIXED_H = 1 / 120;
/** Max substeps consumed per frame — drops the remainder (anti-spiral). */
const MAX_SUBSTEPS = 4;
/** Gravity in body-local px/s² (exaggerated vs real g, game feel). */
const GRAVITY = 1800;
/** Fraction of velocity retained per second (drag = pow(RETENTION, h)). */
const RETENTION = 0.5;
/** Soft constraint passes per substep (plus 1 final hard pass). */
const SOFT_ITERS = 3;
/** Acceleration inheritance: how much body acceleration punches the lobe. */
const K_ACC = 0.9;
/** Velocity (wind) inheritance, 1/s: sustained push against body motion. */
const K_VEL = 6.0;
/** Tip width as a fraction of root width (taper sells "soft lobe"). */
const TIP_WIDTH_RATIO = 0.45;
/** Anti-flip safety radius: point i may never exceed i·segLen·this from the anchor. */
const SAFETY_RADIUS = 1.05;
/** dtSec above this = tab stall / breakpoint: settle instead of stepping. */
const STALL_DT = 0.1;
/** Minimum vector length before a normal/tangent falls back — NaN guard. */
const MIN_LEN = 0.0001;
/**
 * Rest-length ease rate (1/s) applied when segLen changes on a direction
 * switch: the chain grows/shrinks smoothly instead of popping in one frame.
 */
const LEN_EASE_RATE = 18;
/** Per-substep velocity retention, precomputed (FIXED_H is constant). */
const DRAG = Math.pow(RETENTION, FIXED_H);

/** Minimal vector shape accepted by step() — plain {x,y} objects are fine. */
export interface EarlobeVec {
  x: number;
  y: number;
}

export interface EarlobeConfig {
  /** Per-link rest length (px, body-local). */
  segLen: number;
  /** Root ribbon width (px). */
  width: number;
  /** Socket position in body-local space. */
  anchorX: number;
  anchorY: number;
}

export class EarlobeSim {
  /** Current and previous point positions, body-local. Allocated once. */
  private readonly points: EarlobeVec[];
  private readonly prev: EarlobeVec[];
  /** Reused polygon vertex buffer (2 verts × POINTS × 2 coords) — no per-frame alloc. */
  private readonly verts: number[];

  private anchorX: number;
  private anchorY: number;
  /** Current per-link rest length — eases toward targetSegLen. */
  private segLen: number;
  private targetSegLen: number;
  /** Root ribbon width before widthScale. */
  private width: number;
  private widthScale = 1;
  private visible = true;
  /** Fixed-step accumulator remainder (s). */
  private acc = 0;

  constructor(cfg: EarlobeConfig) {
    this.anchorX = cfg.anchorX;
    this.anchorY = cfg.anchorY;
    this.segLen = cfg.segLen;
    this.targetSegLen = cfg.segLen;
    this.width = cfg.width;

    this.points = [];
    this.prev = [];
    for (let i = 0; i < POINTS; i++) {
      this.points.push({ x: 0, y: 0 });
      this.prev.push({ x: 0, y: 0 });
    }
    this.verts = new Array(POINTS * 4).fill(0);

    this.settle();
  }

  // ── Layout controls (called by Character on direction changes) ──

  /** Move the ear socket. Momentum survives — the chain follows the pin. */
  setAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Root-width multiplier (far ear = 0.5×). Applied at render time. */
  setWidthScale(m: number): void {
    this.widthScale = m;
  }

  /**
   * Set the per-link rest length. When snap is false the change is eased
   * over ~0.15 s so a visible lobe never pops on a direction change; when
   * snap is true (lobe was hidden → transition is invisible) it applies
   * immediately.
   */
  setSegLen(px: number, snap = false): void {
    this.targetSegLen = px;
    if (snap) this.segLen = px;
  }

  /**
   * Reset the chain to hanging straight down from the anchor with zero
   * velocity (points = prev). Called on construct and after teleports.
   */
  settle(): void {
    for (let i = 0; i < POINTS; i++) {
      const x = this.anchorX;
      const y = this.anchorY + i * this.segLen;
      this.points[i].x = x;
      this.points[i].y = y;
      this.prev[i].x = x;
      this.prev[i].y = y;
    }
    this.acc = 0;
  }

  // ── Simulation ──

  /**
   * Advance the simulation by dtSec (variable render dt) using a fixed-step
   * accumulator. velLocal/accelLocal are the character's smoothed velocity
   * and acceleration in BODY-LOCAL space (flip-mirrored X), already clamped
   * by the caller.
   */
  step(dtSec: number, velLocal: EarlobeVec, accelLocal: EarlobeVec): void {
    // NaN / zero / negative guard — a bad dt must never poison the chain.
    if (!(dtSec > 0)) return;

    // Ease rest length toward target (frame-rate independent exponential).
    const ease = 1 - Math.exp(-LEN_EASE_RATE * dtSec);
    this.segLen += (this.targetSegLen - this.segLen) * ease;

    // Tab stall / debugger pause: restart from rest instead of exploding.
    if (dtSec > STALL_DT) {
      this.settle();
      return;
    }

    this.acc += dtSec;
    let steps = 0;
    while (this.acc >= FIXED_H && steps < MAX_SUBSTEPS) {
      this.substep(velLocal, accelLocal);
      this.acc -= FIXED_H;
      steps++;
    }
    // Hit the substep cap → drop the excess accumulated time (anti-spiral).
    if (steps === MAX_SUBSTEPS) this.acc = 0;
  }

  /** One fixed 1/120 s substep: pin → integrate → constrain → safety clamp. */
  private substep(velLocal: EarlobeVec, accelLocal: EarlobeVec): void {
    const p = this.points;
    const pr = this.prev;

    // 1. Root pin — carries no own velocity; anchor motion reaches the
    //    chain purely through the distance constraints (implicit momentum).
    p[0].x = this.anchorX;
    p[0].y = this.anchorY;
    pr[0].x = this.anchorX;
    pr[0].y = this.anchorY;

    // 2. Integrate free points (Alan-Wake Verlet: velocity·drag + a·h²).
    //    Inertia injection opposes body motion: -K_ACC·accel - K_VEL·vel.
    const ax = -K_ACC * accelLocal.x - K_VEL * velLocal.x;
    const ay = GRAVITY - K_ACC * accelLocal.y - K_VEL * velLocal.y;
    const h2 = FIXED_H * FIXED_H;
    for (let i = 1; i < POINTS; i++) {
      const px = p[i].x;
      const py = p[i].y;
      p[i].x += (px - pr[i].x) * DRAG + ax * h2;
      p[i].y += (py - pr[i].y) * DRAG + ay * h2;
      pr[i].x = px;
      pr[i].y = py;
    }

    // 3. Constraints: SOFT_ITERS soft passes + 1 hard pass, all root→tip
    //    with the child absorbing the full correction (root pinned absorbs
    //    nothing). One pass already satisfies every link exactly; the extra
    //    passes keep the chain stiff if this formula is ever relaxed.
    for (let k = 0; k < SOFT_ITERS + 1; k++) {
      this.solveLinks();
    }

    // 4. Safety radius clamp — flip-through guard (should never trigger
    //    normally; caps each point within i·segLen·SAFETY_RADIUS of anchor).
    for (let i = 1; i < POINTS; i++) {
      const dx = p[i].x - this.anchorX;
      const dy = p[i].y - this.anchorY;
      const maxR = i * this.segLen * SAFETY_RADIUS;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxR * maxR) {
        const d = Math.sqrt(d2);
        if (d > MIN_LEN) {
          const s = maxR / d;
          p[i].x = this.anchorX + dx * s;
          p[i].y = this.anchorY + dy * s;
        }
      }
    }
  }

  /** One root→tip distance-constraint pass; child moves the full correction. */
  private solveLinks(): void {
    const p = this.points;
    const restLen = this.segLen;
    for (let i = 0; i < POINTS - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= MIN_LEN) continue; // coincident points — never divide by zero
      const diff = (d - restLen) / d;
      b.x -= dx * diff;
      b.y -= dy * diff;
    }
  }

  // ── Rendering ──

  /**
   * Draw the tapered ribbon into the caller's Graphics (cleared each call).
   * Hidden lobes clear and return. Tangent per point comes from the
   * p[i-1]→p[i+1] chord (ends use their single neighbor); the normal is
   * (-ty, tx)/len; width lerps from root width to width·TIP_WIDTH_RATIO.
   */
  render(g: Graphics, colorFill = 0xFFFFFF, colorStroke = 0xCCCCCC): void {
    g.clear();
    if (!this.visible) return;

    const p = this.points;
    const w0 = this.width * this.widthScale;
    const v = this.verts;
    const last = POINTS - 1;

    for (let i = 0; i < POINTS; i++) {
      let tx: number;
      let ty: number;
      if (i === 0) {
        tx = p[1].x - p[0].x;
        ty = p[1].y - p[0].y;
      } else if (i === last) {
        tx = p[last].x - p[last - 1].x;
        ty = p[last].y - p[last - 1].y;
      } else {
        tx = p[i + 1].x - p[i - 1].x;
        ty = p[i + 1].y - p[i - 1].y;
      }
      let len = Math.hypot(tx, ty);
      if (len < MIN_LEN) {
        // Degenerate tangent (overlapped points): fall back to straight down.
        tx = 0;
        ty = 1;
        len = 1;
      }
      const nx = -ty / len;
      const ny = tx / len;
      const hw = (w0 * (1 - (1 - TIP_WIDTH_RATIO) * (i / last))) * 0.5;

      // Left edge root→tip, right edge tip→root (closed winding).
      v[i * 2] = p[i].x + nx * hw;
      v[i * 2 + 1] = p[i].y + ny * hw;
      const ri = (2 * POINTS - 1 - i) * 2;
      v[ri] = p[i].x - nx * hw;
      v[ri + 1] = p[i].y - ny * hw;
    }

    g.poly(v);
    g.fill(colorFill);
    g.stroke({ width: 1, color: colorStroke });

    // Round tip cap.
    const tipW = w0 * TIP_WIDTH_RATIO;
    g.circle(p[last].x, p[last].y, tipW * 0.5);
    g.fill(colorFill);
  }
}
