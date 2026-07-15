/// <reference types="vite/client" />

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { CardArtProvider } from './cards/cardArt';
import './styles.css';

import AssetPreloader from './components/AssetPreloader';

// Enable MSW mock API server in development (no real backend needed)
async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser');
    return worker.start({
      onUnhandledRequest: 'bypass', // let non-mocked requests through
    });
  }
  return Promise.resolve();
}

enableMocking().then(() => {
  const root = document.getElementById('root')!;
  createRoot(root).render(
    <StrictMode>
      <AssetPreloader onReady={() => {}}>
        <AuthProvider>
          <CardArtProvider>
            <App />
          </CardArtProvider>
        </AuthProvider>
      </AssetPreloader>
    </StrictMode>
  );
});
