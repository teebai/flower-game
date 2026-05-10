/// <reference types="vite/client" />

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { CardArtProvider } from './cards/cardArt';
import './styles.css';

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <CardArtProvider>
        <App />
      </CardArtProvider>
    </AuthProvider>
  </StrictMode>
);
