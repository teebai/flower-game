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
 *       ├── glow, legs, feet, torso, arms, hands, ears, head, eyes, mouth
 *   └── shadow (sibling)        ← always at ground level, shrinks with height
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
  legs: Graphics;
  feet: Graphics;
  torso: Graphics;
  arms: Graphics;
  hands: Graphics;
  ears: Graphics;
  head: Graphics;
  eyes: Graphics;
  mouth: Graphics;
}

export class Character extends Container {
  /** Inner container holding all body parts — gets visual Y offsets. */
  private bodyContainer: Container;
  /** Ground shadow — stays on the Character container directly. */
  private shadowGraphics: Graphics;

  private parts: CharacterParts;
  private dna: CharacterDNA;

  /** Current facing: { name ∈ E/SE/S/SW/W, flip: back-facing? } */
  private currentDir = { name: 'S', flip: false };

  private animTimer = 0;
  private isWalking = false;

  /** 0=grounded, 1=flying (wind effect drives this) */
  public flyBlend = 0;
  /** Height above ground in pixels — set by WindEffect each frame */
  public z = 0;

  private baseYOffset = 0;

  private readonly WALK_BOB_AMP = 3;
  private readonly WALK_CYCLE_MS = 600;
  private readonly GLOW_PULSE_MS = 2000;

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

    this.parts = this.createParts();
    this.buildCharacter();
  }

  private createParts(): CharacterParts {
    return {
      glow: new Graphics(),
      legs: new Graphics(),
      feet: new Graphics(),
      torso: new Graphics(),
      arms: new Graphics(),
      hands: new Graphics(),
      ears: new Graphics(),
      head: new Graphics(),
      eyes: new Graphics(),
      mouth: new Graphics(),
    };
  }

  private buildCharacter(): void {
    this.bodyContainer.removeChildren();

    const order: (keyof CharacterParts)[] = [
      'glow', 'legs', 'feet', 'torso', 'arms', 'hands', 'ears', 'head', 'eyes', 'mouth',
    ];
    order.forEach((key, i) => {
      this.parts[key].zIndex = i;
      this.bodyContainer.addChild(this.parts[key]);
    });

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
    const s = this.dna.torsoScale * this.dna.bodyScale;
    const w = 12 * s;
    const h = 18 * s;

    if (this.currentDir.flip) {
      if (dir === 'S') {
        // Pure back (N) — centered, narrow
        g.roundRect(-w * 0.7, -16, w * 1.4, h, 4);
      } else {
        // 3/4 back (NE/NW) — shift shoulders toward the turned side
        const toward = dir === 'SE' ? 1 : -1;
        g.roundRect(toward * 2 - w * 0.75, -16, w * 1.5, h, 4);
      }
    } else if (dir === 'S') {
      g.roundRect(-w, -16, w * 2, h, 5);
    } else if (dir === 'E' || dir === 'W') {
      g.roundRect(-w * 0.5, -16, w, h, 3);
    } else {
      g.roundRect(-w * 0.85, -16, w * 1.7, h, 4);
    }
    g.fill(0xFFFFFF);
    g.stroke({ width: 1, color: this.currentDir.flip ? 0xDDDDDD : 0xCCCCCC });
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

  private redrawIdlePose(): void {
    const dir = this.currentDir.name;
    const s = this.dna.legScale * this.dna.bodyScale;
    const ls = this.dna.armScale * this.dna.bodyScale;
    const isSide = dir === 'E' || dir === 'W';

    const legW = 4 * s, legH = 14 * s, legSpread = isSide ? 1 : 5;
    const legG = this.parts.legs;
    legG.clear();
    legG.roundRect(-legSpread - legW, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.roundRect(legSpread, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    const footW = 5 * s, footH = 3 * s;
    const footG = this.parts.feet;
    footG.clear();
    footG.ellipse(-legSpread - 1, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.ellipse(legSpread + 1, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    const armW = 3.5 * ls, armH = 12 * ls, armSpread = isSide ? 2 : 7;
    const armG = this.parts.arms;
    armG.clear();
    armG.roundRect(-armSpread - armW, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.roundRect(armSpread, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    const handR = 3 * ls;
    const handG = this.parts.hands;
    handG.clear();
    handG.circle(-armSpread - armW * 0.5, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.circle(armSpread + armW * 0.5, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });
  }

  private redrawWalkPose(cycleT: number): void {
    const dir = this.currentDir.name;
    const s = this.dna.legScale * this.dna.bodyScale;
    const ls = this.dna.armScale * this.dna.bodyScale;
    const isSide = dir === 'E' || dir === 'W';

    const legW = 4 * s, legH = 14 * s, stride = 4 * s;
    const leftOff = Math.sin(cycleT * Math.PI * 2) * stride;
    const rightOff = -leftOff;
    const legSpread = isSide ? 1 : 5;

    const legG = this.parts.legs;
    legG.clear();
    legG.roundRect(-legSpread - legW + leftOff, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.roundRect(legSpread + rightOff, 0, legW, legH, 2);
    legG.fill(0xFFFFFF);
    legG.stroke({ width: 1, color: 0xCCCCCC });

    const footW = 5 * s, footH = 3 * s;
    const footG = this.parts.feet;
    footG.clear();
    footG.ellipse(-legSpread - 1 + leftOff, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.ellipse(legSpread + 1 + rightOff, legH + 1, footW, footH);
    footG.fill(0xFFFFFF);
    footG.stroke({ width: 1, color: 0xBBBBBB });

    const armW = 3.5 * ls, armH = 12 * ls, armSpread = isSide ? 2 : 7, swing = 3 * ls;
    const leftArmOff = rightOff / stride * swing;
    const rightArmOff = leftOff / stride * swing;

    const armG = this.parts.arms;
    armG.clear();
    armG.roundRect(-armSpread - armW + leftArmOff, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.roundRect(armSpread + rightArmOff, -12, armW, armH, 2);
    armG.fill(0xFFFFFF);
    armG.stroke({ width: 1, color: 0xCCCCCC });

    const handR = 3 * ls;
    const handG = this.parts.hands;
    handG.clear();
    handG.circle(-armSpread - armW * 0.5 + leftArmOff, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.circle(armSpread + armW * 0.5 + rightArmOff, -12 + armH, handR);
    handG.fill(0xFFFFFF);
    handG.stroke({ width: 1, color: 0xBBBBBB });
  }

  // ═════════════════════════════════════════════════════════════

  destroy(options?: { children?: boolean }): void {
    for (const key of Object.keys(this.parts) as (keyof CharacterParts)[]) {
      this.parts[key].destroy();
    }
    this.shadowGraphics.destroy();
    super.destroy(options);
  }
}
