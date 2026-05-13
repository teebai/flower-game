// ============================================================
// ASSET PRELOADER — Fixed implementation
// ============================================================

export function getAllAssetUrls(): string[] {
  const flowerModules = import.meta.glob('../assets/flowers/*.gif', { eager: true, query: '?url' });
  const powerModules = import.meta.glob('../assets/powers/*.{gif,png}', { eager: true, query: '?url' });
  const animModules = import.meta.glob('../assets/animations/*.gif', { eager: true, query: '?url' });

  const urls: string[] = [];
  const extract = (mod: any): string | null => {
    if (typeof mod === 'string') return mod;
    if (mod?.default) return mod.default;
    return null;
  };

  for (const modules of [flowerModules, powerModules, animModules]) {
    for (const mod of Object.values(modules)) {
      const url = extract(mod);
      if (url) urls.push(url);
    }
  }
  return urls;
}

export async function preloadAssets(): Promise<{ loaded: number; total: number }> {
  const urls = getAllAssetUrls();
  if (urls.length === 0) {
    console.warn('No assets found to preload');
    return { loaded: 0, total: 0 };
  }
  let loaded = 0;
  await Promise.all(urls.map(src => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { loaded++; resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  })));
  return { loaded, total: urls.length };
}
