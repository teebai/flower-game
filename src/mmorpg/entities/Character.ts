/**
 * Character.ts — Player character entity for teebai.flowers MMORPG.
 *
 * Teebai's signature white humanoid: no hair, no nose, no apparel.
 * Flower eyes, smiley mouth, long earlobes.
 * 8-directional spriteless rendering via PixiJS Graphics.
 *
 * STRUCTURE (critical for wind/fly effect):
 *   Character (this Container)  ← this.x / this.y = WORLD POSITION
 *   └── bodyContainer           ← bodyContainer.y = fly height + walk bob (visual only)
 *       ├── glow (z0)
 *       ├── legL, legR (z1)     ← Containers anchored AT the hip joints; child
 *       │                         Graphics drawn in joint-local space (top at 0,0)
 *       ├── torso (z2)          ← drawn OVER legs → hip seam hidden
 *       ├── armL, armR (z3)     ← Containers anchored AT the shoulder joints
 *       └── earGL, earGR (z4)   ← EarlobeSim ribbon graphics (Verlet physics)
 *           head (z5), eyes (z6), mouth (z7)
 *   └── shadow (sibling)        ← always at ground level, shrinks with height
 *
 * JOINT-ANCHOR RIG (Spine/Godot/OpenToonz/RO-ACT pattern):
 *   Each limb is a child Container whose local origin sits EXACTLY on its
 *   joint (hip/shoulder), derived only from torso metrics — never hardcoded.
 *   Geometry extends distally from (0,0); feet/hands are drawn INSIDE the limb
 *   graphics at the distal end so they can never drift. A full joint disc
 *   centered on the pivot keeps the silhouette rotation-invariant, and the
 *   walk cycle ROTATES limbs around the joints (pendulum) instead of
 *   x-translating them — attachment is therefore invariant under DNA scaling
 *   and cannot gap mid-stride.
 *
 * CRITICAL FIX: Previously tick() did `this.y = -this.z` which OVERWROTE
 * the world Y position every frame, freezing the character at y≈0.
 * Now this.y is owned exclusively by PlayerController / WindEffect.
 *
 * Drawn directions (5): E, SE, S, SW, W
 * Mirrored directions (3): NW=flip(SW), N=flip(S), NE=flip(SE)
 * When flip=true the character faces AWAY — no face features are drawn.
 */

import { Container, Graphics } from 'pixi.js';
import type { CharacterDNA } from '../game/CharacterGenerator';
import { angleToDirection8, clamp } from '../utils/math2d';
import { EarlobeSim } from './EarlobeSim';

interface CharacterParts {
  glow: Graphics;
  torso: Graphics;
  head: Graphics;
  eyes: Graphics;
  mouth: Graphics;
}

/**
 * Per-direction layout for ONE earlobe, mirroring the old static drawEars
 * table (anchors, visibility, width multiplier). lenMul follows the spec
 * formula (1 normally, 0.6 for the far-short back lobes); alpha/stroke
 * reproduce the old far-ear and back-view tints.
 */
interface EarLayoutEntry {
  /** Socket anchor in body-local space. */
  x: number;
  y: number;
  /** False = lobe not drawn this direction (clears its Graphics). */
  visible: boolean;
  /** Root-width multiplier (far ear = 0.5×). */
  wMul: number;
  /** Graphics alpha (0 hidden, 0.75 far ear, 1 full). */
  alpha: number;
  /** Rest-length multiplier (far-short back lobe = 0.6×). */
  lenMul: number;
  /** Outline tint (0xCCCCCC front, 0xDDDDDD back/far — old drawEars colors). */
  stroke: number;
}

/**
 * Body metrics computed per pose draw from the SAME torso dimensions the
 * torso graphics uses — limb joint anchors derive only from these values,
 * so attachment can never disagree with the drawn torso.
 */
interface BodyMetrics {
  torsoTop: number;     // constant -16 (neck line — head join stays untouched)
  hipY: number;         // torsoTop + torsoH  (actual bottom of torso)
  torsoHalfW: number;   // half-width from the dir-dependent torso formula
  shoulderX: number;    // torsoHalfW * SHOULDER_INSET
  shoulderY: number;    // torsoTop + 3
  hipSpread: number;    // clamp((isSide ? 1 : 5) * legScale, 0, torsoHalfW * HIP_SPREAD_MAX)
}

export class Character extends Container {
  /** Inner container holding all body parts — gets visual Y offsets. */
  private bodyContainer: Container;
  /** Ground shadow — stays on the Character container directly. */
  private shadowGraphics: Graphics;

  private parts: CharacterParts;
  private dna: CharacterDNA;

  /** Limb hierarchy — each Container's position = joint anchor in body space. */
  private legL: Container;
  private legR: Container;
  private armL: Container;
  private armR: Container;
  /** Limb geometry, drawn in joint-local space (proximal end at 0,0). */
  private legLG: Graphics;
  private legRG: Graphics;
  private armLG: Graphics;
  private armRG: Graphics;

  /** Earlobe ribbons — one Graphics + one Verlet sim per lobe (z4 slot). */
  private earGL: Graphics;
  private earGR: Graphics;
  private lobeL: EarlobeSim;
  private lobeR: EarlobeSim;
  /** Current per-lobe outline tint (set by applyEarLayout, used each render). */
  private earStrokeL = 0xCCCCCC;
  private earStrokeR = 0xCCCCCC;

  /** World-position sample for velocity derivation (null until first tick). */
  private lastWorldPos: { x: number; y: number } | null = null;
  /** Smoothed body-local velocity fed to the sims (allocated once). */
  private readonly smoothV = { x: 0, y: 0 };
  /** Previous frame's smoothV, for acceleration derivation. */
  private readonly prevSmoothV = { x: 0, y: 0 };
  /** Reused acceleration vector passed into lobe.step() (no per-frame alloc). */
  private readonly accelLocal = { x: 0, y: 0 };

  /** Current facing: { name ∈ E/SE/S/SW/W, flip: back-facing? } */
  private currentDir = { name: 'S', flip: false };

  private animTimer = 0;
  private isWalking = false;

  /** 0=grounded, 1=flying (wind effect drives this) */
  public flyBlend = 0;
  /** Height above ground in pixels — set by WindEffect each frame */
  public z = 0;

  /**
   * Flight scale applied to bodyContainer (wind effect drives this).
   * Lives on the INNER container so the direction-flip sign on the OUTER
   * container (scale.x can be negative for mirrored facings) is preserved.
   */
  private flyScale = 1;

  /** Landing squash timer in ms; -1 = inactive. Started by playLanding(). */
  private landT = -1;

  private baseYOffset = 0;

  private readonly WALK_BOB_AMP = 3;
  private readonly WALK_CYCLE_MS = 600;
  private readonly GLOW_PULSE_MS = 2000;
  private readonly LAND_MS = 550;
  /** Max squash/stretch amount on landing (0.22 = ±22%). */
  private readonly LAND_SQUASH = 0.22;

  // ── Rig tuning constants ──
  /** Walk swing amplitude in radians (~16°). */
  private readonly SWING = 0.28;
  /** Arms swing at this fraction of the leg swing, anti-phase. */
  private readonly ARM_SWING_RATIO = 0.8;
  /** Leg containers sit this many px ABOVE the hip line (into the torso). */
  private readonly HIP_OVERLAP = 2;
  /** Shoulder anchors sit at this fraction of the torso half-width. */
  private readonly SHOULDER_INSET = 0.85;
  /** Hip spread never exceeds this fraction of the torso half-width. */
  private readonly HIP_SPREAD_MAX = 0.55;
  /** Neck line: torso top is anchored here in every direction. */
  private readonly TORSO_TOP = -16;

  // ── Earlobe physics tuning (driver side — sim internals in EarlobeSim.ts) ──
  /** EMA factor for world→body-local velocity smoothing (0..1 per frame). */
  private readonly EAR_VEL_EMA = 0.35;
  /** Velocity clamp fed to the sims (px/s) — Spine "Limit" equivalent. */
  private readonly EAR_MAX_SPEED = 600;
  /** Acceleration clamp fed to the sims (px/s²). */
  private readonly EAR_MAX_ACCEL = 3000;
  /** World speed above this = teleport/zone warp → settle lobes, zero velocity. */
  private readonly EAR_TELEPORT_SPEED = 1500;

  constructor(dna: CharacterDNA) {
    super();
    this.dna = dna;
    this.sortableChildren = true;

    // Shadow sits directly on this container (ground level)
    this.shadowGraphics = new Graphics();
    this.shadowGraphics.zIndex = 0;
    this.addChild(this.shadowGraphics);

    // Body parts live inside bodyContainer (visual offset layer)
    this.bodyContainer = new Container();
    this.bodyContainer.zIndex = 1;
    this.bodyContainer.sortableChildren = true;
    this.addChild(this.bodyContainer);

    // Joint-anchored limb containers + their local-space geometry
    this.legL = new Container();
    this.legR = new Container();
    this.armL = new Container();
    this.armR = new Container();
    this.legLG = new Graphics();
    this.legRG = new Graphics();
    this.armLG = new Graphics();
    this.armRG = new Graphics();
    this.legL.addChild(this.legLG);
    this.legR.addChild(this.legRG);
    this.armL.addChild(this.armLG);
    this.armR.addChild(this.armRG);

    // Earlobe physics — created BEFORE buildCharacter() so redrawForDirection
    // can apply the initial layout. Geometry comes from EarlobeSim.render().
    this.earGL = new Graphics();
    this.earGR = new Graphics();
    const es = this.dna.earScale * this.dna.bodyScale;
    this.lobeL = new EarlobeSim({
      segLen: (22 * es) / 5,
      width: 2 * (5 * es), // matches old earW·2
      anchorX: -13,
      anchorY: -30,
    });
    this.lobeR = new EarlobeSim({
      segLen: (22 * es) / 5,
      width: 2 * (5 * es),
      anchorX: 13,
      anchorY: -30,
    });

    this.parts = this.createParts();
    this.buildCharacter();
  }

  private createParts(): CharacterParts {
    return {
      glow: new Graphics(),
      torso: new Graphics(),
      head: new Graphics(),
      eyes: new Graphics(),
      mouth: new Graphics(),
    };
  }

  private buildCharacter(): void {
    this.bodyContainer.removeChildren();

    // z-order: legs UNDER torso (hip seam hidden), arms OVER torso.
    this.parts.glow.zIndex = 0;
    this.legL.zIndex = 1;
    this.legR.zIndex = 1;
    this.parts.torso.zIndex = 2;
    this.armL.zIndex = 3;
    this.armR.zIndex = 3;
    this.earGL.zIndex = 4;
    this.earGR.zIndex = 4;
    this.parts.head.zIndex = 5;
    this.parts.eyes.zIndex = 6;
    this.parts.mouth.zIndex = 7;

    this.bodyContainer.addChild(this.parts.glow);
    this.bodyContainer.addChild(this.legL, this.legR);
    this.bodyContainer.addChild(this.parts.torso);
    this.bodyContainer.addChild(this.armL, this.armR);
    this.bodyContainer.addChild(this.earGL, this.earGR);
    this.bodyContainer.addChild(this.parts.head);
    this.bodyContainer.addChild(this.parts.eyes);
    this.bodyContainer.addChild(this.parts.mouth);

    this.redrawForDirection();
  }

  // ── Direction ───────────────────────────────────────────────

  setDirection(angleDeg: number): void {
    const dir = angleToDirection8(angleDeg);
    if (dir.name === this.currentDir.name && dir.flip === this.currentDir.flip) return;
    this.currentDir = { name: dir.name, flip: dir.flip };

    // Flip the whole character horizontally for mirrored directions
    const absScale = Math.abs(this.scale.x) || 1;
    this.scale.x = absScale * (this.currentDir.flip ? -1 : 1);

    this.redrawForDirection();
  }

  getDirection(): string {
    return this.currentDir.name;
  }

  // ── Walk state ──────────────────────────────────────────────

  setWalking(walking: boolean): void {
    if (this.isWalking === walking) return;
    this.isWalking = walking;
    if (!walking) {
      this.animTimer = 0;
    }
  }

  // ── Per-frame update ────────────────────────────────────────
  // IMPORTANT: pass deltaMS (real milliseconds), NOT normalized delta.

  tick(deltaMS: number): void {
    // ── Walk animation ──
    if (this.isWalking) {
      this.animTimer += deltaMS * this.dna.walkSpeed;
      const cycleT = (this.animTimer % this.WALK_CYCLE_MS) / this.WALK_CYCLE_MS;
      const bob = Math.abs(Math.sin(cycleT * Math.PI * 2)) * this.WALK_BOB_AMP;
      this.baseYOffset = -bob;
      this.redrawWalkPose(cycleT);
    } else {
      // Ease back to idle
      this.baseYOffset *= 0.8;
      if (Math.abs(this.baseYOffset) < 0.1) this.baseYOffset = 0;
      this.redrawIdlePose();
    }

    // ── Glow pulse ──
    const glowT = (performance.now() % this.GLOW_PULSE_MS) / this.GLOW_PULSE_MS;
    this.parts.glow.alpha =
      this.dna.glowIntensity * (0.6 + 0.4 * Math.sin(glowT * Math.PI * 2));

    // ── Landing squash: quick squash-flat, then damped overshoot back ──
    let squashX = 1, squashY = 1;
    if (this.landT >= 0) {
      const t = Math.min(1, this.landT / this.LAND_MS);
      if (t < 0.22) {
        const u = t / 0.22;
        squashX = 1 + this.LAND_SQUASH * u;   // stretch wide
        squashY = 1 - this.LAND_SQUASH * u;   // squash flat
      } else {
        const u = (t - 0.22) / 0.78;
        const f = Math.exp(-4 * u) * Math.cos(u * Math.PI * 3); // damped overshoot
        squashX = 1 + this.LAND_SQUASH * f;
        squashY = 1 - this.LAND_SQUASH * f;
      }
      this.landT += deltaMS;
      if (t >= 1) this.landT = -1;
    }
    this.bodyContainer.scale.set(this.flyScale * squashX, this.flyScale * squashY);

    // ── Apply visual offsets to bodyContainer — NEVER to this.y ──
    // this.x / this.y are world coordinates owned by the controller.
    this.bodyContainer.y = -this.z + this.baseYOffset;

    // ── Shadow: stays on ground, shrinks & fades as character rises ──
    const heightRatio = Math.max(0, Math.min(1, this.z / 200));
    this.shadowGraphics.scale.set(1 - heightRatio * 0.5);
    this.shadowGraphics.alpha = 1 - heightRatio * 0.7;

    // ── Earlobe physics: derive body-local velocity/acceleration from the
    //    world-position delta, then step + render both sims. ──
    const dtSec = deltaMS / 1000;
    if (dtSec > 0 && this.lastWorldPos) {
      let vx = (this.x - this.lastWorldPos.x) / dtSec;
      let vy = (this.y - this.lastWorldPos.y) / dtSec;
      // Teleport guard (zone warps / huge snaps): settle instead of exploding.
      if (Math.hypot(vx, vy) > this.EAR_TELEPORT_SPEED) {
        this.lobeL.settle();
        this.lobeR.settle();
        vx = 0;
        vy = 0;
      }
      // Body-local frame: the outer container's scale.x is negative for
      // mirrored (back-facing) directions, so local X mirrors world X.
      const flipSign = this.currentDir.flip ? -1 : 1;
      const vlx = vx * flipSign;
      const vly = vy;
      // EMA smoothing + magnitude clamp.
      this.smoothV.x += (vlx - this.smoothV.x) * this.EAR_VEL_EMA;
      this.smoothV.y += (vly - this.smoothV.y) * this.EAR_VEL_EMA;
      const sp = Math.hypot(this.smoothV.x, this.smoothV.y);
      if (sp > this.EAR_MAX_SPEED) {
        const s = this.EAR_MAX_SPEED / sp;
        this.smoothV.x *= s;
        this.smoothV.y *= s;
      }
      // Acceleration from the smoothed velocity delta (clamped).
      this.accelLocal.x = clamp(
        (this.smoothV.x - this.prevSmoothV.x) / dtSec,
        -this.EAR_MAX_ACCEL,
        this.EAR_MAX_ACCEL,
      );
      this.accelLocal.y = clamp(
        (this.smoothV.y - this.prevSmoothV.y) / dtSec,
        -this.EAR_MAX_ACCEL,
        this.EAR_MAX_ACCEL,
      );
      this.lobeL.step(dtSec, this.smoothV, this.accelLocal);
      this.lobeR.step(dtSec, this.smoothV, this.accelLocal);
      this.prevSmoothV.x = this.smoothV.x;
      this.prevSmoothV.y = this.smoothV.y;
    }
    // Record world position (first tick only records — no velocity yet).
    if (this.lastWorldPos) {
      this.lastWorldPos.x = this.x;
      this.lastWorldPos.y = this.y;
    } else {
      this.lastWorldPos = { x: this.x, y: this.y };
    }
    this.lobeL.render(this.earGL, 0xFFFFFF, this.earStrokeL);
    this.lobeR.render(this.earGR, 0xFFFFFF, this.earStrokeR);
  }

  // ── Wind effect API ─────────────────────────────────────────

  setFlyBlend(blend: number): void {
    this.flyBlend = Math.max(0, Math.min(1, blend));
  }

  /**
   * Set the flight scale (applied to bodyContainer in tick).
   * Replaces direct `character.scale.set(...)` so the direction-flip sign
   * on the outer container is never clobbered.
   */
  setFlyScale(s: number): void {
    this.flyScale = Number.isFinite(s) ? s : 1;
  }

  /** Start the landing squash animation (called by WindEffect on touchdown). */
  playLanding(): void {
    this.landT = 0;
  }

  setHeight(h: number): void {
    this.z = h;
  }

  // ═════════════════════════════════════════════════════════════
  //  DIRECTIONAL DRAWING
  // ═════════════════════════════════════════════════════════════

  private redrawForDirection(): void {
    const dir = this.currentDir.name;
    this.drawShadow();
    this.drawHead(dir);
    this.applyEarLayout();
    this.drawEyes(dir);
    this.drawMouth(dir);
    this.drawTorso(dir);
    this.drawGlow();
    this.redrawIdlePose();
  }

  /**
   * Compute the body metrics for the current direction. These are the ONLY
   * source of limb joint anchors, and they use the same torsoTop/torsoH/
   * half-width values the torso graphics draws with — so limbs always attach
   * to the REAL torso extents at any DNA scale.
   */
  private computeMetrics(dir: string): BodyMetrics {
    const ts = this.dna.torsoScale * this.dna.bodyScale;
    const ls = this.dna.legScale * this.dna.bodyScale;

    const torsoTop = this.TORSO_TOP;
    const torsoH = 18 * ts;
    const hipY = torsoTop + torsoH;

    // Half-width factor mirrors drawTorso()'s per-direction rect formula.
    let halfFactor: number;
    if (this.currentDir.flip) {
      halfFactor = dir === 'S' ? 0.7 : 0.75;
    } else if (dir === 'S') {
      halfFactor = 1;
    } else if (dir === 'E' || dir === 'W') {
      halfFactor = 0.5;
    } else {
      halfFactor = 0.85; // SE / SW
    }
    const torsoHalfW = 12 * ts * halfFactor;

    const isSide = dir === 'E' || dir === 'W';
    const hipSpread = Math.min(
      Math.max((isSide ? 1 : 5) * ls, 0),
      torsoHalfW * this.HIP_SPREAD_MAX,
    );

    return {
      torsoTop,
      hipY,
      torsoHalfW,
      shoulderX: torsoHalfW * this.SHOULDER_INSET,
      shoulderY: torsoTop + 3,
      hipSpread,
    };
  }

  private drawShadow(): void {
    const g = this.shadowGraphics;
    g.clear();
    const s = this.dna.bodyScale;
    g.ellipse(0, 0, 14 * s, 6 * s);
    g.fill(0x000000, 0.15);
  }

  private drawHead(dir: string): void {
    const g = this.parts.head;
    g.clear();
    const s = this.dna.headScale * this.dna.bodyScale;
    const r = 14 * s;

    if (this.currentDir.flip) {
      // Back of head. Distinguish the three back-facing directions:
      //   N  (dir='S')  → pure centered back dome
      //   NE (dir='SE') → 3/4 back, head turned to one side (offset)
      //   NW (dir='SW') → 3/4 back, mirror offset
      if (dir === 'S') {
        g.ellipse(0, -28, r * 0.9, r * 1.05);
        g.fill(0xFFFFFF);
        g.stroke({ width: 1, color: 0xDDDDDD });
      } else {
        // 3/4 back — NE ('SE') / NW ('SW'). Offset the head toward the
        // turned side and add a subtle cheek/jaw bump on the near side so
        // it clearly reads as a turned head, not the symmetric N dome.
        const toward = dir === 'SE' ? 1 : -1; // local offset dir (container is flipped)
        g.ellipse(toward * 3, -28, r * 0.95, r * 1.06);
        g.fill(0xFFFFFF);
        g.stroke({ width: 1, color: 0xDDDDDD });
        // Near-side jaw/cheek hint
        g.ellipse(toward * (r * 0.7), -24, r * 0.32, r * 0.4);
        g.fill(0xFFFFFF);
        g.stroke({ width: 1, color: 0xE2E2E2 });
      }
    } else if (dir === 'S') {
      g.ellipse(0, -28, r, r * 1.1);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else if (dir === 'E' || dir === 'W') {
      const side = dir === 'E' ? 1 : -1;
      g.ellipse(side * 2, -28, r * 0.85, r * 1.05);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else {
      // SE / SW — 3/4 front
      g.ellipse(0, -28, r * 0.95, r * 1.08);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    }
  }

  /**
   * Per-direction lobe table — mirrors the old static drawEars exactly:
   * front S both lobes, E/W one side only, SE/SW near + subdued far, back
   * variants with the turned-side near ear and the tucked far ear.
   * Returns [left, right] entries in body-local space (flip handled by the
   * outer container's negative scale.x, so left/right stay anatomical).
   */
  private earLayoutFor(dir: string, flip: boolean): [EarLayoutEntry, EarLayoutEntry] {
    if (flip) {
      // Back view. N = symmetric; NE ('SE') / NW ('SW') = 3/4 turn.
      if (dir === 'S') {
        return [
          { x: -12, y: -32, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xDDDDDD },
          { x: 12, y: -32, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xDDDDDD },
        ];
      }
      // toward: local turned side (container is flipped).
      const toward = dir === 'SE' ? 1 : -1;
      return [
        toward === 1
          ? { x: -9, y: -30, visible: true, wMul: 0.5, alpha: 0.75, lenMul: 0.6, stroke: 0xDDDDDD }  // far
          : { x: -14, y: -31, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xDDDDDD },        // near
        toward === 1
          ? { x: 14, y: -31, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xDDDDDD }          // near
          : { x: 9, y: -30, visible: true, wMul: 0.5, alpha: 0.75, lenMul: 0.6, stroke: 0xDDDDDD },    // far
      ];
    }
    if (dir === 'S') {
      return [
        { x: -13, y: -30, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xCCCCCC },
        { x: 13, y: -30, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xCCCCCC },
      ];
    }
    if (dir === 'E' || dir === 'W') {
      // One side only at ±14; the hidden lobe keeps simulating (invisibly)
      // at its front-S socket (±13) so a later reveal already carries
      // natural momentum.
      return [
        { x: dir === 'W' ? -14 : -13, y: -30, visible: dir === 'W', wMul: 1, alpha: dir === 'W' ? 1 : 0, lenMul: 1, stroke: 0xCCCCCC },
        { x: dir === 'E' ? 14 : 13, y: -30, visible: dir === 'E', wMul: 1, alpha: dir === 'E' ? 1 : 0, lenMul: 1, stroke: 0xCCCCCC },
      ];
    }
    // SE / SW — near lobe full, far lobe subdued (half width, 0.75 alpha).
    const isSE = dir === 'SE';
    return [
      isSE
        ? { x: -8, y: -30, visible: true, wMul: 0.5, alpha: 0.75, lenMul: 1, stroke: 0xDDDDDD }   // far
        : { x: -13, y: -30, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xCCCCCC },      // near
      isSE
        ? { x: 13, y: -30, visible: true, wMul: 1, alpha: 1, lenMul: 1, stroke: 0xCCCCCC }        // near
        : { x: 8, y: -30, visible: true, wMul: 0.5, alpha: 0.75, lenMul: 1, stroke: 0xDDDDDD },   // far
    ];
  }

  /**
   * Push the current direction's layout onto both sims WITHOUT settling —
   * momentum survives direction changes. Called from redrawForDirection().
   */
  private applyEarLayout(): void {
    const es = this.dna.earScale * this.dna.bodyScale;
    const baseSeg = (22 * es) / 5;
    const [l, r] = this.earLayoutFor(this.currentDir.name, this.currentDir.flip);
    this.earStrokeL = l.stroke;
    this.earStrokeR = r.stroke;
    this.applyLobe(this.lobeL, this.earGL, l, baseSeg);
    this.applyLobe(this.lobeR, this.earGR, r, baseSeg);
  }

  private applyLobe(sim: EarlobeSim, g: Graphics, e: EarLayoutEntry, baseSeg: number): void {
    // Was hidden → the length transition is invisible, so snap it; a visible
    // lobe eases to its new rest length over a few frames instead of popping.
    const snap = !sim.isVisible();
    sim.setAnchor(e.x, e.y);
    sim.setWidthScale(e.wMul);
    sim.setSegLen(baseSeg * e.lenMul, snap);
    sim.setVisible(e.visible);
    g.alpha = e.alpha;
  }

  private drawEyes(dir: string): void {
    const g = this.parts.eyes;
    g.clear();
    // Back-facing (N, NE, NW) — no eyes
    if (this.currentDir.flip) return;

    const es = this.dna.eyeScale * this.dna.bodyScale;
    const color = this.dna.eyePetalColor;

    if (dir === 'S') {
      this.drawFlowerEye(g, -8, -30, es, color);
      this.drawFlowerEye(g, 8, -30, es, color);
    } else if (dir === 'E' || dir === 'W') {
      this.drawFlowerEye(g, dir === 'E' ? 10 : -10, -30, es * 0.85, color);
    } else {
      // SE / SW
      const isSE = dir === 'SE';
      this.drawFlowerEye(g, isSE ? 9 : -9, -30, es * 0.9, color);
      this.drawFlowerEye(g, isSE ? -4 : 4, -31, es * 0.7, color, true);
    }
  }

  private drawFlowerEye(
    g: Graphics, cx: number, cy: number, scale: number,
    petalColor: number, isFarEye = false,
  ): void {
    const petalR = 4 * scale;
    const alpha = isFarEye ? 0.5 : 0.85;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.ellipse(cx + Math.cos(a) * petalR * 0.6, cy + Math.sin(a) * petalR * 0.6, petalR * 0.5, petalR * 0.7);
      g.fill({ color: petalColor, alpha });
    }
    g.circle(cx, cy, 2 * scale);
    g.fill({ color: 0x333333, alpha });
    g.circle(cx - scale, cy - scale, 0.8 * scale);
    g.fill({ color: 0xFFFFFF, alpha: Math.min(1, alpha + 0.15) });
  }

  private drawMouth(dir: string): void {
    const g = this.parts.mouth;
    g.clear();
    // Back-facing — no mouth
    if (this.currentDir.flip) return;

    const s = this.dna.bodyScale;
    if (dir === 'S') {
      this.drawSmile(g, 0, -20, 6 * s, false);
    } else if (dir === 'E' || dir === 'W') {
      this.drawSmile(g, dir === 'E' ? 2 : -2, -20, 4 * s, true);
    } else {
      this.drawSmile(g, dir === 'SE' ? 2 : -2, -20, 5 * s, false);
    }
  }

  private drawSmile(g: Graphics, cx: number, cy: number, width: number, isProfile: boolean): void {
    const startAngle = isProfile ? -Math.PI * 0.8 : 0.1;
    const endAngle = isProfile ? -Math.PI * 0.2 : Math.PI - 0.1;
    g.arc(cx, cy, width, startAngle, endAngle);
    g.stroke({ width: 1.5, color: 0x888888 });
    if (!isProfile) {
      g.circle(cx - width + 1, cy - 1, 1);
      g.fill({ color: 0xFFCCCC, alpha: 0.5 });
      g.circle(cx + width - 1, cy - 1, 1);
      g.fill({ color: 0xFFCCCC, alpha: 0.5 });
    }
  }

  private drawTorso(dir: string): void {
    const g = this.parts.torso;
    g.clear();
    const ts = this.dna.torsoScale * this.dna.bodyScale;
    const m = this.computeMetrics(dir);
    const { torsoTop, hipY, torsoHalfW, shoulderX, shoulderY } = m;
    const torsoH = hipY - torsoTop; // same height value the metrics expose

    if (this.currentDir.flip) {
      if (dir === 'S') {
        // Pure back (N) — centered, narrow
        g.roundRect(-torsoHalfW, torsoTop, torsoHalfW * 2, torsoH, 4);
      } else {
        // 3/4 back (NE/NW) — shift shoulders toward the turned side
        const toward = dir === 'SE' ? 1 : -1;
        g.roundRect(toward * 2 - torsoHalfW, torsoTop, torsoHalfW * 2, torsoH, 4);
      }
    } else if (dir === 'S') {
      g.roundRect(-torsoHalfW, torsoTop, torsoHalfW * 2, torsoH, 5);
    } else if (dir === 'E' || dir === 'W') {
      g.roundRect(-torsoHalfW, torsoTop, torsoHalfW * 2, torsoH, 3);
    } else {
      g.roundRect(-torsoHalfW, torsoTop, torsoHalfW * 2, torsoH, 4);
    }
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: this.currentDir.flip ? 0xDDDDDD : 0xCCCCCC });

    // Shoulder cap discs (white, no stroke) — when an arm rotates away the
    // seam at the shoulder is still covered by the disc in the torso layer.
    g.circle(-shoulderX, shoulderY, 4 * ts);
    g.fill(0xFFFFFF);
    g.circle(shoulderX, shoulderY, 4 * ts);
    g.fill(0xFFFFFF);
  }

  private drawGlow(): void {
    const g = this.parts.glow;
    g.clear();
    const r = 28 * this.dna.bodyScale;
    g.circle(0, -22, r);
    g.fill({ color: this.dna.glowColor, alpha: 0.25 });
    g.circle(0, -22, r * 0.6);
    g.fill({ color: this.dna.glowColor, alpha: 0.2 });
  }

  // ═════════════════════════════════════════════════════════════
  //  POSES
  // ═════════════════════════════════════════════════════════════

  /**
   * Anchor the limb containers at their joints and (re)draw the limb
   * geometry in joint-local space. Called by every pose draw. Placement
   * derives only from BodyMetrics — DNA-invariant by construction.
   */
  private layoutLimbs(m: BodyMetrics): void {
    // Joint anchors in body space. Legs overlap HIP_OVERLAP px up into the
    // torso (which draws OVER them), so the hip seam can never show.
    this.legL.position.set(-m.hipSpread, m.hipY - this.HIP_OVERLAP);
    this.legR.position.set(m.hipSpread, m.hipY - this.HIP_OVERLAP);
    this.armL.position.set(-m.shoulderX, m.shoulderY);
    this.armR.position.set(m.shoulderX, m.shoulderY);

    this.drawLegLocal(this.legLG);
    this.drawLegLocal(this.legRG);
    this.drawArmLocal(this.armLG);
    this.drawArmLocal(this.armRG);
  }

  /** Leg + foot, drawn in joint-local space with the hip joint at (0,0). */
  private drawLegLocal(g: Graphics): void {
    const ls = this.dna.legScale * this.dna.bodyScale;
    const legW = 4 * ls, legH = 14 * ls;
    g.clear();
    g.roundRect(-legW / 2, 0, legW, legH, 2);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: 0xCCCCCC });
    // Hip joint disc — full circle centered ON the pivot: same silhouette
    // at every walk rotation (OpenToonz hook technique).
    g.circle(0, 0, legW * 0.75);
    g.fill(0xFFFFFF);
    // Foot at the distal end — lives inside the limb, cannot drift.
    g.ellipse(0, legH + 1, 5 * ls, 3 * ls);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: 0xBBBBBB });
  }

  /** Arm + hand, drawn in joint-local space with the shoulder at (0,0). */
  private drawArmLocal(g: Graphics): void {
    const as_ = this.dna.armScale * this.dna.bodyScale;
    const armW = 3.5 * as_, armH = 12 * as_;
    g.clear();
    g.roundRect(-armW / 2, 0, armW, armH, 2);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: 0xCCCCCC });
    // Shoulder joint disc centered ON the pivot.
    g.circle(0, 0, armW * 0.8);
    g.fill(0xFFFFFF);
    // Hand at the distal end.
    g.circle(0, armH, 3 * as_);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: 0xBBBBBB });
  }

  private redrawIdlePose(): void {
    const m = this.computeMetrics(this.currentDir.name);
    this.layoutLimbs(m);
    // Snap to rest — joints pinned, zero swing (parity with old idle snap).
    this.legL.rotation = 0;
    this.legR.rotation = 0;
    this.armL.rotation = 0;
    this.armR.rotation = 0;
  }

  private redrawWalkPose(cycleT: number): void {
    const m = this.computeMetrics(this.currentDir.name);
    this.layoutLimbs(m);
    // Pendulum around the joint pivots — legs anti-phase, arms anti-phase
    // to the same-side leg. Rotation never moves the joint anchors, so no
    // gap can open mid-stride. Mirrored (flip) views inherit this via the
    // outer container's scale.x = -1 — no special case needed.
    const phase = Math.sin(cycleT * Math.PI * 2);
    const armSwing = this.ARM_SWING_RATIO * this.SWING;
    this.legL.rotation = this.SWING * phase;
    this.legR.rotation = -this.SWING * phase;
    this.armL.rotation = -armSwing * phase;
    this.armR.rotation = armSwing * phase;
  }

  // ═════════════════════════════════════════════════════════════

  destroy(options?: { children?: boolean }): void {
    for (const key of Object.keys(this.parts) as (keyof CharacterParts)[]) {
      this.parts[key].destroy();
    }
    // Earlobe ribbon graphics (the sims are plain data — nothing to free).
    this.earGL.destroy();
    this.earGR.destroy();
    // Limb containers own their geometry — destroy children too.
    this.legL.destroy({ children: true });
    this.legR.destroy({ children: true });
    this.armL.destroy({ children: true });
    this.armR.destroy({ children: true });
    this.shadowGraphics.destroy();
    super.destroy(options);
  }
}
