/**
 * Character.ts
 * Player character entity for teebai.flowers MMORPG.
 *
 * Teebai's signature white humanoid: no hair, no nose, no apparel.
 * Flower eyes, smiley mouth, long earlobes.
 * 8-directional spriteless rendering via PixiJS Graphics.
 *
 * Drawn directions (5): E, SE, S, SW, W
 * Mirrored directions (3): NW=flip(SW), N=flip(S), NE=flip(SE)
 */

import { Container, Graphics, Rectangle } from 'pixi.js';
import type { CharacterDNA } from '../game/CharacterGenerator';
import { angleToDirection8 } from '../utils/math2d';

/** Body part references for directional redrawing */
interface CharacterParts {
  shadow: Graphics;
  legs: Graphics;
  feet: Graphics;
  torso: Graphics;
  arms: Graphics;
  hands: Graphics;
  head: Graphics;
  ears: Graphics;
  eyes: Graphics;
  mouth: Graphics;
  glow: Graphics;
}

export class Character extends Container {
  private parts: CharacterParts;
  private dna: CharacterDNA;

  /** Current 8-dir facing { name, flip, angle } */
  private currentDir = { name: 'S', flip: false };

  /** Animation timer in ms */
  private animTimer = 0;

  /** Is the character currently walking? */
  private isWalking = false;

  /** 0=grounded, 1=flying (wind effect) */
  public flyBlend = 0;

  /** Height above ground in pixels (wind effect) */
  public z = 0;

  /** Target Z height (for smooth transitions) */
  private targetZ = 0;

  /** Cached base Y offset for walk bobbing */
  private baseYOffset = 0;

  /** Event target for interaction callbacks */
  public onInteract?: () => void;

  // ── Constants ───────────────────────────────────────────────
  private readonly WALK_BOB_AMP = 3;       // Bobbing amplitude px
  private readonly WALK_CYCLE_MS = 600;    // Full walk cycle duration
  private readonly GLOW_PULSE_MS = 2000;   // Glow pulse cycle

  constructor(dna: CharacterDNA) {
    super();
    this.dna = dna;
    this.sortableChildren = true;

    // CRITICAL: Do NOT set hitArea to a plain object.
    // PixiJS v8 requires a Rectangle instance or null.
    // We leave it unset so PixiJS handles hit detection naturally
    // via the Graphics geometry bounds.
    // If you ever need a custom hitArea, use:
    //   this.hitArea = new Rectangle(-16, -32, 32, 64);

    this.parts = this.createParts();
    this.buildCharacter();
  }

  // ── Part Factory ────────────────────────────────────────────

  private createParts(): CharacterParts {
    return {
      shadow: new Graphics(),
      legs: new Graphics(),
      feet: new Graphics(),
      torso: new Graphics(),
      arms: new Graphics(),
      hands: new Graphics(),
      head: new Graphics(),
      ears: new Graphics(),
      eyes: new Graphics(),
      mouth: new Graphics(),
      glow: new Graphics(),
    };
  }

  // ── Build / Rebuild ─────────────────────────────────────────

  /** Assemble all body parts into the character container. */
  private buildCharacter(): void {
    // Clear any existing children
    this.removeChildren();

    // Add in painter's order (back to front)
    this.addChild(this.parts.glow);
    this.addChild(this.parts.shadow);
    this.addChild(this.parts.legs);
    this.addChild(this.parts.feet);
    this.addChild(this.parts.torso);
    this.addChild(this.parts.arms);
    this.addChild(this.parts.hands);
    this.addChild(this.parts.ears);
    this.addChild(this.parts.head);
    this.addChild(this.parts.eyes);
    this.addChild(this.parts.mouth);

    // Set z-indices via child order (sortableChildren is true)
    this.parts.shadow.zIndex = 0;
    this.parts.glow.zIndex = -1;
    this.parts.legs.zIndex = 1;
    this.parts.feet.zIndex = 2;
    this.parts.torso.zIndex = 3;
    this.parts.arms.zIndex = 4;
    this.parts.hands.zIndex = 5;
    this.parts.ears.zIndex = 6;
    this.parts.head.zIndex = 7;
    this.parts.eyes.zIndex = 8;
    this.parts.mouth.zIndex = 9;

    this.redrawForDirection();
  }

  // ── Direction Handling ──────────────────────────────────────

  /**
   * Set the character's facing direction from an angle in degrees.
   * @param angleDeg 0=E, 45=SE, 90=S, 135=SW, 180=W, 225=NW, 270=N, 315=NE
   */
  setDirection(angleDeg: number): void {
    const dir = angleToDirection8(angleDeg);
    this.currentDir = { name: dir.name, flip: dir.flip };

    // Apply horizontal flip for mirrored directions
    // We use Math.abs to preserve any existing uniform scale
    const absScale = Math.abs(this.scale.x) || 1;
    this.scale.x = absScale * (this.currentDir.flip ? -1 : 1);

    this.redrawForDirection();
  }

  /** Get current direction name for external logic. */
  getDirection(): string {
    return this.currentDir.name;
  }

  // ── Walk State ──────────────────────────────────────────────

  setWalking(walking: boolean): void {
    this.isWalking = walking;
    if (!walking) {
      this.animTimer = 0;
      this.baseYOffset = 0;
    }
  }

  isCurrentlyWalking(): boolean {
    return this.isWalking;
  }

  // ── Per-Frame Update ────────────────────────────────────────

  /**
   * Call every frame with delta time in milliseconds.
   * Handles walk animation, bobbing, glow pulse, and wind height.
   */
  tick(deltaMS: number): void {
    // ── Walk animation ──
    if (this.isWalking) {
      this.animTimer += deltaMS * this.dna.walkSpeed;
      const cycleT = (this.animTimer % this.WALK_CYCLE_MS) / this.WALK_CYCLE_MS;
      const bob = Math.sin(cycleT * Math.PI * 2) * this.WALK_BOB_AMP;
      this.baseYOffset = -Math.abs(bob);

      // Redraw limbs for walk pose
      this.redrawWalkPose(cycleT);
    } else {
      // Return to idle
      if (this.baseYOffset !== 0) {
        this.baseYOffset *= 0.8;
        if (Math.abs(this.baseYOffset) < 0.1) this.baseYOffset = 0;
      }
      this.redrawIdlePose();
    }

    // ── Glow pulse ──
    const glowT = (performance.now() % this.GLOW_PULSE_MS) / this.GLOW_PULSE_MS;
    const glowAlpha = this.dna.glowIntensity * (0.6 + 0.4 * Math.sin(glowT * Math.PI * 2));
    this.parts.glow.alpha = glowAlpha;

    // ── Wind/fly height smoothing ──
    this.z += (this.targetZ - this.z) * 0.1;
    if (Math.abs(this.targetZ - this.z) < 0.1) this.z = this.targetZ;

    // Apply final Y offset (negative because PixiJS Y is down)
    this.y = -this.z + this.baseYOffset;
  }

  // ── Wind Effect API ─────────────────────────────────────────

  /** Set how much the character is flying (0=ground, 1=flying). */
  setFlyBlend(blend: number): void {
    this.flyBlend = Math.max(0, Math.min(1, blend));
    this.targetZ = this.flyBlend * 40; // Max 40px hover height
  }

  /** Set explicit height above ground in pixels. */
  setHeight(h: number): void {
    this.z = h;
    this.targetZ = h;
  }

  // ═════════════════════════════════════════════════════════════
  //  DIRECTIONAL DRAWING
  // ═════════════════════════════════════════════════════════════

  /** Redraw all body parts based on current facing direction. */
  private redrawForDirection(): void {
    const dir = this.currentDir.name;

    this.drawShadow();
    this.drawHead(dir);
    this.drawEars(dir);
    this.drawEyes(dir);
    this.drawMouth(dir);
    this.drawTorso(dir);
    this.drawLegs(dir);
    this.drawFeet(dir);
    this.drawArms(dir);
    this.drawHands(dir);
    this.drawGlow(dir);
  }

  // ── Shadow ──────────────────────────────────────────────────

  private drawShadow(): void {
    const g = this.parts.shadow;
    g.clear();
    // Oval shadow on ground
    g.ellipse(0, 0, 14 * this.dna.bodyScale, 6 * this.dna.bodyScale);
    g.fill(0x000000, 0.15);
  }

  // ── Head ────────────────────────────────────────────────────

  private drawHead(dir: string): void {
    const g = this.parts.head;
    g.clear();
    const s = this.dna.headScale * this.dna.bodyScale;
    const r = 14 * s;

    if (this.currentDir.flip) {
      // Back of head — N, NE, NW all show the back
      // NE/NW use a slightly wider 3/4-back shape vs pure N's narrow dome
      const isPureN = dir === 'S'; // N is stored as S with flip=true
      const rx = isPureN ? r * 0.9 : r * 0.95;
      const ry = isPureN ? r * 1.05 : r * 1.08;
      g.ellipse(0, -28, rx, ry);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xDDDDDD });
    } else if (dir === 'S') {
      // Full front face
      g.ellipse(0, -28, r, r * 1.1);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else if (dir === 'E' || dir === 'W') {
      // Profile view
      const side = dir === 'E' ? 1 : -1;
      g.ellipse(side * 2, -28, r * 0.85, r * 1.05);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else {
      // 3/4 front view (SE, SW)
      g.ellipse(0, -28, r * 0.95, r * 1.08);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    }
  }

  // ── Ears (Teebai signature: long earlobes) ──────────────────

  private drawEars(dir: string): void {
    const g = this.parts.ears;
    g.clear();
    const es = this.dna.earScale * this.dna.bodyScale;
    const earW = 5 * es;
    const earH = 22 * es;

    if (dir === 'N') {
      // Back: ears stick out sideways, tips droop
      this.drawEarLobe(g, -12, -32, -earW, earH, true);
      this.drawEarLobe(g, 12, -32, earW, earH, true);
    } else if (dir === 'S') {
      // Front: both ears visible, dangling down
      this.drawEarLobe(g, -13, -30, -earW, earH, false);
      this.drawEarLobe(g, 13, -30, earW, earH, false);
    } else if (dir === 'E' || dir === 'W') {
      // Profile: one ear visible
      const sideX = dir === 'E' ? 14 : -14;
      const sideW = dir === 'E' ? earW : -earW;
      this.drawEarLobe(g, sideX, -30, sideW, earH, false);
      // Slight hint of far ear
      this.drawEarLobe(g, -sideX * 0.3, -30, -sideW * 0.3, earH * 0.6, true);
    } else {
      // 3/4 view: near ear fully visible, far ear partially
      const isSE = dir === 'SE';
      const nearX = isSE ? 13 : -13;
      const nearW = isSE ? earW : -earW;
      const farX = isSE ? -8 : 8;
      const farW = isSE ? -earW * 0.5 : earW * 0.5;
      this.drawEarLobe(g, nearX, -30, nearW, earH, false);
      this.drawEarLobe(g, farX, -30, farW, earH * 0.7, true);
    }
  }

  private drawEarLobe(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    isBack: boolean,
  ): void {
    // Draw elongated ellipse for earlobe
    g.ellipse(x, y + h * 0.3, Math.abs(w) + 1, h * 0.5);
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: isBack ? 0xDDDDDD : 0xCCCCCC });

    // Inner ear detail
    g.ellipse(x + w * 0.15, y + h * 0.25, Math.abs(w) * 0.5, h * 0.3);
    g.fill(isBack ? 0xF5F5F5 : 0xFFF8F0);
  }

  // ── Eyes (Flower-shaped) ────────────────────────────────────

  private drawEyes(dir: string): void {
    const g = this.parts.eyes;
    g.clear();
    // No eyes for back-facing directions: N, NE, NW (all have flip=true)
    if (this.currentDir.flip) return;

    const es = this.dna.eyeScale * this.dna.bodyScale;
    const petalColor = this.dna.eyePetalColor;

    if (dir === 'S') {
      // Both eyes facing front
      this.drawFlowerEye(g, -8, -30, es, petalColor);
      this.drawFlowerEye(g, 8, -30, es, petalColor);
    } else if (dir === 'E' || dir === 'W') {
      // Profile: one eye visible
      const sideX = dir === 'E' ? 10 : -10;
      this.drawFlowerEye(g, sideX, -30, es * 0.85, petalColor);
    } else {
      // 3/4 view: both eyes, offset depth
      const isSE = dir === 'SE';
      const nearX = isSE ? 9 : -9;
      const farX = isSE ? -4 : 4;
      this.drawFlowerEye(g, nearX, -30, es * 0.9, petalColor);
      this.drawFlowerEye(g, farX, -31, es * 0.7, petalColor, true);
    }
  }

  private drawFlowerEye(
    g: Graphics,
    cx: number,
    cy: number,
    scale: number,
    petalColor: string,
    isFarEye = false,
  ): void {
    const petalR = 4 * scale;
    const petalCount = 5;
    const alpha = isFarEye ? 0.5 : 0.85;

    // Draw 5 petals arranged in a circle (flower shape)
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * petalR * 0.6;
      const py = cy + Math.sin(angle) * petalR * 0.6;
      g.ellipse(px, py, petalR * 0.5, petalR * 0.7);
      g.fill({ color: petalColor, alpha });
    }

    // Center of flower (pupil)
    g.circle(cx, cy, 2 * scale);
    g.fill({ color: 0x333333, alpha });

    // Highlight dot
    g.circle(cx - 1 * scale, cy - 1 * scale, 0.8 * scale);
    g.fill({ color: 0xFFFFFF, alpha: alpha + 0.15 });
  }

  // ── Mouth (Smiley) ──────────────────────────────────────────

  private drawMouth(dir: string): void {
    const g = this.parts.mouth;
    g.clear();
    // No mouth for back-facing directions: N, NE, NW (all have flip=true)
    if (this.currentDir.flip) return;

    const s = this.dna.bodyScale;

    if (dir === 'S') {
      // Full smile
      this.drawSmile(g, 0, -20, 6 * s, false);
    } else if (dir === 'E' || dir === 'W') {
      // Profile smile — slight curve visible
      const sideOff = dir === 'E' ? 2 : -2;
      this.drawSmile(g, sideOff, -20, 4 * s, true);
    } else {
      // 3/4 view
      const isSE = dir === 'SE';
      const mx = isSE ? 2 : -2;
      this.drawSmile(g, mx, -20, 5 * s, false);
    }
  }

  private drawSmile(
    g: Graphics,
    cx: number,
    cy: number,
    width: number,
    isProfile: boolean,
  ): void {
    // Simple curved smile using arc
    const startAngle = isProfile ? -Math.PI * 0.8 : 0.1;
    const endAngle = isProfile ? -Math.PI * 0.2 : Math.PI - 0.1;
    g.arc(cx, cy, width, startAngle, endAngle);
    g.stroke({ width: 1.5, color: 0x888888 });

    // Small smile dimples at ends
    if (!isProfile) {
      g.circle(cx - width + 1, cy - 1, 1);
      g.fill(0xFFCCCC, 0.5);
      g.circle(cx + width - 1, cy - 1, 1);
      g.fill(0xFFCCCC, 0.5);
    }
  }

  // ── Torso ───────────────────────────────────────────────────

  private drawTorso(dir: string): void {
    const g = this.parts.torso;
    g.clear();
    const s = this.dna.torsoScale * this.dna.bodyScale;
    const w = 12 * s;
    const h = 18 * s;

    if (dir === 'N') {
      // Back: narrower
      g.roundRect(-w * 0.7, -16, w * 1.4, h, 4);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xDDDDDD });
    } else if (dir === 'S') {
      // Front: full width
      g.roundRect(-w, -16, w * 2, h, 5);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else if (dir === 'E' || dir === 'W') {
      // Profile
      g.roundRect(-w * 0.5, -16, w, h, 3);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    } else {
      // 3/4
      g.roundRect(-w * 0.85, -16, w * 1.7, h, 4);
      g.fill(0xFFFFFF);
      g.stroke({ width: 1, color: 0xCCCCCC });
    }
  }

  // ── Legs ────────────────────────────────────────────────────

  private drawLegs(_dir: string): void {
    // Legs are redrawn in walk/idle pose methods
    this.redrawIdlePose();
  }

  private drawFeet(_dir: string): void {
    // Feet are part of leg drawing
  }

  private drawArms(_dir: string): void {
    // Arms are redrawn in pose methods
  }

  private drawHands(_dir: string): void {
    // Hands are part of arm drawing
  }

  // ── Glow Aura ───────────────────────────────────────────────

  private drawGlow(_dir: string): void {
    const g = this.parts.glow;
    g.clear();
    const s = this.dna.bodyScale;
    const r = 28 * s;

    // Soft radial glow behind character
    g.circle(0, -22, r);
    g.fill({ color: this.dna.glowColor, alpha: 0.25 });
    g.circle(0, -22, r * 0.6);
    g.fill({ color: this.dna.glowColor, alpha: 0.2 });
  }

  // ═════════════════════════════════════════════════════════════
  //  POSE ANIMATION (Idle + Walk)
  // ═════════════════════════════════════════════════════════════

  private redrawIdlePose(): void {
    const dir = this.currentDir.name;
    const s = this.dna.legScale * this.dna.bodyScale;
    const ls = this.dna.armScale * this.dna.bodyScale;

    // ── Legs (idle: side by side) ──
    const legG = this.parts.legs;
    legG.clear();
    const legW = 4 * s;
    const legH = 14 * s;
    const isSide = dir === 'E' || dir === 'W';
    const legSpread = isSide ? 1 : 5;

    // Left leg
    legG.roundRect(-legSpread - legW, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    // Right leg
    legG.roundRect(legSpread, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    // ── Feet (idle) ──
    const footG = this.parts.feet;
    footG.clear();
    const footW = 5 * s;
    const footH = 3 * s;

    footG.ellipse(-legSpread - 1, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    footG.ellipse(legSpread + 1, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    // ── Arms (idle: hanging down) ──
    const armG = this.parts.arms;
    armG.clear();
    const armW = 3.5 * ls;
    const armH = 12 * ls;
    const armSpread = isSide ? 2 : 7;

    armG.roundRect(-armSpread - armW, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    armG.roundRect(armSpread, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    // ── Hands ──
    const handG = this.parts.hands;
    handG.clear();
    const handR = 3 * ls;

    handG.circle(-armSpread - armW * 0.5, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });

    handG.circle(armSpread + armW * 0.5, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });
  }

  private redrawWalkPose(cycleT: number): void {
    const dir = this.currentDir.name;
    const s = this.dna.legScale * this.dna.bodyScale;
    const ls = this.dna.armScale * this.dna.bodyScale;
    const isSide = dir === 'E' || dir === 'W';

    // ── Legs (walk: alternating forward/back) ──
    const legG = this.parts.legs;
    legG.clear();
    const legW = 4 * s;
    const legH = 14 * s;
    const stride = 4 * s;

    const leftOffset = Math.sin(cycleT * Math.PI * 2) * stride;
    const rightOffset = Math.sin(cycleT * Math.PI * 2 + Math.PI) * stride;
    const legSpread = isSide ? 1 : 5;

    // Left leg
    legG.roundRect(-legSpread - legW + leftOffset, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    // Right leg
    legG.roundRect(legSpread + rightOffset, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    // ── Feet (walk) ──
    const footG = this.parts.feet;
    footG.clear();
    const footW = 5 * s;
    const footH = 3 * s;

    footG.ellipse(-legSpread - 1 + leftOffset, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    footG.ellipse(legSpread + 1 + rightOffset, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    // ── Arms (walk: swing opposite to legs) ──
    const armG = this.parts.arms;
    armG.clear();
    const armW = 3.5 * ls;
    const armH = 12 * ls;
    const armSpread = isSide ? 2 : 7;
    const armSwing = 3 * ls;

    const leftArmOffset = Math.sin(cycleT * Math.PI * 2 + Math.PI) * armSwing;
    const rightArmOffset = Math.sin(cycleT * Math.PI * 2) * armSwing;

    armG.roundRect(-armSpread - armW + leftArmOffset, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    armG.roundRect(armSpread + rightArmOffset, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    // ── Hands ──
    const handG = this.parts.hands;
    handG.clear();
    const handR = 3 * ls;

    handG.circle(-armSpread - armW * 0.5 + leftArmOffset, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });

    handG.circle(armSpread + armW * 0.5 + rightArmOffset, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });
  }

  // ═════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═════════════════════════════════════════════════════════════

  destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
    // Destroy all part Graphics to free GPU resources
    for (const key of Object.keys(this.parts) as (keyof CharacterParts)[]) {
      this.parts[key].destroy();
    }
    super.destroy(options);
  }
}
