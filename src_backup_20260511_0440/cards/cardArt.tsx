// ============================================================
// FLOWER GAME — CARD ART STORE
// Per-card-type image customization, persisted to localStorage.
// ============================================================

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import type { Card, FlowerColor, PowerCardName } from '../types/gameTypes';
import { DEFAULT_CARD_ART } from './defaultCardArt';

const STORAGE_KEY = 'flower-game:card-art:v1';

export const FLOWER_KEYS: FlowerColor[] = [
  'blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black',
  'rainbow', 'triple_rainbow', 'divine',
];

export const POWER_KEYS: PowerCardName[] = [
  'wind', 'divine_protection', 'bug', 'bee',
  'double_happiness', 'trade_present', 'trade_fate', 'let_go',
  'spring', 'summer', 'autumn', 'winter',
  'natural_disaster', 'eclipse', 'great_reset',
];

export type CardArtKey =
  | `flower:${FlowerColor}`
  | `power:${PowerCardName}`
  | 'back';

export function cardArtKey(card: Card): CardArtKey {
  if (card.kind === 'flower') return `flower:${card.color}`;
  return `power:${card.name}`;
}

export function humanName(key: CardArtKey): string {
  if (key === 'back') return 'Card Back';
  const [, rest] = key.split(':');
  return rest.replace(/_/g, ' ');
}

export type CardArtStoreData = Partial<Record<CardArtKey, string>>;

interface CardArtContextValue {
  store: CardArtStoreData;
  getArt: (key: CardArtKey) => string | undefined;
  setArt: (key: CardArtKey, dataUrl: string | null) => void;
  clearAll: () => void;
  exportJSON: () => string;
  importJSON: (json: string) => { imported: number };
}

const CardArtContext = createContext<CardArtContextValue | null>(null);

function readFromStorage(): CardArtStoreData {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const valid: CardArtStoreData = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.startsWith('data:')) {
        valid[key as CardArtKey] = value;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function writeToStorage(data: CardArtStoreData) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('CardArtStore: could not persist to localStorage', err);
  }
}

export function CardArtProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<CardArtStoreData>(() => readFromStorage());

  useEffect(() => {
    writeToStorage(store);
  }, [store]);

  const getArt = useCallback((key: CardArtKey) => store[key] ?? DEFAULT_CARD_ART[key], [store]);

  const setArt = useCallback((key: CardArtKey, dataUrl: string | null) => {
    setStore(prev => {
      const next = { ...prev };
      if (dataUrl) next[key] = dataUrl;
      else delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setStore({}), []);

  const exportJSON = useCallback(() => {
    return JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      cards: store,
    }, null, 2);
  }, [store]);

  const importJSON = useCallback((json: string) => {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Not a JSON object');
    const raw = (parsed as { cards?: unknown }).cards ?? parsed;
    if (!raw || typeof raw !== 'object') throw new Error('Missing cards map');

    const incoming: CardArtStoreData = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && value.startsWith('data:')) {
        incoming[key as CardArtKey] = value;
        count += 1;
      }
    }
    setStore(prev => ({ ...prev, ...incoming }));
    return { imported: count };
  }, []);

  const value = useMemo<CardArtContextValue>(() => ({
    store, getArt, setArt, clearAll, exportJSON, importJSON,
  }), [store, getArt, setArt, clearAll, exportJSON, importJSON]);

  return <CardArtContext.Provider value={value}>{children}</CardArtContext.Provider>;
}

export function useCardArt(): CardArtContextValue {
  const ctx = useContext(CardArtContext);
  if (!ctx) throw new Error('useCardArt must be used inside <CardArtProvider>');
  return ctx;
}

// ── Image processing ────────────────────────────────────────

/**
 * Downscale a user-uploaded image into a compact JPEG data URL suitable
 * for localStorage. Keeps aspect ratio, caps the longest edge at maxDim.
 */
export async function processImageFile(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<string> {
  const maxDim = opts.maxDim ?? 320;
  const quality = opts.quality ?? 0.82;

  const bitmap = await loadBitmap(file);
  const ratio = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported in this browser');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const isTransparent = file.type === 'image/png' || file.type === 'image/webp';
  const mime = isTransparent ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, quality);

  if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close();
  }
  return dataUrl;
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}
