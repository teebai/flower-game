// ============================================================
// ANIMATED GIF SPRITE — Single canvas texture updated each frame
// Parses GIF with gifuct-js, draws current frame to canvas,
// updates Pixi texture. Uses only ONE canvas + ONE texture.
// ============================================================

import { Container, Sprite, Texture } from 'pixi.js';
import { parseGIF, decompressFrames } from 'gifuct-js';

interface ParsedFrame {
  imageData: ImageData;
  dims: { left: number; top: number; width: number; height: number };
  delay: number; // ms
  disposalType: number;
}

interface GifData {
  frames: ParsedFrame[];
  width: number;
  height: number;
  naturalDuration: number;
}

const gifDataCache = new Map<string, GifData>();

async function loadGifData(url: string): Promise<GifData | null> {
  if (gifDataCache.has(url)) return gifDataCache.get(url)!;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch failed');
    const buf = await resp.arrayBuffer();
    const gif = parseGIF(buf);
    const frames = decompressFrames(gif, true);
    if (frames.length === 0) throw new Error('no frames');

    const gifW = gif.lsd.width;
    const gifH = gif.lsd.height;

    const parsedFrames: ParsedFrame[] = frames.map((frame) => ({
      imageData: new ImageData(frame.patch, frame.dims.width, frame.dims.height),
      dims: frame.dims,
      delay: (frame.delay || 10) * 10,
      disposalType: frame.disposalType,
    }));

    const naturalDuration = parsedFrames.reduce((sum, f) => sum + f.delay, 0);
    const data: GifData = { frames: parsedFrames, width: gifW, height: gifH, naturalDuration };
    gifDataCache.set(url, data);
    return data;
  } catch (e) {
    // GIF load failure handled silently
    return null;
  }
}

export function clearGifDataCache(): void {
  gifDataCache.clear();
}

export class AnimatedGifSprite {
  container: Container;
  private sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: Texture;

  private frames: ParsedFrame[] = [];
  private gifWidth = 0;
  private gifHeight = 0;
  private naturalDuration = 0;
  private elapsed = 0;
  private playing = true;

  constructor(url: string) {
    this.container = new Container();

    this.canvas = document.createElement('canvas');
    this.canvas.width = 50;
    this.canvas.height = 50;
    this.ctx = this.canvas.getContext('2d')!;

    // Proven path: data URL → Image → Texture.from(img)
    const placeholder = new Image();
    placeholder.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    this.texture = Texture.from(placeholder);

    this.sprite = new Sprite({ texture: this.texture });
    this.sprite.anchor.set(0.5);
    this.container.addChild(this.sprite);

    this.load(url);
  }

  private async load(url: string): Promise<void> {
    const data = await loadGifData(url);
    if (!data || data.frames.length === 0) return;

    this.frames = data.frames;
    this.gifWidth = data.width;
    this.gifHeight = data.height;
    this.naturalDuration = data.naturalDuration;

    this.canvas.width = data.width;
    this.canvas.height = data.height;

    // Convert canvas to data URL once loaded, then create proper texture
    const dataUrl = this.canvas.toDataURL('image/png');
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); });
    this.texture = Texture.from(img);
    this.sprite.texture = this.texture;
  }

  update(dt: number): void {
    if (!this.playing || this.frames.length === 0 || this.naturalDuration <= 0) return;

    this.elapsed += dt;
    const loopTime = this.elapsed % this.naturalDuration;

    let accumulated = 0;
    let frameIndex = 0;
    while (frameIndex < this.frames.length && loopTime >= accumulated + this.frames[frameIndex].delay) {
      accumulated += this.frames[frameIndex].delay;
      frameIndex++;
    }
    if (frameIndex >= this.frames.length) frameIndex = this.frames.length - 1;

    // Compose all frames up to current
    this.ctx.clearRect(0, 0, this.gifWidth, this.gifHeight);
    for (let i = 0; i <= frameIndex; i++) {
      const f = this.frames[i];
      if (f.disposalType === 2 && i < frameIndex) {
        this.ctx.clearRect(0, 0, this.gifWidth, this.gifHeight);
      }
      this.ctx.putImageData(f.imageData, f.dims.left, f.dims.top);
    }

    // Update Pixi texture — in v8, canvas textures may need source update
    (this.texture.source as any).update?.();
  }

  play(): void {
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
  }

  destroy(): void {
    this.texture.destroy(true);
    this.container.destroy({ children: true });
  }
}
