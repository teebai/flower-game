/**
 * PlayerController.ts
 *
 * Handles all player input: WASD/Arrow keyboard movement and
 * click-to-move pathing. Integrates with the wind system by disabling
 * input during wind flights.
 *
 * Movement model:
 *   - Keyboard: 8-directional (cardinal + diagonal), normalized.
 *   - Click-to-move: single target point, character walks toward it.
 *   - Click overrides keyboard while active; keyboard cancels click-to-move.
 *
 * The controller outputs position + facing angle each frame so that
 * the camera, zone manager, and network sync layer can consume them.
 */

import { Container, Point } from 'pixi.js';
import { Character } from '../entities/Character';
import { PLAYER_SPEED, MAP_SIZE } from '../utils/constants';
import { pointsToAngle, clamp } from '../utils/math2d';

/**
 * Normalized key names for consistent lookup regardless of
 * keyboard layout or caps state.
 */
const KEY = {
  W: 'w',
  A: 'a',
  S: 's',
  D: 'd',
  ARROW_UP: 'arrowup',
  ARROW_DOWN: 'arrowdown',
  ARROW_LEFT: 'arrowleft',
  ARROW_RIGHT: 'arrowright',
} as const;

export class PlayerController {
  /** The character this controller drives. */
  private character: Character;

  /** Currently held keys (normalized to lowercase). */
  private keys: Set<string> = new Set();

  /**
   * Click-to-move target. When set, the character walks toward this point.
   * Cleared when the character arrives (within arrival threshold).
   */
  private moveTarget: Point | null = null;

  /** Whether input is currently accepted. Set to false during wind, menus, etc. */
  private enabled: boolean = true;

  /** Distance in pixels at which click-to-move considers the target reached. */
  private readonly ARRIVAL_THRESHOLD = 5;

  /** Forwarded each frame when the character actually moves. */
  public onMove: (
    (x: number, y: number, angle: number) => void
  ) | null = null;

  /** Forwarded when the character starts or stops walking (for animation). */
  public onWalkingChange: ((isWalking: boolean) => void) | null = null;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  constructor(character: Character) {
    this.character = character;
    this.setupInput();
  }

  /** Bind global keyboard listeners. */
  private setupInput(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  /** Enable or disable all input (called by WindEffect, menus, etc.). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.moveTarget = null;
      this.character.setWalking(false);
      this.onWalkingChange?.(false);
    }
  }

  /** Returns whether the controller is currently accepting input. */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ── Input handlers ──────────────────────────────────────────────────────

  /**
   * Set a click-to-move target.
   * Call this from the game's pointer-down handler with world coordinates.
   */
  handleClick(worldX: number, worldY: number): void {
    if (!this.enabled) return;
    this.moveTarget = new Point(worldX, worldY);
  }

  /** Cancel any active click-to-move (e.g., on right-click or ability cast). */
  cancelClickMove(): void {
    this.moveTarget = null;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.keys.add(key);

    // Keyboard input cancels click-to-move so the player can override.
    if (
      [
        KEY.W,
        KEY.A,
        KEY.S,
        KEY.D,
        KEY.ARROW_UP,
        KEY.ARROW_DOWN,
        KEY.ARROW_LEFT,
        KEY.ARROW_RIGHT,
      ].includes(key)
    ) {
      this.moveTarget = null;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  // ── Per-frame update ────────────────────────────────────────────────────

  /**
   * Process input and update character position.
   *
   * @param delta   PixiJS deltaTime (~1.0 at 60fps).
   * @param deltaMS Wall-clock milliseconds since last frame.
   */
  update(delta: number, _deltaMS: number): void {
    if (!this.enabled) return;

    let dx = 0;
    let dy = 0;

    // ── Keyboard input ──
    const up =
      this.keys.has(KEY.W) || this.keys.has(KEY.ARROW_UP);
    const down =
      this.keys.has(KEY.S) || this.keys.has(KEY.ARROW_DOWN);
    const left =
      this.keys.has(KEY.A) || this.keys.has(KEY.ARROW_LEFT);
    const right =
      this.keys.has(KEY.D) || this.keys.has(KEY.ARROW_RIGHT);

    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;

    // Normalize diagonal movement so going NW isn't faster than N.
    const keyLen = Math.sqrt(dx * dx + dy * dy);
    if (keyLen > 0) {
      dx /= keyLen;
      dy /= keyLen;
    }

    // ── Click-to-move override ──
    if (this.moveTarget) {
      const tdx = this.moveTarget.x - this.character.x;
      const tdy = this.moveTarget.y - this.character.y;
      const tLen = Math.sqrt(tdx * tdx + tdy * tdy);

      if (tLen < this.ARRIVAL_THRESHOLD) {
        // Arrived — clear target
        this.moveTarget = null;
      } else {
        // Override keyboard vector with direction to target
        dx = tdx / tLen;
        dy = tdy / tLen;
      }
    }

    // ── Apply movement ──
    const isMoving = keyLen > 0 || this.moveTarget !== null;

    if (isMoving) {
      // Scale speed by delta so movement is frame-rate independent.
      const speed = PLAYER_SPEED * (delta / 60);
      this.character.x += dx * speed;
      this.character.y += dy * speed;

      // Face movement direction.
      // -dy because PixiJS Y increases downward, but our angle
      // convention has 0 = east, PI/2 = north (up on screen).
      const angle = pointsToAngle(0, 0, dx, -dy);
      this.character.setDirection(angle);
      this.character.setWalking(true);

      // Notify subscribers (camera, zone manager, network).
      this.onMove?.(this.character.x, this.character.y, angle);
      this.onWalkingChange?.(true);
    } else {
      this.character.setWalking(false);
      this.onWalkingChange?.(false);
    }

    // ── Clamp to map bounds ──
    this.character.x = clamp(this.character.x, 0, MAP_SIZE);
    this.character.y = clamp(this.character.y, 0, MAP_SIZE);
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** Current character position (synced to world each frame). */
  getPosition(): { x: number; y: number } {
    return { x: this.character.x, y: this.character.y };
  }

  /** Direct access to the controlled character. */
  getCharacter(): Character {
    return this.character;
  }

  /** Clean up event listeners (call on scene destroy). */
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.keys.clear();
    this.moveTarget = null;
    this.onMove = null;
    this.onWalkingChange = null;
  }
}
