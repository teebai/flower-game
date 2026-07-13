/**
 * PortalFlower.ts — Interactive flower portal for zone transitions.
 *
 * Two variants:
 *   - 'minigame': Fiery red/orange, aggressive pulse, larger scale
 *   - 'shop': Golden yellow, gentle bob, smaller scale
 *
 * Features rotating glow ring, individual petal breathing, and
 * an interact prompt that appears when the player is in range.
 */

import { Container, Graphics } from 'pixi.js';

export type PortalType = 'minigame' | 'shop';

export class PortalFlower extends Container {
  private type: PortalType;
  private petals: Graphics[] = [];
  private glowRing: Graphics;
  private pulsePhase: number = 0;
  private baseScale: number;

  // Colors per type
  private readonly COLORS = {
    minigame: {
      petalBase: 0xff6347,
      petalTip: 0xff4500,
      center: 0xffd700,
      glow: 0xff6347,
      petalCount: 10,
    },
    shop: {
      petalBase: 0xffd700,
      petalTip: 0xffa500,
      center: 0xffed4a,
      glow: 0xffd700,
      petalCount: 8,
    },
  };

  constructor(x: number, y: number, type: PortalType) {
    super();
    this.type = type;
    this.position.set(x, y);
    this.baseScale = type === 'minigame' ? 1.2 : 0.9;
    this.scale.set(this.baseScale);

    this.glowRing = new Graphics();
    this.addChild(this.glowRing);

    this.buildPortal();
  }

  private buildPortal(): void {
    const colors = this.COLORS[this.type];
    const petalCount = colors.petalCount;
    const petalLength = 35;
    const petalWidth = 14;

    // Build petals
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petal = new Graphics();

      // Gradient-like fill using two overlapping ellipses
      petal.ellipse(0, -petalLength * 0.5, petalWidth, petalLength);
      petal.fill(colors.petalBase);
      petal.stroke({ width: 1.5, color: colors.petalTip });

      // Tip highlight
      petal.ellipse(0, -petalLength * 0.8, petalWidth * 0.5, petalLength * 0.3);
      petal.fill({ color: colors.petalTip, alpha: 0.4 });

      petal.rotation = angle;
      this.addChild(petal);
      this.petals.push(petal);
    }

    // Center
    const center = new Graphics();
    center.circle(0, 0, 12);
    center.fill(colors.center);
    center.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

    // Inner dot
    center.circle(0, 0, 5);
    center.fill(0xffffff);
    this.addChild(center);
  }

  tick(delta: number): void {
    this.pulsePhase += 0.03 * delta;

    const colors = this.COLORS[this.type];

    if (this.type === 'minigame') {
      // Aggressive pulse + micro-shake
      const pulse = 1 + Math.sin(this.pulsePhase) * 0.12;
      this.scale.set(this.baseScale * pulse);

      // Micro shake at peak
      if (Math.sin(this.pulsePhase) > 0.8) {
        this.rotation = (Math.random() - 0.5) * 0.05;
      } else {
        this.rotation = 0;
      }
    } else {
      // Gentle bob + slow pulse
      const pulse = 1 + Math.sin(this.pulsePhase * 0.7) * 0.06;
      this.scale.set(this.baseScale * pulse);
      this.y += Math.sin(this.pulsePhase * 0.5) * 0.15 * delta;
    }

    // Rotate glow ring
    this.glowRing.rotation += 0.01 * delta;

    // Redraw glow ring
    this.glowRing.clear();
    this.glowRing.arc(0, 0, 50, 0, Math.PI * 2);
    this.glowRing.stroke({
      width: 4,
      color: colors.glow,
      alpha: 0.15 + Math.sin(this.pulsePhase) * 0.1,
    });

    // Individual petal breathing
    for (let i = 0; i < this.petals.length; i++) {
      const breathe =
        1 + Math.sin(this.pulsePhase * 0.9 + i * 0.8) * 0.04;
      this.petals[i].scale.x = breathe;
    }
  }

  onInteract(): void {
    this.emit('interact', this.type);
  }
}
