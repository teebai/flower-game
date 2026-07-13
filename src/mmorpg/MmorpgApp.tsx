// ============================================================
// MMORPG APP — Main Game Canvas Component
// PixiJS v8 + React integration for teebai.flowers world
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
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
import { generateCharacterDNA, generateGuestId } from './game/CharacterGenerator';
import { SPAWN_POS, ZONES } from './utils/constants';

interface MmorpgAppProps {
  guestId?: string;
}

export function MmorpgApp({ guestId }: MmorpgAppProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

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

    // Generate player character
    const dna = generateCharacterDNA(guestId || generateGuestId());
    const character = new Character(dna);
    character.position.set(SPAWN_POS.x, SPAWN_POS.y);
    worldContainer.addChild(character);

    // Player controller
    const controller = new PlayerController(character);

    // Wind effect
    const windEffect = new WindEffect();

    // Zone manager
    const zoneManager = new ZoneManager();
    zoneManager.setCallbacks({
      onEnterWind: (char, x, y) => {
        // Disable player control during wind
        controller.setEnabled(false);
        // Trigger wind blow
        windEffect.trigger(char, x, y, () => {
          // Wind complete — re-enable control
          controller.setEnabled(true);
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
    // Gallery massive flower
    const galleryFlower = new MassiveFlower(1500, 300, 150);
    worldContainer.addChild(galleryFlower);

    // Minigame portal
    const minigamePortal = new PortalFlower(2700, 1500, 'minigame');
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
      const worldPos = camera.screenToWorld(e.clientX, e.clientY);
      controller.handleClick(worldPos.x, worldPos.y);
    };
    app.canvas.addEventListener('click', handleClick);

    // Resize handler
    const handleResize = () => {
      camera.resize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Current zone display
    let currentZone: ZoneName = 'none';

    // Game loop
    app.ticker.add((ticker) => {
      const delta = ticker.deltaTime;
      const deltaMS = ticker.deltaMS;

      // Wind effect (takes priority over player movement)
      if (windEffect.isActive()) {
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

      // Update entities
      character.tick(delta);
      galleryFlower.tick(delta);
      minigamePortal.tick(delta);
      shopPortal.tick(delta);
      steamSystem.tick(deltaMS);
      worldMap.tick(delta);
    });

    // Cleanup function
    return () => {
      app.canvas.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      app.destroy(true, { children: true });
    };
  }, [guestId]);

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
  );
}
