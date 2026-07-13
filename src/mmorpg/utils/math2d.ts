/**
 * math2d.ts — 2D vector math, angle conversion, and easing utilities
 *
 * All angle functions use the convention: 0° = East, increasing clockwise.
 * This matches PixiJS screen coordinates (Y-down) and common game dev usage.
 */

// ── Vec2 ────────────────────────────────────────────────────────────────────

export class Vec2 {
  constructor(public x: number, public y: number) {}

  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }

  mul(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vec2 {
    const len = this.length();
    return len === 0 ? new Vec2(0, 0) : new Vec2(this.x / len, this.y / len);
  }

  distance(v: Vec2): number {
    return this.sub(v).length();
  }

  /** Angle in degrees, 0=East, clockwise (matches PixiJS Y-down). */
  angle(): number {
    return (Math.atan2(-this.y, this.x) * 180 / Math.PI + 360) % 360;
  }

  static fromAngle(deg: number): Vec2 {
    const rad = deg * Math.PI / 180;
    return new Vec2(Math.cos(rad), -Math.sin(rad));
  }
}

// ── Angle <-> Direction ─────────────────────────────────────────────────────

/**
 * Convert an angle (degrees, 0=East, CW) to one of 8 directions.
 *
 * Returns the canonical direction name and whether it should be horizontally
 * flipped. 5 unique directions are drawn (E, SE, S, SW, W); the other 3
 * (NE, N, NW) are obtained by flipping SE, S, SW respectively.
 */
export function angleToDirection8(
  angleDeg: number,
): { name: string; flip: boolean } {
  const normalized = ((angleDeg % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;

  const dirs = [
    { name: 'E', flip: false },   // 0°
    { name: 'SE', flip: false },  // 45°
    { name: 'S', flip: false },   // 90°
    { name: 'SW', flip: false },  // 135°
    { name: 'W', flip: false },   // 180°
    { name: 'SW', flip: true },   // 225° → mirrored NW
    { name: 'S', flip: true },    // 270° → mirrored N
    { name: 'SE', flip: true },   // 315° → mirrored NE
  ];

  return dirs[idx];
}

/**
 * Compute the angle from point A to point B in screen coordinates.
 * Result: 0° = East, increasing clockwise, range [0, 360).
 */
export function pointsToAngle(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const dx = toX - fromX;
  const dy = -(toY - fromY); // flip Y for screen coords
  return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

// ── Interpolation & Easing ──────────────────────────────────────────────────

/** Linear interpolation: a + (b-a) * t */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** Ease-out cubic: fast start, gentle deceleration. NOT for wind parametric curves. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
}

/** Ease-in-out sine: smooth acceleration and deceleration. */
export function easeInOutSine(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * c) - 1) / 2;
}

/** Clamp a value to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Collision ───────────────────────────────────────────────────────────────

/** Point-in-rectangle test (inclusive). */
export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/** Circle-circle collision using squared distance (no sqrt). */
export function circleCollision(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy <= (r1 + r2) * (r1 + r2);
}

// ── Culling ─────────────────────────────────────────────────────────────────

/**
 * Check if an entity is within (or near) the camera viewport.
 * @param padding  Extra margin in pixels beyond the viewport edges.
 */
export function isOnScreen(
  entityX: number,
  entityY: number,
  cameraX: number,
  cameraY: number,
  screenW: number,
  screenH: number,
  padding: number = 100,
): boolean {
  const halfW = screenW / 2;
  const halfH = screenH / 2;
  const left = cameraX - halfW - padding;
  const right = cameraX + halfW + padding;
  const top = cameraY - halfH - padding;
  const bottom = cameraY + halfH + padding;
  return entityX >= left && entityX <= right && entityY >= top && entityY <= bottom;
}
