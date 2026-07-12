import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface DivineFavouriteTransitionProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromSize?: number;
  toSize?: number;
  onComplete: () => void;
}

interface ParticleConfig {
  id: number;
  startX: number;
  startY: number;
  path: string;          /* SVG path for offset-path */
  size: number;
  duration: number;
  delay: number;
  rotOffset: number;     /* initial rotation offset */
  ease: string;
}

const EASINGS = [
  'cubic-bezier(0.5, 0, 0.75, 0)',
  'cubic-bezier(0.45, 0.05, 0.75, 0.15)',
  'cubic-bezier(0.55, 0, 0.8, 0.1)',
  'cubic-bezier(0.4, 0, 0.6, 0.2)',
];

export const DivineFavouriteTransition = React.memo(function DivineFavouriteTransition({
  fromX, fromY, toX, toY, fromSize = 180, toSize = 180, onComplete,
}: DivineFavouriteTransitionProps) {
  const particles = useMemo<ParticleConfig[]>(() => {
    const pathDx = toX - fromX;
    const pathDy = toY - fromY;
    const pathLen = Math.hypot(pathDx, pathDy) || 1;

    /* Perpendicular unit vector */
    const perpX = -pathDy / pathLen;
    const perpY = pathDx / pathLen;

    return Array.from({ length: 10 }, (_, i) => {
      const radiusRatio = 0.55 + (i % 6) * 0.1;
      const fromRadius = fromSize * radiusRatio;
      const toRadius = toSize * radiusRatio;

      const baseAngle = (i / 10) * Math.PI * 2;
      const startAngle = baseAngle + Math.random() * 1.0;
      const endAngle = baseAngle + Math.random() * 1.0;

      const startX = fromX + Math.cos(startAngle) * fromRadius;
      const startY = fromY + Math.sin(startAngle) * fromRadius;
      const endX = toX + Math.cos(endAngle) * toRadius;
      const endY = toY + Math.sin(endAngle) * toRadius;

      const dx = endX - startX;
      const dy = endY - startY;

      /* Gentle arc — 10–25 % of path length, just a little distorted */
      const arcSide = i % 2 === 0 ? 1 : -1;
      const arcMag = (0.10 + Math.random() * 0.15) * pathLen;
      const arcX = perpX * arcMag * arcSide;
      const arcY = perpY * arcMag * arcSide;

      /*
        Quadratic Bézier: M 0 0 → Q control → dx dy
        The control point is placed *past* the arc peak so the curve
        sweeps outward and then glides into the destination.
      */
      const qx = arcX * 2.2;
      const qy = arcY * 2.2;
      const path = `path('M 0 0 Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}')`;

      const size = 0.5 + (i % 4) * 0.5;
      const rotOffset = Math.random() * 360;
      const ease = EASINGS[i % EASINGS.length];
      const delay = Math.floor(Math.random() * 100);
      const duration = 1000 + Math.floor(Math.random() * 600);

      return {
        id: i,
        startX,
        startY,
        path,
        size,
        duration,
        delay,
        rotOffset,
        ease,
      };
    });
  }, [fromX, fromY, toX, toY, fromSize, toSize]);

  useEffect(() => {
    const maxDur = Math.max(...particles.map(p => p.delay + p.duration));
    const timer = window.setTimeout(onComplete, maxDur + 50);
    return () => window.clearTimeout(timer);
  }, [particles, onComplete]);

  return createPortal(
    <div className="divine-transition-layer" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="divine-transition-orb"
          style={{
            left: p.startX,
            top: p.startY,
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            ['--rot0' as string]: `${p.rotOffset}deg`,
            ['--dur' as string]: `${p.duration}ms`,
            ['--ease' as string]: p.ease,
            offsetPath: p.path,
            animationDelay: `${p.delay}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>,
    document.body,
  );
});
