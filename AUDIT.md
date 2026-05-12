# FLOWER GAME v2 — COMPREHENSIVE AUDIT & REFACTOR PLAN

## 📊 AUDIT RESULTS

### 1. CODEBASE OVERVIEW
| Metric | Value |
|--------|-------|
| **Total Lines** | ~13,828 |
| **FlowerBoard.tsx** | 4,663 lines (34% of entire app!) |
| **styles.css** | 5,589 lines |
| **GardenPhysics.ts** | 589 lines |
| **useMatterGardens.ts** | 512 lines |
| **FlowerGame.ts** | 463 lines |
| **CardChip.tsx** | 233 lines |
| **Console.log statements** | 40+ scattered |
| **React hooks in FlowerBoard** | 135+ |
| **Event handlers in FlowerBoard** | 275+ |

---

### 2. 🚨 CRITICAL ISSUES

#### A. MONOLITHIC FlowerBoard.tsx (4,663 lines)
**Problem:** One file handles EVERYTHING:
- Game state management
- Drag & drop system
- Card rendering
- Garden rendering
- Animation system
- Hover effects
- Modal/popup management
- Timer logic
- Chat system
- Sound effects
- Theme switching
- Mobile responsiveness

**Impact:** 
- Impossible to debug
- React re-renders everything on any state change
- Hot reload takes 3+ seconds
- One bug breaks the entire UI

#### B. Animation System (COMPLETELY DISABLED)
**Status:** `ActionAnimationOverlay` returns `null` — animations are off
**History:** Tried 5 different implementations, all caused blank screens
**Root cause:** `setActiveAnimation()` triggers render loop → overlay blocks clicks → game unplayable

#### C. Console.log Pollution
**40+ statements** including:
- `console.warn` for card kind debugging (left from joker card hunt)
- `console.log` in drag system
- `console.log` in server moves
- `console.log` in physics engine

**Impact:** Slows performance, clutters DevTools

#### D. CSS Architecture Failure
| Metric | Current | Target |
|--------|---------|--------|
| CSS classes | 5,000+ | ~200 |
| CSS variables used | ~300 | 50+ core variables |
| CSS file size | 105KB | ~30KB |
| Inline styles in JSX | 200+ | 0 |

**Problem:** Every card state has its own class. Changing one color requires editing 20+ rules.

#### E. Hover/Targeting System (PARTIALLY WORKING)
**Status:** 
- `hoverMode` computed correctly
- CSS classes added to flowers
- BUT: Inline `transform` from Matter.js overrides CSS animation
- Result: Flowers don't visually react to hover

#### F. Anti-Overlap Physics (UNTESTED)
**Status:** Added repulsion force but not verified working
**Risk:** May cause flowers to jitter or fly off screen

---

### 3. ⚠️ MODERATE ISSUES

#### A. Dead Code
- `shownAnimationsRef` — part of disabled global animation system
- `prevSeasonRef` — part of disabled global animation system  
- Multiple commented-out animation attempts in `ActionAnimationOverlay.tsx`
- Backup files in `src_backup_*` directories

#### B. Asset Management
- 22 GIF files in dist (animations + card art)
- No lazy loading — all assets bundled upfront
- Card art loaded as inline SVG strings (heavy)

#### C. Bundle Size
- JS: 940KB (single chunk)
- CSS: 105KB
- Total: ~1.1MB before images
- **Vite warning:** "chunks larger than 500 kB"

#### D. Server/Client Sync
- `npm run build` (Vite) **wipes** `dist/server/` and `dist/game/`
- Must recompile server AFTER every client build
- Easy to forget → stale server code

#### E. Multiplayer Architecture
- `localhost:8000` hardcoded until recent fix
- WebSocket connection fails silently on wrong network
- No connection status indicator
- No reconnection logic

---

### 4. ✅ WHAT'S WORKING WELL

| Feature | Status |
|---------|--------|
| Core game logic (engine) | ✅ Solid |
| Matter.js physics | ✅ Running, flowers float |
| Server (boardgame.io) | ✅ Health check OK |
| playerView (no hand hiding) | ✅ Fixed |
| Card rendering (no emoji overlay) | ✅ Fixed |
| Drag & drop system | ✅ Functional |
| Game log | ✅ Working |
| Mobile responsive layout | ✅ Working |
| Theme switching | ✅ Working |
| Sound effects | ✅ Working |
| Timer | ✅ Working |
| Chat | ✅ Working |

---

## 🔧 REFACTOR PLAN

### PHASE 1: CLEANUP (1-2 hours)
**Goal:** Remove dead code, fix immediate issues

1. **Delete console.logs**
   - Remove all `console.log/warn/error` from FlowerBoard.tsx
   - Keep only critical error logging
   
2. **Remove dead animation code**
   - Delete `shownAnimationsRef`, `prevSeasonRef`
   - Remove commented-out animation attempts
   - Keep `ActionAnimationOverlay` as simple pass-through

3. **Delete backup files**
   - Remove `src_backup_*` directories
   
4. **Fix CSS dark bar**
   - Verify `.v2-action-row` and `.v2-hand-dock` are transparent

5. **Fix server build pipeline**
   - Create `build-all.sh` script: `npm run build && npx tsc -p tsconfig.server.json`

### PHASE 2: CSS REFACTOR (2-3 hours)
**Goal:** Replace 5,000 classes with ~200 using CSS variables

1. **Define core CSS variables**
   ```css
   :root {
     --bg-primary: #faf5f7;
     --bg-garden: transparent;
     --card-width: 68px;
     --card-height: 92px;
     --flower-size: 28px;
     --flower-hover-scale: 1.5;
     --color-wind: #1e3a5f;
     --color-plant: #2d5a3e;
     --color-danger: #e94560;
     --shadow-card: 0 2px 8px rgba(0,0,0,0.15);
     --shadow-garden: 0 4px 12px rgba(0,0,0,0.1);
     --transition-fast: 150ms;
     --transition-medium: 300ms;
   }
   ```

2. **Create utility classes**
   - `.card-chip` — base card styles
   - `.card-chip--power` — power card modifier
   - `.card-chip--flower` — flower card modifier
   - `.card-chip--hover` — hover state
   - `.card-chip--dragging` — drag state
   - `.garden-flower` — base flower styles
   - `.garden-flower--target` — targeting state
   - `.garden-flower--wiggle` — animation state

3. **Remove 4,800+ redundant class definitions**
   - Merge `.v2-shell.theme-spring .x` into `[data-theme="spring"] .x`
   - Replace per-card classes with attribute selectors

### PHASE 3: MODULARIZE FlowerBoard.tsx (4-6 hours)
**Goal:** Split 4,663 lines into ~10 focused modules

```
src/board/
├── FlowerBoard.tsx          (main orchestrator, ~500 lines)
├── components/
│   ├── GameHeader.tsx       (timer, phase, scores)
│   ├── PlayerHand.tsx       (card rendering, drag, sort)
│   ├── GardenArena.tsx      (garden layout, pan/zoom)
│   ├── GardenFlowerField.tsx  (flower rendering — EXISTING)
│   ├── MovePanel.tsx        (action buttons, move type selection)
│   ├── SuggestedMoves.tsx   (hint system)
│   ├── AnimationOverlay.tsx (power card animations)
│   ├── EventModal.tsx       (target selection modals)
│   ├── GameLog.tsx          (log display)
│   └── ChatBubble.tsx       (chat system)
├── hooks/
│   ├── useDragAndDrop.ts    (drag logic extracted)
│   ├── useCardTargeting.ts  (hover mode computation)
│   ├── useGameAnimations.ts (animation state management)
│   ├── useSoundEffects.ts   (audio)
│   └── useMatterGardens.ts  (EXISTING — keep)
└── utils/
    ├── cardAnimations.ts    (EXISTING — keep)
    ├── cardUtils.ts         (EXISTING — keep)
    └── gardenUtils.ts       (layout calculations)
```

**Extraction priority:**
1. `useDragAndDrop.ts` — ~200 lines from FlowerBoard
2. `useCardTargeting.ts` — hover mode logic (~100 lines)
3. `PlayerHand.tsx` — hand rendering (~400 lines)
4. `MovePanel.tsx` — action buttons (~300 lines)
5. `AnimationOverlay.tsx` — animation system (~150 lines)
6. `EventModal.tsx` — modals (~200 lines)

### PHASE 4: FIX HOVER TARGETING (2-3 hours)
**Goal:** Make drag→hover→target intuitive

**Architecture:**
```typescript
// useCardTargeting.ts
interface TargetingState {
  mode: 'flower' | 'set' | 'garden' | 'none';
  targetId: string | null;     // flower ID, set ID, or player ID
  targetSetId: string | null;
  targetPlayerId: string | null;
  validTargets: Set<string>;   // pre-computed valid targets
}

// When dragging starts:
// 1. Compute valid targets from card type
// 2. Highlight valid gardens/sets/flowers
// 3. On hover: highlight specific target
// 4. On release: play card immediately (no popup for simple moves)
```

**Visual feedback:**
- **Flower mode** (Wind/Bug): Target flower → `scale(1.5)` + gold glow + gentle wiggle
- **Set mode** (Natural Disaster/Bee): Target set → all flowers `scale(1.15)` + shake
- **Garden mode** (Trade): Target garden → all flowers pulse + blue glow
- **Invalid target**: Grayed out, no reaction

**Key fix:** Use CSS custom properties for transform so Matter.js inline styles don't conflict:
```css
.garden-flower {
  transform: rotate(var(--rotation)) scale(var(--scale));
}
.garden-flower.is-target {
  --scale: 1.5;
  animation: targetWiggle 0.5s ease infinite;
}
```

### PHASE 5: REBUILD ANIMATION SYSTEM (3-4 hours)
**Goal:** Global animations visible to ALL players, ONCE per event

**Architecture:**
```typescript
// Server-side: add to game state
interface GameState {
  // ... existing fields ...
  lastEvent: {
    type: 'season' | 'eclipse' | 'let_go' | 'great_reset' | 'natural_disaster';
    playerId: string;
    timestamp: number;  // for deduplication
  } | null;
}

// Client-side: read lastEvent, show animation, clear it
useEffect(() => {
  if (G.lastEvent && G.lastEvent.timestamp !== lastShownTimestamp) {
    showAnimation(G.lastEvent.type);
    lastShownTimestamp = G.lastEvent.timestamp;
  }
}, [G.lastEvent]);
```

**Animation component:**
- Simple: `<img src={gifUrl} onLoad={...} onError={...} />`
- Auto-dismiss: 2.5s or tap
- No pointer-events blocking (use `pointer-events: none` on container)
- Position: fixed, centered, z-index 999

### PHASE 6: OPTIMIZE ASSETS & BUNDLE (2-3 hours)

1. **Code splitting**
   ```javascript
   // vite.config.ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'physics': ['matter-js'],
           'game-engine': ['./engine/engine.ts'],
           'card-art': ['./cards/cardArt.tsx'],
           'animations': ['./cards/actionAnimations.ts'],
         }
       }
     }
   }
   ```

2. **Lazy load card art**
   ```typescript
   const CardArt = lazy(() => import('./cards/CardArt'));
   ```

3. **Compress GIFs**
   - Use `gifsicle` or `ffmpeg` to reduce GIF file sizes
   - Convert simple animations to CSS or Lottie JSON

4. **Object pooling for flowers**
   - Reuse Matter.js bodies instead of creating/destroying
   - Pre-allocate body pool per garden

### PHASE 7: SERVER HARDENING (1-2 hours)

1. **Build script**
   ```bash
   #!/bin/bash
   # build-all.sh
   set -e
   echo "Building client..."
   npm run build
   echo "Building server..."
   npx tsc -p tsconfig.server.json
   echo "Done!"
   ```

2. **Health check endpoint**
   - Already exists ✅
   - Add version info, player count

3. **CORS configuration**
   - Allow local WiFi IPs dynamically
   - Whitelist for production

---

## 📋 EXECUTION ORDER

| Phase | Time | Priority | Risk |
|-------|------|----------|------|
| 1. Cleanup | 1-2h | 🔴 CRITICAL | Low |
| 2. CSS Refactor | 2-3h | 🔴 CRITICAL | Medium |
| 3. FlowerBoard Modularization | 4-6h | 🟡 MODERATE | High (breaks things) |
| 4. Hover Targeting | 2-3h | 🔴 CRITICAL | Medium |
| 5. Animation System | 3-4h | 🟡 MODERATE | Medium |
| 6. Asset Optimization | 2-3h | 🟢 LOW | Low |
| 7. Server Hardening | 1-2h | 🟢 LOW | Low |

**Total: ~15-23 hours**

**Recommended approach:** Do Phase 1 → 4 → 2 → 5 → 6 → 3 → 7
(Quick wins first, modularization last since it's most disruptive)

---

## 🎯 IMMEDIATE NEXT STEPS

1. **Phase 1: Cleanup** — I can do this now (30 min)
2. **Phase 4: Hover targeting fix** — Critical for gameplay (2-3 hours)
3. **Phase 5: Animation rebuild** — You wanted this (3-4 hours)
4. **Deploy & test** — Verify nothing broke
5. **Phase 3: Modularization** — Big refactor, do when game is stable

**What do you want me to start with?**
