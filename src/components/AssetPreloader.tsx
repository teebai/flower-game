// ============================================================
// FLOWER GAME — ASSET PRELOADER
// Uses Vite import.meta.glob to get resolved hashed URLs,
// then preloads all images before game starts.
// ============================================================

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface AssetPreloaderProps {
  children: ReactNode;
  onReady: () => void;
}

/** Load a single image and cache it */
function loadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!src || src.startsWith('data:')) { resolve(true); return; }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false); // Don't block on single failure
    img.src = src;
  });
}

/** Get all asset URLs using Vite's import.meta.glob */
function getAllAssetUrls(): string[] {
  const flowerMods = import.meta.glob('../assets/flowers/*.gif', { eager: true, query: '?url' });
  const powerMods = import.meta.glob('../assets/powers/*.{gif,png}', { eager: true, query: '?url' });
  const animMods = import.meta.glob('../assets/animations/*.gif', { eager: true, query: '?url' });

  const urls: string[] = [];

  for (const mod of Object.values(flowerMods)) {
    if (typeof mod === 'string') urls.push(mod);
    else if (mod && typeof mod === 'object' && 'default' in mod && typeof mod.default === 'string') urls.push(mod.default);
  }
  for (const mod of Object.values(powerMods)) {
    if (typeof mod === 'string') urls.push(mod);
    else if (mod && typeof mod === 'object' && 'default' in mod && typeof mod.default === 'string') urls.push(mod.default);
  }
  for (const mod of Object.values(animMods)) {
    if (typeof mod === 'string') urls.push(mod);
    else if (mod && typeof mod === 'object' && 'default' in mod && typeof mod.default === 'string') urls.push(mod.default);
  }

  return [...new Set(urls)];
}

export default function AssetPreloader({ children, onReady }: AssetPreloaderProps) {
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const urls = getAllAssetUrls();
    setTotal(urls.length);

    let completed = 0;
    const updateProgress = () => {
      completed++;
      setLoaded(completed);
      if (completed >= urls.length) {
        setReady(true);
        onReady();
      }
    };

    // Preload all in parallel (browser handles queue)
    Promise.all(urls.map(url => loadImage(url).then(updateProgress)))
      .catch(() => {
        // Even on error, proceed after a timeout
        setTimeout(() => {
          setReady(true);
          onReady();
        }, 1000);
      });
  }, [onReady]);

  if (!ready) {
    return (
      <div style={styles.overlay}>
        <div style={styles.content}>
          <div style={styles.spinner}>🌸</div>
          <div style={styles.text}>Loading Flower Garden...</div>
          <div style={styles.progress}>{loaded} / {total} assets ready</div>
          <div style={styles.bar}>
            <div style={{ ...styles.barFill, width: total > 0 ? `${(loaded / total) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
  },
  content: { textAlign: 'center', color: '#fff' },
  spinner: { fontSize: 64, animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 24 },
  text: { fontSize: 20, fontWeight: 600, marginBottom: 16 },
  progress: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  bar: { width: 240, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden', margin: '0 auto' },
  barFill: { height: '100%', background: 'linear-gradient(90deg, #e6c84a, #f1c40f)', borderRadius: 3, transition: 'width 0.3s ease' },
};