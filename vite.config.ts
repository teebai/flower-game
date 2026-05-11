import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      // HTTP API calls (create match, join match)
      '/games': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // WebSocket (live game state sync)
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
