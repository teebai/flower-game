/**
 * SteamParticle.ts — Rising steam particle system for the Hot Spring zone.
 *
 * Soft white puffs rise from a configurable spawn area, growing and fading
 * as they ascend. Natural movement includes horizontal drift and sinusoidal
 * wobble for an organic feel.
 */

import { Container, Graphics } from 'pixi.js';

interface SteamPuff {
  graphics: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  initialAlpha: number;
  wobblePhase: number;
  wobbleSpeed: number;
}

export class SteamParticleSystem extends Container {
  private puffs: SteamPuff[] = [];
  private spawnTimer: number = 0;
  private spawnRate: number = 200; // ms between spawns
  private spawnArea: { x: number; y: number; w: number; h: number };
  private windForce: number = 0;

  /** Maximum simultaneous puffs for performance. */
  private readonly MAX_PUFFS = 120;

  constructor(spawnX: number, spawnY: number, spawnW: number, spawnH: number) {
    super();
    this.spawnArea = { x: spawnX, y: spawnY, w: spawnW, h: spawnH };
  }

  /** Set a global horizontal wind force (for ambient drift). */
  setWind(force: number): void {
    this.windForce = force;
  }

  tick(deltaMS: number): void {
    // Clamp delta to prevent spiral of death on lag spikes
    const dt = Math.min(deltaMS, 50);

    // Spawn new puffs
    this.spawnTimer += dt;
    while (this.spawnTimer >= this.spawnRate && this.puffs.length < this.MAX_PUFFS) {
      this.spawnTimer -= this.spawnRate;
      this.spawnPuff();
    }

    // Update existing puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.life -= dt;

      if (puff.life <= 0) {
        this.removeChild(puff.graphics);
        puff.graphics.destroy();
        this.puffs.splice(i, 1);
        continue;
      }

      const t = puff.life / puff.maxLife;

      // Movement: rise + drift + wobble
      puff.wobblePhase += puff.wobbleSpeed * dt * 0.001;
      const wobble = Math.sin(puff.wobblePhase) * 15;

      puff.graphics.x += (puff.vx + this.windForce + wobble) * dt * 0.001;
      puff.graphics.y += puff.vy * dt * 0.001;

      // Fade and grow
      puff.graphics.alpha = t * puff.initialAlpha;
      const scale = 1 + (1 - t) * 2; // grow from 1x to 3x
      puff.graphics.scale.set(scale);
    }
  }

  private spawnPuff(): void {
    const g = new Graphics();

    // Double-circle draw for soft hand-drawn feel
    const r = 8 + Math.random() * 12;
    g.circle(0, 0, r);
    g.fill(0xffffff, 0.2);
    g.circle(0, 0, r * 0.6);
    g.fill(0xffffff, 0.15);

    g.x = this.spawnArea.x + Math.random() * this.spawnArea.w;
    g.y = this.spawnArea.y + Math.random() * this.spawnArea.h;
    this.addChild(g);

    this.puffs.push({
      graphics: g,
      vx: (Math.random() - 0.5) * 20,
      vy: -30 - Math.random() * 40, // rise up
      life: 2000 + Math.random() * 1500,
      maxLife: 3500,
      initialAlpha: 0.2 + Math.random() * 0.3,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 2 + Math.random() * 3,
    });
  }

  /** Get current puff count (for debug/performance monitoring). */
  getPuffCount(): number {
    return this.puffs.length;
  }
}
