/**
 * MassiveFlower.ts — Large decorative mystical flower for the Gallery zone.
 *
 * Features:
 *   - 8 radial petals with organic purple-to-blue coloring
 *   - Multi-layered golden center with sparkle dots
 *   - Soft halo glow with breathing pulse
 *   - Gentle sway animation (combined rotation + counter-rotation)
 */

import { Container, Graphics } from 'pixi.js';

export class MassiveFlower extends Container {
  private petals: Graphics[] = [];
  private center: Graphics;
  private halo: Graphics;
  private swayPhase: number = 0;
  private swaySpeed: number = 0.02;
  private swayAmount: number = 5; // degrees

  constructor(x: number, y: number, size: number = 150) {
    super();
    this.position.set(x, y);
    this.buildFlower(size);
  }

  private buildFlower(size: number): void {
    // ── Halo glow (drawn first, behind everything) ──
    this.halo = new Graphics();
    this.halo.circle(0, 0, size * 1.4);
    this.halo.fill({ color: 0x9b59b6, alpha: 0.08 });
    this.addChild(this.halo);

    // ── Petals ──
    const petalCount = 8;
    const petalLength = size * 0.85;
    const petalWidth = size * 0.35;

    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petal = new Graphics();

      // Gradient-like coloring: purple center → blue tips
      const t = i / petalCount;
      const r = Math.floor(107 + t * 30);
      const g = Math.floor(50 + t * 60);
      const b = Math.floor(180 + t * 40);
      const color = (r << 16) | (g << 8) | b;

      // Draw petal as an ellipse offset and rotated
      petal.ellipse(0, -petalLength * 0.5, petalWidth, petalLength);
      petal.fill(color);
      petal.stroke({ width: 2, color: 0x7d3c98 });

      // Vein highlight
      petal.moveTo(0, -petalLength * 0.8);
      petal.lineTo(0, -petalLength * 0.2);
      petal.stroke({ width: 1, color: 0xffffff, alpha: 0.2 });

      petal.rotation = angle;
      this.addChild(petal);
      this.petals.push(petal);
    }

    // ── Center ──
    this.center = new Graphics();

    // Outer ring
    this.center.circle(0, 0, size * 0.25);
    this.center.fill(0xffd700);
    this.center.stroke({ width: 3, color: 0xffa500 });

    // Inner circle
    this.center.circle(0, 0, size * 0.15);
    this.center.fill(0xffed4a);

    // Sparkle dots
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = size * 0.2;
      this.center.circle(Math.cos(a) * r, Math.sin(a) * r, 2);
      this.center.fill(0xffffff);
    }

    this.addChild(this.center);
  }

  tick(delta: number): void {
    // Main sway
    this.swayPhase += this.swaySpeed * delta;
    const mainSway = Math.sin(this.swayPhase) * (this.swayAmount * Math.PI / 180);

    // Counter-sway for organic feel
    const counterSway =
      Math.sin(this.swayPhase * 1.3 + 1) * (this.swayAmount * 0.5 * Math.PI / 180);

    // Apply to container
    this.rotation = mainSway;

    // Individual petal breathing
    for (let i = 0; i < this.petals.length; i++) {
      const breathe = 1 + Math.sin(this.swayPhase * 0.8 + i * 0.7) * 0.03;
      this.petals[i].scale.set(breathe);
    }

    // Center counter-rotates slightly
    this.center.rotation = counterSway;

    // Halo pulse
    const haloAlpha = 0.06 + Math.sin(this.swayPhase * 0.5) * 0.02;
    this.halo.clear();
    this.halo.circle(0, 0, 210);
    this.halo.fill({ color: 0x9b59b6, alpha: haloAlpha });
  }
}
