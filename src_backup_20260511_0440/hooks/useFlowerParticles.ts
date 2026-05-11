import { useRef, useEffect, useState, useCallback } from 'react';
import type { GardenSet, FlowerCard, FlowerColor } from '../types/gameTypes';

// ============================================================
// FLOWER PARTICLES — Per-Set Physics Engine
// Organic clustering: same-color magnet + group cohesion +
// repulsion + Brownian drift + drag hover pulse
// ============================================================

export interface FlowerParticle {
  id: string;
  x: number;      // position relative to container center (px)
  y: number;
  vx: number;     // velocity (px/frame)
  vy: number;
  size: number;   // visual size (px)
  rotation: number;
  rotVel: number;
  brownianPhase: number;
  color: FlowerColor;
  hoverScale: number;    // 1.0 normal, ~1.3-1.4 when drag-hover
  brightness: number;    // 1.15 base, 1.4 hover
  saturate: number;      // 1.2 base, 1.5 hover
  opacity: number;       // for destroy / spawn animations
}

export interface FlowerParticlesState {
  particles: FlowerParticle[];
  containerW: number;
  containerH: number;
}

// ── Physics constants ───────────────────────────────────────
const SPRING_K_CENTER = 0.004;        // weak pull to set center
const SPRING_K_SAME_COLOR = 0.012;    // strong same-color magnet
const REPULSION_STRENGTH = 90;       // repulsion coefficient
const REPULSION_SOFTENING = 8;       // soften inverse-square near zero
const DAMPING = 0.94;                // velocity decay
const BROWNIAN_AMP = 0.12;           // noise strength
const BROWNIAN_FREQ = 0.015;         // phase increment per frame
const ROTATION_DAMP = 0.92;
const ROTATION_BROWNIAN = 0.06;
const BOUNDARY_K = 0.006;            // boundary restoring force
const HOVER_SPRING_K = 0.08;         // hover scale spring
const STOP_VELOCITY = 0.005;         // below this = "sleep" mode
const SLEEP_BROWNIAN_MULT = 0.3;     // reduced drift when sleeping
const MAX_FRAME_DT = 2.5;            // cap delta-time for tab-switch safety

// ── Visual constants ────────────────────────────────────────
const BASE_BRIGHTNESS = 1.15;
const BASE_SATURATE = 1.25;
const HOVER_BRIGHTNESS = 1.45;
const HOVER_SATURATE = 1.6;
const HOVER_SCALE_TARGET = 1.35;

// Simple pseudo-noise: sum of sines at incommensurate frequencies
function noise(phase: number): number {
  return (
    Math.sin(phase) * 0.50 +
    Math.sin(phase * 1.618) * 0.25 +
    Math.sin(phase * 2.718) * 0.15 +
    Math.sin(phase * 3.142) * 0.10
  );
}

// Seeded random from string (deterministic per flower ID)
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash - 1) / 2147483646;
  };
}

// Compute container ellipse radii from flower count
function setEllipseRadii(flowerCount: number): { rx: number; ry: number } {
  const baseW = 50;
  const baseH = 42;
  const growW = 5.5;
  const growH = 4.5;
  return {
    rx: Math.min(90, baseW + flowerCount * growW),
    ry: Math.min(72, baseH + flowerCount * growH),
  };
}

// Compute flower size based on set size and per-flower seed
function flowerSize(flowerCount: number, rng: () => number): number {
  let base: number;
  if (flowerCount <= 2) base = 24;
  else if (flowerCount <= 4) base = 21;
  else if (flowerCount <= 6) base = 19;
  else if (flowerCount <= 9) base = 17;
  else base = 15;
  // ±15% random variation
  return base * (0.85 + rng() * 0.30);
}

// Check if a point is outside an ellipse
function outsideEllipse(x: number, y: number, rx: number, ry: number): boolean {
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) > 1;
}

// Ellipse boundary restoring force
function ellipseForce(x: number, y: number, rx: number, ry: number): { fx: number; fy: number } {
  const normalized = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (normalized <= 1) return { fx: 0, fy: 0 };
  const excess = Math.sqrt(normalized) - 1;
  const angle = Math.atan2(y / (ry * ry), x / (rx * rx));
  return {
    fx: -Math.cos(angle) * excess * rx * BOUNDARY_K,
    fy: -Math.sin(angle) * excess * ry * BOUNDARY_K,
  };
}

// ── Main hook ─────────────────────────────────────────────

interface UseFlowerParticlesOptions {
  set: GardenSet;
  isHovered: boolean;        // drag hover: card held over this set
  isDragActive: boolean;      // any drag happening on board
  isBeingDragged: boolean;    // this specific set is being dragged
}

export function useFlowerParticles({
  set,
  isHovered,
  isDragActive,
  isBeingDragged,
}: UseFlowerParticlesOptions): FlowerParticlesState {
  const particlesRef = useRef<FlowerParticle[]>([]);
  const prevFlowerIdsRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const isHoveredRef = useRef(isHovered);
  const isDragActiveRef = useRef(isDragActive);
  const isBeingDraggedRef = useRef(isBeingDragged);
  const [state, setState] = useState<FlowerParticlesState>({
    particles: [],
    containerW: 100,
    containerH: 80,
  });

  // Keep refs in sync without re-triggering effects
  useEffect(() => {
    isHoveredRef.current = isHovered;
    isDragActiveRef.current = isDragActive;
    isBeingDraggedRef.current = isBeingDragged;
  });

  // Initialize / re-initialize particles when set flowers change
  useEffect(() => {
    const currentIds = set.flowers.map(f => f.id).join(',');
    const prevIds = prevFlowerIdsRef.current;

    if (currentIds === prevIds) return; // no change

    const { rx, ry } = setEllipseRadii(set.flowers.length);
    const containerW = rx * 2 + 12;  // padding
    const containerH = ry * 2 + 12;

    const existingById = new Map(particlesRef.current.map(p => [p.id, p]));
    const prevSetSize = particlesRef.current.length;

    const particles: FlowerParticle[] = set.flowers.map((flower, i) => {
      const rng = seededRandom(flower.id);
      const existing = existingById.get(flower.id);

      if (existing) {
        // Flower already exists: keep position/velocity, update size if set grew
        return {
          ...existing,
          size: flowerSize(set.flowers.length, rng),
          color: flower.color,
        };
      }

      // New flower: spawn near boundary, drift inward
      const spawnAngle = rng() * Math.PI * 2;
      const spawnDist = rx * (0.6 + rng() * 0.4);
      const spawnX = Math.cos(spawnAngle) * spawnDist;
      const spawnY = Math.sin(spawnAngle) * spawnDist * (ry / rx);

      // Give initial velocity toward center + slight random kick
      const targetX = (rng() - 0.5) * rx * 0.5;
      const targetY = (rng() - 0.5) * ry * 0.5;

      return {
        id: flower.id,
        x: spawnX,
        y: spawnY,
        vx: (targetX - spawnX) * 0.015,
        vy: (targetY - spawnY) * 0.015,
        size: flowerSize(set.flowers.length, rng),
        rotation: (rng() - 0.5) * 24,
        rotVel: (rng() - 0.5) * 0.4,
        brownianPhase: rng() * Math.PI * 2,
        color: flower.color,
        hoverScale: 1.0,
        brightness: BASE_BRIGHTNESS,
        saturate: BASE_SATURATE,
        opacity: 0, // fade in
      };
    });

    // If new flowers were added, give existing flowers a small outward ripple
    if (particles.length > prevSetSize && prevSetSize > 0) {
      const newFlowerIds = new Set(set.flowers.map(f => f.id));
      for (const p of particles) {
        if (newFlowerIds.has(p.id) && !existingById.has(p.id)) continue; // skip new ones
        // Push outward from center
        const dist = Math.hypot(p.x, p.y) || 1;
        const push = 2.5;
        p.vx += (p.x / dist) * push * (0.5 + Math.random() * 0.5);
        p.vy += (p.y / dist) * push * (0.5 + Math.random() * 0.5);
      }
    }

    particlesRef.current = particles;
    prevFlowerIdsRef.current = currentIds;

    setState({ particles, containerW, containerH });
  }, [set.id, set.flowers.map(f => f.id).join(',')]);

  // Physics simulation loop
  useEffect(() => {
    const { rx, ry } = setEllipseRadii(set.flowers.length);

    let frameCount = 0;

    const tick = (time: number) => {
      // Delta time clamping
      let dt = 1;
      if (lastTimeRef.current > 0) {
        dt = Math.min(MAX_FRAME_DT, (time - lastTimeRef.current) / 16.67);
      }
      lastTimeRef.current = time;

      const particles = particlesRef.current;
      if (particles.length === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const hovered = isHoveredRef.current;
      const dragActive = isDragActiveRef.current;
      const beingDragged = isBeingDraggedRef.current;

      // Target brightness / scale based on hover
      const targetBrightness = hovered ? HOVER_BRIGHTNESS : BASE_BRIGHTNESS;
      const targetSaturate = hovered ? HOVER_SATURATE : BASE_SATURATE;
      const targetScale = hovered ? HOVER_SCALE_TARGET : 1.0;

      // When being dragged, reduce clustering so flowers spread evenly
      const centerStrength = beingDragged ? SPRING_K_CENTER * 0.3 : SPRING_K_CENTER;
      const sameColorStrength = beingDragged ? SPRING_K_SAME_COLOR * 0.2 : SPRING_K_SAME_COLOR;

      // Group same-color positions for magnet attraction
      const colorGroups = new Map<FlowerColor, { x: number; y: number; count: number }>();
      for (const p of particles) {
        const g = colorGroups.get(p.color) || { x: 0, y: 0, count: 0 };
        g.x += p.x;
        g.y += p.y;
        g.count++;
        colorGroups.set(p.color, g);
      }
      for (const g of colorGroups.values()) {
        g.x /= g.count;
        g.y /= g.count;
      }

      // Physics integration
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Spring toward set center (group cohesion)
        p.vx += -p.x * centerStrength * dt;
        p.vy += -p.y * centerStrength * dt;

        // 2. Magnet attraction to same-color group center
        const group = colorGroups.get(p.color);
        if (group && group.count > 1) {
          const gdx = group.x - p.x;
          const gdy = group.y - p.y;
          const gdist = Math.hypot(gdx, gdy) || 1;
          // Stronger when farther, weaker when close (don't collapse)
          const magnet = sameColorStrength * Math.min(1, gdist / 20);
          p.vx += (gdx / gdist) * magnet * dt;
          p.vy += (gdy / gdist) * magnet * dt;
        }

        // 3. Pairwise repulsion
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const minDist = (p.size + q.size) * 0.4; // allow gentle overlap
          if (dist < minDist) {
            const force = REPULSION_STRENGTH / (dist * dist + REPULSION_SOFTENING * REPULSION_SOFTENING);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            p.vx -= fx * dt;
            p.vy -= fy * dt;
            q.vx += fx * dt;
            q.vy += fy * dt;
          }
        }

        // 4. Brownian motion
        const isSleeping = Math.hypot(p.vx, p.vy) < STOP_VELOCITY;
        const brownianMult = isSleeping ? SLEEP_BROWNIAN_MULT : 1.0;
        p.brownianPhase += BROWNIAN_FREQ * dt;
        p.vx += noise(p.brownianPhase) * BROWNIAN_AMP * brownianMult * dt;
        p.vy += noise(p.brownianPhase + 100) * BROWNIAN_AMP * brownianMult * dt;

        // 5. Boundary force (soft ellipse)
        const b = ellipseForce(p.x, p.y, rx, ry);
        p.vx += b.fx * dt;
        p.vy += b.fy * dt;

        // 6. Integrate
        p.vx *= Math.pow(DAMPING, dt);
        p.vy *= Math.pow(DAMPING, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 7. Rotation drift
        p.rotVel += (noise(p.brownianPhase + 200) * ROTATION_BROWNIAN - p.rotVel * 0.1) * dt;
        p.rotVel *= Math.pow(ROTATION_DAMP, dt);
        p.rotation += p.rotVel * dt;

        // 8. Hover scale spring
        p.hoverScale += (targetScale - p.hoverScale) * HOVER_SPRING_K * dt;

        // 9. Brightness / saturate spring
        p.brightness += (targetBrightness - p.brightness) * HOVER_SPRING_K * dt;
        p.saturate += (targetSaturate - p.saturate) * HOVER_SPRING_K * dt;

        // 10. Spawn fade-in
        if (p.opacity < 1) {
          p.opacity = Math.min(1, p.opacity + 0.03 * dt);
        }
      }

      // Publish to React state every 2 frames (30fps) for rendering
      frameCount++;
      if (frameCount % 2 === 0) {
        setState(prev => ({
          ...prev,
          particles: particles.map(p => ({ ...p })), // shallow copy for React
        }));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = 0;
    };
  }, [set.flowers.length]);

  return state;
}
