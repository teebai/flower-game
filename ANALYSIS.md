# DEEP ANALYSIS — 4 Persistent Bugs

## 1. Face-Down Card (❓) Still Appearing

**Root Cause: NOT playerView anymore** — I disabled hand hiding in `playerView`.

**Actual cause**: The `myHand` in `FlowerBoard.tsx` comes from `me?.hand` where `me = G.players.find(p => p.id === playerID)`. The `playerID` from boardgame.io's `BoardProps` could be a NUMBER (e.g., `0`) while `p.id` from the engine is a STRING (e.g., `"0"`). When the comparison fails, `me` becomes `undefined`, and `myHand` becomes empty — but the UI still tries to render something.

Wait, actually that's not right either. Let me look more carefully at what the screenshot shows. The ❓ card is a `kind: 'hidden'` card. These are created by `playerView`. If `playerView` is truly disabled, these shouldn't exist.

**Possibility**: The server is running a CACHED/COMPILED version of the game. The `server/index.ts` imports `FlowerGame` from `../game/FlowerGame.js`. If there's no `.js` file, Node.js/tsx resolves it to `.ts`. But if the server was started BEFORE my edit, it might have the old version in memory.

**Fix**: Restart the server to load the updated `FlowerGame.ts`.

---

## 2. Global Animation Not Triggering

**Root Cause**: `getActionAnimation()` imports GIF files:
```ts
import windAnim from '../assets/animations/wind-animation.gif';
```

These are Vite static asset imports. At build time, Vite resolves them to hashed URLs like `/assets/wind-animation-abc123.gif`. The import returns a STRING URL.

**BUT**: `ActionAnimationOverlay` has this code:
```ts
const url = getActionAnimation(active.name, active.phase);
if (!url) { onComplete(); return; } // SKIPS animation if url is falsy!
```

If `url` is an empty string or undefined, the overlay immediately calls `onComplete()` and never renders.

**Why would url be empty?** The `import` might be resolving to `undefined` if the asset isn't found, or the module isn't properly bundled.

**Fix**: Add defensive logging and fallback. Ensure the overlay ALWAYS renders something even if the GIF fails.

---

## 3. Flowers Bouncing Too Far

**Root Cause**: `gardenEllipse()` calculates rx/ry based on TOTAL flower count across ALL gardens:
```ts
const rx = Math.min(260, 80 + flowerCount * 9);   // up to 260px
const ry = Math.min(200, 60 + flowerCount * 7);   // up to 200px
```

But the actual garden container (CSS) is only:
- Desktop: ~160-200px wide
- Mobile: ~130-180px wide

So flowers spawn at x=170 in a 160px garden — they're WAY outside. Then:
- Center pull force: `GARDEN_CENTER_K = 0.0005` → `0.0005 * 170 = 0.085` per frame
- Boundary force: `BOUNDARY_K = 0.003` → extremely gentle
- Damping: `0.72` → velocities decay slowly

Result: Flowers take 3-5 seconds to drift back from their spawn positions.

**Fix**: `gardenEllipse` must use the ACTUAL garden container dimensions, not flower count. Or the spawn positions must be proportional to garden size.

---

## 4. Flowers Cropped on Mobile

**Same root cause as #3**: Flowers are positioned outside the garden bounds (because rx/ry > garden width/height), so `overflow: hidden` on the garden container clips them.

**Fix**: Same as #3 — keep flowers within garden bounds.

---

## COMPREHENSIVE FIX PLAN

### Step 1: Restart Server (critical for face-down card fix)
The server must reload the updated `FlowerGame.ts` with disabled `playerView` hand hiding.

### Step 2: Fix Garden Physics
Replace `gardenEllipse(flowerCount)` with a function that uses actual DOM garden dimensions. Scale all physics forces and spawn positions proportionally.

### Step 3: Fix Animation Overlay
Add defensive rendering: if `getActionAnimation` returns falsy, show a CSS animation fallback instead of silently skipping.

### Step 4: Verify All Fixes
Test each bug independently.
