/**
 * WorldMap.ts
 *
 * Renders the 3000x3000 game world with 9 themed zones, decorative
 * ground patterns, and a highlighted spawn area.
 *
 * Architecture:
 *   - Ground layer: base fill + subtle checker tile pattern.
 *   - Zone layer: translucent colored overlays + borders per zone.
 *   - Decor layer: optional animated elements (flowers, particles).
 *
 * Zone layout (9 zones across 3000x3000):
 *   ┌─────────────────────────────────────┐
 *   │  Gallery    │  Community  │  Wind   │  y: 0-1000
 *   ├─────────────────────────────────────┤
 *   │  Hot Spring │   Artists   │  Shop   │  y: 1000-2000
 *   ├─────────────────────────────────────┤
 *   │  Minigame   │   Spawn*    │Reserved │  y: 2000-3000
 *   └─────────────────────────────────────┘
 *        x: 0-1000   1000-2000   2000-3000
 *
 * *Spawn is a special circular zone centered at (1500, 1500) with radius 200.
 */

import { Container, Graphics } from 'pixi.js';
import { ZONES, MAP_SIZE, COLORS, TILE_SIZE } from '../utils/constants';

export class WorldMap extends Container {
  /** Base ground fill + tile pattern. */
  private groundLayer: Graphics;

  /** Zone overlays, borders, and spawn ring. */
  private zoneLayer: Graphics;

  /** Optional decorative layer for grass tufts, pebbles, etc. */
  private decorLayer: Graphics;

  /** Pulse phase for animated spawn ring (0 → 2PI). */
  private pulsePhase: number = 0;

  /** Cached zone entries for iteration. */
  private zoneEntries: Array<{ name: string; zone: (typeof ZONES)[keyof typeof ZONES] }>;

  constructor() {
    super();

    this.groundLayer = new Graphics();
    this.zoneLayer = new Graphics();
    this.decorLayer = new Graphics();

    this.addChild(this.groundLayer, this.zoneLayer, this.decorLayer);

    // Pre-extract zone entries so we don't re-compute each frame.
    this.zoneEntries = Object.entries(ZONES).map(([name, zone]) => ({
      name,
      zone,
    }));

    this.drawGround();
    this.drawZones();
    this.drawDecor();
  }

  // ── Drawing ─────────────────────────────────────────────────────────────

  /** Fill the entire map with the base ground color and a subtle checker. */
  private drawGround(): void {
    // Base fill
    this.groundLayer.rect(0, 0, MAP_SIZE, MAP_SIZE);
    this.groundLayer.fill(COLORS.ground);

    // Subtle checker tile pattern every 4 tiles (128px if TILE_SIZE=32)
    const step = TILE_SIZE * 4;
    for (let x = 0; x < MAP_SIZE; x += step) {
      for (let y = 0; y < MAP_SIZE; y += step) {
        if (
          Math.floor(x / step + y / step) % 2 === 0
        ) {
          this.groundLayer.rect(x, y, step, step);
          this.groundLayer.fill(COLORS.groundAlt);
        }
      }
    }
  }

  /** Draw each zone as a translucent overlay with a colored border. */
  private drawZones(): void {
    for (const { name, zone } of this.zoneEntries) {
      // Zone fill (very subtle — just enough to give each area identity)
      this.zoneLayer.rect(zone.x, zone.y, zone.w, zone.h);
      this.zoneLayer.fill({ color: zone.color, alpha: 0.12 });

      // Zone border
      this.zoneLayer.rect(zone.x, zone.y, zone.w, zone.h);
      this.zoneLayer.stroke({
        width: 2,
        color: zone.color,
        alpha: 0.45,
      });
    }

    // ── Spawn ring (center of map) ──
    const spawnX = 1500;
    const spawnY = 1500;
    const spawnR = 200;

    // Outer ring stroke
    this.zoneLayer.circle(spawnX, spawnY, spawnR);
    this.zoneLayer.stroke({
      width: 3,
      color: COLORS.spawnRing,
      alpha: 0.6,
    });

    // Inner glow fill
    this.zoneLayer.circle(spawnX, spawnY, spawnR * 0.7);
    this.zoneLayer.fill({
      color: COLORS.spawnRing,
      alpha: 0.05,
    });

    // Center dot
    this.zoneLayer.circle(spawnX, spawnY, 6);
    this.zoneLayer.fill(COLORS.spawnRing);
  }

  /** Scatter small decorative shapes (grass tufts, pebbles) across the map. */
  private drawDecor(): void {
    // Use a seeded-like deterministic scatter so decor looks consistent
    // without needing a full PRNG. Period = 7919 (prime) to avoid patterns.
    const primeX = 7919;
    const primeY = 6271;

    for (let i = 0; i < 400; i++) {
      const x = ((i * primeX) % MAP_SIZE);
      const y = ((i * primeY * 3) % MAP_SIZE);

      // Small grass tuft — tiny triangle cluster
      this.decorLayer.moveTo(x, y);
      this.decorLayer.lineTo(x - 4, y + 8);
      this.decorLayer.lineTo(x + 4, y + 8);
      this.decorLayer.closePath();
      this.decorLayer.fill({ color: COLORS.grassTuft, alpha: 0.3 });
    }

    // A few larger decorative pebbles near paths
    for (let i = 0; i < 60; i++) {
      const px = ((i * primeX * 7 + 1000) % (MAP_SIZE - 200)) + 100;
      const py = ((i * primeY * 11 + 2000) % (MAP_SIZE - 200)) + 100;
      const r = 3 + ((i * 13) % 8);
      this.decorLayer.circle(px, py, r);
      this.decorLayer.fill({ color: COLORS.pebble, alpha: 0.25 });
    }
  }

  // ── Animation ───────────────────────────────────────────────────────────

  /**
   * Advance any animated map elements.
   * @param delta  PixiJS deltaTime (~1 at 60fps).
   */
  tick(delta: number): void {
    // Animate spawn ring pulse
    this.pulsePhase += 0.02 * delta;
    if (this.pulsePhase > Math.PI * 2) {
      this.pulsePhase -= Math.PI * 2;
    }

    // Redraw just the pulsing spawn ring (efficient — only 2 circles)
    const spawnX = 1500;
    const spawnY = 1500;
    const spawnR = 200;
    const pulseAlpha = 0.35 + Math.sin(this.pulsePhase) * 0.15;

    // Clear and redraw only the animated ring portion
    // Note: In PixiJS v8 we redraw the ring each frame for the pulse effect.
    // For a more optimized version, use a separate Graphics object.
    this.zoneLayer.clear();

    // Redraw all static zones
    for (const { name, zone } of this.zoneEntries) {
      this.zoneLayer.rect(zone.x, zone.y, zone.w, zone.h);
      this.zoneLayer.fill({ color: zone.color, alpha: 0.12 });
      this.zoneLayer.rect(zone.x, zone.y, zone.w, zone.h);
      this.zoneLayer.stroke({
        width: 2,
        color: zone.color,
        alpha: 0.45,
      });
    }

    // Pulsing spawn ring
    this.zoneLayer.circle(spawnX, spawnY, spawnR);
    this.zoneLayer.stroke({
      width: 3,
      color: COLORS.spawnRing,
      alpha: pulseAlpha,
    });

    this.zoneLayer.circle(spawnX, spawnY, spawnR * 0.7);
    this.zoneLayer.fill({
      color: COLORS.spawnRing,
      alpha: 0.03 + pulseAlpha * 0.04,
    });

    this.zoneLayer.circle(spawnX, spawnY, 6);
    this.zoneLayer.fill(COLORS.spawnRing);
  }
}
