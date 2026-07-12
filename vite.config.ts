import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import purgeCSS from 'vite-plugin-purgecss';

// Safelist: all string tokens found in source files that look like CSS classes.
// This catches dynamically-constructed class names (template literals, conditionals).
const SAFELIST = [
  /^is-/, /^has-/, /^v2-/, /^theme-/, /^layout-/, /^scene-/, /^page$/,
  /^garden-/, /^action-/, /^lobby-/, /^arena-/, /^board-/, /^player-/,
  /^match-/, /^chat-/, /^card-/, /^discard-/, /^bug-report-/, /^game-menu-/,
  /^settings-panel-/, /^stat-slider-/, /^divine-transition-/, /^wind-path-/,
  /^hs-hand-/, /^inline-/, /^mini-/, /^waiting-room-/, /^leaderboard-/,
  /^changelog-/, /^counter-window-/, /^turn-step-/, /^hand-card-/, /^garden-visual-fx-/,
  /^tether-/, /^flower-/, /^modal-/, /^drag-/, /^active$/, /^dragging$/,
  /^chosen$/, /^occupied$/, /^preview$/, /^primary$/, /^danger$/, /^results$/,
  /^phase$/, /^play$/, /^entry$/, /^className$/, /^style$/, /^id$/,
  /^data-/, /^aria-/, /^role$/, /^type$/, /^name$/, /^title$/, /^alt$/,
  /^src$/, /^href$/, /^target$/, /^rel$/, /^method$/, /^action$/,
  /^placeholder$/, /^value$/, /^defaultValue$/, /^key$/, /^ref$/,
  /^onClick$/, /^onChange$/, /^onSubmit$/, /^onFocus$/, /^onBlur$/,
  /^onMouseEnter$/, /^onMouseLeave$/, /^onPointerDown$/, /^onPointerUp$/,
  /^onPointerMove$/, /^onTouchStart$/, /^onTouchEnd$/, /^onTouchMove$/,
  /^onDragStart$/, /^onDragEnd$/, /^onDrop$/, /^onDragOver$/,
  /^onKeyDown$/, /^onKeyUp$/, /^onScroll$/, /^onResize$/,
  /^disabled$/, /^readonly$/, /^required$/, /^checked$/, /^selected$/,
  /^hidden$/, /^visible$/, /^open$/, /^closed$/, /^expanded$/, /^collapsed$/,
  /^loading$/, /^loaded$/, /^error$/, /^success$/, /^warning$/, /^info$/,
  /^pending$/, /^complete$/, /^incomplete$/, /^active$/, /^inactive$/,
  /^enabled$/, /^disabled$/, /^visible$/, /^hidden$/, /^shown$/, /^hidden$/,
  /^open$/, /^close$/, /^opened$/, /^closed$/, /^expanded$/, /^collapsed$/,
  /^mounted$/, /^unmounted$/, /^rendered$/, /^destroyed$/,
];

export default defineConfig({
  plugins: [
    react(),
    purgeCSS({
      content: [
        './index.html',
        './src/**/*.tsx',
        './src/**/*.ts',
      ],
      safelist: SAFELIST,
      blocklist: [],
    }),
  ],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/games': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
