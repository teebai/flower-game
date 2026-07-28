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

// Enable MSW mock API server in development (no real backend needed).
// If the mock worker fails to start, render the app anyway — a rejected
// promise here must never leave the page blank.
enableMocking()
  .catch((err) => {
    console.warn('[dev] MSW mock worker failed to start; continuing without mocks.', err);
  })
  .finally(() => {
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
