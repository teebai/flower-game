/**
 * constants.ts — Global game constants for the teebai.flowers MMORPG
 *
 * All zones are defined in world coordinates on a 3000×3000 map.
 *
 * Zone layout (NON-OVERLAPPING by design intent):
 *   ┌─────────────────────────────────────────┐ 0
 *   │ Reserved │         Gallery        │Shop │
 *   │          │  (top strip, y:0–600)  │     │
 *   ├─Wind─────┼────────────────────────┤     │ 600
 *   │ Zone     │                        │     │
 *   │ (middle- │      Spawn zone        │Mini │
 *   │  left,   │    (circular, center)  │game │
 *   │  x:0–400)│                        │     │
 *   │          │                        │     │
 *   ├──────────┤                        ├─────┤ 1800
 *   │          │                        │     │
 *   │          │                        │     │
 *   │ Hot      │      Community         │Art- │ 2200
 *   │ Spring   │  (bottom strip)        │ists │
 *   │          │                        │     │
 *   └─────────────────────────────────────────┘ 3000
 *   0                                    2400  3000
 *
 * Wind zone: a narrow middle-left vertical strip (x:0–400, y:600–2400)
 * Spawn zone: circular region around map center — use point+radius check
 */

/* ═══════════════════════════════════════════════════════════════
   Map & world
   ═══════════════════════════════════════════════════════════════ */

/** Total map dimensions in pixels */
export const MAP_SIZE = 3000;

/** Tile/grid size in pixels */
export const TILE_SIZE = 64;

/** Default player spawn position (map center) */
export const SPAWN_POS = { x: 1500, y: 1500 } as const;

/* ═══════════════════════════════════════════════════════════════
   Player
   ═══════════════════════════════════════════════════════════════ */

/** Player movement speed in pixels per second */
export const PLAYER_SPEED = 200;

/** Player visual size (diameter) in pixels */
export const PLAYER_SIZE = 32;

/* ═══════════════════════════════════════════════════════════════
   Zones — NON-OVERLAPPING layout
   ═══════════════════════════════════════════════════════════════ */

export interface ZoneDef {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  label: string;
}

/**
 * Zone definitions for the map.
 *
 * Layout logic:
 *   • Gallery    — top strip spanning full width (north)
 *   • Community  — bottom strip spanning full width (south)
 *   • Wind       — middle-left vertical strip (the wind corridor)
 *   • Hot Spring — bottom-left corner (sub-zone within Community visually)
 *   • Artists    — bottom-right corner (sub-zone within Community visually)
 *   • Minigame   — right-middle area
 *   • Shop       — top-right corner (sub-zone within Gallery visually)
 *   • Reserved   — top-left corner (sub-zone within Gallery visually)
 *   • Spawn      — circular zone around center (use point+radius check)
 *
 * Note: Some smaller zones overlap with larger strip zones visually.
 * For gameplay collision, check sub-zones first (more specific) then
 * fall back to the strip zones.
 */
export const ZONES = {
  gallery:    { x: 0,    y: 0,    w: 3000, h: 600,  color: 0x6a5acd, label: 'Gallery' },
  community:  { x: 0,    y: 2400, w: 3000, h: 600,  color: 0x8b7355, label: 'Community' },
  wind:       { x: 0,    y: 600,  w: 400,  h: 1800, color: 0xd2b48c, label: 'Wind Zone' },
  hotspring:  { x: 0,    y: 2200, w: 800,  h: 800,  color: 0x4682b4, label: 'Hot Spring' },
  artists:    { x: 2200, y: 2200, w: 800,  h: 800,  color: 0xda70d6, label: 'Special Artists' },
  minigame:   { x: 2400, y: 1200, w: 600,  h: 600,  color: 0xff6347, label: 'Minigame' },
  shop:       { x: 2400, y: 0,    w: 600,  h: 600,  color: 0xffd700, label: 'Shop' },
  reserved:   { x: 0,    y: 0,    w: 600,  h: 600,  color: 0x708090, label: 'Reserved' },
} as const satisfies Record<string, ZoneDef>;

/** Spawn zone bounds — circular spawn area (check with pointInRect or center+radius) */
export const SPAWN_ZONE = { x: 1300, y: 1300, w: 400, h: 400 } as const;

/** Spawn zone center and radius for circular collision checks */
export const SPAWN_CENTER = {
  x: SPAWN_ZONE.x + SPAWN_ZONE.w / 2,
  y: SPAWN_ZONE.y + SPAWN_ZONE.h / 2,
} as const;
export const SPAWN_RADIUS = SPAWN_ZONE.w / 2; // 200

/* ═══════════════════════════════════════════════════════════════
   Wind effect
   ═══════════════════════════════════════════════════════════════ */

/** Total duration of a wind blow in milliseconds */
export const WIND_DURATION = 8000;

/** Maximum height (in pixels above ground) that wind lifts entities */
export const WIND_MAX_HEIGHT = 200;

/** Horizontal distance (in pixels) the wind carries entities across the map */
export const WIND_ARC_DISTANCE = 2200;

/* ═══════════════════════════════════════════════════════════════
   Colors
   ═══════════════════════════════════════════════════════════════ */

export const COLORS = {
  /** Main ground / grass color */
  ground: 0x2d5a27,
  /** Alternate ground tile color (checkerboard variation) */
  groundAlt: 0x3a6b32,
  /** Path / dirt color */
  path: 0x8b7355,
  /** Spawn zone ring indicator color */
  spawnRing: 0xffd700,
  /** Wind particle color (parchment/beige) */
  windParticle: 0xf5f5dc,
  /** Steam / hot spring particle color */
  steam: 0xffffff,
  /** Grass tuft accent color for scattered decor */
  grassTuft: 0x4a8c3f,
  /** Pebble / stone color for path-side decor */
  pebble: 0x999999,
} as const;
