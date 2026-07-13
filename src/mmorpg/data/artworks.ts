/**
 * artworks.ts — Gallery artwork data + procedural thumbnail generator
 *
 * Each artwork is rendered to an offscreen <canvas> ONCE, and that same canvas
 * is reused both as the in-world PixiJS texture and as the popup <img>. This
 * keeps the two views visually identical and avoids duplicating draw logic.
 *
 * Because we don't ship real image assets yet, the thumbnail is a procedurally
 * generated abstract-floral composition driven by the artwork's `seed` and
 * `palette`, in Teebai's soft hand-drawn aesthetic (low-saturation, warm).
 *
 * To use real art later: set `imageUrl` on an artwork and the loader will use
 * that instead of the procedural canvas.
 */

export interface Artwork {
  /** Stable unique id */
  id: string;
  /** Display title */
  title: string;
  /** Year created */
  year: number;
  /** Medium / materials */
  medium: string;
  /** Physical dimensions, human readable, e.g. "60 × 80 cm" */
  dimensions: string;
  /** Price in `currency`; null = "Price on enquiry" */
  price: number | null;
  /** ISO-ish currency code or symbol, e.g. "USD" */
  currency: string;
  /** Procedural seed (deterministic layout) */
  seed: number;
  /** Palette of hex colors used by the generator (3–5 entries) */
  palette: number[];
  /** Optional real image URL — overrides procedural thumbnail */
  imageUrl?: string;

  /* ── Orbit assignment (filled in by buildGalleryOrbits) ── */
  /** Horizontal orbit radius around gallery center */
  orbitRadius: number;
  /** Angular speed in radians per millisecond */
  orbitSpeed: number;
  /** Starting angle in radians */
  orbitOffset: number;
  /** Vertical flattening of the ellipse (0 = circle … 0.6 = strong squash) */
  orbitTilt: number;
}

/** Gallery flower center (world coords) — artworks orbit this point. */
export const GALLERY_CENTER = { x: 1500, y: 300 } as const;

/* ═══════════════════════════════════════════════════════════════
   Curated palettes — warm, low-saturation, on-brand
   ═══════════════════════════════════════════════════════════════ */

const PALETTES: number[][] = [
  [0xE8B4B8, 0xC98A8E, 0xF4D7D9, 0x8E6C6E], // dusty rose
  [0xD9B8E6, 0xB18CC9, 0xEFE0F4, 0x6E5A8E], // soft lavender
  [0xF2C9A0, 0xE0A878, 0xFBE8D4, 0x9C7B54], // warm peach
  [0xA8C8B8, 0x7FA896, 0xD8EAE0, 0x4F7A68], // sage green
  [0xF0D98C, 0xDDB95A, 0xFBEFC8, 0x9C8740], // muted gold
  [0xB8C8E6, 0x8CA4D0, 0xDCE6F6, 0x5A6E9C], // misty blue
  [0xE6C0A8, 0xC99880, 0xF6E2D4, 0x8E6450], // terracotta
  [0xC9B8E6, 0xA88CD0, 0xE6DCF6, 0x6A589C], // iris violet
];

/* ═══════════════════════════════════════════════════════════════
   Deterministic RNG (seeded) — same seed → same artwork forever
   ═══════════════════════════════════════════════════════════════ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/* ═══════════════════════════════════════════════════════════════
   Procedural thumbnail → HTMLCanvasElement
   ═══════════════════════════════════════════════════════════════ */

/**
 * Draw an abstract floral composition for an artwork onto a fresh canvas.
 * Deterministic from `artwork.seed` + `artwork.palette`.
 *
 * @param artwork  The artwork to render.
 * @param size     Canvas width/height in px (square). Use ~96 for in-world,
 *                 ~360 for the popup.
 */
export function generateArtworkCanvas(artwork: Artwork, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const rng = mulberry32(artwork.seed || 1);
  const pal = artwork.palette.length >= 3 ? artwork.palette : PALETTES[0];
  const u = size / 100; // unit scale so all coords are resolution-independent

  // ── Background: soft warm paper with a faint radial vignette ──
  ctx.fillStyle = '#FBF7F0';
  ctx.fillRect(0, 0, size, size);

  const vg = ctx.createRadialGradient(
    size * 0.5, size * 0.42, size * 0.1,
    size * 0.5, size * 0.5, size * 0.75,
  );
  vg.addColorStop(0, 'rgba(255,255,255,0.5)');
  vg.addColorStop(1, 'rgba(220,205,185,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, size, size);

  // ── Layer 1: a couple of big translucent color-field blobs ──
  const blobCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < blobCount; i++) {
    const cx = (20 + rng() * 60) * u;
    const cy = (20 + rng() * 60) * u;
    const r = (18 + rng() * 26) * u;
    ctx.beginPath();
    ctx.fillStyle = hex(pal[i % pal.length]);
    ctx.globalAlpha = 0.35;
    ctx.ellipse(cx, cy, r, r * (0.7 + rng() * 0.6), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Layer 2: a central flower — N petals around a core ──
  const flowerX = (38 + rng() * 24) * u;
  const flowerY = (38 + rng() * 24) * u;
  const petals = 5 + Math.floor(rng() * 3);
  const petalLen = (14 + rng() * 8) * u;
  const petalWid = (6 + rng() * 4) * u;
  const petalColor = pal[1 % pal.length];
  const rot0 = rng() * Math.PI * 2;

  for (let i = 0; i < petals; i++) {
    const a = rot0 + (i / petals) * Math.PI * 2;
    const px = flowerX + Math.cos(a) * petalLen * 0.55;
    const py = flowerY + Math.sin(a) * petalLen * 0.55;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = hex(petalColor);
    ctx.ellipse(0, 0, petalWid, petalLen, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.8 * u;
    ctx.strokeStyle = hex(pal[3 % pal.length]);
    ctx.stroke();
    ctx.restore();
  }
  // Core
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.fillStyle = hex(pal[2 % pal.length]);
  ctx.arc(flowerX, flowerY, (5 + rng() * 3) * u, 0, Math.PI * 2);
  ctx.fill();

  // ── Layer 3: a few loose hand-drawn stems / strokes ──
  const strokes = 2 + Math.floor(rng() * 3);
  ctx.lineCap = 'round';
  for (let i = 0; i < strokes; i++) {
    ctx.beginPath();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = hex(pal[(i + 2) % pal.length]);
    ctx.lineWidth = (0.8 + rng() * 1.4) * u;
    const sx = rng() * 100 * u;
    const sy = 100 * u;
    const ex = (sx + (rng() - 0.5) * 40 * u);
    const ey = (40 + rng() * 30) * u;
    const mx = (sx + ex) / 2 + (rng() - 0.5) * 20 * u;
    const my = (sy + ey) / 2;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ── Layer 4: scattered pollen dots ──
  const dots = 6 + Math.floor(rng() * 8);
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = hex(pal[Math.floor(rng() * pal.length)]);
    ctx.arc(rng() * 100 * u, rng() * 100 * u, (0.6 + rng() * 1.2) * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Thin inner border to read as a "print" ──
  ctx.strokeStyle = 'rgba(120,100,80,0.35)';
  ctx.lineWidth = 1 * u;
  ctx.strokeRect(1.5 * u, 1.5 * u, size - 3 * u, size - 3 * u);

  return canvas;
}

/* ═══════════════════════════════════════════════════════════════
   Sample gallery catalogue
   (Replace with real titles/images when the artist supplies them.)
   ═══════════════════════════════════════════════════════════════ */

export const GALLERY_ARTWORKS: Artwork[] = [
  {
    id: 'art-001', title: 'Bloom No. 7', year: 2024,
    medium: 'Acrylic on canvas', dimensions: '60 × 80 cm',
    price: 1200, currency: 'USD', seed: 1147, palette: PALETTES[0],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-002', title: 'Soft Petals', year: 2023,
    medium: 'Watercolor on paper', dimensions: '40 × 50 cm',
    price: 650, currency: 'USD', seed: 2291, palette: PALETTES[1],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-003', title: 'Golden Hour', year: 2024,
    medium: 'Oil on linen', dimensions: '70 × 90 cm',
    price: null, currency: 'USD', seed: 3407, palette: PALETTES[4],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-004', title: 'Garden Study', year: 2022,
    medium: 'Gouache on board', dimensions: '30 × 40 cm',
    price: 480, currency: 'USD', seed: 4513, palette: PALETTES[3],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-005', title: 'Iris Dream', year: 2024,
    medium: 'Acrylic on canvas', dimensions: '50 × 70 cm',
    price: 980, currency: 'USD', seed: 5629, palette: PALETTES[7],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-006', title: 'Peach Whisper', year: 2023,
    medium: 'Mixed media', dimensions: '45 × 60 cm',
    price: 720, currency: 'USD', seed: 6731, palette: PALETTES[2],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-007', title: 'Morning Mist', year: 2025,
    medium: 'Watercolor on paper', dimensions: '35 × 45 cm',
    price: 540, currency: 'USD', seed: 7873, palette: PALETTES[5],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
  {
    id: 'art-008', title: 'Ember Bloom', year: 2024,
    medium: 'Oil on canvas', dimensions: '80 × 100 cm',
    price: 1800, currency: 'USD', seed: 8941, palette: PALETTES[6],
    orbitRadius: 0, orbitSpeed: 0, orbitOffset: 0, orbitTilt: 0,
  },
];

/* ═══════════════════════════════════════════════════════════════
   Orbit layout — distribute artworks across 3 elliptical rings
   ═══════════════════════════════════════════════════════════════ */

/**
 * Assign orbit parameters to each artwork, distributing them across three
 * concentric elliptical rings around GALLERY_CENTER. Mutates and returns the
 * array for convenience.
 *
 * Speeds are slow (≈ one revolution per 75–120 s) and staggered so artworks
 * never clump together.
 */
export function buildGalleryOrbits(artworks: Artwork[]): Artwork[] {
  // Ring definitions: [radius, tilt, periodSeconds]
  const rings: Array<[number, number, number]> = [
    [210, 0.5, 80],   // inner
    [315, 0.5, 100],  // middle
    [430, 0.52, 120], // outer
  ];

  artworks.forEach((art, i) => {
    const ringIdx = i % rings.length;
    const [radius, tilt, period] = rings[ringIdx];
    // Count how many artworks share this ring to space them evenly
    const inRing = artworks.filter((_, j) => j % rings.length === ringIdx).length;
    const posInRing = Math.floor(i / rings.length);

    art.orbitRadius = radius;
    art.orbitTilt = tilt;
    // radians per millisecond (negative on alternate rings for counter-rotation)
    const dir = ringIdx % 2 === 0 ? 1 : -1;
    art.orbitSpeed = dir * (Math.PI * 2) / (period * 1000);
    // Evenly space starting angles within the ring + small seed jitter
    const jitter = (mulberry32(art.seed)() - 0.5) * 0.3;
    art.orbitOffset = (posInRing / inRing) * Math.PI * 2 + jitter;
  });

  return artworks;
}

/** Format a price for display. */
export function formatPrice(art: Artwork): string {
  if (art.price == null) return 'Price on enquiry';
  const symbol = art.currency === 'USD' ? '$' : art.currency + ' ';
  return `${symbol}${art.price.toLocaleString('en-US')}`;
}
