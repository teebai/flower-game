/**
 * Character.ts — Procedural white humanoid entity for teebai.flowers
 *
 * Teebai's signature character: white humanoid, no hair, no nose, no apparel.
 * Built entirely from PixiJS Graphics primitives (circles, ellipses, paths).
 * Each body part scales independently via CharacterDNA for unique proportions.
 *
 * 8-directional facing:
 *   5 unique drawn angles: E, SE, S, SW, W
 *   3 mirrored angles: NE(flip SE), N(flip S), NW(flip SW)
 *
 * CRITICAL FIX: Do NOT set `this.hitArea` to avoid the PixiJS v8 error:
 *   "container.hitArea.contains is not a function"
 * If hit detection is needed, use a separate interactive overlay or
 * rely on PixiJS's built-in bounds calculation.
 */

import {
  Container,
  Graphics,
  // Rectangle — kept for reference but NOT used to set hitArea
} from 'pixi.js';
import { CharacterDNA } from '../game/CharacterGenerator';
import { angleToDirection8 } from '../utils/math2d';

/** Helper: draw a flower-shaped eye with n petals. */
function drawFlowerEye(
  g: Graphics,
  cx: number,
  cy: number,
  radius: number,
  petals: number,
  petalLength: number,
): void {
  // Petals
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * petalLength;
    const py = cy + Math.sin(angle) * petalLength;
    g.ellipse(px, py, radius * 0.6, radius * 0.9, angle);
    g.fill(0xffffff);
    g.stroke({ width: 1.5, color: 0xdddddd });
  }
  // Center pupil
  g.circle(cx, cy, radius * 0.5);
  g.fill(0x2a2a2a);
  // Highlight
  g.circle(cx - radius * 0.15, cy - radius * 0.15, radius * 0.15);
  g.fill(0xffffff);
}

/** Helper: draw a smiley mouth. */
function drawSmile(g: Graphics, cx: number, cy: number, width: number): void {
  // Arc smile
  g.moveTo(cx - width / 2, cy);
  g.quadraticCurveTo(cx, cy + width * 0.4, cx + width / 2, cy);
  g.stroke({ width: 2, color: 0x333333 });
  // Small cheek dimples
  g.circle(cx - width / 2 - 2, cy - 1, 1.5);
  g.fill(0xffaaaa);
  g.circle(cx + width / 2 + 2, cy - 1, 1.5);
  g.fill(0xffaaaa);
}

export class Character extends Container {
  private dna: CharacterDNA;
  private currentDirection: { name: string; flip: boolean } = {
    name: 'S',
    flip: false,
  };
  private animTimer: number = 0;
  private isWalking: boolean = false;

  // For wind effect
  public flyBlend: number = 0; // 0 = ground, 1 = flying
  public z: number = 0; // height above ground

  // Body part containers (rebuilt on direction change)
  private bodyContainer: Container;
  private shadowGraphics: Graphics;

  constructor(dna: CharacterDNA) {
    super();
    this.dna = dna;

    // CRITICAL: Do NOT set hitArea to a plain object.
    // PixiJS v8 throws "container.hitArea.contains is not a function"
    // if hitArea is not a proper IHitArea implementation.
    // If you ever need a custom hitArea, use:
    //   this.hitArea = new Rectangle(-16, -32, 32, 64);
    // But for now, let PixiJS handle interaction naturally.

    this.shadowGraphics = new Graphics();
    this.addChild(this.shadowGraphics);

    this.bodyContainer = new Container();
    this.addChild(this.bodyContainer);

    this.buildCharacter();
    this.sortableChildren = true;
  }

  // ── Building ────────────────────────────────────────────────────────────

  private buildCharacter(): void {
    this.bodyContainer.removeChildren();
    const g = new Graphics();
    this.bodyContainer.addChild(g);

    const d = this.dna;

    // ── Shadow (drawn first, at ground level) ──
    this.shadowGraphics.clear();
    this.shadowGraphics.ellipse(0, 2, 18 * d.torsoScale, 6);
    this.shadowGraphics.fill(0x000000, 0.15);

    // ── Body parts (drawn relative to body center 0,0) ──

    // Colors
    const skin = 0xffffff;
    const skinShadow = 0xe8e8e8;
    const outline = 0xcccccc;

    // Helper to draw an ellipse with optional stroke
    const ellipse = (
      x: number,
      y: number,
      rx: number,
      ry: number,
      fillColor: number,
    ) => {
      g.ellipse(x, y, rx, ry);
      g.fill(fillColor);
      g.ellipse(x, y, rx, ry);
      g.stroke({ width: 1, color: outline });
    };

    // ── Legs ──
    const legW = 5 * d.legScale;
    const legH = 18 * d.legScale;
    ellipse(-6, 18, legW, legH, skin); // left leg
    ellipse(6, 18, legW, legH, skinShadow); // right leg (slightly darker)

    // ── Feet ──
    const footW = 8 * d.footScale;
    const footH = 4 * d.footScale;
    ellipse(-7, 32, footW, footH, skin);
    ellipse(7, 32, footW, footH, skinShadow);

    // ── Torso ──
    const torsoW = 16 * d.torsoScale;
    const torsoH = 20 * d.torsoScale;
    ellipse(0, 2, torsoW, torsoH, skin);

    // ── Arms ──
    const armW = 4 * d.armScale;
    const armH = 16 * d.armScale;
    ellipse(-18, 0, armW, armH, skin); // left arm
    ellipse(18, 0, armW, armH, skinShadow); // right arm

    // ── Hands ──
    const handR = 4 * d.handScale;
    circle(-20, 14, handR, skin);
    circle(20, 14, handR, skinShadow);

    // ── Head ──
    const headR = 18 * d.headScale;
    circle(0, -22, headR, skin);

    // ── Ears (signature long earlobes) ──
    const earW = 5 * d.earScale;
    const earH = 20 * d.earScale;
    ellipse(-20, -18, earW, earH, skin); // left ear
    ellipse(20, -18, earW, earH, skinShadow); // right ear

    // ── Eyes (flower-shaped) ──
    const eyeR = 5 * d.eyeScale;
    const eyeY = -24;
    const eyeOffset = 8 * d.eyeScale;
    // Only draw eyes if facing South or diagonal (not pure North/Back)
    if (this.currentDirection.name !== 'S' || !this.currentDirection.flip) {
      drawFlowerEye(g, -eyeOffset, eyeY, eyeR, 5, eyeR * 1.6);
      drawFlowerEye(g, eyeOffset, eyeY, eyeR, 5, eyeR * 1.6);
    }

    // ── Mouth ──
    const mouthW = 8 * d.mouthScale;
    const mouthY = -14;
    if (this.currentDirection.name === 'S' && !this.currentDirection.flip) {
      // Front-facing smile
      drawSmile(g, 0, mouthY, mouthW);
    } else if (this.currentDirection.name === 'S' && this.currentDirection.flip) {
      // Back view — minimal mouth hint
      g.ellipse(0, mouthY, mouthW * 0.3, 1);
      g.fill(0xdddddd);
    } else {
      // Side/profile view
      g.ellipse(4, mouthY, mouthW * 0.4, 2);
      g.fill(0x333333);
    }

    // ── Glow effect (behind everything) ──
    if (d.glowIntensity > 0) {
      g.ellipse(0, 0, 30 + d.glowIntensity * 10, 40 + d.glowIntensity * 10);
      g.fill({ color: 0xffffcc, alpha: d.glowIntensity * 0.15 });
    }

    function circle(cx: number, cy: number, r: number, color: number) {
      g.ellipse(cx, cy, r, r);
      g.fill(color);
      g.ellipse(cx, cy, r, r);
      g.stroke({ width: 1, color: outline });
    }
  }

  // ── Direction & Animation ───────────────────────────────────────────────

  setDirection(angleDeg: number): void {
    const prev = this.currentDirection;
    this.currentDirection = angleToDirection8(angleDeg);

    // Apply horizontal flip for mirrored directions
    const flip = this.currentDirection.flip ? -1 : 1;
    this.bodyContainer.scale.x = Math.abs(this.bodyContainer.scale.x) * flip;

    // Rebuild body if direction changed significantly
    if (
      prev.name !== this.currentDirection.name ||
      prev.flip !== this.currentDirection.flip
    ) {
      this.buildCharacter();
    }
  }

  setWalking(walking: boolean): void {
    this.isWalking = walking;
  }

  tick(delta: number): void {
    // Walk animation — gentle body bob
    if (this.isWalking) {
      this.animTimer += delta * 0.15;
      const bob = Math.sin(this.animTimer) * 2;
      this.bodyContainer.y = -this.z + bob;
    } else {
      this.animTimer = 0;
      this.bodyContainer.y = -this.z;
    }

    // Shadow scales inversely with height
    const shadowScale = 1 - this.z * 0.001;
    this.shadowGraphics.scale.set(Math.max(0.3, shadowScale));
    this.shadowGraphics.alpha = Math.max(0.1, 0.4 - this.z * 0.001);
  }

  // ── Wind effect helpers ─────────────────────────────────────────────────

  setFlyBlend(blend: number): void {
    this.flyBlend = blend;
  }

  setHeight(h: number): void {
    this.z = h;
  }
}
