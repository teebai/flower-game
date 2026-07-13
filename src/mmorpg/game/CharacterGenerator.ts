/**
 * CharacterGenerator.ts
 *
 * Procedural character DNA generation for teebai.flowers.
 *
 * Each character is defined by a "DNA" object — a set of 13 scalar traits
 * that control body-part proportions, facial features, and visual effects.
 * Given the same seed string, the generator always produces the same DNA,
 * making characters reproducible from user IDs or shareable codes.
 *
 * Traits are expressed as continuous lerps over defined ranges, with a few
 * discrete picks (eye type, mouth type). The ear scale has the widest
 * range (0.5–1.8) to give the most dramatic visual variation.
 */

/** The complete set of procedural traits that define a character's appearance. */
export interface CharacterDNA {
  /** Head scale factor (0.7 = small, 1.3 = oversized). */
  headScale: number;

  /** Eye variant index: 0–5 (six distinct eye styles). */
  eyeType: number;

  /** Eye size factor (0.6 = tiny, 1.4 = large). */
  eyeScale: number;

  /**
   * Ear size factor (0.5 = stubby, 1.8 = very long).
   * This has the widest range of any trait — the most visually distinctive.
   */
  earScale: number;

  /** Mouth variant index: 0–2 (three mouth styles). */
  mouthType: number;

  /** Mouth width factor (0.5 = small, 1.5 = wide). */
  mouthScale: number;

  /** Torso scale factor (0.6 = petite, 1.4 = bulky). */
  torsoScale: number;

  /** Arm length factor (0.5 = short, 1.5 = long). */
  armScale: number;

  /** Hand size factor (0.5 = tiny, 1.5 = oversized). */
  handScale: number;

  /** Leg length factor (0.5 = short, 1.5 = long). */
  legScale: number;

  /** Foot size factor (0.5 = small, 1.3 = large). */
  footScale: number;

  /** Glow intensity for the character's aura (0.0 = none, 1.0 = bright). */
  glowIntensity: number;

  /**
   * Skin tone as a brightness multiplier (0.95–1.0).
   * Slight variation keeps the hand-drawn white aesthetic while
   * giving each character a unique warmth.
   */
  skinTone: number;
}

/** Trait metadata: min/max ranges and whether the trait is discrete. */
export interface TraitMeta {
  name: keyof CharacterDNA;
  min: number;
  max: number;
  discrete: boolean;
  steps?: number;
}

/** All trait definitions in order — useful for debug UI or editors. */
export const TRAIT_DEFINITIONS: TraitMeta[] = [
  { name: 'headScale', min: 0.7, max: 1.3, discrete: false },
  { name: 'eyeType', min: 0, max: 5, discrete: true, steps: 6 },
  { name: 'eyeScale', min: 0.6, max: 1.4, discrete: false },
  { name: 'earScale', min: 0.5, max: 1.8, discrete: false },
  { name: 'mouthType', min: 0, max: 2, discrete: true, steps: 3 },
  { name: 'mouthScale', min: 0.5, max: 1.5, discrete: false },
  { name: 'torsoScale', min: 0.6, max: 1.4, discrete: false },
  { name: 'armScale', min: 0.5, max: 1.5, discrete: false },
  { name: 'handScale', min: 0.5, max: 1.5, discrete: false },
  { name: 'legScale', min: 0.5, max: 1.5, discrete: false },
  { name: 'footScale', min: 0.5, max: 1.3, discrete: false },
  { name: 'glowIntensity', min: 0.0, max: 1.0, discrete: false },
  { name: 'skinTone', min: 0.95, max: 1.0, discrete: false },
];

// ── Math helpers ──────────────────────────────────────────────────────────

/** Linear interpolation: a + (b-a) * t */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value to [min, max]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Seeded RNG ────────────────────────────────────────────────────────────

/**
 * Create a deterministic pseudo-random number generator from a string seed.
 * Uses a 32-bit LCG (Lehmer / Park-Miller) for fast, reproducible sequences.
 */
function createSeededRNG(seed: string): () => number {
  // Jenkins one-at-a-time hash to convert the string seed into a numeric hash.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // Force 32-bit signed integer
  }

  // Ensure positive starting state (LCG needs > 0)
  hash = Math.abs(hash) || 1;

  return () => {
    // Park-Miller LCG: next = (prev * 16807) % 2147483647
    hash = (hash * 16807) % 2147483647;
    return (hash - 1) / 2147483646; // Normalize to [0, 1)
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a CharacterDNA from an optional seed string.
 *
 * @param seed  Optional seed for reproducible DNA. If omitted, uses
 *              Math.random (non-deterministic).
 * @returns     A complete CharacterDNA object.
 *
 * @example
 *   const dna = generateCharacterDNA('player_123');
 *   const dna2 = generateCharacterDNA('player_123'); // identical
 */
export function generateCharacterDNA(seed?: string): CharacterDNA {
  const rng = seed ? createSeededRNG(seed) : Math.random;

  return {
    headScale: lerp(0.7, 1.3, rng()),
    eyeType: Math.floor(rng() * 6),   // 0–5
    eyeScale: lerp(0.6, 1.4, rng()),
    earScale: lerp(0.5, 1.8, rng()),   // widest range → most variation
    mouthType: Math.floor(rng() * 3),  // 0–2
    mouthScale: lerp(0.5, 1.5, rng()),
    torsoScale: lerp(0.6, 1.4, rng()),
    armScale: lerp(0.5, 1.5, rng()),
    handScale: lerp(0.5, 1.5, rng()),
    legScale: lerp(0.5, 1.5, rng()),
    footScale: lerp(0.5, 1.3, rng()),
    glowIntensity: 0,                  // start un-glowed
    skinTone: lerp(0.95, 1.0, rng()),  // slight warmth variation
  };
}

/**
 * Generate DNA from a compact numeric "genome" array.
 * Each value is in [0, 1] and maps to the trait's defined range.
 * Useful for serializing DNA to URLs or compact storage.
 */
export function dnaFromGenome(genome: number[]): CharacterDNA {
  const g = (i: number) => clamp01(genome[i] ?? 0.5);

  return {
    headScale: lerp(0.7, 1.3, g(0)),
    eyeType: Math.floor(g(1) * 6),
    eyeScale: lerp(0.6, 1.4, g(2)),
    earScale: lerp(0.5, 1.8, g(3)),
    mouthType: Math.floor(g(4) * 3),
    mouthScale: lerp(0.5, 1.5, g(5)),
    torsoScale: lerp(0.6, 1.4, g(6)),
    armScale: lerp(0.5, 1.5, g(7)),
    handScale: lerp(0.5, 1.5, g(8)),
    legScale: lerp(0.5, 1.5, g(9)),
    footScale: lerp(0.5, 1.3, g(10)),
    glowIntensity: clamp01(g(11)),
    skinTone: lerp(0.95, 1.0, g(12)),
  };
}

/**
 * Serialize a DNA object into a compact [0,1] genome array.
 * Inverse of dnaFromGenome.
 */
export function dnaToGenome(dna: CharacterDNA): number[] {
  return [
    (dna.headScale - 0.7) / (1.3 - 0.7),
    dna.eyeType / 5,
    (dna.eyeScale - 0.6) / (1.4 - 0.6),
    (dna.earScale - 0.5) / (1.8 - 0.5),
    dna.mouthType / 2,
    (dna.mouthScale - 0.5) / (1.5 - 0.5),
    (dna.torsoScale - 0.6) / (1.4 - 0.6),
    (dna.armScale - 0.5) / (1.5 - 0.5),
    (dna.handScale - 0.5) / (1.5 - 0.5),
    (dna.legScale - 0.5) / (1.5 - 0.5),
    (dna.footScale - 0.5) / (1.3 - 0.5),
    dna.glowIntensity,
    (dna.skinTone - 0.95) / (1.0 - 0.95),
  ];
}

/**
 * Create a base "default" DNA — all traits at midpoint.
 * Useful for rendering a placeholder before a real seed is available.
 */
export function createDefaultDNA(): CharacterDNA {
  return {
    headScale: 1.0,
    eyeType: 0,
    eyeScale: 1.0,
    earScale: 1.0,
    mouthType: 0,
    mouthScale: 1.0,
    torsoScale: 1.0,
    armScale: 1.0,
    handScale: 1.0,
    legScale: 1.0,
    footScale: 1.0,
    glowIntensity: 0,
    skinTone: 0.975,
  };
}

// ── Guest utilities ───────────────────────────────────────────────────────

/**
 * Generate a random guest player ID.
 * Format: guest_<8-char alphanumeric>
 */
export function generateGuestId(): string {
  return (
    'guest_' +
    Math.random().toString(36).substring(2, 10)
  );
}

/**
 * Generate both a guest ID and its corresponding DNA in one call.
 */
export function generateGuestCharacter(): {
  id: string;
  dna: CharacterDNA;
} {
  const id = generateGuestId();
  return { id, dna: generateCharacterDNA(id) };
}
