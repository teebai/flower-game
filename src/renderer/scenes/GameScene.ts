// ============================================================
// FLOWER GAME v2 — GAME SCENE
// Manages the arena camera, gardens, and touch input.
// Ported from v7 renderer.
// ============================================================

import { Application, Container, Graphics, FederatedPointerEvent } from 'pixi.js';
import type { Player, GardenSet } from '../../types/gameTypes';
import { GardenView, GardenViewPlayer } from '../entities/GardenView';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.0;

interface CameraState {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export interface GameSceneState {
  players: GardenViewPlayer[];
  currentPlayerId: string;
  myPlayerId: string | null;
  godsFavouritePlayerId: string | null;
  gardenPositions?: Array<{ playerId: string; x: number; y: number }>;
  gardenSectors?: Array<{ playerId: string; centerAngle: number; halfAngle: number; innerR: number; outerR: number }>;
  hoveredPlayerId?: string | null;
  hoveredSetId?: string | null;
}

export class GameScene {
  container: Container;
  cameraContainer: Container;
  gardens = new Map<string, GardenView>();
  camera: CameraState;

  private app: Application;
  private bgGraphics: Graphics;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private cameraDragStart = { x: 0, y: 0 };
  private lastPinchDist = 0;
  private lastPinchCenter = { x: 0, y: 0 };
  private turnTransitionTimer = 0;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.hitArea = { contains: () => true }; // Catch all events

    this.bgGraphics = new Graphics();
    this.container.addChild(this.bgGraphics);

    this.cameraContainer = new Container();
    this.container.addChild(this.cameraContainer);

    // Camera origin marker (subtle, for debugging)
    const camOrigin = new Graphics();
    camOrigin.circle(0, 0, 4);
    camOrigin.fill({ color: 0xff00ff, alpha: 0.3 });
    this.cameraContainer.addChild(camOrigin);

    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
      targetX: 0,
      targetY: 0,
      targetZoom: 1,
    };

  }

  init(): void {
    this.drawBackground();
    // Input handling disabled — Pixi is decorative; DOM arena handles all zoom/pan/touch
    // this.setupInput();
  }

  update(dt: number): void {
    // Log camera state once per 10 seconds for debugging
    // Camera debug logging removed for production

    // Turn transition: briefly pause camera lerp
    if (this.turnTransitionTimer > 0) {
      this.turnTransitionTimer -= dt;
      const flash = Math.max(0, Math.sin((this.turnTransitionTimer / 800) * Math.PI));
      // Subtle flash effect could be added here
    }

    // Smooth camera lerp
    const lerp = 1 - Math.exp(-dt * 0.008);
    this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * lerp;

    this.cameraContainer.scale.set(this.camera.zoom);
    this.cameraContainer.position.set(
      this.app.screen.width / 2 + this.camera.x * this.camera.zoom,
      this.app.screen.height / 2 + this.camera.y * this.camera.zoom,
    );

    // Update gardens
    for (const garden of this.gardens.values()) {
      garden.update(dt);
    }
  }

  syncWithState(state: GameSceneState): void {
    const { players, currentPlayerId, myPlayerId, godsFavouritePlayerId, gardenPositions, gardenSectors } = state;

    // Use DOM garden positions if available, otherwise fall back to computeArenaLayout
    const positions = gardenPositions && gardenPositions.length > 0
      ? players.map((p) => {
          const pos = gardenPositions.find((g) => g.playerId === p.id);
          return pos || { x: 0, y: 0 };
        })
      : this.computeArenaLayout(players, myPlayerId);

    const validIds = new Set(players.map((p) => p.id));

    // ── Gardens rendered via DOM layer — Pixi flower sync disabled ──
    // useSectorFlowerLayout in GardenFlowerField handles all flower positioning.
    // Pixi GardenView is kept for future background effects but flowers are pure DOM.
    /*
    let totalFlowers = 0;
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const pos = positions[i];
      let garden = this.gardens.get(player.id);

      if (!garden) {
        garden = new GardenView(player.id, player.name);
        this.gardens.set(player.id, garden);
        this.cameraContainer.addChild(garden.container);
      }

      garden.container.position.set(pos.x, pos.y);

      const sector = gardenSectors?.find((s) => s.playerId === player.id);
      if (sector) {
        garden.setSectorGeometry(sector.centerAngle, sector.halfAngle, sector.innerR, sector.outerR);
      } else {
        const angle = Math.atan2(pos.y, pos.x);
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        garden.setSectorGeometry(angle, Math.PI / players.length, dist * 0.5, dist * 1.2);
      }

      garden.sync(player, state.hoveredSetId ?? null);
      totalFlowers += garden.flowersContainer.children.length;
    }

    // Remove disconnected players
    for (const [id, garden] of this.gardens) {
      if (!validIds.has(id)) {
        this.cameraContainer.removeChild(garden.container);
        garden.destroy();
        this.gardens.delete(id);
      }
    }
    */

    // Camera is controlled by DOM — do not auto-fit here.
    // this.fitCameraToGardens(positions);
  }

  syncCamera(panX: number, panY: number, zoom: number): void {
    const safeZoom = Math.max(0.01, zoom);
    this.camera.targetX = panX / safeZoom;
    this.camera.targetY = panY / safeZoom;
    this.camera.targetZoom = zoom;
    // Snap instantly — the DOM already smooths
    this.camera.x = this.camera.targetX;
    this.camera.y = this.camera.targetY;
    this.camera.zoom = this.camera.targetZoom;
  }

  resize(): void {
    this.drawBackground();
    // Camera is DOM-controlled — no auto-fit on resize
  }

  destroy(): void {
    for (const garden of this.gardens.values()) {
      garden.destroy();
    }
    this.gardens.clear();
  }

  // ── Input Handling ──────────────────────────────────────────

  private setupInput(): void {
    // Mouse wheel zoom
    const canvas = this.app.renderer.canvas as HTMLCanvasElement;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.targetZoom - e.deltaY * zoomSpeed));

      // Zoom toward cursor
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - this.app.screen.width / 2;
      const mouseY = e.clientY - rect.top - this.app.screen.height / 2;
      const zoomRatio = newZoom / this.camera.targetZoom;

      this.camera.targetX = mouseX - (mouseX - this.camera.targetX) * zoomRatio;
      this.camera.targetY = mouseY - (mouseY - this.camera.targetY) * zoomRatio;
      this.camera.targetZoom = newZoom;
    }, { passive: false });

    // Pan with mouse drag
    this.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return; // Only left click
      this.isDragging = true;
      this.dragStart.x = e.global.x;
      this.dragStart.y = e.global.y;
      this.cameraDragStart.x = this.camera.targetX;
      this.cameraDragStart.y = this.camera.targetY;
    });

    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.global.x - this.dragStart.x;
      const dy = e.global.y - this.dragStart.y;
      this.camera.targetX = this.cameraDragStart.x + dx;
      this.camera.targetY = this.cameraDragStart.y + dy;
    });

    this.container.on('pointerup', () => {
      this.isDragging = false;
    });

    this.container.on('pointerupoutside', () => {
      this.isDragging = false;
    });

    // Touch pinch zoom
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.lastPinchDist = Math.hypot(dx, dy);
        this.lastPinchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const center = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };

        if (this.lastPinchDist > 0) {
          const scale = dist / this.lastPinchDist;
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.camera.targetZoom * scale));
          this.camera.targetZoom = newZoom;
        }

        this.lastPinchDist = dist;
        this.lastPinchCenter = center;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.lastPinchDist = 0;
    }, { passive: true });
  }

  // ── Layout ──────────────────────────────────────────────────

  private computeArenaLayout(players: GardenViewPlayer[], myPlayerId: string | null): { x: number; y: number }[] {
    const count = players.length;
    const SPACING = 280;

    if (count === 2) {
      return [
        { x: 0, y: -SPACING },
        { x: 0, y: SPACING },
      ];
    }

    const positions: { x: number; y: number }[] = [];
    const radius = SPACING * 0.9;

    // Find my index and rotate so "me" is at bottom (π/2)
    const myIndex = myPlayerId ? players.findIndex((p) => p.id === myPlayerId) : 0;
    const effectiveMyIndex = Math.max(0, myIndex);
    const startAngle = Math.PI / 2 - (effectiveMyIndex * 2 * Math.PI) / count;

    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / count;
      positions.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    return positions;
  }

  private fitCameraToGardens(positions: { x: number; y: number }[]): void {
    if (positions.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    const PADDING = 160;
    const contentWidth = maxX - minX + PADDING * 2;
    const contentHeight = maxY - minY + PADDING * 2;

    const scaleX = this.app.screen.width / contentWidth;
    const scaleY = this.app.screen.height / contentHeight;
    const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY) * 0.9));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.camera.targetX = -centerX;
    this.camera.targetY = -centerY;
    this.camera.targetZoom = targetZoom;
  }

  private drawBackground(): void {
    this.bgGraphics.clear();
    // Transparent — let DOM grass show through
  }
}
