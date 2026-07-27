/**
 * Flower/nature-themed random name generator for teebai.flowers portal.
 */

const FLOWER_ADJECTIVES = [
  'Amber', 'Azure', 'Blissful', 'Blooming', 'Breezy', 'Bright', 'Crimson',
  'Dancing', 'Dewdrop', 'Dreamy', 'Ethereal', 'Fading', 'Floral', 'Fragrant',
  'Gentle', 'Gilded', 'Golden', 'Graceful', 'Harmony', 'Hidden', 'Ivory',
  'Jade', 'Lavender', 'Luminous', 'Lush', 'Meadow', 'Misty', 'Moonlit',
  'Morning', 'Mossy', 'Mystic', 'Opal', 'Pale', 'Peaceful', 'Petal',
  'Radiant', 'Rose', 'Saffron', 'Serene', 'Shadow', 'Shimmering', 'Silken',
  'Silver', 'Sleepy', 'Soft', 'Spring', 'Starlit', 'Sunny', 'Sweet',
  'Tender', 'Thorny', 'Twilight', 'Velvet', 'Violet', 'Whimsical', 'Wild',
  'Willow', 'Windswept', 'Wisteria',
];

const FLOWER_NOUNS = [
  'Anemone', 'Azalea', 'Begonia', 'Blossom', 'Bluebell', 'Buttercup',
  'Camellia', 'Carnation', 'Chrysanthemum', 'Clover', 'Daffodil', 'Dahlia',
  'Daisy', 'Fern', 'Forget-Me-Not', 'Foxglove', 'Gardenia', 'Geranium',
  'Hibiscus', 'Hyacinth', 'Iris', 'Jasmine', 'Lavender', 'Lilac', 'Lily',
  'Lotus', 'Magnolia', 'Marigold', 'Meadow', 'Orchid', 'Pansy', 'Peony',
  'Petal', 'Petunia', 'Poppy', 'Primrose', 'Rose', 'Sage', 'Snapdragon',
  'Sunflower', 'Thistle', 'Tulip', 'Violet', 'Waterlily', 'Wisteria', 'Zinnia',
];

const NATURE_SUFFIXES = [
  'Seed', 'Sprout', 'Stem', 'Bud', 'Bloom', 'Petal', 'Leaf', 'Root',
  'Thorn', 'Nectar', 'Pollen', 'Dew', 'Mist', 'Breeze', 'Glow',
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Generate a deterministic name from a seed string. */
export function generateNameFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const r = rng(hash);
  const pattern = Math.floor(r() * 4);

  switch (pattern) {
    case 0:
      return `${rand(FLOWER_ADJECTIVES)} ${rand(FLOWER_NOUNS)}`;
    case 1:
      return `${rand(FLOWER_NOUNS)} ${rand(NATURE_SUFFIXES)}`;
    case 2:
      return `${rand(FLOWER_ADJECTIVES)} ${rand(FLOWER_NOUNS)} ${rand(NATURE_SUFFIXES)}`;
    default:
      return `${rand(FLOWER_NOUNS)} the ${rand(FLOWER_ADJECTIVES)}`;
  }
}

/** Generate a completely random name. */
export function generateRandomName(): string {
  const seed = Math.random().toString(36).substring(2, 10);
  return generateNameFromSeed(seed);
}

/** Generate a list of name suggestions. */
export function generateNameSuggestions(count = 5): string[] {
  const names: string[] = [];
  while (names.length < count) {
    const name = generateRandomName();
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
