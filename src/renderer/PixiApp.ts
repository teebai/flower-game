// ============================================================
// FLOWER GAME v2 — PIXI APP WRAPPER
// DPI-aware, resize-observing, ticker-driven.
// Ported from v7 renderer.
// ============================================================

import { Application } from 'pixi.js';
import { GameScene, GameSceneState } from './scenes/GameScene';
import { preloadFlowerTextures, clearFlowerTextures } from './entities/FlowerSprite';

export class PixiApp {
  app: Application;
  gameScene: GameScene;
  private parentElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private ready = false;
  private initialized = false;
  private destroyed = false;

  constructor() {
    this.app = new Application();
    this.gameScene = new GameScene(this.app);
  }

  async mount(parent: HTMLElement): Promise<void> {
    if (this.destroyed) return;
    this.parentElement = parent;

    // Preload flower textures before creating sprites
    await preloadFlowerTextures();
    if (this.destroyed) return;

    await this.app.init({
      backgroundAlpha: 0,
      resizeTo: parent,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    if (this.destroyed) {
      try { this.app.destroy(true, { children: true, texture: true }); } catch {}
      return;
    }

    // Renderer info logged silently
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.gameScene.container);
    this.gameScene.init();

    // Ticker drives scene updates
    this.app.ticker.add((ticker) => {
      if (!this.ready) return;
      this.gameScene.update(ticker.deltaMS);
    });

    // ResizeObserver for responsive sizing
    this.resizeObserver = new ResizeObserver(() => {
      if (this.ready) this.gameScene.resize();
    });
    this.resizeObserver.observe(parent);
    this.initialized = true;
    this.ready = true;
  }

  syncState(state: GameSceneState): void {
    if (!this.ready) return;
    this.gameScene.syncWithState(state);
  }

  syncCamera(panX: number, panY: number, zoom: number): void {
    // Don't check ready — syncCamera just sets state, doesn't need renderer
    this.gameScene.syncCamera(panX, panY, zoom);
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.resizeObserver?.disconnect();

    // Always remove canvas from DOM to prevent ghost canvases in Strict Mode
    // app.canvas getter throws if init() hasn't been called (renderer is undefined)
    try {
      if (this.app.canvas && this.app.canvas.parentElement) {
        this.app.canvas.remove();
      }
    } catch { /* app not initialized yet — no canvas to remove */ }

    if (!this.initialized) {
      this.parentElement = null;
      return;
    }
    this.app.ticker?.stop?.();
    this.gameScene.destroy();
    clearFlowerTextures();
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      // Ignore destroy errors
    }
    this.parentElement = null;
  }
}
