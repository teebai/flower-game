/**
 * Camera.ts
 *
 * Smooth-follow camera with configurable lerp and map-bound clamping.
 *
 * The camera maintains its own position and smoothly interpolates toward a
 * target point each frame. The interpolated position is then translated into
 * a world-container offset so that the target stays centered on screen.
 *
 * Usage:
 *   const camera = new Camera();
 *   camera.follow(playerPosition);
 *   // In game loop:
 *   camera.update(delta);
 *   camera.applyTo(worldContainer);
 */

import { Container, Point } from 'pixi.js';

/** Axis-aligned bounds used for clamping the camera position. */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class Camera {
  /** Current camera center in world space. */
  private position: Point = new Point(1500, 1500);

  /** Target point to follow (e.g., the player's world position). */
  private target: Point | null = null;

  /**
   * Base interpolation factor per frame at 60 fps.
   * Higher = snappier follow (0.15), lower = more floaty (0.03).
   */
  private lerpFactor: number = 0.08;

  /** Viewport dimensions in pixels. */
  private screenW: number = window.innerWidth;
  private screenH: number = window.innerHeight;

  /** Cached half-dimensions to avoid recomputing every frame. */
  private halfScreenW: number = this.screenW / 2;
  private halfScreenH: number = this.screenH / 2;

  /** World map size in pixels. */
  private readonly mapSize: number = 3000;

  /** Precomputed clamp bounds updated on resize. */
  private bounds: Bounds = this.computeBounds();

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Set the point the camera should follow.
   * Call every frame with the player's current world position, or once
   * when switching targets.
   */
  follow(target: Point): void {
    this.target = target;
  }

  /**
   * Adjust the follow smoothness.
   * @param factor  0.0–1.0 range (typical: 0.03–0.15). Default is 0.08.
   */
  setLerp(factor: number): void {
    this.lerpFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Advance the camera by one frame.
   *
   * @param delta  PixiJS deltaTime — normalized so ~1.0 at 60fps.
   *               Multiplied against lerpFactor to keep responsiveness
   *               consistent across frame rates.
   */
  update(delta: number): void {
    if (!this.target) return;

    // Scale lerp by delta so the follow speed feels the same at 30fps and 144fps.
    const adjustedLerp = this.lerpFactor * delta;

    // Smoothly interpolate current position toward the target.
    this.position.x += (this.target.x - this.position.x) * adjustedLerp;
    this.position.y += (this.target.y - this.position.y) * adjustedLerp;

    // Clamp so the camera never shows beyond the map edges.
    // The clamp range accounts for the viewport centering offset.
    this.position.x = Math.max(
      this.bounds.minX,
      Math.min(this.bounds.maxX, this.position.x),
    );
    this.position.y = Math.max(
      this.bounds.minY,
      Math.min(this.bounds.maxY, this.position.y),
    );
  }

  /**
   * Apply the camera transform to a world container.
   * This offsets the container so the camera's position lands at screen center.
   */
  applyTo(container: Container): void {
    container.position.set(
      this.halfScreenW - this.position.x,
      this.halfScreenH - this.position.y,
    );
  }

  /**
   * Convert screen coordinates (e.g., mouse click) to world coordinates.
   */
  screenToWorld(screenX: number, screenY: number): Point {
    return new Point(
      screenX - this.halfScreenW + this.position.x,
      screenY - this.halfScreenH + this.position.y,
    );
  }

  /**
   * Convert world coordinates to screen coordinates.
   * Useful for positioning UI elements over world objects.
   */
  worldToScreen(worldX: number, worldY: number): Point {
    return new Point(
      worldX + this.halfScreenW - this.position.x,
      worldY + this.halfScreenH - this.position.y,
    );
  }

  /**
   * Update viewport dimensions (call on window resize).
   */
  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
    this.halfScreenW = w / 2;
    this.halfScreenH = h / 2;
    this.bounds = this.computeBounds();
  }

  /** Get the camera's current center position in world space. */
  getPosition(): Readonly<Point> {
    return this.position;
  }

  /** Get the camera's current viewport dimensions. */
  getViewport(): { w: number; h: number } {
    return { w: this.screenW, h: this.screenH };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /** Recompute clamp bounds based on current screen and map size. */
  private computeBounds(): Bounds {
    return {
      minX: this.halfScreenW,
      minY: this.halfScreenH,
      maxX: this.mapSize - this.halfScreenW,
      maxY: this.mapSize - this.halfScreenH,
    };
  }
}
