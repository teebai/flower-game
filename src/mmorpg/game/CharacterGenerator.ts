/**
 * CharacterGenerator.ts — Procedural character DNA for teebai.flowers
 *
 * Deterministic from a seed: same guest ID → same character forever.
 */

/** Eye petal color palette (one per eyeType 0-5) */
const EYE_PETAL_COLORS = [
  0xFF69B4, // pink
  0xFFD700, // gold
  0x87CEEB, // sky blue
  0x98FB98, // pale green
  0xDDA0DD, // plum
  0xFFA07A, // salmon
];

/** Glow color palette (subtle warm tones) */
const GLOW_COLORS = [
  0xFFF4D6, // warm white
  0xFFE4B5, // moccasin
  0xF0FFF0, // honeydew
  0xFFF0F5, // lavender blush
];

export interface CharacterDNA {
  /** Overall body size multiplier (0.85–1.15) */
  bodyScale: number;
  /** Head scale factor (0.7–1.3) */
  headScale: number;
  /** Eye variant index 0–5 */
  eyeType: number;
  /** Eye petal color (hex, derived from eyeType) */
  eyePetalColor: number;
  /** Eye size factor (0.6–1.4) */
  eyeScale: number;
  /** Ear size factor (0.5–1.8) — most dramatic trait */
  earScale: number;
  /** Mouth variant index 0–2 */
  mouthType: number;
  /** Mouth width factor (0.5–1.5) */
  mouthScale: number;
  /** Torso scale factor (0.6–1.4) */
  torsoScale: number;
  /** Arm scale factor (0.5–1.5) */
  armScale: number;
  /** Hand scale factor (0.5–1.5) */
  handScale: number;
  /** Leg scale factor (0.5–1.5) */
  legScale: number;
  /** Foot scale factor (0.5–1.3) */
  footScale: number;
  /** Walk animation speed multiplier (0.9–1.1) */
  walkSpeed: number;
  /** Glow intensity 0.0–1.0 (flower-credit driven, starts at 0.3) */
  glowIntensity: number;
  /** Glow color (hex) */
  glowColor: number;
  /** Skin tone brightness (0.95–1.0) */
  skinTone: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic seeded RNG (Park-Miller LCG) */
function createSeededRNG(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash) || 1;
  return () => {
    hash = (hash * 16807) % 2147483647;
    return (hash - 1) / 2147483646;
  };
}

export function generateCharacterDNA(seed?: string): CharacterDNA {
  const rng = seed ? createSeededRNG(seed) : Math.random;

  const eyeType = Math.floor(rng() * 6);
  const glowColorIdx = Math.floor(rng() * GLOW_COLORS.length);

  return {
    bodyScale: lerp(0.85, 1.15, rng()),
    headScale: lerp(0.7, 1.3, rng()),
    eyeType,
    eyePetalColor: EYE_PETAL_COLORS[eyeType],
    eyeScale: lerp(0.6, 1.4, rng()),
    earScale: lerp(0.5, 1.8, rng()),
    mouthType: Math.floor(rng() * 3),
    mouthScale: lerp(0.5, 1.5, rng()),
    torsoScale: lerp(0.6, 1.4, rng()),
    armScale: lerp(0.5, 1.5, rng()),
    handScale: lerp(0.5, 1.5, rng()),
    legScale: lerp(0.5, 1.5, rng()),
    footScale: lerp(0.5, 1.3, rng()),
    walkSpeed: lerp(0.9, 1.1, rng()),
    glowIntensity: 0.3, // subtle base glow; flower credits raise this later
    glowColor: GLOW_COLORS[glowColorIdx],
    skinTone: lerp(0.95, 1.0, rng()),
  };
}

export function generateGuestId(): string {
  return 'guest_' + Math.random().toString(36).substring(2, 10);
}
