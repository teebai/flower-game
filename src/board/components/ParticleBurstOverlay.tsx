// ============================================================
// PARTICLE BURST OVERLAY — Reusable DOM particle effects
// Renders above Pixi canvas via createPortal.
// Used for: plant feedback, wind landing, counter resolution, etc.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface BurstParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;   // 0..1
  decay: number;  // per-frame life reduction
  size: number;
  color: string;
  shape: 'circle' | 'star' | 'ring';
}

export interface ParticleBurst {
  id: string;
  x: number;
  y: number;
  color: string;
  count?: number;
  spread?: number;
  duration?: number;
}

function makeBurst({ x, y, color, count = 14, spread = 60, duration = 700 }: ParticleBurst): BurstParticle[] {
  const particles: BurstParticle[] = [];
  const palette = [color, '#ffffff', '#fff8c8', '#c8f8d8'];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const speed = 0.3 + Math.random() * 1.4;
    particles.push({
      id: `${i}-${Math.random().toString(36).slice(2, 6)}`,
      x,
      y,
      vx: Math.cos(angle) * speed * (spread / duration) * 16,
      vy: Math.sin(angle) * speed * (spread / duration) * 16 - 0.8,
      life: 1,
      decay: 1 / (duration / 16),
      size: 3 + Math.random() * 5,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: ['circle', 'star', 'ring'][Math.floor(Math.random() * 3)] as BurstParticle['shape'],
    });
  }
  return particles;
}

function ParticleItem({ p }: { p: BurstParticle }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: p.x,
    top: p.y,
    width: p.size * p.life,
    height: p.size * p.life,
    borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'ring' ? '50%' : '0%',
    background: p.shape === 'ring' ? 'transparent' : p.color,
    border: p.shape === 'ring' ? `2px solid ${p.color}` : 'none',
    opacity: p.life,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    boxShadow: p.shape === 'star'
      ? `0 0 ${p.size * 0.8}px ${p.color}`
      : `0 0 ${p.size * 0.5}px ${p.color}80`,
  };

  if (p.shape === 'star') {
    return (
      <div style={{ ...style, clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} />
    );
  }
  return <div style={style} />;
}

export function ParticleBurstOverlay({
  bursts,
  onComplete,
}: {
  bursts: ParticleBurst[];
  onComplete: (id: string) => void;
}) {
  const particlesRef = useRef<Map<string, BurstParticle[]>>(new Map());
  const rafRef = useRef<number>(0);
  const [, forceUpdate] = useState(0);

  // Initialize new bursts
  useEffect(() => {
    for (const b of bursts) {
      if (!particlesRef.current.has(b.id)) {
        particlesRef.current.set(b.id, makeBurst(b));
      }
    }
  }, [bursts]);

  // Animation loop
  useEffect(() => {
    const tick = () => {
      let changed = false;
      const now = performance.now();
      for (const [burstId, particles] of particlesRef.current.entries()) {
        let alive = 0;
        for (const p of particles) {
          if (p.life <= 0) continue;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.04; // gravity
          p.vx *= 0.98;
          p.life -= p.decay;
          if (p.life > 0) alive++;
          changed = true;
        }
        if (alive === 0) {
          particlesRef.current.delete(burstId);
          onComplete(burstId);
        }
      }
      if (changed) forceUpdate(n => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [onComplete]);

  const allParticles = useMemo(() => {
    const out: { key: string; p: BurstParticle }[] = [];
    for (const [burstId, particles] of particlesRef.current.entries()) {
      for (const p of particles) {
        if (p.life > 0) out.push({ key: `${burstId}-${p.id}`, p });
      }
    }
    return out;
  }, [forceUpdate]);

  if (allParticles.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {allParticles.map(({ key, p }) => (
        <ParticleItem key={key} p={p} />
      ))}
    </div>,
    document.body,
  );
}


