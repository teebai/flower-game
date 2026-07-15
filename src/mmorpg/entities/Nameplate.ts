/**
 * Nameplate.ts — Floating text label above a character's head.
 *
 * Renders as a Pixi Text object that follows the character's world
 * position. Used to show player names above characters in the MMORPG.
 *
 * The nameplate sits on the world container and updates its position
 * every frame to match the character it tracks.
 */

import { Container, Text } from 'pixi.js';

const NAMEPLATE_STYLE = {
  fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
  fontSize: 11,
  fontWeight: '700' as const,
  fill: 0xFFFFFF,
  stroke: {
    width: 2.5,
    color: 0x000000,
    join: 'round' as const,
  },
  letterSpacing: 0.5,
  align: 'center' as const,
};

/**
 * A floating name label that follows a target character.
 * Add this as a sibling of the character in the world container.
 */
export class Nameplate extends Text {
  private target: { x: number; y: number };
  private bobPhase: number;
  private bobSpeed: number;
  private bobAmplitude: number;

  /**
   * @param name — The display name (e.g. "teebai" or "Garden Guest 1234")
   * @param target — Object with {x, y} that the nameplate will follow
   *                (pass the character itself — it has x/y properties)
   */
  constructor(name: string, target: { x: number; y: number }) {
    super({ text: name, style: NAMEPLATE_STYLE });
    this.target = target;
    this.anchor.set(0.5, 1); // center horizontally, bottom-aligned
    this.bobPhase = Math.random() * Math.PI * 2;
    this.bobSpeed = 1.5 + Math.random() * 0.8;
    this.bobAmplitude = 1.5;
    this.zIndex = 999; // above most world objects
    this.alpha = 0.92;

    // Initial position
    this.updatePosition();
  }

  /**
   * Call this every frame. Updates the nameplate position to follow
   * the target with a gentle floating bob animation.
   * @param deltaMS — elapsed time in milliseconds
   */
  tick(deltaMS: number): void {
    this.updatePosition(deltaMS);
  }

  private updatePosition(deltaMS?: number): void {
    // Position above the character's head (approximately -70px above center)
    const baseY = this.target.y - 72;

    // Gentle bob animation
    let bobOffset = 0;
    if (deltaMS) {
      this.bobPhase += (deltaMS / 1000) * this.bobSpeed;
      bobOffset = Math.sin(this.bobPhase) * this.bobAmplitude;
    }

    this.x = this.target.x;
    this.y = baseY + bobOffset;
  }

  /** Update the displayed name. */
  setName(name: string): void {
    this.text = name;
  }

  /** Update the target reference (e.g. when character changes). */
  setTarget(target: { x: number; y: number }): void {
    this.target = target;
  }

  /**
   * Fade the nameplate in/out. Useful for culling off-screen characters.
   * @param visible — whether the nameplate should be visible
   * @param duration — fade duration in ms
   */
  setVisible(visible: boolean, duration = 200): void {
    const targetAlpha = visible ? 0.92 : 0;
    if (duration <= 0) {
      this.alpha = targetAlpha;
      return;
    }
    // Simple fade — can be enhanced with a proper tween if needed
    const startAlpha = this.alpha;
    const startTime = performance.now();
    const tickFade = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      this.alpha = startAlpha + (targetAlpha - startAlpha) * t;
      if (t < 1) requestAnimationFrame(tickFade);
    };
    requestAnimationFrame(tickFade);
  }
}
