import React, { useRef, useEffect, useState } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';

interface GifPlayerProps {
  src: string;
  width: number;
  height: number;
  targetDuration: number; // ms — total time the GIF should play for
  repeat?: boolean;      // if true, loop the GIF during targetDuration
  onLoad?: () => void;
  onError?: () => void;
}

interface ParsedFrame {
  delay: number;        // scaled delay in ms
  imageData: ImageData;
  disposalType: number;
  dims: { left: number; top: number; width: number; height: number };
}

// Cap backing-store resolution to save GPU memory on mobile
const MAX_BACKING_W = 520;
const MAX_BACKING_H = 380;

export const GifPlayer = React.memo(function GifPlayer({
  src, width, height, targetDuration, repeat, onLoad, onError,
}: GifPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    async function loadAndPlay() {
      try {
        // Fetch GIF as ArrayBuffer
        const resp = await fetch(src);
        if (!resp.ok) throw new Error('fetch failed');
        const buf = await resp.arrayBuffer();
        const gif = parseGIF(buf);
        const frames = decompressFrames(gif, true);

        if (cancelled) return;
        if (frames.length === 0) throw new Error('no frames');

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const gifW = gif.lsd.width;
        const gifH = gif.lsd.height;

        // Cap backing-store resolution to reduce memory pressure on mobile
        const scale = Math.min(1, MAX_BACKING_W / gifW, MAX_BACKING_H / gifH);
        const displayW = Math.round(gifW * scale);
        const displayH = Math.round(gifH * scale);

        canvas.width = displayW;
        canvas.height = displayH;

        // Full-canvas buffer for compositing (at original resolution)
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = gifW;
        fullCanvas.height = gifH;
        const fullCtx = fullCanvas.getContext('2d')!;

        // Pre-render each frame patch
        const parsedFrames: ParsedFrame[] = [];
        for (const frame of frames) {
          const imgData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
          parsedFrames.push({
            delay: (frame.delay || 10) * 10, // hundredths → ms, default 100ms
            imageData: imgData,
            disposalType: frame.disposalType,
            dims: frame.dims,
          });
        }

        // Calculate total original (natural) duration
        const naturalDuration = parsedFrames.reduce((sum, f) => sum + f.delay, 0);

        let scaledFrames: ParsedFrame[];
        if (repeat) {
          scaledFrames = parsedFrames;
        } else {
          const timeScale = targetDuration / naturalDuration;
          scaledFrames = parsedFrames.map(f => ({
            ...f,
            delay: f.delay * timeScale,
          }));
        }

        if (cancelled) return;
        setReady(true);
        onLoad?.();

        // Playback loop
        const startTime = performance.now();

        const play = () => {
          const elapsed = performance.now() - startTime;

          if (elapsed >= targetDuration) {
            // Time's up — draw last frame and stop
            const last = scaledFrames[scaledFrames.length - 1];
            fullCtx.clearRect(0, 0, gifW, gifH);
            fullCtx.putImageData(last.imageData, last.dims.left, last.dims.top);
            ctx.drawImage(fullCanvas, 0, 0, displayW, displayH);
            return;
          }

          // Map elapsed time into the GIF timeline
          const loopTime = repeat ? (elapsed % naturalDuration) : elapsed;
          let accumulated = 0;
          let frameIndex = 0;

          while (frameIndex < scaledFrames.length && loopTime >= accumulated + scaledFrames[frameIndex].delay) {
            accumulated += scaledFrames[frameIndex].delay;
            frameIndex++;
          }

          if (frameIndex >= scaledFrames.length) {
            frameIndex = scaledFrames.length - 1;
          }

          // Re-compose all frames up to current frame (GIF requires cumulative compositing)
          fullCtx.clearRect(0, 0, gifW, gifH);
          for (let i = 0; i <= frameIndex; i++) {
            const f = scaledFrames[i];
            if (f.disposalType === 2 && i < frameIndex) {
              fullCtx.clearRect(0, 0, gifW, gifH);
            }
            fullCtx.putImageData(f.imageData, f.dims.left, f.dims.top);
          }

          ctx.drawImage(fullCanvas, 0, 0, displayW, displayH);
          rafRef.current = requestAnimationFrame(play);
        };

        rafRef.current = requestAnimationFrame(play);
      } catch {
        if (!cancelled) onError?.();
      }
    }

    loadAndPlay();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [src, targetDuration, repeat, onLoad, onError]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        objectFit: 'contain',
        opacity: ready ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    />
  );
});
