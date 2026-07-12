// ============================================================
// FLOWER GAME v2 — FLOWER SPRITE (Pixi.js)
// Renders a single flower using animated GIF art.
// Uses AnimatedSprite with autoUpdate: false to avoid
// Ticker.shared dependency, calling update() manually.
// Glow is a shared radial-gradient sprite (fast, no filters).
// ============================================================

import { AnimatedSprite, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { FlowerColor } from '../../types/gameTypes';
import { flowerArt } from '../../utils/flowerArt';
import { loadGifAnimation, clearGifCache, type GifAnimation } from './GifAnimation';

const FLOWER_SIZE = 40;
const GLOW_RADIUS = 56;

const COLOR_MAP: Record<FlowerColor, number> = {
  blue: 0x3c8cff, purple: 0xc83cff, red: 0xff3c3c,
  orange: 0xff7800, yellow: 0xffe600, green: 0x3cdc64,
  black: 0xb4b4c8, rainbow: 0xffc83c,
  triple_rainbow: 0xffc83c, divine: 0xffd700,
};

const FLOWER_COLORS: FlowerColor[] = [
  'blue', 'purple', 'red', 'orange', 'yellow',
  'green', 'black', 'rainbow', 'triple_rainbow', 'divine',
];

// Shared soft radial-gradient glow texture (128×128, white center → transparent edge)
let _glowTexture: Texture | null = null;
function getGlowTexture(): Texture {
  if (_glowTexture) return _glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.90)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.50, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  _glowTexture = Texture.from(canvas);
  return _glowTexture;
}

// Module-level cache for GIF animations
const flowerAnimations = new Map<string, GifAnimation>();

export function clearFlowerTextures(): void {
  clearGifCache();
  flowerAnimations.clear();
}

export async function preloadFlowerTextures(): Promise<void> {
  // React Strict Mode can destroy textures from a previous mount — clear stale entries
  flowerAnimations.clear();
  clearGifCache();
  await Promise.all(
    FLOWER_COLORS.map(async (color) => {
      const url = flowerArt(color);
      try {
        const anim = await loadGifAnimation(url);
        if (anim && anim.frames.length > 0) {
          flowerAnimations.set(url, anim);
        }
      } catch (e) {
        // GIF load failure handled silently
      }
    })
  );
}

export class FlowerSprite {
  container: Container;
  private body: AnimatedSprite;
  private glow: Sprite;
  private inner: Graphics;

  targetX = 0;
  targetY = 0;
  isNew = false;

  private color: FlowerColor;
  private isWildcard: boolean;
  private isComplete = false;
  private isSolid = false;
  private isDivine = false;
  private isHighlighted = false;

  constructor(color: FlowerColor, isWildcard: boolean) {
    this.color = color;
    this.isWildcard = isWildcard;

    const url = flowerArt(color);
    const anim = flowerAnimations.get(url);

    this.container = new Container();

    // Glow layer (behind) — shared radial-gradient sprite, additive blend
    this.glow = new Sprite(getGlowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.visible = false;
    this.container.addChild(this.glow);

    // Flower body — animated GIF art via AnimatedSprite
    // autoUpdate: false → we drive updates manually via app ticker
    if (anim && anim.frames.length > 0) {
      const frames = anim.frames.map((f) => ({ texture: f.texture, time: f.delay }));
      this.body = new AnimatedSprite({
        textures: frames,
        autoUpdate: false,
        autoPlay: true,
        loop: true,
      });
    } else {
      // Fallback: white placeholder
      this.body = new AnimatedSprite({
        textures: [Texture.WHITE],
        autoUpdate: false,
        autoPlay: false,
      });
    }
    this.body.anchor.set(0.5);
    this.container.addChild(this.body);

    // Inner highlight
    this.inner = new Graphics();
    this.container.addChild(this.inner);

    this.draw();
  }

  setSetProperties(complete: boolean, solid: boolean, divine: boolean): void {
    const changed = this.isComplete !== complete || this.isSolid !== solid || this.isDivine !== divine;
    this.isComplete = complete;
    this.isSolid = solid;
    this.isDivine = divine;
    if (changed) this.draw();
  }

  setHighlighted(highlighted: boolean): void {
    if (this.isHighlighted !== highlighted) {
      this.isHighlighted = highlighted;
      this.draw();
    }
  }

  update(dt: number): void {
    const speed = 1 - Math.exp(-dt * 0.012);
    this.container.x += (this.targetX - this.container.x) * speed;
    this.container.y += (this.targetY - this.container.y) * speed;
    const targetScale = this.isHighlighted ? 1.3 : 1;
    const currentScale = this.container.scale.x;
    this.container.scale.set(currentScale + (targetScale - currentScale) * 0.15);

    // Drive AnimatedSprite manually with a fake ticker object
    // Pixi's AnimatedSprite.update() expects deltaTime in "frames" (60fps = 1)
    if (this.body.playing) {
      this.body.update({ deltaTime: dt * 60 / 1000 * 2 } as any);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private draw(): void {
    const hex = COLOR_MAP[this.color] || 0xffffff;
    const size = this.isDivine ? FLOWER_SIZE * 1.3 : this.color === 'triple_rainbow' ? FLOWER_SIZE * 1.5 : FLOWER_SIZE;

    // Glow — shared soft radial-gradient sprite with additive blend
    const glow = this.glow;
    if (this.isHighlighted) {
      glow.visible = true;
      glow.tint = 0xffffff;
      glow.alpha = 0.70;
      glow.scale.set((GLOW_RADIUS * 1.6) / 128);
    } else if (this.isDivine) {
      glow.visible = true;
      glow.tint = 0xffd700;
      glow.alpha = 0.55;
      glow.scale.set((GLOW_RADIUS * 1.5) / 128);
    } else if (this.isSolid) {
      // Bright color-matched glow — clearly stronger than complete set
      glow.visible = true;
      glow.tint = hex;
      glow.alpha = 0.75;
      glow.scale.set((GLOW_RADIUS * 1.55) / 128);
    } else if (this.isComplete) {
      // Softer glow — dimmer than solid set
      glow.visible = true;
      glow.tint = this.color === 'green' ? 0x4ecca3 : hex;
      glow.alpha = 0.35;
      glow.scale.set((GLOW_RADIUS * 1.4) / 128);
    } else {
      glow.visible = false;
    }

    // Scale body
    const artSize = 50;
    const scale = size / artSize;
    this.body.scale.set(scale);
    // No tint for rainbow, triple_rainbow, or divine — they render from GIF directly
    if (this.body.totalFrames > 1) {
      this.body.tint = this.color === 'rainbow' || this.color === 'triple_rainbow' || this.color === 'divine'
        ? 0xffffff
        : hex;
    }

    // Inner highlight
    this.inner.clear();
    this.inner.circle(-size * 0.15, -size * 0.15, size * 0.2);
    this.inner.fill({ color: 0xffffff, alpha: 0.25 });
  }
}
