/**
 * OrbitingArtwork.ts — A single framed artwork that lives in the gallery.
 *
 * LIFECYCLE
 *   hidden  → the artwork is not visible yet (gallery starts empty)
 *   emerging→ it flies out of the flower centre to its orbit position
 *   orbiting→ it drifts along its elliptical orbit indefinitely
 *
 * The gallery flower triggers `bloom()` on every artwork when tapped. Each
 * piece starts collapsed at the flower centre (scale 0, alpha 0) and animates
 * outward along its orbit angle to its ring radius with a slight overshoot,
 * staggered so they blossom one after another.
 *
 * While orbiting, the artwork is billboarded upright, depth-scaled and
 * y-sorted so nearer pieces (bottom of the ellipse) overlap farther ones and
 * the flower core.
 *
 * Interaction: DOUBLE-TAP opens the detail popup. Single tap is ignored so it
 * never fights click-to-move. A subtle hover ring hints it is interactive.
 */

import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import type { Artwork } from '../data/artworks';
import { generateArtworkCanvas, GALLERY_CENTER } from '../data/artworks';
import { lerp } from '../utils/math2d';

/** Callback fired when the artwork is double-tapped. */
export type ArtworkOpenHandler = (artwork: Artwork) => void;

type EmergeState = 'hidden' | 'emerging' | 'orbiting';

/** Ease-out with a gentle overshoot — gives the bloom a soft "pop". */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class OrbitingArtwork extends Container {
  /** The backing data for this artwork. */
  public readonly data: Artwork;

  /** Current orbit angle in radians. */
  private angle: number;

  private picture: Sprite;
  private frame: Graphics;
  private glow: Graphics;
  private hoverRing: Graphics;

  /** Double-tap detection state. */
  private lastTapTime = 0;
  private readonly DOUBLE_TAP_MS = 380;

  private openHandler: ArtworkOpenHandler | null = null;

  /** Base world size of the picture (before depth scaling). */
  private readonly BASE_SIZE = 64;

  /** Gentle idle bob so the artwork feels alive. */
  private bobPhase: number;

  /* ── Emerge animation state ── */
  private emergeState: EmergeState = 'hidden';
  private emergeElapsed = 0;
  private emergeDelayMs = 0;
  private readonly EMERGE_MS = 1000;

  constructor(data: Artwork) {
    super();
    this.data = data;
    this.angle = data.orbitOffset;
    this.bobPhase = data.orbitOffset * 3.1;
    this.sortableChildren = true;

    // ── Glow ring (lowest layer) ──
    this.glow = new Graphics();
    this.glow.zIndex = 0;
    this.addChild(this.glow);

    // ── Frame ──
    this.frame = new Graphics();
    this.frame.zIndex = 1;
    this.addChild(this.frame);

    // ── Picture (procedural canvas → texture, in-world thumbnail) ──
    const canvas = generateArtworkCanvas(data, 128);
    const texture = Texture.from(canvas);
    this.picture = new Sprite(texture);
    this.picture.anchor.set(0.5);
    this.picture.width = this.BASE_SIZE;
    this.picture.height = this.BASE_SIZE;
    this.picture.zIndex = 2;
    this.addChild(this.picture);

    // ── Hover ring (top, hidden by default) ──
    this.hoverRing = new Graphics();
    this.hoverRing.zIndex = 3;
    this.hoverRing.visible = false;
    this.addChild(this.hoverRing);

    this.drawFrame();
    this.drawGlow();
    this.drawHoverRing();

    // ── Interactivity ──
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hit = this.BASE_SIZE * 0.75;
    this.hitArea = new Rectangle(-hit, -hit, hit * 2, hit * 2);

    this.on('pointertap', this.handleTap, this);
    this.on('pointerover', () => { this.hoverRing.visible = true; });
    this.on('pointerout', () => { this.hoverRing.visible = false; });

    // Start collapsed + invisible at the flower centre.
    this.visible = false;
    this.updateOrbitPosition(0);
  }

  /** Register the double-tap → open-popup handler. */
  onOpen(handler: ArtworkOpenHandler): void {
    this.openHandler = handler;
  }

  /**
   * Begin the bloom: the artwork flies out of the flower centre to its orbit.
   * @param delayMs  Stagger delay before this piece starts moving.
   */
  bloom(delayMs = 0): void {
    if (this.emergeState !== 'hidden') return;
    this.emergeState = 'emerging';
    this.emergeElapsed = 0;
    this.emergeDelayMs = delayMs;
    this.visible = true;
    this.updateOrbitPosition(0);
    this.alpha = 0;
  }

  /** True once the piece has finished emerging and is in steady orbit. */
  isOrbiting(): boolean {
    return this.emergeState === 'orbiting';
  }

  // ── Drawing ─────────────────────────────────────────────────

  private drawFrame(): void {
    const g = this.frame;
    g.clear();
    const s = this.BASE_SIZE;
    g.roundRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24, 4);
    g.fill(0x5b4632);
    g.roundRect(-s * 0.56, -s * 0.56, s * 1.12, s * 1.12, 2);
    g.fill(0xd9c08a);
    g.roundRect(-s * 0.52, -s * 0.52, s * 1.04, s * 1.04, 1);
    g.fill(0x2a2018);
  }

  private drawGlow(): void {
    const g = this.glow;
    g.clear();
    const color = this.data.palette[1] ?? 0xffffff;
    g.ellipse(0, this.BASE_SIZE * 0.55, this.BASE_SIZE * 0.7, this.BASE_SIZE * 0.28);
    g.fill({ color, alpha: 0.28 });
    g.ellipse(0, this.BASE_SIZE * 0.55, this.BASE_SIZE * 0.45, this.BASE_SIZE * 0.18);
    g.fill({ color, alpha: 0.22 });
  }

  private drawHoverRing(): void {
    const g = this.hoverRing;
    g.clear();
    const s = this.BASE_SIZE;
    g.roundRect(-s * 0.66, -s * 0.66, s * 1.32, s * 1.32, 6);
    g.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  }

  // ── Interaction ─────────────────────────────────────────────

  private handleTap(): void {
    // Ignore taps until the piece has fully emerged.
    if (this.emergeState !== 'orbiting') return;
    const now = performance.now();
    if (now - this.lastTapTime <= this.DOUBLE_TAP_MS) {
      this.lastTapTime = 0;
      this.openHandler?.(this.data);
    } else {
      this.lastTapTime = now;
    }
  }

  // ── Per-frame update ────────────────────────────────────────

  /**
   * Advance the artwork by `deltaMS` milliseconds.
   * Returns the artwork's current world Y (used by the parent for z-sorting).
   */
  tick(deltaMS: number): number {
    if (this.emergeState === 'hidden') {
      return this.y;
    }

    if (this.emergeState === 'emerging') {
      this.emergeElapsed += deltaMS;
      if (this.emergeElapsed < this.emergeDelayMs) {
        // Still waiting for its staggered start — stay collapsed at centre.
        this.updateOrbitPosition(0);
        this.alpha = 0;
      } else {
        const localT = (this.emergeElapsed - this.emergeDelayMs) / this.EMERGE_MS;
        const t = Math.min(1, localT);
        const eased = easeOutBack(t);
        this.updateOrbitPosition(eased);
        // Fade in over the first two-thirds of the flight.
        this.alpha = Math.min(1, t / 0.66);
        if (t >= 1) {
          this.emergeState = 'orbiting';
        }
      }
      return this.y;
    }

    // ── Steady orbiting ──
    this.angle += this.data.orbitSpeed * deltaMS;
    this.bobPhase += 0.0016 * deltaMS;
    this.updateOrbitPosition(1);
    return this.y;
  }

  /**
   * Position the artwork on its ellipse, scaled by `radiusMul` (0 = collapsed
   * at the flower centre, 1 = full orbit). Also applies depth scale and bob.
   */
  private updateOrbitPosition(radiusMul: number): void {
    const r = this.data.orbitRadius * radiusMul;
    const squash = 1 - this.data.orbitTilt;

    const ex = Math.cos(this.angle) * r;
    const ey = Math.sin(this.angle) * r * squash;
    const bob = Math.sin(this.bobPhase) * 3 * radiusMul;

    this.x = GALLERY_CENTER.x + ex;
    this.y = GALLERY_CENTER.y + ey + bob;

    // Depth: bottom of ellipse (sin>0) is nearer the viewer → bigger.
    const depth = (Math.sin(this.angle) + 1) / 2; // 0 (far) … 1 (near)
    const scale = lerp(0.7, 1.2, depth) * radiusMul;
    this.scale.set(scale);

    // Alpha: depth-based while orbiting; handled separately while emerging.
    if (this.emergeState === 'orbiting') {
      this.alpha = lerp(0.78, 1.0, depth);
    }

    this.glow.alpha = lerp(0.5, 1.0, depth) * radiusMul;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  destroy(options?: { children?: boolean; texture?: boolean }): void {
    this.picture.texture.destroy(true);
    this.picture.destroy();
    this.frame.destroy();
    this.glow.destroy();
    this.hoverRing.destroy();
    super.destroy(options);
  }
}
