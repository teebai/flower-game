/**
 * MassiveFlower.ts
 * A large decorative mystical flower for the Gallery zone center.
 * 8 petals in purple-to-blue gradient hues with a glowing center.
 * Sways gently in an ambient breeze.
 *
 * Hand-drawn cartoon style — soft edges, organic shapes.
 */

import { Container, Graphics, Circle } from 'pixi.js';

/** Configuration for petal color stops (inner → outer) */
const PETAL_COLORS = [
  0x8B5CF6, // Violet
  0x7C3AED, // Purple
  0x6D28D9, // Deep purple
  0x5B21B6, // Indigo-purple
  0x4C1D95, // Deep violet
];

/** Center glow colors */
const CENTER_COLORS = [0xFDE68A, 0xFCD34D, 0xF59E0B, 0xD97706];

export class MassiveFlower extends Container {
  /** Individual petal Graphics, drawn back-to-front */
  private petals: Graphics[] = [];

  /** Flower center disc */
  private centerDisc: Graphics;

  /** Glow halo behind the flower */
  private halo: Graphics;

  /** Sway animation phase (radians) */
  private swayPhase = 0;

  /** Sway speed in radians per ms */
  private swaySpeed: number;

  /** Maximum sway angle in degrees */
  private swayAmount: number;

  /** Flower size in pixels (radius scale) */
  private flowerSize: number;

  /** Number of petals */
  private readonly petalCount = 8;

  /** Secondary counter-sway for organic feel */
  private counterSwayPhase = Math.PI * 0.7;

  /** Pulse phase for breathing glow effect */
  private pulsePhase = 0;

  /** Pulsing "tap me" hint ring (visible until first tap) */
  private hintRing: Graphics;

  /** Whether the flower accepts taps */
  private interactive = false;

  /** Whether the flower has been tapped already */
  private tapped = false;

  /** Handler invoked on first tap */
  private tapHandler: (() => void) | null = null;

  /** Hint pulse phase */
  private hintPhase = 0;

  /**
   * @param x       World X position
   * @param y       World Y position
   * @param size    Base radius in pixels (default 150)
   * @param swaySpeed  Sway speed multiplier (default 0.02)
   * @param swayAmount Max sway angle in degrees (default 5)
   */
  constructor(
    x: number,
    y: number,
    size: number = 150,
    swaySpeed = 0.02,
    swayAmount = 5,
  ) {
    super();
    this.position.set(x, y);
    this.flowerSize = size;
    this.swaySpeed = swaySpeed;
    this.swayAmount = swayAmount;

    // Create halo first (behind everything)
    this.halo = new Graphics();
    this.addChild(this.halo);

    // Create petal Graphics objects
    for (let i = 0; i < this.petalCount; i++) {
      const petal = new Graphics();
      this.petals.push(petal);
      this.addChild(petal);
    }

    // Create center disc (on top)
    this.centerDisc = new Graphics();
    this.addChild(this.centerDisc);

    // Hint ring (above everything; hidden until interaction is enabled)
    this.hintRing = new Graphics();
    this.hintRing.visible = false;
    this.addChild(this.hintRing);

    this.buildFlower();
    this.drawHintRing();
  }

  // ── Construction ────────────────────────────────────────────

  private buildFlower(): void {
    this.drawHalo();
    this.drawPetals();
    this.drawCenter();
  }

  /** Draw soft glow halo behind the flower. */
  private drawHalo(): void {
    const g = this.halo;
    g.clear();

    const r = this.flowerSize * 1.4;

    // Outer soft glow
    g.circle(0, 0, r);
    g.fill({ color: 0xA78BFA, alpha: 0.06 });

    // Medium glow
    g.circle(0, 0, r * 0.7);
    g.fill({ color: 0xC4B5FD, alpha: 0.08 });

    // Inner glow
    g.circle(0, 0, r * 0.4);
    g.fill({ color: 0xDDD6FE, alpha: 0.1 });
  }

  /** Draw all 8 petals arranged radially. */
  private drawPetals(): void {
    const size = this.flowerSize;

    for (let i = 0; i < this.petalCount; i++) {
      const g = this.petals[i];
      g.clear();

      const angle = (i / this.petalCount) * Math.PI * 2 - Math.PI / 2;
      const colorIndex = i % PETAL_COLORS.length;
      const color = PETAL_COLORS[colorIndex];

      // Petal dimensions
      const petalLen = size * (0.55 + Math.random() * 0.05); // Slight organic variation
      const petalW = size * 0.22;

      // Position petal outward from center
      const px = Math.cos(angle) * size * 0.15;
      const py = Math.sin(angle) * size * 0.15;

      // Draw petal as elongated ellipse, rotated to angle
      g.ellipse(px, py, petalW, petalLen);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ width: 1.5, color: 0x4C1D95, alpha: 0.4 });

      // Petal vein line
      const veinLen = petalLen * 0.6;
      const vx = Math.cos(angle) * veinLen;
      const vy = Math.sin(angle) * veinLen;
      g.moveTo(px - vx * 0.1, py - vy * 0.1);
      g.lineTo(px + vx, py + vy);
      g.stroke({ width: 1, color: 0xFFFFFF, alpha: 0.25 });

      // Lighter petal tip highlight
      const tipX = px + Math.cos(angle) * petalLen * 0.7;
      const tipY = py + Math.sin(angle) * petalLen * 0.7;
      g.ellipse(tipX, tipY, petalW * 0.3, petalLen * 0.15);
      g.fill({ color: 0xA78BFA, alpha: 0.3 });

      // Rotate entire petal to face outward
      g.rotation = angle + Math.PI / 2;
    }
  }

  /** Draw multi-layered glowing center disc. */
  private drawCenter(): void {
    const g = this.centerDisc;
    g.clear();

    const r = this.flowerSize * 0.2;

    // Outer ring
    g.circle(0, 0, r * 1.3);
    g.fill({ color: 0xFDE68A, alpha: 0.4 });

    // Middle ring
    g.circle(0, 0, r);
    g.fill({ color: 0xFCD34D, alpha: 0.6 });

    // Inner bright disc
    g.circle(0, 0, r * 0.65);
    g.fill({ color: 0xF59E0B, alpha: 0.8 });

    // Core highlight
    g.circle(0, 0, r * 0.35);
    g.fill({ color: 0xFEF3C7, alpha: 0.9 });

    // Sparkle dots
    for (let i = 0; i < 6; i++) {
      const sa = (i / 6) * Math.PI * 2;
      const sr = r * 0.5;
      g.circle(Math.cos(sa) * sr, Math.sin(sa) * sr, 2);
      g.fill(0xFFFFFF, 0.7);
    }
  }

  /** Draw the soft "tap me" ring that pulses around the flower. */
  private drawHintRing(): void {
    const g = this.hintRing;
    g.clear();
    const r = this.flowerSize * 0.95;
    g.circle(0, 0, r);
    g.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.7 });
    g.circle(0, 0, r + 8);
    g.stroke({ width: 1.5, color: 0xFFFFFF, alpha: 0.35 });
  }

  // ── Interaction ─────────────────────────────────────────────

  /**
   * Make the flower tappable. The first tap invokes `onTap` (used to bloom the
   * gallery artworks) and retires the hint ring.
   */
  enableInteraction(onTap: () => void): void {
    this.interactive = true;
    this.tapHandler = onTap;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    // Circular hit area covering the whole flower.
    this.hitArea = new Circle(0, 0, this.flowerSize * 0.95);
    this.hintRing.visible = true;

    this.on('pointertap', () => {
      if (this.tapped) return;
      this.tapped = true;
      this.hintRing.visible = false;
      this.tapHandler?.();
    });
  }

  /** Whether the flower has been tapped already. */
  hasBeenTapped(): boolean {
    return this.tapped;
  }

  // ── Per-Frame Update ────────────────────────────────────────

  /**
   * Call every frame with delta time.
   * @param delta   Frame delta (1.0 at 60fps, use deltaMS for ms)
   * @param deltaMS Delta time in milliseconds
   */
  tick(delta: number, deltaMS: number = delta * 16.67): void {
    // Main sway
    this.swayPhase += this.swaySpeed * deltaMS;

    // Counter-sway for organic movement
    this.counterSwayPhase += this.swaySpeed * 1.3 * deltaMS;

    // Breathing glow pulse
    this.pulsePhase += 0.0015 * deltaMS;

    // Combined rotation: main sway + subtle counter + tiny noise
    const mainSway = Math.sin(this.swayPhase) * this.swayAmount;
    const counterSway = Math.sin(this.counterSwayPhase) * this.swayAmount * 0.3;
    const noise = Math.sin(this.swayPhase * 2.7) * this.swayAmount * 0.15;

    this.rotation = ((mainSway + counterSway + noise) * Math.PI) / 180;

    // Pulse halo alpha
    const pulse = 0.5 + 0.5 * Math.sin(this.pulsePhase);
    this.halo.alpha = 0.6 + pulse * 0.4;

    // Counter-rotate center disc slightly for depth
    this.centerDisc.rotation = Math.sin(this.pulsePhase * 0.5) * 0.05;

    // Pulse the hint ring until the flower is tapped
    if (this.interactive && !this.tapped) {
      this.hintPhase += 0.004 * deltaMS;
      const hp = 0.5 + 0.5 * Math.sin(this.hintPhase);
      this.hintRing.alpha = 0.35 + hp * 0.5;
      const hs = 1 + hp * 0.04;
      this.hintRing.scale.set(hs);
    }
  }

  // ── Setters ─────────────────────────────────────────────────

  setSwaySpeed(speed: number): void {
    this.swaySpeed = speed;
  }

  setSwayAmount(degrees: number): void {
    this.swayAmount = degrees;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
    for (const petal of this.petals) {
      petal.destroy();
    }
    this.centerDisc.destroy();
    this.halo.destroy();
    this.hintRing.destroy();
    super.destroy(options);
  }
}
