/**
 * OrbitingArtwork.ts — A single framed artwork orbiting the gallery flower.
 *
 * The artwork travels along a flattened ellipse around GALLERY_CENTER, is
 * billboarded upright (always faces the viewer — a rotating painting would
 * look odd), and is depth-scaled + y-sorted so nearer artworks (bottom of the
 * ellipse) appear larger and overlap farther ones and the flower core.
 *
 * Interaction: DOUBLE-TAP (or double-click) opens the detail popup. Single tap
 * is ignored so it never fights click-to-move. A subtle hover highlight tells
 * the player it's interactive.
 *
 * The thumbnail uses a PixiJS Texture created from the shared procedural
 * canvas (see data/artworks.ts), so it matches the popup image exactly.
 */

import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import type { Artwork } from '../data/artworks';
import { generateArtworkCanvas, GALLERY_CENTER } from '../data/artworks';
import { lerp } from '../utils/math2d';

/** Callback fired when the artwork is double-tapped. */
export type ArtworkOpenHandler = (artwork: Artwork) => void;

export class OrbitingArtwork extends Container {
  /** The backing data for this artwork. */
  public readonly data: Artwork;

  /** Current orbit angle in radians. */
  private angle: number;

  /** The framed picture sprite. */
  private picture: Sprite;
  /** Frame + mat border drawn around the picture. */
  private frame: Graphics;
  /** Soft colored glow ring on the "floor" under the artwork. */
  private glow: Graphics;
  /** Hover highlight overlay (hidden unless hovered). */
  private hoverRing: Graphics;

  /** Double-tap detection state. */
  private lastTapTime = 0;
  private readonly DOUBLE_TAP_MS = 380;

  /** Handler invoked on double-tap. */
  private openHandler: ArtworkOpenHandler | null = null;

  /** Base world size of the picture (before depth scaling). */
  private readonly BASE_SIZE = 64;

  /** Gentle idle bob so the artwork feels alive. */
  private bobPhase: number;

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

    // ── Picture (procedural canvas → texture) ──
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
    // Generous square hit area around the picture for easy tapping.
    const hit = this.BASE_SIZE * 0.75;
    this.hitArea = new Rectangle(-hit, -hit, hit * 2, hit * 2);

    this.on('pointertap', this.handleTap, this);
    this.on('pointerover', () => { this.hoverRing.visible = true; });
    this.on('pointerout', () => { this.hoverRing.visible = false; });

    // Place at initial orbit position.
    this.updateOrbitPosition();
  }

  /** Register the double-tap → open-popup handler. */
  onOpen(handler: ArtworkOpenHandler): void {
    this.openHandler = handler;
  }

  // ── Drawing ─────────────────────────────────────────────────

  private drawFrame(): void {
    const g = this.frame;
    g.clear();
    const s = this.BASE_SIZE;
    // Outer dark wood frame
    g.roundRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24, 4);
    g.fill(0x5b4632);
    // Inner gold mat
    g.roundRect(-s * 0.56, -s * 0.56, s * 1.12, s * 1.12, 2);
    g.fill(0xd9c08a);
    // Inner shadow edge
    g.roundRect(-s * 0.52, -s * 0.52, s * 1.04, s * 1.04, 1);
    g.fill(0x2a2018);
  }

  private drawGlow(): void {
    const g = this.glow;
    g.clear();
    const color = this.data.palette[1] ?? 0xffffff;
    // A soft flattened ring beneath the artwork (ground glow).
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
    const now = performance.now();
    if (now - this.lastTapTime <= this.DOUBLE_TAP_MS) {
      // Double-tap detected
      this.lastTapTime = 0;
      this.openHandler?.(this.data);
    } else {
      this.lastTapTime = now;
    }
  }

  // ── Orbit + depth ───────────────────────────────────────────

  /**
   * Advance the orbit by `deltaMS` milliseconds and reposition the artwork.
   * Returns the artwork's current world Y (used by the parent for z-sorting).
   */
  tick(deltaMS: number): number {
    this.angle += this.data.orbitSpeed * deltaMS;
    this.bobPhase += 0.0016 * deltaMS;
    this.updateOrbitPosition();
    return this.y;
  }

  /** Compute position on the ellipse + apply depth scale/bob. */
  private updateOrbitPosition(): void {
    const r = this.data.orbitRadius;
    const squash = 1 - this.data.orbitTilt; // vertical flattening

    const ex = Math.cos(this.angle) * r;
    const ey = Math.sin(this.angle) * r * squash;

    // Gentle vertical bob for life
    const bob = Math.sin(this.bobPhase) * 3;

    this.x = GALLERY_CENTER.x + ex;
    this.y = GALLERY_CENTER.y + ey + bob;

    // Depth: bottom of ellipse (sin>0) is nearer the viewer → bigger.
    const depth = (Math.sin(this.angle) + 1) / 2; // 0 (far) … 1 (near)
    const scale = lerp(0.7, 1.2, depth);
    this.scale.set(scale); // scale the whole framed artwork for depth

    // Fade far artworks slightly for atmosphere.
    this.alpha = lerp(0.78, 1.0, depth);

    // Keep glow on the ground plane (counter the container scale a touch).
    this.glow.alpha = lerp(0.5, 1.0, depth);
  }

  /** True if this artwork is currently in front of the flower core. */
  isInFront(): boolean {
    return Math.sin(this.angle) > 0;
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
