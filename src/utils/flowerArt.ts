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
import type { FlowerColor } from '../types/gameTypes';

const FLOWER_ART: Record<FlowerColor, string> = {
  blue: blueFlowerGif,
  purple: purpleFlowerGif,
  red: redFlowerGif,
  orange: orangeFlowerGif,
  yellow: yellowFlowerGif,
  green: greenFlowerGif,
  black: blackFlowerGif,
  rainbow: rainbowFlowerGif,
  triple_rainbow: tripleRainbowFlowerGif,
  divine: divineFlowerGif,
};

export function flowerArt(color: FlowerColor): string {
  return FLOWER_ART[color] || blackFlowerGif;
}
