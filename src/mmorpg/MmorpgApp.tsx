// ============================================================
// MMORPG APP — Main Game Canvas Component
// PixiJS v8 + React integration for teebai.flowers world
// ============================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Container, Point } from 'pixi.js';
import { WorldMap } from './game/WorldMap';
import { Camera } from './game/Camera';
import { ZoneManager, ZoneName } from './game/ZoneManager';
import { WindEffect } from './game/WindEffect';
import { PlayerController } from './game/PlayerController';
import { Character } from './entities/Character';
import { MassiveFlower } from './entities/MassiveFlower';
import { PortalFlower } from './entities/PortalFlower';
import { SteamParticleSystem } from './entities/SteamParticle';
import { generateGuestId } from './game/CharacterGenerator';
import { resolveCharacterDNA } from '../character/resolveDna';
import { SPAWN_POS, ZONES } from './utils/constants';
import { OrbitingArtwork } from './entities/OrbitingArtwork';
import { GALLERY_ARTWORKS, buildGalleryOrbits, GALLERY_CENTER, type Artwork } from './data/artworks';
import { ArtworkPopup } from './ui/ArtworkPopup';
import { Nameplate } from './entities/Nameplate';

// ── DEBUG BUILD MARKER ───────────────────────────────────────
// Bump this string on every push so you can confirm at a glance
// (on-screen + console) that the browser is running the NEW code
// and not a stale Vite bundle.
const BUILD_ID = 'heaven-portal-2026-07-28b';

/** Height (world px) the character falls from when arriving via the portal. */
const SKY_DROP_HEIGHT = 700;
/** Sky-drop fall duration in ms (ease-in, then squash-and-stretch landing). */
const SKY_DROP_MS = 1400;
/** Slightly larger scale while falling — settles to 1 on touchdown. */
const SKY_DROP_SCALE = 1.25;
/** sessionStorage flag set by the landing page just before the handoff. */
const PORTAL_ENTRY_KEY = 'flower-game:portal-entry';

/** Consume the portal-entry flag: true exactly once per landing handoff. */
function consumePortalEntryFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(PORTAL_ENTRY_KEY) === '1') {
      window.sessionStorage.removeItem(PORTAL_ENTRY_KEY);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/** Peek at the portal-entry flag without consuming it (initGame consumes). */
function peekPortalEntryFlag(): boolean {
  try {
    return window.sessionStorage.getItem(PORTAL_ENTRY_KEY) === '1';
  } catch { /* ignore */ }
  return false;
}

interface MmorpgAppProps {
  guestId?: string;
  /** Player display name shown above the character as a nameplate. */
  playerName: string;
  /** Called when the player taps the big minigame portal flower. */
  onOpenMinigame?: () => void;
}

export function MmorpgApp({ guestId, playerName, onOpenMinigame }: MmorpgAppProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  // Arriving via the portal: the world starts at the same brightest white
  // the tunnel ended on, then fades down to normal — one continuous light.
  const [arriving] = useState(peekPortalEntryFlag);
  // Ref keeps the portal tap callback fresh without re-initialising Pixi.
  const onOpenMinigameRef = useRef(onOpenMinigame);
  useEffect(() => {
    onOpenMinigameRef.current = onOpenMinigame;
  }, [onOpenMinigame]);

  const initGame = useCallback(async (container: HTMLDivElement) => {
    // Create PixiJS Application
    const app = new Application();
    await app.init({
      resizeTo: container,
      backgroundColor: 0x1a1a2e,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(app.canvas);
    appRef.current = app;

    // World container (moved by camera)
    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    // Create world map
    const worldMap = new WorldMap();
    worldContainer.addChild(worldMap);

    // Create camera
    const camera = new Camera();
    camera.resize(container.clientWidth, container.clientHeight);

    // Generate player character — resolveCharacterDNA applies the persisted
    // body-size override so the spawn matches the landing preview exactly.
    const dna = resolveCharacterDNA(guestId || generateGuestId());
    const character = new Character(dna);
    character.position.set(SPAWN_POS.x, SPAWN_POS.y);
    worldContainer.addChild(character);

    // Nameplate floating above the character
    const nameplate = new Nameplate(playerName, character);
    worldContainer.addChild(nameplate);

    // Player controller
    const controller = new PlayerController(character);

    // ── Portal sky-drop: arriving from the landing page, the character
    //    falls out of the sky and lands on the grass (one continuous motion
    //    from the portal transition). Input is suppressed until touchdown.
    let skyDrop: { t: number } | null = null;
    if (consumePortalEntryFlag()) {
      character.setHeight(SKY_DROP_HEIGHT);
      character.setFlyScale(SKY_DROP_SCALE);
      character.alpha = 0;
      controller.setEnabled(false);
      skyDrop = { t: 0 };
    }

    // Wind effect
    const windEffect = new WindEffect();

    // Timestamp of the most recent wind landing — suppresses the stale
    // click that triggered the wind from also moving the character after
    // landing (the browser 'click' event fires after pointerup).
    let lastWindEnd = 0;

    // Zone manager
    const zoneManager = new ZoneManager();
    zoneManager.setCallbacks({
      onEnterWind: (char, x, y) => {
        // Disable player control during wind
        controller.setEnabled(false);
        // Trigger wind blow
        windEffect.trigger(char, x, y, () => {
          // Wind complete — re-enable control and arm the stale-click guard
          controller.setEnabled(true);
          lastWindEnd = performance.now();
        });
      },
      onEnterHotSpring: () => {
        console.log('Entered Hot Spring — chat mode');
      },
      onEnterMinigame: () => {
        console.log('Entered Minigame Portal');
      },
      onEnterShop: () => {
        console.log('Entered Shop');
      },
      onEnterGallery: () => {
        console.log('Entered Gallery');
      },
      onEnterCommunity: () => {
        console.log('Entered Community');
      },
      onEnterArtists: () => {
        console.log('Entered Special Artists zone');
      },
    });

    // Zone-specific entities
    // ── Gallery: flower centerpiece + orbiting artworks ──
    // Isolated container with depth-sorting so nearer artworks overlap the
    // flower core and farther ones tuck behind it.
    const galleryContainer = new Container();
    galleryContainer.sortableChildren = true;
    worldContainer.addChild(galleryContainer);

    const galleryFlower = new MassiveFlower(GALLERY_CENTER.x, GALLERY_CENTER.y, 150);
    galleryFlower.zIndex = GALLERY_CENTER.y; // depth-sort with artworks by y
    galleryContainer.addChild(galleryFlower);

    // Artwork detail popup (HTML overlay).
    const artworkPopup = new ArtworkPopup(container);
    // Ordered catalogue enables ‹ › prev/next navigation inside the popup.
    artworkPopup.setCollection(GALLERY_ARTWORKS);
    artworkPopup.onClose(() => controller.setEnabled(true));

    // Timestamp of the most recent artwork tap — used to suppress the
    // click-to-move that would otherwise also fire on the same click.
    let lastArtworkTap = 0;

    // Build orbiting artworks across 3 elliptical rings.
    // They start HIDDEN — the gallery is empty until the flower is tapped.
    const orbitingArtworks: OrbitingArtwork[] = [];
    buildGalleryOrbits(GALLERY_ARTWORKS).forEach((art: Artwork) => {
      const node = new OrbitingArtwork(art);
      node.onOpen((data) => {
        controller.setEnabled(false); // freeze player while reading the popup
        artworkPopup.show(data);
      });
      // Any tap on an artwork must not also trigger a ground move.
      node.on('pointertap', () => { lastArtworkTap = performance.now(); });
      galleryContainer.addChild(node);
      orbitingArtworks.push(node);
    });

    // ── Bloom the gallery on a SINGLE click of the flower ──
    // The flower fires on pointerdown (see MassiveFlower.enableInteraction),
    // so one press instantly blossoms every artwork out of the centre,
    // staggered so they open one after another.
    galleryFlower.enableInteraction(() => {
      lastArtworkTap = performance.now(); // suppress click-to-move from this tap
      orbitingArtworks.forEach((art, i) => art.bloom(i * 70));
    });

    // Minigame portal — tapping the big flower opens the game lobby.
    // lastPortalTap suppresses the click-to-move that the same press would
    // otherwise trigger on the ground (same pattern as artwork taps).
    let lastPortalTap = 0;
    const minigamePortal = new PortalFlower(2700, 1500, 'minigame');
    minigamePortal.enableInteraction(() => {
      lastPortalTap = performance.now();
      onOpenMinigameRef.current?.();
    });
    worldContainer.addChild(minigamePortal);

    // Shop portal
    const shopPortal = new PortalFlower(2700, 300, 'shop');
    worldContainer.addChild(shopPortal);

    // Hot Spring steam
    const steamSystem = new SteamParticleSystem(100, 2400, 600, 400);
    worldContainer.addChild(steamSystem);

    // Click-to-move handler
    const handleClick = (e: MouseEvent) => {
      if (windEffect.isActive()) return;
      if (artworkPopup.isVisible()) return;
      // Ignore the click if it just landed on an artwork (prevents the
      // character from walking when the player taps an orbiting piece).
      if (performance.now() - lastArtworkTap < 300) return;
      // Ignore the click that immediately follows a wind landing (the
      // press that triggered the wind resolves as a click on pointerup).
      if (performance.now() - lastWindEnd < 350) return;
      // Ignore the click that just opened a portal (lobby popup).
      if (performance.now() - lastPortalTap < 300) return;
      const worldPos = camera.screenToWorld(e.clientX, e.clientY);
      controller.handleClick(worldPos.x, worldPos.y);
    };
    app.canvas.addEventListener('click', handleClick);

    // ── Pointer steering during wind (touch-drag + mouse) ──
    // Drag from the press point: direction = lean direction, magnitude
    // ramps from a 24px deadzone to full at 120px. Works alongside the
    // keyboard steer vector (keyboard wins when both are active).
    let pointerSteer = { x: 0, y: 0 };
    let steerPointerId: number | null = null;
    let steerStart = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      if (!windEffect.isActive()) return;
      steerPointerId = e.pointerId;
      steerStart = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== steerPointerId) return;
      const dx = e.clientX - steerStart.x, dy = e.clientY - steerStart.y;
      const len = Math.hypot(dx, dy);
      if (len < 24) { pointerSteer = { x: 0, y: 0 }; return; }
      const m = Math.min(1, len / 120);
      pointerSteer = { x: (dx / len) * m, y: (dy / len) * m };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === steerPointerId) { steerPointerId = null; pointerSteer = { x: 0, y: 0 }; }
    };
    app.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    // pointercancel (e.g. OS gesture interrupt on mobile) must also release
    // the steer pointer or the input would stick for the rest of the flight.
    window.addEventListener('pointercancel', onPointerUp);

    // Resize handler
    const handleResize = () => {
      camera.resize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // ── DEBUG HUD (temporary) ────────────────────────────────
    // On-screen overlay showing build marker + live character coords.
    // Confirms the new bundle is loaded and where the character actually is.
    console.log(`[teebai.world] BUILD ${BUILD_ID} loaded`);
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute', 'top:8px', 'left:8px', 'z-index:9999',
      'background:rgba(0,0,0,0.6)', 'color:#7CFC9B',
      'font:12px/1.5 monospace', 'padding:8px 10px',
      'border-radius:6px', 'pointer-events:none', 'white-space:pre',
    ].join(';');
    hud.textContent = `BUILD ${BUILD_ID}\nloading...`;
    // Ensure the wrapper is a positioning context for the absolute HUD.
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(hud);
    let hudTimer = 0;

    // Current zone display
    let currentZone: ZoneName = 'none';

    // Game loop
    app.ticker.add((ticker) => {
      const delta = ticker.deltaTime;
      const deltaMS = ticker.deltaMS;

      // Sky-drop takes priority over everything until touchdown.
      if (skyDrop) {
        skyDrop.t += deltaMS;
        const p = Math.min(1, skyDrop.t / SKY_DROP_MS);
        const easeIn = p * p; // accelerating fall
        character.setHeight(SKY_DROP_HEIGHT * (1 - easeIn));
        character.alpha = Math.min(1, p * 2.5);
        character.setFlyScale(SKY_DROP_SCALE + (1 - SKY_DROP_SCALE) * p);
        if (p >= 1) {
          character.setHeight(0);
          character.alpha = 1;
          character.setFlyScale(1);
          character.playLanding(); // squash-and-stretch bounce
          controller.setEnabled(true);
          skyDrop = null;
        }
        camera.setLerp(0.12);
      } else if (windEffect.isActive()) {
        // Feed steering every frame: keyboard wins, else pointer drag.
        const ks = controller.getSteerVector();
        windEffect.setSteerInput(
          ks.x !== 0 || ks.y !== 0 ? ks.x : pointerSteer.x,
          ks.x !== 0 || ks.y !== 0 ? ks.y : pointerSteer.y,
        );
        windEffect.tick(deltaMS);
        // Tight camera follow during wind so character stays on-screen
        camera.setLerp(0.1);
      } else {
        // Normal camera follow
        camera.setLerp(0.08);

        // Player movement
        controller.update(delta, deltaMS);

        // Zone detection
        const pos = controller.getPosition();
        const newZone = zoneManager.update(pos.x, pos.y, character);
        if (newZone !== currentZone) {
          currentZone = newZone;
          console.log(`Zone: ${newZone}`);
        }
      }

      // Camera follows character position
      const charPos = new Point(character.x, character.y);
      camera.follow(charPos);
      camera.update(delta);
      camera.applyTo(worldContainer);

      // Update entities (Character expects real milliseconds)
      character.tick(deltaMS);
      nameplate.tick(deltaMS);
      galleryFlower.tick(delta);
      minigamePortal.tick(delta);
      shopPortal.tick(delta);
      steamSystem.tick(deltaMS);
      worldMap.tick(delta);

      // Orbit artworks + depth-sort them against the flower by world Y
      for (const art of orbitingArtworks) {
        art.zIndex = art.tick(deltaMS);
      }

      // ── DEBUG HUD update (~6x/sec) ──
      hudTimer += deltaMS;
      if (hudTimer > 160) {
        hudTimer = 0;
        const windOn = windEffect.isActive();
        hud.textContent =
          `BUILD ${BUILD_ID}\n` +
          `X:${character.x.toFixed(1)}  Y:${character.y.toFixed(1)}  Z:${character.z.toFixed(1)}\n` +
          `zone:${currentZone}  wind:${windOn ? 'ON' : 'off'}\n` +
          `cam:${camera.getPosition().x.toFixed(0)},${camera.getPosition().y.toFixed(0)}` +
          (windOn
            ? `\nsteer: WASD/drag · brake: hold against wind\n` +
              `braking:${windEffect.getState().braking ? 'YES' : 'no'}`
            : '');
      }
    });

    // Cleanup function
    return () => {
      app.canvas.removeEventListener('click', handleClick);
      app.canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', handleResize);
      hud.remove();
      artworkPopup.destroy();
      app.destroy(true, { children: true });
    };
  }, [guestId, playerName]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;

    initGame(container).then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      cleanup?.();
    };
  }, [initGame]);

  return (
    <>
      <div
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: '#1a1a2e',
        }}
      />
      {arriving && (
        <>
          <style>{`
            @keyframes world-arrival-fade {
              0% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
          {/* Arrival flash: matches the tunnel's brightest white, then
              eases down to the normal world while the character drops. */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9990,
              pointerEvents: 'none',
              background: '#ffffff',
              animation: 'world-arrival-fade 1.8s ease-out 0.15s forwards',
            }}
          />
        </>
      )}
    </>
  );
}
