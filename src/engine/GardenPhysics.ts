// ============================================================
// FLOWER GAME — GARDEN PHYSICS ENGINE (Matter.js)
// Per-player GardenPhysicsWorld with water-like dynamics:
//   • Zero global gravity + centre gravity well
//   • Circular flower bodies (high damping 0.95, friction 0.8)
//   • Same-colour magnetic attraction
//   • Wind blows flowers along a GSAP bezier path to target garden
//   • Hard ellipse boundary clamp — flowers can never escape
//   • Reactive hover: scale 1.2× + gentle wiggle
// ============================================================

import Matter from 'matter-js';
import { gsap } from 'gsap';
import type { FlowerColor, GardenSet } from '../types/gameTypes';

const {
  Engine, World, Bodies, Body, Composite, Events, Runner, Vector,
} = Matter;

// ── Types ──────────────────────────────────────────────────

export interface GardenPhysicsConfig {
  /** Centre of this garden in world space */
  gardenCenter: { x: number; y: number };
  /** Horizontal / vertical radius of the garden ellipse */
  gardenRadius: { rx: number; ry: number };
  /** Strength of the centre gravity well (default 0.0003) */
  gravityWellStrength: number;
  /** Strength of same-colour magnetic pull (default 0.001) */
  sameColorAttraction: number;
  /** Linear damping factor per tick (default 0.95) */
  damping: number;
  /** Static friction on flower circles (default 0.8) */
  friction: number;
  /** Collision restitution — kept at 0 for water-like feel */
  restitution: number;
  /** Radius of each flower physics body in px (default 18) */
  flowerRadius: number;
  /** Density of flower bodies */
  density: number;
  /** Max rotation speed during hover wiggle (rad/s) */
  hoverWiggleSpeed: number;
  /** Hover scale target */
  hoverScaleTarget: number;
  /** How fast hover scale transitions (lerp factor per tick) */
  hoverScaleLerp: number;
  /** Duration (ms) of the GSAP wind bezier flight */
  windBezierDuration: number;
}

/** Metadata attached to each physics body representing a flower */
export interface FlowerPhysicsBody {
  id: string;          // flower card id
  body: Matter.Body;
  color: FlowerColor;
  setId: string;
  playerId: string;
  isDivine: boolean;
  isSolid: boolean;
  isHovered: boolean;
  /** Current visual scale (animated toward 1.0 or hoverScaleTarget) */
  scale: number;
  /** ms timestamp when this flower was spawned */
  spawnTime: number;
  /** Active GSAP tween when wind is blowing this flower */
  windTween: gsap.core.Tween | null;
  /** True while the flower is being animated by wind (physics forces suppressed) */
  isWindFlying: boolean;
}

const DEFAULT_CONFIG: GardenPhysicsConfig = {
  gardenCenter: { x: 0, y: 0 },
  gardenRadius: { rx: 120, ry: 90 },
  gravityWellStrength: 0.0006,     // gentle center pull
  sameColorAttraction: 0.001,      // very gentle clustering
  damping: 0.95,                   // high damping for calm water feel
  friction: 0.8,                   // higher friction (was 0.5 — too slippery)
  restitution: 0.0,
  flowerRadius: 20,                // standard size
  density: 0.001,
  hoverWiggleSpeed: 0,
  hoverScaleTarget: 1.0,
  hoverScaleLerp: 0.08,
  windBezierDuration: 1400,
};

// ── GardenPhysicsWorld ───────────────────────────────────────

export class GardenPhysicsWorld {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private flowers: Map<string, FlowerPhysicsBody> = new Map();
  private config: GardenPhysicsConfig;
  private _time = 0;

  constructor(config: Partial<GardenPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create engine with zero global gravity — we apply custom forces per tick
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
    });

    this.runner = Runner.create();

    // Per-tick custom forces + boundary clamp + hover wiggle
    Events.on(this.engine, 'beforeUpdate', () => this.applyForces());

    // Start the Matter.js runner
    Runner.run(this.runner, this.engine);
  }

  // ── Internal: per-frame physics ───────────────────────────

  private applyForces() {
    const dt = this.engine.timing.timestamp - this._time;
    this._time = this.engine.timing.timestamp;
    const t = this.engine.timing.timestamp * 0.001;

    const bodies = Composite.allBodies(this.engine.world);
    const { config } = this;

    for (const body of bodies) {
      const flower = this.flowers.get(body.label);
      if (!flower) continue;

      // Skip normal physics while wind is carrying the flower
      if (flower.isWindFlying) continue;

      // ── 1. Centre gravity well ──
      const dx = config.gardenCenter.x - body.position.x;
      const dy = config.gardenCenter.y - body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const wellForce = config.gravityWellStrength * body.mass;
      Body.applyForce(body, body.position, {
        x: (dx / dist) * wellForce,
        y: (dy / dist) * wellForce,
      });

      // ── 2. Same-colour magnetic attraction ──
      for (const other of bodies) {
        if (other === body) continue;
        const otherFlower = this.flowers.get(other.label);
        if (!otherFlower) continue;
        if (otherFlower.color !== flower.color) continue;

        const odx = other.position.x - body.position.x;
        const ody = other.position.y - body.position.y;
        const odist = Math.sqrt(odx * odx + ody * ody) || 1;
        if (odist > 5 && odist < 200) {
          const magForce = config.sameColorAttraction * body.mass;
          Body.applyForce(body, body.position, {
            x: (odx / odist) * magForce,
            y: (ody / odist) * magForce,
          });
        }
      }

      // ── 3. High linear damping (water-like resistance) ──
      Body.setVelocity(body, {
        x: body.velocity.x * config.damping,
        y: body.velocity.y * config.damping,
      });

      // ── 4. Angular damping (kill spin) ──
      Body.setAngularVelocity(body, body.angularVelocity * config.damping);

      // ── 5. Hover scale animation (no wiggle — CSS handles visuals) ──
      const targetScale = flower.isHovered ? config.hoverScaleTarget : 1.0;
      flower.scale += (targetScale - flower.scale) * config.hoverScaleLerp;

      // ── 6. Soft ellipse boundary force ──
      // Instead of snapping position (which fights the solver),
      // apply an increasing inward force as flowers approach the edge
      const { rx, ry } = config.gardenRadius;
      const pad = config.flowerRadius + 4;
      const maxRx = Math.max(1, rx - pad);
      const maxRy = Math.max(1, ry - pad);

      const normalized =
        (body.position.x / maxRx) ** 2 + (body.position.y / maxRy) ** 2;

      if (normalized > 0.64) {
        const t = (normalized - 0.64) / 0.36;
        const angle = Math.atan2(body.position.y, body.position.x);
        const push = 0.0008 * t * t * body.mass;
        Body.applyForce(body, body.position, {
          x: -Math.cos(angle) * push,
          y: -Math.sin(angle) * push,
        });
      }
    }
  }

  // ── Public API ────────────────────────────────────────────

  /** Add a new flower body to this garden */
  addFlower(props: {
    id: string;
    color: FlowerColor;
    setId: string;
    playerId: string;
    isDivine: boolean;
    isSolid: boolean;
    x: number;
    y: number;
  }): FlowerPhysicsBody {
    const { id, color, setId, playerId, isDivine, isSolid, x, y } = props;

    const body = Bodies.circle(x, y, this.config.flowerRadius, {
      label: id,
      restitution: this.config.restitution,
      friction: this.config.friction,
      frictionAir: 0.05,
      density: this.config.density,
      angle: 0,
      collisionFilter: {
        group: 0,
        category: 0x0001,
        mask: 0x0001,
      },
    });

    const flower: FlowerPhysicsBody = {
      id,
      body,
      color,
      setId,
      playerId,
      isDivine,
      isSolid,
      isHovered: false,
      scale: 0.2,          // spawn in small, grow to 1.0
      spawnTime: Date.now(),
      windTween: null,
      isWindFlying: false,
    };

    this.flowers.set(id, flower);
    World.add(this.engine.world, body);
    return flower;
  }

  /** Remove a flower from the physics world */
  removeFlower(id: string) {
    const flower = this.flowers.get(id);
    if (flower) {
      if (flower.windTween) {
        flower.windTween.kill();
        flower.windTween = null;
      }
      World.remove(this.engine.world, flower.body);
      this.flowers.delete(id);
    }
  }

  /** Set hover state for a single flower */
  setFlowerHover(id: string, hovered: boolean) {
    const flower = this.flowers.get(id);
    if (flower) flower.isHovered = hovered;
  }

  /** Clear all hover states */
  clearAllHovers() {
    for (const flower of this.flowers.values()) {
      flower.isHovered = false;
    }
  }

  /** Apply wind to a flower, sending it along a GSAP bezier path toward a target garden centre */
  windFlower(id: string, targetX: number, targetY: number) {
    const flower = this.flowers.get(id);
    if (!flower) return;

    // Kill any existing wind tween
    if (flower.windTween) {
      flower.windTween.kill();
      flower.windTween = null;
    }

    const body = flower.body;
    flower.isWindFlying = true;

    // Zero out velocity so the flower glides cleanly
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);

    const startX = body.position.x;
    const startY = body.position.y;
    const midX = (startX + targetX) / 2 + (Math.random() - 0.5) * 60;
    const midY = (startY + targetY) / 2 - 40 - Math.random() * 40;

    // GSAP bezier-style animation: quadratic bezier through a control point
    const tween = gsap.to({}, {
      duration: this.config.windBezierDuration / 1000,
      ease: 'power2.inOut',
      onUpdate: function () {
        const t = this.progress();
        const inv = 1 - t;
        // Quadratic Bezier: B(t) = (1-t)²·P₀ + 2(1-t)t·P₁ + t²·P₂
        const bx = inv * inv * startX + 2 * inv * t * midX + t * t * targetX;
        const by = inv * inv * startY + 2 * inv * t * midY + t * t * targetY;
        Body.setPosition(body, { x: bx, y: by });
      },
      onComplete: () => {
        flower.isWindFlying = false;
        flower.windTween = null;
        // Small settling impulse
        Body.setVelocity(body, {
          x: (Math.random() - 0.5) * 0.5,
          y: (Math.random() - 0.5) * 0.5,
        });
      },
    });

    flower.windTween = tween;
  }

  /** Apply a gentle gust to every flower in this garden */
  gustGarden(strength = 0.02) {
    for (const flower of this.flowers.values()) {
      if (flower.isWindFlying) continue;
      const body = flower.body;
      const angle = Math.random() * Math.PI * 2;
      Body.applyForce(body, body.position, {
        x: Math.cos(angle) * strength,
        y: Math.sin(angle) * strength,
      });
    }
  }

  /** Snapshot all flower positions / rotations / scales for React rendering */
  getFlowerStates(): Array<{
    id: string;
    x: number;
    y: number;
    angle: number;
    color: FlowerColor;
    playerId: string;
    setId: string;
    isDivine: boolean;
    isSolid: boolean;
    scale: number;
  }> {
    const now = Date.now();
    return Array.from(this.flowers.values()).map((f) => {
      const age = now - f.spawnTime;
      // Spawn scale-in: 0→1 over 300ms
      const spawnScale = age < 300 ? age / 300 : 1;
      return {
        id: f.id,
        x: f.body.position.x,
        y: f.body.position.y,
        angle: f.body.angle,
        color: f.color,
        playerId: f.playerId,
        setId: f.setId,
        isDivine: f.isDivine,
        isSolid: f.isSolid,
        scale: f.scale * spawnScale,
      };
    });
  }

  /** Update garden centre / radius (e.g. after window resize) */
  updateGardenGeometry(center: { x: number; y: number }, radius: { rx: number; ry: number }) {
    this.config.gardenCenter = center;
    this.config.gardenRadius = radius;
  }

  /** Count of active flower bodies */
  get flowerCount(): number {
    return this.flowers.size;
  }

  /** Dispose engine and runner */
  dispose() {
    for (const flower of this.flowers.values()) {
      if (flower.windTween) flower.windTween.kill();
    }
    this.flowers.clear();
    Runner.stop(this.runner);
    Engine.clear(this.engine);
  }
}

// ── Utility: ellipse clamp helper (used by boundary logic above) ──

export function clampToEllipse(
  x: number,
  y: number,
  rx: number,
  ry: number,
): { x: number; y: number } {
  const nx = x / rx;
  const ny = y / ry;
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d <= 1) return { x, y };
  return { x: (x / d), y: (y / d) };
}

// ── Utility: build physics world config from garden layout data ──

export function buildGardenPhysicsConfig(
  playerId: string,
  gardenCenterX: number,
  gardenCenterY: number,
  totalFlowers: number,
  totalSets: number,
  gardenWidth: number,
  gardenHeight: number,
): GardenPhysicsConfig {
  // Garden radius = half container size minus padding
  const pad = 28;
  const rx = Math.max(40, gardenWidth / 2 - pad);
  const ry = Math.max(30, gardenHeight / 2 - pad);

  return {
    ...DEFAULT_CONFIG,
    gardenCenter: { x: gardenCenterX, y: gardenCenterY },
    gardenRadius: { rx, ry },
  };
}
