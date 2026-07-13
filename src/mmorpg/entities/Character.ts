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
 *       └── ears (z4), head (z5), eyes (z6), mouth (z7)
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
import { angleToDirection8 } from '../utils/math2d';

interface CharacterParts {
  glow: Graphics;
  torso: Graphics;
  ears: Graphics;
  head: Graphics;
  eyes: Graphics;
  mouth: Graphics;
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

    this.parts = this.createParts();
    this.buildCharacter();
  }

  private createParts(): CharacterParts {
    return {
      glow: new Graphics(),
      torso: new Graphics(),
      ears: new Graphics(),
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
    this.parts.ears.zIndex = 4;
    this.parts.head.zIndex = 5;
    this.parts.eyes.zIndex = 6;
    this.parts.mouth.zIndex = 7;

    this.bodyContainer.addChild(this.parts.glow);
    this.bodyContainer.addChild(this.legL, this.legR);
    this.bodyContainer.addChild(this.parts.torso);
    this.bodyContainer.addChild(this.armL, this.armR);
    this.bodyContainer.addChild(this.parts.ears);
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
    this.drawEars(dir);
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

  private drawEars(dir: string): void {
    const g = this.parts.ears;
    g.clear();
    const es = this.dna.earScale * this.dna.bodyScale;
    const earW = 5 * es;
    const earH = 22 * es;

    if (this.currentDir.flip) {
      // Back view. N = symmetric splay; NE/NW = asymmetric 3/4 turn.
      if (dir === 'S') {
        // Pure back: both ears splay out sideways evenly
        this.drawEarLobe(g, -12, -32, -earW, earH, true);
        this.drawEarLobe(g, 12, -32, earW, earH, true);
      } else {
        // 3/4 back — NE ('SE') / NW ('SW'): near ear (turned side) is full
        // and droops outward; far ear is shorter and tucked behind the head.
        const toward = dir === 'SE' ? 1 : -1; // local turned side (container flipped)
        // Near ear — prominent, angled outward
        this.drawEarLobe(g, toward * 14, -31, toward * earW, earH, true);
        // Far ear — shorter, peeking from behind head on the other side
        this.drawEarLobe(g, toward * -9, -30, toward * -earW * 0.5, earH * 0.6, true);
      }
    } else if (dir === 'S') {
      this.drawEarLobe(g, -13, -30, -earW, earH, false);
      this.drawEarLobe(g, 13, -30, earW, earH, false);
    } else if (dir === 'E' || dir === 'W') {
      const sideX = dir === 'E' ? 14 : -14;
      const sideW = dir === 'E' ? earW : -earW;
      this.drawEarLobe(g, sideX, -30, sideW, earH, false);
    } else {
      // SE / SW
      const isSE = dir === 'SE';
      this.drawEarLobe(g, isSE ? 13 : -13, -30, isSE ? earW : -earW, earH, false);
      this.drawEarLobe(g, isSE ? -8 : 8, -30, isSE ? -earW * 0.5 : earW * 0.5, earH * 0.7, true);
    }
  }

  private drawEarLobe(g: Graphics, x: number, y: number, w: number, h: number, isBack: boolean): void {
    g.ellipse(x, y + h * 0.3, Math.abs(w) + 1, h * 0.5);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: isBack ? 0xDDDDDD : 0xCCCCCC });
    g.ellipse(x + w * 0.15, y + h * 0.25, Math.abs(w) * 0.5, h * 0.3);
    g.fill(isBack ? 0xF5F5F5 : 0xFFF8F0);
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
    // Limb containers own their geometry — destroy children too.
    this.legL.destroy({ children: true });
    this.legR.destroy({ children: true });
    this.armL.destroy({ children: true });
    this.armR.destroy({ children: true });
    this.shadowGraphics.destroy();
    super.destroy(options);
  }
}
