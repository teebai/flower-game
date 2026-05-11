import blueFlowerGif from '../assets/flowers/blue-flower.gif';
import purpleFlowerGif from '../assets/flowers/purple-flower.gif';
import redFlowerGif from '../assets/flowers/red-flower.gif';
import orangeFlowerGif from '../assets/flowers/orange-flower.gif';
import yellowFlowerGif from '../assets/flowers/yellow-flower.gif';
import greenFlowerGif from '../assets/flowers/green-flower.gif';
import blackFlowerGif from '../assets/flowers/black-flower.gif';
import rainbowFlowerGif from '../assets/flowers/rainbow-flower.gif';
import tripleRainbowFlowerGif from '../assets/flowers/triple-rainbow-flower.gif';
import divineFlowerGif from '../assets/flowers/divine-flower.gif';
import type { CardArtKey, CardArtStoreData } from './cardArt';

export const DEFAULT_CARD_ART: Partial<Record<CardArtKey, string>> = {
  'flower:blue': blueFlowerGif,
  'flower:purple': purpleFlowerGif,
  'flower:red': redFlowerGif,
  'flower:orange': orangeFlowerGif,
  'flower:yellow': yellowFlowerGif,
  'flower:green': greenFlowerGif,
  'flower:black': blackFlowerGif,
  'flower:rainbow': rainbowFlowerGif,
  'flower:triple_rainbow': tripleRainbowFlowerGif,
  'flower:divine': divineFlowerGif,
};

export function hasCustomArt(store: CardArtStoreData, key: CardArtKey): boolean {
  return typeof store[key] === 'string';
}
