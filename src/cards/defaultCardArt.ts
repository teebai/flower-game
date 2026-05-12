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

// Fallback flower colors (reuse existing art for missing colors)
import pinkFlowerGif from '../assets/flowers/red-flower.gif';
import cyanFlowerGif from '../assets/flowers/blue-flower.gif';
import magentaFlowerGif from '../assets/flowers/purple-flower.gif';
import whiteFlowerGif from '../assets/flowers/yellow-flower.gif';

// Power cards
import windGif from '../assets/powers/wind.gif';
import divineProtectionGif from '../assets/powers/divine_protection.png';
import bugGif from '../assets/powers/bug.png';
import beeGif from '../assets/powers/bee.png';
import doubleHappinessGif from '../assets/powers/double_happiness.png';
import tradePresentGif from '../assets/powers/trade_present.gif';
import tradeFateGif from '../assets/powers/trade_fate.gif';
import letGoGif from '../assets/powers/let_go.gif';
import springGif from '../assets/powers/spring.gif';
import summerGif from '../assets/powers/summer.gif';
import autumnGif from '../assets/powers/autumn.png';
import winterGif from '../assets/powers/winter.gif';
import naturalDisasterGif from '../assets/powers/natural_disaster.gif';
import eclipseGif from '../assets/powers/eclipse.png';
import greatResetGif from '../assets/powers/great_reset.png';

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

  // Fallbacks for flower colors without dedicated art
  'flower:pink': pinkFlowerGif,
  'flower:cyan': cyanFlowerGif,
  'flower:magenta': magentaFlowerGif,
  'flower:white': whiteFlowerGif,

  'power:wind': windGif,
  'power:divine_protection': divineProtectionGif,
  'power:bug': bugGif,
  'power:bee': beeGif,
  'power:double_happiness': doubleHappinessGif,
  'power:trade_present': tradePresentGif,
  'power:trade_fate': tradeFateGif,
  'power:let_go': letGoGif,
  'power:spring': springGif,
  'power:summer': summerGif,
  'power:autumn': autumnGif,
  'power:winter': winterGif,
  'power:natural_disaster': naturalDisasterGif,
  'power:eclipse': eclipseGif,
  'power:great_reset': greatResetGif,
};

export function hasCustomArt(store: CardArtStoreData, key: CardArtKey): boolean {
  return typeof store[key] === 'string';
}
