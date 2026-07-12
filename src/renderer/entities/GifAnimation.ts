// ============================================================
// GIF ANIMATION — Parse flower GIFs into Pixi AnimatedSprite frames
// Uses gifuct-js (already in project)
// ============================================================

import { Texture } from 'pixi.js';
import { parseGIF, decompressFrames } from 'gifuct-js';

export interface GifFrame {
  texture: Texture;
  delay: number; // ms
}

export interface GifAnimation {
  frames: GifFrame[];
  width: number;
  height: number;
}

const gifCache = new Map<string, GifAnimation>();

// Proven path: canvas → PNG data URL → Image → Texture.from(img)
// Texture.from(canvas) silently fails on Sprites in this Pixi v8 setup.
async function canvasToTexture(canvas: HTMLCanvasElement): Promise<Texture> {
  const dataUrl = canvas.toDataURL('image/png');
  const img = new Image();
  img.src = dataUrl;
  // Wait for image to be fully decoded before creating texture
  await img.decode();
  return Texture.from(img);
}

export async function loadGifAnimation(url: string): Promise<GifAnimation | null> {
  if (gifCache.has(url)) return gifCache.get(url)!;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('fetch failed');
    const buf = await resp.arrayBuffer();
    const gif = parseGIF(buf);
    const frames = decompressFrames(gif, true);

    if (frames.length === 0) throw new Error('no frames');

    const gifW = gif.lsd.width;
    const gifH = gif.lsd.height;

    // Full-canvas buffer for compositing
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = gifW;
    fullCanvas.height = gifH;
    const fullCtx = fullCanvas.getContext('2d')!;

    const parsedFrames: GifFrame[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const imgData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);

      // Composite: handle disposal type
      if (frame.disposalType === 2) {
        fullCtx.clearRect(0, 0, gifW, gifH);
      }
      fullCtx.putImageData(imgData, frame.dims.left, frame.dims.top);

      // Create texture from composed frame
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = gifW;
      frameCanvas.height = gifH;
      const frameCtx = frameCanvas.getContext('2d')!;
      frameCtx.drawImage(fullCanvas, 0, 0);

      const texture = await canvasToTexture(frameCanvas);
      parsedFrames.push({
        texture,
        delay: (frame.delay || 10) * 10, // hundredths → ms
      });
    }

    const anim: GifAnimation = { frames: parsedFrames, width: gifW, height: gifH };
    gifCache.set(url, anim);
    return anim;
  } catch (e) {
    // Load failure handled silently
    return null;
  }
}

export function clearGifCache(): void {
  for (const anim of gifCache.values()) {
    for (const frame of anim.frames) {
      frame.texture.destroy(true);
    }
  }
  gifCache.clear();
}
