/**
 * CloudTunnelCanvas.tsx — Infinite "flight into heaven" cloud tunnel.
 *
 * Canvas 2D renderer:
 * - Bright sky gradient background (white → soft pink/blue).
 * - Pre-rendered soft cloud-puff sprites projected through a tunnel with
 *   z-depth: clouds spawn far away (small, near the centre) and stream
 *   toward the viewer (growing + drifting outward), recycling seamlessly at
 *   the near plane — an endless forward flight with no visible loop.
 * - Occasional iridescent light rays: subtle translucent diagonal beams
 *   with soft rainbow gradients fading in/out at random spots.
 *
 * Set `accelerating` to speed the tunnel up (used by the enter-world
 * transition). jsdom has no canvas 2D context — when getContext('2d')
 * returns null the component renders a static CSS-gradient fallback instead.
 */

import { useEffect, useRef, useState } from 'react';

interface CloudTunnelCanvasProps {
  /** True while the enter-world transition runs — tunnel speeds up. */
  accelerating?: boolean;
  className?: string;
}

interface Puff {
  /** Direction from the tunnel centre (radians). */
  angle: number;
  /** Lane offset 0..1 (0 = centre, 1 = tunnel wall). */
  lane: number;
  /** Depth 0..1 (0 = far / at the vanishing point, 1 = at the camera). */
  z: number;
  /** Per-cloud speed multiplier. */
  speed: number;
  /** Which pre-rendered sprite to use. */
  sprite: number;
  /** Size variation. */
  sizeJitter: number;
  /** Sine wobble phase/speed so lanes drift organically. */
  wobblePhase: number;
  wobbleSpeed: number;
}

interface Ray {
  /** Centre position in relative canvas coordinates. */
  x: number;
  y: number;
  /** Beam direction (radians). */
  angle: number;
  /** Beam half-length in relative units. */
  length: number;
  /** Beam width in px at 1000px canvas width. */
  width: number;
  /** Age and total lifespan in ms. */
  age: number;
  lifespan: number;
}

const PUFF_COUNT = 64;
const BASE_SPEED = 0.055;      // z units per second (cruising)
const ACCEL_SPEED = 0.42;      // z units per second (transition)
const FADE_IN_END = 0.12;      // z where a cloud finishes fading in
const FADE_OUT_START = 0.82;   // z where a cloud starts fading out

/** Soft cloud-puff sprite tint variants (white with pink/blue tints). */
const TINTS: Array<{ edge: string }> = [
  { edge: '255, 214, 232' }, // soft pink
  { edge: '214, 232, 255' }, // soft blue
  { edge: '255, 255, 255' }, // pure white
  { edge: '240, 222, 255' }, // faint lavender
];

function makeCloudSprite(edge: string): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas');
  sprite.width = 256;
  sprite.height = 256;
  const ctx = sprite.getContext('2d');
  if (!ctx) return null;

  // A puff = several overlapping radial-gradient blobs.
  const blobs: Array<[number, number, number]> = [
    [128, 138, 92],
    [84, 120, 62],
    [172, 118, 66],
    [104, 166, 58],
    [152, 168, 60],
    [128, 108, 54],
  ];
  for (const [bx, by, br] of blobs) {
    const grad = ctx.createRadialGradient(bx, by, br * 0.1, bx, by, br);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.55, `rgba(${edge}, 0.55)`);
    grad.addColorStop(1, `rgba(${edge}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  return sprite;
}

function spawnPuff(far: boolean): Puff {
  return {
    angle: Math.random() * Math.PI * 2,
    lane: 0.18 + Math.random() * 0.82,
    z: far ? Math.random() * 0.1 : Math.random(),
    speed: 0.7 + Math.random() * 0.6,
    sprite: Math.floor(Math.random() * TINTS.length),
    sizeJitter: 0.7 + Math.random() * 0.7,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.3 + Math.random() * 0.7,
  };
}

function spawnRay(): Ray {
  return {
    x: 0.15 + Math.random() * 0.7,
    y: 0.1 + Math.random() * 0.6,
    angle: -Math.PI / 3 + (Math.random() - 0.5) * 0.9, // mostly diagonal-down
    length: 0.35 + Math.random() * 0.4,
    width: 30 + Math.random() * 70,
    age: 0,
    lifespan: 2600 + Math.random() * 2600,
  };
}

export function CloudTunnelCanvas({ accelerating = false, className }: CloudTunnelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acceleratingRef = useRef(accelerating);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    acceleratingRef.current = accelerating;
  }, [accelerating]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // jsdom (tests) and very old browsers: fall back to a static gradient.
      setSupported(false);
      return;
    }

    const sprites = TINTS.map(t => makeCloudSprite(t.edge)).filter(
      (s): s is HTMLCanvasElement => s !== null,
    );
    if (sprites.length === 0) {
      setSupported(false);
      return;
    }

    const puffs: Puff[] = Array.from({ length: PUFF_COUNT }, () => spawnPuff(false));
    const rays: Ray[] = [];
    let nextRayAt = 1200 + Math.random() * 2000;

    let speed = BASE_SPEED;
    let rafId = 0;
    let lastTs: number | null = null;
    let disposed = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawSky = (w: number, h: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#ffffff');
      sky.addColorStop(0.45, '#fdf1f7');
      sky.addColorStop(1, '#e9f2ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Heavenly glow at the vanishing point.
      const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
      glow.addColorStop(0, 'rgba(255, 250, 225, 0.9)');
      glow.addColorStop(0.4, 'rgba(255, 240, 248, 0.45)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    };

    const drawRays = (w: number, h: number, dtMs: number, now: number) => {
      if (now >= nextRayAt && rays.length < 3) {
        rays.push(spawnRay());
        nextRayAt = now + 1800 + Math.random() * 3200;
      }
      const scale = w / 1000;
      for (let i = rays.length - 1; i >= 0; i -= 1) {
        const ray = rays[i];
        ray.age += dtMs;
        if (ray.age >= ray.lifespan) {
          rays.splice(i, 1);
          continue;
        }
        const lifeT = ray.age / ray.lifespan;
        // Fade in, hold, fade out.
        const alpha =
          (lifeT < 0.25 ? lifeT / 0.25 : lifeT > 0.7 ? 1 - (lifeT - 0.7) / 0.3 : 1) * 0.16;

        const cx = ray.x * w;
        const cy = ray.y * h;
        const halfLen = ray.length * Math.max(w, h) * 0.5;
        const dx = Math.cos(ray.angle) * halfLen;
        const dy = Math.sin(ray.angle) * halfLen;
        const beamWidth = ray.width * scale;

        const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        grad.addColorStop(0, 'rgba(255, 182, 213, 0)');
        grad.addColorStop(0.25, `rgba(255, 214, 165, ${alpha})`);
        grad.addColorStop(0.5, `rgba(190, 235, 255, ${alpha})`);
        grad.addColorStop(0.75, `rgba(226, 190, 255, ${alpha})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ray.angle);
        ctx.fillStyle = grad;
        ctx.fillRect(-halfLen, -beamWidth / 2, halfLen * 2, beamWidth);
        ctx.restore();
      }
    };

    const drawPuffs = (w: number, h: number, dtSec: number, nowSec: number) => {
      const cx = w / 2;
      const cy = h / 2;
      const maxRadius = Math.hypot(w, h) * 0.62;
      const baseSize = Math.min(w, h) * 0.55;

      // Painter's order: far clouds first.
      puffs.sort((a, b) => a.z - b.z);

      for (const puff of puffs) {
        puff.z += puff.speed * speed * dtSec;
        if (puff.z >= 1) {
          // Recycle to the far plane with a fresh lane — seamless loop.
          const fresh = spawnPuff(true);
          puff.angle = fresh.angle;
          puff.lane = fresh.lane;
          puff.sprite = fresh.sprite;
          puff.sizeJitter = fresh.sizeJitter;
          puff.speed = fresh.speed;
          puff.wobblePhase = fresh.wobblePhase;
          puff.wobbleSpeed = fresh.wobbleSpeed;
          puff.z -= 1;
          continue;
        }

        const z = puff.z;
        const perspective = z * z; // ease the projection: slow far, fast near
        const wobble = Math.sin(nowSec * puff.wobbleSpeed + puff.wobblePhase) * 0.03;
        const offset = (puff.lane + wobble) * perspective * maxRadius;
        const px = cx + Math.cos(puff.angle) * offset;
        const py = cy + Math.sin(puff.angle) * offset * 0.86; // slight vertical squash

        const size = baseSize * puff.sizeJitter * (0.05 + perspective * 1.25);
        if (size <= 0.5) continue;

        let alpha = 1;
        if (z < FADE_IN_END) alpha = z / FADE_IN_END;
        else if (z > FADE_OUT_START) alpha = 1 - (z - FADE_OUT_START) / (1 - FADE_OUT_START);
        alpha *= 0.92;
        if (alpha <= 0.01) continue;

        const sprite = sprites[puff.sprite % sprites.length];
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const frame = (ts: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(frame);

      if (lastTs === null) {
        lastTs = ts;
        return;
      }
      const dtMs = Math.min(ts - lastTs, 100); // clamp tab-switch jumps
      const dtSec = dtMs / 1000;
      lastTs = ts;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return; // hidden / zero-sized: skip, never NaN

      // Smoothly ramp speed toward the target (cruise vs transition).
      const target = acceleratingRef.current ? ACCEL_SPEED : BASE_SPEED;
      speed += (target - speed) * Math.min(1, dtSec * 2.2);

      const nowSec = ts / 1000;
      drawSky(w, h);
      drawRays(w, h, dtMs, ts);
      drawPuffs(w, h, dtSec, nowSec);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  if (!supported) {
    // Static fallback for environments without canvas 2D (e.g. jsdom tests).
    return <div className={className ? `${className} cloud-tunnel-fallback` : 'cloud-tunnel-fallback'} />;
  }

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
