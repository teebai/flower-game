// ============================================================
// FLOWER GAME — MAIN GAME BOARD (v2)
// ============================================================

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, Card, FlowerCard, GardenSet, PendingAction, Player, FlowerColor } from '../types/gameTypes';
import {
  FLOWER_EMOJI, POWER_EMOJI, SEASON_COLOR,
  cardLabel, cardName, isFlower, isPower, cardDetail, escapeRegExp,
} from '../cards/cardUtils';
import { CardChip } from '../cards/CardChip';
import { DEFAULT_CARD_ART } from '../cards/defaultCardArt';
import gardenGrassGif from '../assets/garden/garden-grass.gif';
import middleUiSlowGif from '../assets/garden/middle-ui-slow.gif';
import middleUiFastGif from '../assets/garden/middle-ui-fast.gif';
import swapLifeGif from '../assets/garden/swap-life.gif';
import windBlowGif from '../assets/garden/wind-blow.gif';
import naturalDisasterGif from '../assets/garden/natural-disaster.gif';
import { MatchContext } from '../matchContext';

const MOVE_LABELS: Record<string, string> = {
  plantOwn: '🌱 Plant in your garden',
  plantOpponent: '🌿 Plant in an opponent garden',
  playWindSingle: '💨 Wind ×1',
  playWindDouble: '💨💨 Wind ×2',
  playBug: '🐛 Bug',
  playBee: '🐝 Bee',
  doubleHappiness: '🎉 Double Happiness',
  doubleHappinessTake: '🎉 Double Happiness — Take',
  doubleHappinessGive: '🎉 Double Happiness — Give',
  tradePresent: '🎁 Trade Present',
  tradeFate: '🔀 Trade Fate',
  letGo: '✋ Let Go',
  playSeason: '🌸 Season',
  naturalDisaster: '🌪️ Natural Disaster',
  playEclipse: '🌑 Eclipse',
  playGreatReset: '♻️ Great Reset',
  discardFlower: '🍂 Discard Flower',
};

const MOVE_DETAILS: Record<string, { summary: string; steps: string[] }> = {
  plantOwn: {
    summary: 'Plant a flower from your hand into your own garden.',
    steps: ['Pick 1 flower card.', 'If needed, choose a color for a wildcard flower.', 'Choose which set to add to, or start a new one.'],
  },
  plantOpponent: {
    summary: 'Plant a flower from your hand into another player\'s garden.',
    steps: ['Pick 1 flower card.', 'If needed, choose a color for a wildcard flower.', 'Choose the target player and their destination set.'],
  },
  playWindSingle: {
    summary: 'Use 1 Wind card against one vulnerable target set.',
    steps: ['Pick 1 Wind card.', 'Choose the target player.', 'Choose the exact set to blow from.'],
  },
  playWindDouble: {
    summary: 'Use 2 Wind cards for the stronger Wind effect on one target set.',
    steps: ['Pick 2 Wind cards.', 'Choose the target player.', 'Choose the exact set to blow from.'],
  },
  playBug: {
    summary: 'Use Bug on a vulnerable target set.',
    steps: ['Pick the Bug card.', 'Choose the target player.', 'Choose the set Bug will affect.'],
  },
  playBee: {
    summary: 'Bee uses a flower from the discard pile and plants it into a chosen garden.',
    steps: ['Pick the Bee card.', 'Pick 1 flower from the discard pile.', 'Choose whose garden to plant into, then choose a set or start a new one.'],
  },
  doubleHappiness: {
    summary: 'Choose a target player, then decide whether you will take 2 cards from them or give them 2 cards from your hand.',
    steps: ['Pick the Double Happiness card.', 'Choose the target player.', 'Choose Take 2 or Give 2 before confirming.'],
  },
  doubleHappinessTake: {
    summary: 'Target a player and make them choose which 2 cards to give you.',
    steps: ['Pick the Double Happiness card.', 'Choose the target player.', 'After you confirm, the target chooses their own 2 cards.'],
  },
  doubleHappinessGive: {
    summary: 'Give 2 cards from your hand to another player.',
    steps: ['Pick Double Happiness.', 'Pick 2 more cards from your hand.', 'Choose who receives them.'],
  },
  tradePresent: {
    summary: 'Offer 1 card from your hand; the target then chooses 1 of their own cards to exchange.',
    steps: ['Pick Trade Present.', 'Choose the target player.', 'Pick the 1 card you are offering, then confirm.'],
  },
  tradeFate: {
    summary: 'Swap your whole hand with another player.',
    steps: ['Pick Trade Fate.', 'Choose the target player.', 'Confirm the full hand swap.'],
  },
  letGo: {
    summary: 'Discard your own hand-management card to resolve Let Go.',
    steps: ['Pick the Let Go card.', 'Review the effect.', 'Confirm the play.'],
  },
  playSeason: {
    summary: 'Change the current season by playing a season card. Leaving Winter now draws cards immediately for the new season.',
    steps: ['Pick the season card you want to play.', 'Review the season effect and any immediate draw.', 'Confirm to change the season.'],
  },
  naturalDisaster: {
    summary: 'Destroy a chosen vulnerable garden set.',
    steps: ['Pick Natural Disaster.', 'Choose the target player.', 'Choose the set to destroy.'],
  },
  playEclipse: {
    summary: 'Reverse turn direction with Eclipse.',
    steps: ['Pick the Eclipse card.', 'Review the turn-order change.', 'Confirm the play.'],
  },
  playGreatReset: {
    summary: 'Reset hands for all players with Great Reset.',
    steps: ['Pick Great Reset.', 'Review the global reset.', 'Confirm the play.'],
  },
  discardFlower: {
    summary: 'Autumn-only flower discard action.',
    steps: ['Pick 1 flower card.', 'Review which flower you are discarding.', 'Confirm the discard.'],
  },
};

const CHOOSABLE_FLOWER_COLORS: FlowerColor[] = ['blue', 'purple', 'red', 'orange', 'yellow', 'green', 'black'];

function moveLabel(type: string): string {
  return MOVE_LABELS[type] ?? type.replace(/([A-Z])/g, ' $1').trim();
}

function moveDetails(type: string): { summary: string; steps: string[] } {
  return MOVE_DETAILS[type] ?? {
    summary: 'Play the selected card and follow the remaining prompts.',
    steps: ['Choose the needed card.', 'Choose any required targets.', 'Confirm the action.'],
  };
}

function flowerArt(color: FlowerColor): string | undefined {
  return DEFAULT_CARD_ART[`flower:${color}`];
}

function wildcardNeedsChosenColor(card: FlowerCard | null | undefined): boolean {
  return !!card && card.isWildcard && card.color !== 'triple_rainbow';
}

function canChooseColorForNewSet(card: FlowerCard | null | undefined): boolean {
  return !!card && (wildcardNeedsChosenColor(card) || card.color === 'triple_rainbow');
}

function InlineCardLabel({ card }: { card: Card }) {
  if (card.kind === 'flower') {
    const art = flowerArt(card.color);
    return (
      <span className="inline-card-label">
        {art
          ? <img src={art} alt={card.color} className="inline-flower-icon" />
          : <span aria-hidden="true">{FLOWER_EMOJI[card.color] ?? '🌺'}</span>}
        <span>{cardName(card)}</span>
      </span>
    );
  }

  return (
    <span className="inline-card-label">
      <span aria-hidden="true">{cardLabel(card)}</span>
      <span>{cardName(card)}</span>
    </span>
  );
}

type MoveSfxPreset = {
  type: OscillatorType;
  notes: number[];
  step: number;
  gain: number;
};

const MOVE_SFX_PRESETS: MoveSfxPreset[] = [
  { type: 'triangle', notes: [660, 784, 988], step: 0.075, gain: 0.065 },
  { type: 'sine', notes: [440, 554, 659], step: 0.09, gain: 0.072 },
  { type: 'square', notes: [330, 392, 523], step: 0.065, gain: 0.05 },
  { type: 'sawtooth', notes: [523, 659, 523], step: 0.07, gain: 0.045 },
  { type: 'triangle', notes: [784, 932, 1175], step: 0.055, gain: 0.055 },
];

let moveSfxAudioContext: AudioContext | null = null;

function getMoveSfxAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!moveSfxAudioContext || moveSfxAudioContext.state === 'closed') {
    moveSfxAudioContext = new AudioContextCtor();
  }
  return moveSfxAudioContext;
}

function unlockMoveSfx() {
  try {
    const audio = getMoveSfxAudioContext();
    if (!audio || audio.state !== 'suspended') return;
    void audio.resume().catch(() => undefined);
  } catch {
    // best-effort only
  }
}

function playMoveSfx() {
  try {
    const audio = getMoveSfxAudioContext();
    if (!audio) return;
    if (audio.state === 'suspended') {
      void audio.resume().then(() => playMoveSfx()).catch(() => undefined);
      return;
    }
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const preset = MOVE_SFX_PRESETS[Math.floor(Math.random() * MOVE_SFX_PRESETS.length)];

    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.notes[0], audio.currentTime);
    preset.notes.slice(1).forEach((note, index) => {
      oscillator.frequency.exponentialRampToValueAtTime(note, audio.currentTime + ((index + 1) * preset.step));
    });
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(preset.gain, audio.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (preset.step * (preset.notes.length + 1)));

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + (preset.step * (preset.notes.length + 1.3)));
  } catch {
    // best-effort only
  }
}

type SeasonTheme = {
  pageClass: string;
  pageStyle: React.CSSProperties;
  panel: string;
  panelAlt: string;
  panelSoft: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  border: string;
  glow: string;
};

function getSeasonTheme(season: GameState['season']): SeasonTheme {
  if (season === 'winter') {
    return {
      pageClass: 'theme-winter',
      pageStyle: {
        background: 'linear-gradient(180deg, #f7fdff 0%, #dff3ff 45%, #fefefe 100%)',
        color: '#17324d',
      },
      panel: '#ffffff',
      panelAlt: '#e9f6ff',
      panelSoft: '#f6fbff',
      text: '#17324d',
      muted: '#54708a',
      accent: '#2c7be5',
      accent2: '#ff88b5',
      border: '#cfe4f4',
      glow: 'rgba(44, 123, 229, 0.18)',
    };
  }

  if (season === 'spring') {
    return {
      pageClass: 'theme-spring',
      pageStyle: { background: 'radial-gradient(circle at top, #fff4fb 0%, #f8dff0 36%, #f4d3ea 58%, #e8d9ff 100%)', color: '#5b2944' },
      panel: 'rgba(255, 250, 253, 0.86)',
      panelAlt: 'rgba(255, 239, 248, 0.92)',
      panelSoft: 'rgba(255, 226, 241, 0.9)',
      text: '#5b2944',
      muted: '#8d5b77',
      accent: '#ff7eb6',
      accent2: '#8e6bff',
      border: '#efbed6',
      glow: 'rgba(255, 126, 182, 0.24)',
    };
  }

  if (season === 'summer') {
    return {
      pageClass: 'theme-summer',
      pageStyle: { background: 'linear-gradient(180deg, #21243d 0%, #172236 100%)' },
      panel: '#16213e',
      panelAlt: '#21426d',
      panelSoft: '#233b62',
      text: '#eee',
      muted: '#c9d3f2',
      accent: '#ffd166',
      accent2: '#ff8c42',
      border: '#0f3460',
      glow: 'rgba(255, 209, 102, 0.18)',
    };
  }

  if (season === 'autumn') {
    return {
      pageClass: 'theme-autumn',
      pageStyle: { background: 'linear-gradient(180deg, #241a2f 0%, #1b2038 100%)' },
      panel: '#16213e',
      panelAlt: '#2b2245',
      panelSoft: '#2e274b',
      text: '#eee',
      muted: '#d8cfe6',
      accent: '#ffb45e',
      accent2: '#f16d5e',
      border: '#0f3460',
      glow: 'rgba(255, 180, 94, 0.18)',
    };
  }

  return {
    pageClass: 'theme-neutral',
    pageStyle: { background: 'linear-gradient(180deg, #1a1a2e 0%, #121626 100%)' },
    panel: '#16213e',
    panelAlt: '#0f3460',
    panelSoft: '#1b2d50',
    text: '#eee',
    muted: '#aaa',
    accent: '#4ecca3',
    accent2: '#e94560',
    border: '#0f3460',
    glow: 'rgba(78, 204, 163, 0.14)',
  };
}

function setSizeClass(set: GardenSet): string {
  if (set.isToken) return 'size-token';
  const n = set.flowers.length;
  if (set.isDivine) return 'size-divine';
  if (n >= 6) return 'size-xl';
  if (n >= 4) return 'size-lg';
  if (n >= 2) return 'size-md';
  return 'size-sm';
}

function describeGardenSet(set: GardenSet | null | undefined): string {
  if (!set) return 'a garden set';
  if (set.isToken) return 'the token set';
  if (set.isDivine) return 'the Divine set';
  const colorLabel = gardenSetColor(set) ?? 'flower';
  return `${set.flowers.length}-flower ${colorLabel} set`;
}

function flowerDisplayColor(flower: FlowerCard): FlowerColor {
  return flower.representedColor ?? flower.color;
}

function gardenSetColor(set: GardenSet): FlowerColor | null {
  if (set.isToken) return null;
  const anchorFlower = set.flowers.find(f => {
    const displayColor = flowerDisplayColor(f);
    return displayColor !== 'rainbow' && displayColor !== 'triple_rainbow' && displayColor !== 'divine';
  }) ?? set.flowers.find(f => {
    const displayColor = flowerDisplayColor(f);
    return displayColor !== 'triple_rainbow' && displayColor !== 'divine';
  });
  return anchorFlower ? flowerDisplayColor(anchorFlower) : null;
}

function gardenDensityClass(count: number): string {
  if (count >= 6) return 'garden-density-compact';
  if (count >= 4) return 'garden-density-comfy';
  return 'garden-density-spacious';
}

type ArenaGardenLayout = {
  player: Player;
  x: number;
  y: number;
  size: number;
  angle: number;
  totalFlowers: number;
  totalSets: number;
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNoise(seed: number, index: number): number {
  const x = Math.sin(seed * 0.0000017 + index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function createGardenBlobPath(seed: number, totalFlowers: number, totalSets: number, emphasis: number): string {
  const n = 16;
  const baseRadius = 28 + Math.min(10, totalFlowers * 0.9) + Math.min(8, totalSets * 1.6);
  const wobble = 2.5 + Math.min(4, totalSets * 0.55) + Math.min(3, totalFlowers * 0.1);
  const stretchX = 1.05 + Math.min(0.18, totalSets * 0.015);
  const stretchY = 0.88 + Math.min(0.16, totalFlowers * 0.012);

  const pts = Array.from({ length: n }, (_, i) => {
    const t = (Math.PI * 2 * i) / n;
    const noise = seededNoise(seed, i) - 0.5;
    const lobe = Math.sin(t * 2 + (seed % 7) * 0.1) * wobble * 0.65;
    const ripple = Math.cos(t * 3 - (seed % 5) * 0.1) * wobble * 0.2;
    const minR = baseRadius * 0.72 + emphasis;
    const r = Math.max(minR, baseRadius + lobe + ripple + noise * wobble * 0.4 + emphasis);
    return { x: 50 + Math.cos(t) * r * stretchX, y: 50 + Math.sin(t) * r * stretchY };
  });

  // Catmull-Rom → cubic Bezier: guarantees smooth tangent continuity at every joint
  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  path += ' Z';
  return path;
}

function GardenBlob({
  seed,
  totalFlowers,
  totalSets,
  isActive,
  isMe,
  isTargeted,
  accent,
  accent2,
  accent3,
}: {
  seed: string;
  totalFlowers: number;
  totalSets: number;
  isActive: boolean;
  isMe: boolean;
  isTargeted: boolean;
  accent: string;
  accent2: string;
  accent3: string;
}) {
  const seedValue = hashSeed(seed);
  const path = createGardenBlobPath(
    seedValue,
    totalFlowers,
    totalSets,
    (isMe ? 1.8 : 0.8) + (isActive ? 3.4 : 0) + (isTargeted ? 2.1 : 0),
  );
  const glow = isTargeted ? 0.38 : isActive ? 0.28 : isMe ? 0.2 : 0.12;

  return (
    <svg className="garden-blob-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={`blob-pattern-${seedValue}`} patternUnits="objectBoundingBox" width="0.05" height="0.05">
          <image
            href={gardenGrassGif}
            x="0"
            y="0"
            width="1"
            height="1"
            preserveAspectRatio="none"
          />
        </pattern>
        <filter id={`blob-glow-${seedValue}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glow} 0`}
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path className="garden-blob-shadow" d={path} />
      <path
        className="garden-blob-texture"
        d={path}
        fill={`url(#blob-pattern-${seedValue})`}
      />
      <path className="garden-blob-line" d={path} />
    </svg>
  );
}

function computeArenaLayout(
  players: Player[],
  viewport: { width: number; height: number },
  compactLayout: boolean,
  myPlayerIndex: number = 0,
): ArenaGardenLayout[] {
  const count = Math.max(1, players.length);
  const shortSide = Math.max(360, Math.min(viewport.width, viewport.height));
  const longSide = Math.max(viewport.width, viewport.height);
  const densityFactor = compactLayout ? 0.78 : 1;
  const playerFactor = Math.max(0.78, 1 - (Math.max(0, count - 3) * 0.06));
  const sizeScale = densityFactor * playerFactor;
  const baseOrbit = compactLayout
    ? Math.min(shortSide * 0.24, longSide * 0.17)
    : Math.min(shortSide * 0.30, longSide * 0.22);
  const baseRadius = Math.max(compactLayout ? 84 : 120, Math.min(compactLayout ? 200 : 280, baseOrbit));
  const nodes = players.map((player, i) => {
    const totalFlowers = player.garden.sets.reduce((sum, set) => sum + (set.isToken ? 1 : set.flowers.length), 0);
    const totalSets = player.garden.sets.length;
    const rawSize = Math.max(compactLayout ? 106 : 132, Math.min(compactLayout ? 176 : 210, (compactLayout ? 126 : 150) + (totalFlowers * 2) + (totalSets * 8)));
    const size = rawSize * sizeScale;
    const angle = (Math.PI * 2 * (i - myPlayerIndex)) / count + Math.PI / 2;
    const orbit = baseRadius + (totalFlowers * (compactLayout ? 1.6 : 1.4)) + (totalSets * (compactLayout ? 12 : 9));
    return {
      player,
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit * (compactLayout ? 0.84 : 0.74),
      size,
      angle,
      totalFlowers,
      totalSets,
    };
  });

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  for (let iter = 0; iter < 9; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const minDist = (a.size + b.size) / 2 + (compactLayout ? 30 : 42);
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }

    for (const node of nodes) {
      const desiredOrbit = baseRadius + (node.totalFlowers * (compactLayout ? 2.1 : 2.6)) + (node.totalSets * (compactLayout ? 12 : 14));
      const dist = Math.max(1, Math.hypot(node.x, node.y));
      const pull = (dist - desiredOrbit) * 0.07;
      node.x -= (node.x / dist) * pull;
      node.y -= (node.y / dist) * pull;
      node.x = clamp(node.x, compactLayout ? -340 : -420, compactLayout ? 340 : 420);
      node.y = clamp(node.y, compactLayout ? -240 : -300, compactLayout ? 240 : 300);
    }
  }

  return nodes;
}

type WindFlight = {
  id: string;
  card: Card;
  fromPlayerId: string;
  toPlayerId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  delayMs: number;
};

type CardPlayEffect = 'none' | 'trade-fate' | 'wind-blow';

type GardenVisualEffect = {
  key: string;
  playerId: string;
  type: 'natural-disaster';
};

type GardenSettleState = {
  key: string;
  changedSetIds: string[];
};

type GardenSnapshot = Record<string, {
  signature: string;
  setSignatures: Record<string, string>;
}>;

type DragPreview = {
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const CARD_GESTURE_DEADZONE_PX = 9;
const CARD_PLAY_LIFT_PX = 14;
const CARD_SCROLL_INTENT_PX = 14;
const CARD_REORDER_INTENT_PX = 10;

type PointerDragMode = 'pending' | 'reorder' | 'play' | 'scroll';

type PointerDragSession = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  canPlay: boolean;
  canReorder: boolean;
  mode: PointerDragMode;
  dragging: boolean;
};

type ArenaTouchSession =
  | {
      mode: 'pan';
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      mode: 'pinch';
      startDistance: number;
      startZoom: number;
      contentX: number;
      contentY: number;
    };

type GardenDropHit = {
  playerId: string;
  setId: string;
};

function snapshotGardenIds(players: Player[]): Record<string, string[]> {
  return Object.fromEntries(players.map(player => [
    player.id,
    player.garden.sets.flatMap(set => set.flowers.map(flower => flower.id)),
  ]));
}

function snapshotGardenState(players: Player[]): GardenSnapshot {
  return Object.fromEntries(players.map(player => {
    const setSignatures = Object.fromEntries(player.garden.sets.map(set => [
      set.id,
      [
        set.flowers.map(flower => `${flower.id}:${flower.color}:${flower.isWildcard ? 'w' : 'n'}`).join(','),
        set.isComplete ? 'c' : 'i',
        set.isSolid ? 's' : 'n',
        set.isDivine ? 'd' : 'n',
        set.isToken ? 't' : 'n',
      ].join('|'),
    ]));
    return [player.id, {
      signature: player.garden.sets.map(set => `${set.id}:${setSignatures[set.id]}`).join('||'),
      setSignatures,
    }];
  }));
}

// ── Shared styles ──────────────────────────────────────────────

const btn = (color = '#0f3460', text = '#fff'): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, border: 'none',
  cursor: 'pointer', fontWeight: 600, fontSize: 13,
  background: color, color: text,
});

// ── Garden set ─────────────────────────────────────────────────

function SetChip({
  set,
  onClick,
  onPointerDown,
  highlight,
  sizeClass,
  dragActive,
  setRef,
  clusterStyle,
  isNewGrowth,
}: {
  set: GardenSet;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  highlight?: boolean;
  sizeClass?: string;
  dragActive?: boolean;
  setRef?: (node: HTMLDivElement | null) => void;
  clusterStyle?: React.CSSProperties;
  isNewGrowth?: boolean;
}) {
  const powerLabel = set.isToken ? '' : set.isDivine ? '👑' : set.isSolid ? '✦' : set.isComplete ? '✓' : '';
  const glowColor = highlight ? '#e94560' : set.isToken ? '#8ee0ff' : set.isSolid ? '#ffd700' : set.isComplete ? '#4ecca3' : null;
  const showBox = highlight || dragActive;
  const maxVisibleFlowers = sizeClass === 'size-xl' ? 6 : sizeClass === 'size-lg' ? 5 : 4;
  const visibleFlowers = set.flowers.slice(0, maxVisibleFlowers);
  const hiddenFlowerCount = Math.max(0, set.flowers.length - visibleFlowers.length);
  return (
    <div
      ref={setRef}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={['garden-set-chip', sizeClass, set.isToken ? 'is-token' : '', showBox ? 'has-frame' : '', highlight ? 'is-highlighted' : '', dragActive ? 'is-drag-active' : '', isNewGrowth ? 'is-new-growth' : '']
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--garden-set-border' as string]: showBox ? (highlight ? '#e94560' : 'rgba(78,204,163,0.6)') : 'transparent',
        ['--garden-set-bg' as string]: dragActive ? 'rgba(78, 204, 163, 0.14)' : 'transparent',
        ['--garden-set-shadow' as string]: highlight ? '0 0 10px #e94560' : 'none',
        ['--garden-set-glow' as string]: glowColor && !showBox ? `drop-shadow(0 0 6px ${glowColor})` : 'none',
        cursor: onClick ? 'pointer' : onPointerDown ? 'grab' : 'default',
        ...clusterStyle,
      }}
    >
      {set.isToken && (
        <span className="mini-token-placeholder" aria-label="token" title="Token">
          💎
        </span>
      )}
      {!set.isToken && visibleFlowers.map(f => {
        const displayColor = flowerDisplayColor(f);
        const art = flowerArt(displayColor);
        return (
          <span key={f.id} title={displayColor} className="mini-flower-token">
            {art
              ? <img src={art} alt={displayColor} />
              : <span>{FLOWER_EMOJI[displayColor] ?? '🌺'}</span>}
          </span>
        );
      })}
      {!set.isToken && hiddenFlowerCount > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>
          +{hiddenFlowerCount}
        </span>
      )}
      {powerLabel && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', alignSelf: 'flex-end' }}>
          {powerLabel}
        </span>
      )}
    </div>
  );
}

// ── Main Board ─────────────────────────────────────────────────

type Moves = Record<string, (...args: unknown[]) => void>;

type FlowerBoardProps = BoardProps<GameState> & {
  playerNames?: Record<string, string>;
};

// ── Chat types (used by InlineChat) ──────────────────────────

const QUICK_CHAT_OPTIONS = [
  { emoji: '🖕', text: '🖕' },
  { emoji: '☠️', text: '☠️' },
  { emoji: '😭', text: '😭' },
  { emoji: '🤣', text: '🤣' },
  { emoji: '🔥', text: '🔥' },
  { emoji: '🫨', text: '🫨' },
];

interface ChatMessage {
  id: string;
  matchID: string;
  playerID?: string;
  playerName: string;
  text: string;
  createdAt: number;
}

function formatChatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type LocalLogEntry = {
  key: string;
  text: string;
  createdAt: number;
};

function formatElapsedClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatSeasonLabel(season: GameState['season']): string {
  if (!season) return 'None';
  return season.charAt(0).toUpperCase() + season.slice(1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function FlowerBoard({ G, ctx, moves, playerID, playerNames, isConnected }: FlowerBoardProps) {
  const m = moves as unknown as Moves;
  const matchCtx = useContext(MatchContext);

  // ── Disconnect detection ─────────────────────────────────────
  const wasConnectedRef = useRef(false);
  const disconnectTimerRef = useRef<number | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<'socket' | 'match-gone' | null>(null);
  const showDisconnect = disconnectReason !== null;

  // 1) Socket-level disconnect: isConnected flips false after being true
  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      setDisconnectReason(null);
      if (disconnectTimerRef.current !== null) {
        window.clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    } else if (wasConnectedRef.current) {
      // Give boardgame.io 5 s to auto-reconnect before surfacing the overlay
      disconnectTimerRef.current = window.setTimeout(() => {
        setDisconnectReason('socket');
      }, 5000);
    }
    return () => {
      if (disconnectTimerRef.current !== null) {
        window.clearTimeout(disconnectTimerRef.current);
      }
    };
  }, [isConnected]);

  // 2) Match-deletion: poll the REST API — covers cases where the socket stays
  //    open but the match was deleted server-side (isConnected stays true)
  useEffect(() => {
    const server  = matchCtx?.server;
    const matchID = matchCtx?.matchID;
    if (!server || !matchID) return;

    let cancelled = false;

    const checkMatch = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${server}/games/flower-game/${matchID}`);
        if (!cancelled && res.status === 404) setDisconnectReason('match-gone');
      } catch { /* network issues handled by the socket watcher above */ }
    };

    // First check after 2 s (fast initial signal), then every 8 s
    const initialTimer = window.setTimeout(() => {
      void checkMatch();
    }, 2000);
    const pollInterval = window.setInterval(() => { void checkMatch(); }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection state ──────────────────────────────────────────
  const [step, setStep]   = useState<'menu' | 'pick-card' | 'pick-target' | 'confirm'>('menu');
  const [moveType, setMoveType]   = useState('');
  const [pickedCards, setPickedCards] = useState<string[]>([]);
  const [targetPlayer, setTargetPlayer] = useState('');
  const [targetSet, setTargetSet]     = useState('');
  const [hoverTargetPlayer, setHoverTargetPlayer] = useState('');
  const [hoverTargetSet, setHoverTargetSet] = useState('');
  const [chosenColor, setChosenColor] = useState('');
  const [discardChoice, setDiscardChoice] = useState('');
  const [windAttackDoubleMode, setWindAttackDoubleMode] = useState(false);
  const [windExtraTargetSets, setWindExtraTargetSets] = useState<string[]>([]);
  const [doubleHappinessMode, setDoubleHappinessMode] = useState<'take' | 'give' | ''>('');
  const [counterPickedCards, setCounterPickedCards] = useState<string[]>([]);
  const [error, setError] = useState('');

  // ── Blessing phase state ──────────────────────────────────────
  const [blessingStep, setBlessingStep] = useState<'pick' | 'arrange'>('pick');
  const [blessingPicked, setBlessingPicked] = useState<string[]>([]);
  const [blessingArranged, setBlessingArranged] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [pointerDragActive, setPointerDragActive] = useState(false);
  const [armedCardId, setArmedCardId] = useState<string | null>(null);
  const [arenaLogToast, setArenaLogToast] = useState<{ key: string; text: string } | null>(null);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [localLogEntries, setLocalLogEntries] = useState<LocalLogEntry[]>([]);

  // ── V2 drawer / modal state ────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [logUnread, setLogUnread] = useState(0);
  const [modalOpen, setModalOpen] = useState<'menu' | 'rules' | 'results' | null>(null);
  const [playerInfoPlayerId, setPlayerInfoPlayerId] = useState<string | null>(null);

  // ── Chat state ────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatMsgsRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const [chatBubbles, setChatBubbles] = useState<Record<string, { text: string; key: string }>>({});
  const prevLastMsgIdRef = useRef<Record<string, string>>({});
  const bubbleTimersRef = useRef<Record<string, number>>({});
  const arenaLogToastTimerRef = useRef<number | null>(null);
  const cardPlayFxTimerRef = useRef<number | null>(null);
  const arenaLogToastPrimedRef = useRef(false);
  const seatPresencePrimedRef = useRef(false);
  const previousSeatPresenceRef = useRef(matchCtx?.seatPresence ?? {});
  const [discardFlyCard, setDiscardFlyCard] = useState<Card | null>(null);
  const [windFlights, setWindFlights] = useState<WindFlight[]>([]);
  const [sceneFx, setSceneFx] = useState<'none' | 'eclipse' | 'reset'>('none');
  const [cardPlayFx, setCardPlayFx] = useState<CardPlayEffect>('none');
  const [gardenVisualEffect, setGardenVisualEffect] = useState<GardenVisualEffect | null>(null);
  const [settlingGardens, setSettlingGardens] = useState<Record<string, GardenSettleState>>({});
  const [scenePulse, setScenePulse] = useState<string | null>(null);
  const [arenaZoom, setArenaZoom] = useState(1);
  const [arenaPan, setArenaPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));
  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);
  const gardenRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const gardenSetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const arenaPanRef = useRef(arenaPan);
  const arenaZoomRef = useRef(arenaZoom);
  const arenaTouchSessionRef = useRef<ArenaTouchSession | null>(null);
  const dragSessionRef = useRef<PointerDragSession | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const pendingDragPreviewRef = useRef<DragPreview | null>(null);
  const proximityFrameRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef<string | null>(null);
  const suppressSetClickRef = useRef<string | null>(null);
  const previousDiscardCountRef = useRef<number>(G.discardPile.length);
  const previousGardenIdsRef = useRef<Record<string, string[]>>(snapshotGardenIds(G.players));
  const previousGardenStateRef = useRef<GardenSnapshot>(snapshotGardenState(G.players));
  const submitUnlockRef = useRef<number | null>(null);
  const gardenVisualEffectTimerRef = useRef<number | null>(null);
  const gardenSettleTimersRef = useRef<Record<string, number>>({});
  const previousLogLengthRef = useRef<number>(G.log.length);
  const pendingLocalPlantSoundLogSkipsRef = useRef<number>(0);
  const autoOpenedMatchResultRef = useRef<number | null>(null);
  const handDockRef = useRef<HTMLDivElement | null>(null);
  const handRowRef = useRef<HTMLDivElement | null>(null);
  const [handOrderIds, setHandOrderIds] = useState<string[]>([]);
  const [handInfoCardId, setHandInfoCardId] = useState<string | null>(null);
  const [handInfoAnchor, setHandInfoAnchor] = useState(0.5);
  const clampArenaZoom = (next: number) => Math.max(0.82, Math.min(1.75, Number(next.toFixed(2))));
  const adjustArenaZoom = (delta: number, focus?: { clientX: number; clientY: number }) => {
    const nextZoom = clampArenaZoom(arenaZoomRef.current + delta);
    if (!focus || !arenaRef.current) {
      setArenaZoom(nextZoom);
      return;
    }

    const rect = arenaRef.current.getBoundingClientRect();
    const screenX = focus.clientX - rect.left - (rect.width / 2);
    const screenY = focus.clientY - rect.top - (rect.height / 2);
    const currentPan = arenaPanRef.current;
    const contentX = (screenX - currentPan.x) / arenaZoomRef.current;
    const contentY = (screenY - currentPan.y) / arenaZoomRef.current;

    setArenaZoom(nextZoom);
    setArenaPan({
      x: screenX - (contentX * nextZoom),
      y: screenY - (contentY * nextZoom),
    });
  };
  useEffect(() => {
    arenaPanRef.current = arenaPan;
  }, [arenaPan]);

  useEffect(() => {
    arenaZoomRef.current = arenaZoom;
  }, [arenaZoom]);

  useEffect(() => {
    const arenaNode = arenaRef.current;
    if (!arenaNode) return;

    const touchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const [a, b] = [touches[0], touches[1]];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    };

    const touchCenter = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    };

    const startPinch = (touches: TouchList) => {
      const rect = arenaNode.getBoundingClientRect();
      const center = touchCenter(touches);
      const screenX = center.x - rect.left - (rect.width / 2);
      const screenY = center.y - rect.top - (rect.height / 2);
      const currentPan = arenaPanRef.current;

      arenaTouchSessionRef.current = {
        mode: 'pinch',
        startDistance: touchDistance(touches),
        startZoom: arenaZoomRef.current,
        contentX: (screenX - currentPan.x) / arenaZoomRef.current,
        contentY: (screenY - currentPan.y) / arenaZoomRef.current,
      };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (pointerDragActive) return;
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        arenaTouchSessionRef.current = {
          mode: 'pan',
          startX: touch.clientX,
          startY: touch.clientY,
          startPanX: arenaPanRef.current.x,
          startPanY: arenaPanRef.current.y,
        };
        return;
      }
      if (event.touches.length === 2) {
        startPinch(event.touches);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pointerDragActive) return;
      const session = arenaTouchSessionRef.current;
      if (!session) return;

      if (session.mode === 'pan' && event.touches.length === 1) {
        const touch = event.touches[0];
        event.preventDefault();
        setArenaPan({
          x: session.startPanX + (touch.clientX - session.startX),
          y: session.startPanY + (touch.clientY - session.startY),
        });
        return;
      }

      if (event.touches.length !== 2) return;
      if (session.mode !== 'pinch') {
        startPinch(event.touches);
      }
      const pinchSession = arenaTouchSessionRef.current;
      if (!pinchSession || pinchSession.mode !== 'pinch' || !pinchSession.startDistance) return;

      event.preventDefault();
      const currentDistance = touchDistance(event.touches);
      const nextZoom = clampArenaZoom(pinchSession.startZoom * (currentDistance / pinchSession.startDistance));
      const rect = arenaNode.getBoundingClientRect();
      const center = touchCenter(event.touches);
      const screenX = center.x - rect.left - (rect.width / 2);
      const screenY = center.y - rect.top - (rect.height / 2);

      setArenaZoom(nextZoom);
      setArenaPan({
        x: screenX - (pinchSession.contentX * nextZoom),
        y: screenY - (pinchSession.contentY * nextZoom),
      });
    };

    const syncTouchSession = (event: TouchEvent) => {
      if (pointerDragActive) {
        arenaTouchSessionRef.current = null;
        return;
      }
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        arenaTouchSessionRef.current = {
          mode: 'pan',
          startX: touch.clientX,
          startY: touch.clientY,
          startPanX: arenaPanRef.current.x,
          startPanY: arenaPanRef.current.y,
        };
        return;
      }
      if (event.touches.length === 2) {
        startPinch(event.touches);
        return;
      }
      arenaTouchSessionRef.current = null;
    };

    arenaNode.addEventListener('touchstart', onTouchStart, { passive: true });
    arenaNode.addEventListener('touchmove', onTouchMove, { passive: false });
    arenaNode.addEventListener('touchend', syncTouchSession);
    arenaNode.addEventListener('touchcancel', syncTouchSession);

    return () => {
      arenaNode.removeEventListener('touchstart', onTouchStart);
      arenaNode.removeEventListener('touchmove', onTouchMove);
      arenaNode.removeEventListener('touchend', syncTouchSession);
      arenaNode.removeEventListener('touchcancel', syncTouchSession);
    };
  }, [pointerDragActive]);
  const awaitingMoveResolutionRef = useRef<{
    phase: GameState['phase'];
    logLength: number;
    movesRemaining: number;
    handLength: number;
    currentPlayerIndex: number;
    pendingSelection: PendingAction['selectionKind'] | undefined;
  } | null>(null);
  // Live ref to moves — allows effects to always call the latest proxy
  const movesRef = useRef(m);
  movesRef.current = m;



  useEffect(() => {
    const unlockAudio = () => unlockMoveSfx();
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  function gardenSetRefKey(playerId: string, setId: string) {
    return `${playerId}::${setId}`;
  }

  function clearDropHover() {
    setHoverTargetPlayer('');
    setHoverTargetSet('');
  }

  function scheduleDragPreview(next: DragPreview | null) {
    pendingDragPreviewRef.current = next;
    if (dragPreviewFrameRef.current !== null) return;
    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;
      setDragPreview(pendingDragPreviewRef.current);
    });
  }

  function scheduleProximityUpdate(clientX: number, clientY: number) {
    if (proximityFrameRef.current !== null) return;
    proximityFrameRef.current = window.requestAnimationFrame(() => {
      proximityFrameRef.current = null;
      for (const [, gardenEl] of Object.entries(gardenRefs.current)) {
        if (!gardenEl) continue;
        const rect = gardenEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - cx, clientY - cy);
        const t = 1 - Math.min(1, Math.max(0, (dist - 20) / 280));
        gardenEl.style.setProperty('--proximity', t.toFixed(3));
      }
    });
  }

  function clearProximity() {
    if (proximityFrameRef.current !== null) {
      window.cancelAnimationFrame(proximityFrameRef.current);
      proximityFrameRef.current = null;
    }
    for (const [, gardenEl] of Object.entries(gardenRefs.current)) {
      gardenEl?.style.setProperty('--proximity', '0');
    }
  }

  function clearDragState() {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }
    pendingDragPreviewRef.current = null;
    setDragPreview(null);
    setDraggingCardId(null);
    clearDropHover();
    clearProximity();
  }

  function pointInsideHandReorderZone(clientX: number, clientY: number) {
    const handRow = handRowRef.current;
    if (!handRow) return false;
    const rect = handRow.getBoundingClientRect();
    return (
      clientX >= rect.left - 28
      && clientX <= rect.right + 28
      && clientY >= rect.top - 36
      && clientY <= rect.bottom + 36
    );
  }

  function reorderHandCard(cardId: string, clientX: number) {
    setHandOrderIds(prev => {
      const current = prev.length > 0 ? [...prev] : myHand.map(card => card.id);
      if (!current.includes(cardId)) return current;
      const remaining = current.filter(id => id !== cardId);
      let insertIndex = remaining.length;

      for (let i = 0; i < remaining.length; i += 1) {
        const rect = handCardRefs.current[remaining[i]]?.getBoundingClientRect();
        if (!rect) continue;
        if (clientX < rect.left + (rect.width / 2)) {
          insertIndex = i;
          break;
        }
      }

      remaining.splice(insertIndex, 0, cardId);
      return remaining;
    });
  }

  function showHandCardInfo(cardId: string) {
    const dockRect = handDockRef.current?.getBoundingClientRect();
    const cardRect = handCardRefs.current[cardId]?.getBoundingClientRect();
    if (dockRect && cardRect && dockRect.width > 0) {
      const centerRatio = (cardRect.left + (cardRect.width / 2) - dockRect.left) / dockRect.width;
      setHandInfoAnchor(clampNumber(centerRatio, 0.16, 0.84));
    } else {
      setHandInfoAnchor(0.5);
    }
    setHandInfoCardId(cardId);
  }

  function suppressNextCardClick(cardId: string) {
    suppressCardClickRef.current = cardId;
    window.setTimeout(() => {
      if (suppressCardClickRef.current === cardId) suppressCardClickRef.current = null;
    }, 0);
  }

  function resetAll() {
    setStep('menu'); setMoveType(''); setPickedCards([]);
    setTargetPlayer(''); setTargetSet(''); setWindExtraTargetSets([]); clearDropHover(); setChosenColor(''); setDiscardChoice(''); setWindAttackDoubleMode(false); setDoubleHappinessMode(''); setError('');
    dragSessionRef.current = null;
    setPointerDragActive(false);
    setHandInfoCardId(null);
    setArmedCardId(null); clearDragState();
  }

  function resetBlessing() {
    setBlessingStep('pick'); setBlessingPicked([]); setBlessingArranged([]);
  }

  function beginTradePresentFlow(tradeCardId?: string, targetPlayerId = '') {
    if (!me) return;
    const tradeCard = tradeCardId
      ? me.hand.find(card => card.id === tradeCardId && isPower(card, 'trade_present'))
      : me.hand.find(card => isPower(card, 'trade_present'));
    if (!tradeCard) {
      setError('You need a Trade Present card to start this move.');
      return;
    }

    setMoveType('tradePresent');
    setPickedCards([tradeCard.id]);
    setTargetPlayer(targetPlayerId);
    setTargetSet('');
    setWindExtraTargetSets([]);
    setChosenColor('');
    setDiscardChoice('');
    setDoubleHappinessMode('');
    setError('');
    setArmedCardId(tradeCard.id);
    setHandInfoCardId(null);
    clearDragState();
    setStep(targetPlayerId ? 'pick-card' : 'pick-target');
  }

  function moveBlessingCard(idx: number, dir: -1 | 1) {
    const fallbackOrder = G.blessingState?.revealedCards.map(card => card.id) ?? [];
    const arr = [...(blessingArranged.length > 0 ? blessingArranged : fallbackOrder)];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    setBlessingArranged(arr);
  }

  function selectionLimit(type: string): number {
    if (type === 'playWindDouble') return 2;
    if (type === 'doubleHappiness') return 1;
    if (type === 'doubleHappinessGive') return 3;
    if (type === 'tradePresent') return 2;
    return 1;
  }

  function toggleCard(id: string) {
    const limit = selectionLimit(moveType);
    setPickedCards(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= limit) return prev;
      return [...prev, id];
    });
  }

  // ── Derived values ───────────────────────────────────────────
  const me = G.players.find(p => p.id === playerID);
  const myTurn = ctx.currentPlayer === playerID;
  const nameOf = (player?: Player | null) => player ? (playerNames?.[player.id] ?? player.name) : '?';
  const displayLogEntry = (entry: string) => {
    let rendered = entry;
    for (const player of G.players) {
      const liveName = nameOf(player);
      if (!liveName || liveName === player.name) continue;
      rendered = rendered.replace(new RegExp(`\\b${escapeRegExp(player.name)}\\b`, 'g'), liveName);
      rendered = rendered.replace(new RegExp(`\\bPlayer ${Number(player.id) + 1}\\b`, 'g'), liveName);
    }
    return rendered;
  };
  const displayLogItems = useMemo(
    () => [
      ...localLogEntries.map(entry => ({ key: entry.key, text: entry.text })),
      ...G.log.map((entry, index) => ({ key: `server-${index}`, text: displayLogEntry(entry) })),
    ],
    [G.log, localLogEntries],
  );
  const isCounter = G.phase === 'counter';
  const amTarget  = G.pendingAction?.targetPlayerId === playerID;
  const inStage   = !!(ctx.activePlayers && playerID !== null && ctx.activePlayers[playerID!]);
  const opponents = G.players.filter(p => p.id !== playerID);
  const beeDiscardFlowers = G.discardPile.filter((c): c is FlowerCard => c.kind === 'flower' && c.color !== 'triple_rainbow');
  const drawPhaseSeason = G.drawPhaseSeason ?? G.season;
  const targetablePlayers = moveType === 'playBee' && me ? [me, ...opponents] : opponents;
  const hasNaturalDisasterTarget = opponents.some(p => p.garden.sets.some(s => !s.isDivine));
  const theme = getSeasonTheme(G.season);
  const matchResult = G.matchResult;
  const isGameOver = G.phase === 'game_over';
  const finalClockMs = matchResult?.finishedAt ?? nowMs;
  const turnStartedAt = G.turnStartedAt ?? Date.now();
  const turnTimeLimitSec = Math.max(60, G.turnTimeLimitSec ?? 0);
  const counterStartedAt = G.phase === 'counter' ? G.pendingAction?.startedAt ?? null : null;
  const counterTimeLimitSec = G.phase === 'counter' ? Math.max(1, G.pendingAction?.responseTimeLimitSec ?? 14) : null;
  const turnDeadlineMs = counterStartedAt != null
    ? counterStartedAt + (counterTimeLimitSec! * 1000)
    : turnStartedAt + (turnTimeLimitSec * 1000);
  const turnRemainingSec = isGameOver ? 0 : Math.max(0, Math.ceil((turnDeadlineMs - finalClockMs) / 1000));
  const totalTimerStartMs = G.gameStartedAt && G.gameStartedAt > 0 ? G.gameStartedAt : turnStartedAt;
  const totalElapsedSec = matchResult
    ? matchResult.durationSec
    : Math.max(0, Math.floor((finalClockMs - totalTimerStartMs) / 1000));
  const totalTimerLabel = formatElapsedClock(totalElapsedSec);
  const turnTimerLabel = isGameOver
    ? totalTimerLabel
    : `${String(Math.floor(turnRemainingSec / 60)).padStart(2, '0')}:${String(turnRemainingSec % 60).padStart(2, '0')}`;
  const timerPlayerId = G.phase === 'counter' && G.pendingAction
    ? G.pendingAction.targetPlayerId
    : G.turnOrder[G.currentPlayerIndex];
  const activePlayer = G.players.find(p => p.id === timerPlayerId) ?? null;
  const timerLabel = isGameOver
    ? 'Match complete'
    : G.phase === 'counter'
    ? `Waiting on ${activePlayer ? nameOf(activePlayer) : 'counter'}`
    : myTurn
      ? 'Your turn'
      : nameOf(G.players.find(p => p.id === G.turnOrder[G.currentPlayerIndex]));
  const resultWinnerLabel = matchResult?.winnerName
    ?? nameOf(G.players.find(player => player.id === G.winner))
    ?? 'Unknown';
  const myHandRaw = me?.hand ?? [];
  const myHand = useMemo(() => {
    if (myHandRaw.length === 0) return [];
    const byId = new Map(myHandRaw.map(card => [card.id, card]));
    const ordered = handOrderIds
      .map(id => byId.get(id))
      .filter((card): card is Card => !!card);
    const missing = myHandRaw.filter(card => !handOrderIds.includes(card.id));
    return [...ordered, ...missing];
  }, [handOrderIds, myHandRaw]);
  const selectedPrimaryWindCard = moveType === 'playWindSingle'
    ? myHand.find(card => card.id === pickedCards[0] && isPower(card, 'wind')) ?? null
    : null;
  const extraWindCards = selectedPrimaryWindCard
    ? myHand.filter(card => isPower(card, 'wind') && card.id !== selectedPrimaryWindCard.id)
    : [];
  const autoDoubleWindCard = extraWindCards[0] ?? null;
  const canUpgradeSingleWind = !!selectedPrimaryWindCard && !!autoDoubleWindCard;
  const effectiveMoveType = moveType === 'playWindSingle' && windAttackDoubleMode && canUpgradeSingleWind
    ? 'playWindDouble'
    : moveType === 'doubleHappiness'
      ? doubleHappinessMode === 'give'
        ? 'doubleHappinessGive'
        : doubleHappinessMode === 'take'
          ? 'doubleHappinessTake'
          : moveType
      : moveType;
  const isWindCounterWindow = isCounter
    && amTarget
    && inStage
    && !!G.pendingAction
    && (G.pendingAction.original.type === 'play_wind_single' || G.pendingAction.original.type === 'play_wind_double');
  const isMobileLayout = viewport.width <= 720;
  // Use the actual playfield size (subtracting v2 shell chrome)
  const chatW  = 0;
  const logW   = 0;
  const headerH = 40; const actionH = isMobileLayout ? 120 : 108; const footerH = 34;
  const effectiveW = Math.max(320, viewport.width  - chatW - logW);
  const effectiveH = Math.max(280, viewport.height - headerH - actionH - footerH);
  const layoutMode = effectiveW >= 1200 && effectiveH >= 700 && G.players.length <= 4 ? 'spacious' : 'compact';
  const compactLayout = layoutMode === 'compact';
  const myPlayerIndex = G.players.findIndex(p => p.id === playerID);
  const arenaLayout = useMemo(
    () => computeArenaLayout(G.players, { width: effectiveW, height: effectiveH }, compactLayout, Math.max(0, myPlayerIndex)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [G.players, effectiveW, effectiveH, compactLayout, myPlayerIndex],
  );

  useEffect(() => {
    document.body.classList.remove('layout-compact');
    document.documentElement.classList.remove('layout-compact');
  }, []);
  const activeGardenPlayerId = hoverTargetPlayer || targetPlayer;
  const activeGardenSetId = hoverTargetSet || targetSet;
  const attackedGardenPlayerId = G.phase === 'counter' ? G.pendingAction?.targetPlayerId ?? '' : '';
  const attackedGardenSetId = G.phase === 'counter' ? G.pendingAction?.original.targetSetId ?? '' : '';
  const attackedGardenPlayer = attackedGardenPlayerId
    ? G.players.find(p => p.id === attackedGardenPlayerId) ?? null
    : null;
  const attackedGardenSet = attackedGardenPlayer && attackedGardenSetId
    ? attackedGardenPlayer.garden.sets.find(set => set.id === attackedGardenSetId) ?? null
    : null;
  const attackedSetLabel = describeGardenSet(attackedGardenSet);
  const selectedHandInfoCard = handInfoCardId
    ? myHand.find(card => card.id === handInfoCardId) ?? null
    : null;
  const showHandInfoCard = !myTurn && selectedHandInfoCard;

  function showArenaToast(text: string, key: string) {
    if (arenaLogToastTimerRef.current !== null) {
      window.clearTimeout(arenaLogToastTimerRef.current);
    }
    setArenaLogToast({ key, text });
    arenaLogToastTimerRef.current = window.setTimeout(() => {
      setArenaLogToast(null);
      arenaLogToastTimerRef.current = null;
    }, 5000);
  }

  function pushLocalLogEntry(text: string) {
    const entry = {
      key: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: Date.now(),
    };
    setLocalLogEntries(prev => [...prev, entry].slice(-18));
    showArenaToast(text, entry.key);
  }

  function resolvePlantTargetSetId(cardId: string, targetPlayerId: string, currentTargetSetId: string): string {
    const card = me?.hand.find(c => c.id === cardId);
    if (!card || !isFlower(card)) return currentTargetSetId;

    const target = G.players.find(p => p.id === targetPlayerId);
    if (!target) return currentTargetSetId;

    if (!card.isWildcard && card.color !== 'triple_rainbow') {
      const fallbackSet = target.garden.sets.find(set => !set.isDivine && gardenSetColor(set) === card.color);
      return fallbackSet?.id ?? '';
    }

    if (currentTargetSetId) return currentTargetSetId;

    const effectiveColor = chosenColor;
    if (!effectiveColor) return '';

    const fallbackSet = target.garden.sets.find(set => !set.isDivine && gardenSetColor(set) === effectiveColor);
    return fallbackSet?.id ?? '';
  }
  const tetherLine = useMemo(() => {
    const sourceId = draggingCardId || armedCardId;
    const targetId = activeGardenPlayerId || targetPlayer;
    if (!sourceId || !targetId) return null;
    const targetEl = gardenRefs.current[targetId];
    if (!targetEl) return null;
    const sourceRect = dragPreview
      ? { left: dragPreview.x, top: dragPreview.y, width: dragPreview.width, height: dragPreview.height }
      : handCardRefs.current[sourceId]?.getBoundingClientRect();
    if (!sourceRect) return null;
    const t = targetEl.getBoundingClientRect();
    return {
      x1: sourceRect.left + (sourceRect.width / 2),
      y1: sourceRect.top + (sourceRect.height / 2),
      x2: t.left + (t.width / 2),
      y2: t.top + (t.height / 2),
    };
  }, [dragPreview, draggingCardId, armedCardId, activeGardenPlayerId, targetPlayer, G.players.length, G.log.length]);

  function hitTestGardenDrop(clientX: number, clientY: number): GardenDropHit | null {
    for (const [key, setEl] of Object.entries(gardenSetRefs.current)) {
      if (!setEl) continue;
      const rect = setEl.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      const [playerId, setId] = key.split('::');
      if (playerId && typeof setId === 'string') return { playerId, setId };
    }

    for (const [playerId, gardenEl] of Object.entries(gardenRefs.current)) {
      if (!gardenEl) continue;
      const rect = gardenEl.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return { playerId, setId: '' };
      }
    }

    return null;
  }

  function updateDragHover(clientX: number, clientY: number) {
    const hit = hitTestGardenDrop(clientX, clientY);
    if (!hit) {
      clearDropHover();
      return null;
    }
    setHoverTargetPlayer(hit.playerId);
    setHoverTargetSet(hit.setId);
    return hit;
  }

  function defendWithWind(count: number) {
    if (!isWindCounterWindow) return;
    const availableWind = myHand.filter(entry => isPower(entry, 'wind'));
    if (availableWind.length < count) {
      setError(`You need ${count} Wind card${count > 1 ? 's' : ''} to defend.`);
      return;
    }
    setError('');
    runMove(() => m.counterWind(...availableWind.slice(0, count).map(card => card.id)));
  }

  function startCardPointerSession(cardId: string, event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const canPlay = myTurn && G.phase === 'action';
    const canReorder = !myTurn;
    if (!canPlay && !canReorder) return;
    const sourceEl = handCardRefs.current[cardId];
    if (!sourceEl) return;
    const rect = sourceEl.getBoundingClientRect();
    dragSessionRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      canPlay,
      canReorder,
      mode: 'pending',
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setHandInfoCardId(null);
    setPointerDragActive(true);
  }

  function handleHandCardClick(cardId: string) {
    if (suppressCardClickRef.current === cardId) {
      suppressCardClickRef.current = null;
      return;
    }
    setError('');
    setArmedCardId(prev => prev === cardId ? null : cardId);
    if (myTurn) {
      setHandInfoCardId(null);
      return;
    }
    setHandInfoCardId(prev => {
      const next = prev === cardId ? null : cardId;
      if (next) {
        window.requestAnimationFrame(() => showHandCardInfo(cardId));
      }
      return next;
    });
  }

  function moveTypeFromCard(card: Card, targetPlayerId: string): string | null {
    if (isFlower(card)) return targetPlayerId === playerID ? 'plantOwn' : 'plantOpponent';
    if (isPower(card, 'wind')) return targetPlayerId === playerID ? null : 'playWindSingle';
    if (isPower(card, 'bug')) return targetPlayerId === playerID ? null : 'playBug';
    if (isPower(card, 'bee')) return 'playBee';
    if (isPower(card, 'double_happiness')) return targetPlayerId === playerID ? null : 'doubleHappiness';
    if (isPower(card, 'trade_present')) return targetPlayerId === playerID ? null : 'tradePresent';
    if (isPower(card, 'trade_fate')) return targetPlayerId === playerID ? null : 'tradeFate';
    if (isPower(card, 'let_go')) return 'letGo';
    if (isPower(card, 'spring') || isPower(card, 'summer') || isPower(card, 'autumn') || isPower(card, 'winter')) return 'playSeason';
    if (isPower(card, 'natural_disaster')) return targetPlayerId === playerID ? null : 'naturalDisaster';
    if (isPower(card, 'eclipse')) return 'playEclipse';
    if (isPower(card, 'great_reset')) return 'playGreatReset';
    return null;
  }

  function moveNeedsTargetPlayer(type: string) {
    return [
      'plantOpponent', 'playWindSingle', 'playWindDouble', 'playBug', 'playBee',
      'naturalDisaster', 'tradePresent', 'tradeFate', 'doubleHappiness', 'doubleHappinessTake', 'doubleHappinessGive',
    ].includes(type);
  }

  function moveRequiresTargetSet(type: string) {
    return ['playWindSingle', 'playWindDouble', 'playBug', 'naturalDisaster'].includes(type);
  }

  function moveUsesEditableSetTarget(type: string) {
    return ['playWindSingle', 'playWindDouble', 'playBug', 'playBee', 'naturalDisaster'].includes(type);
  }

  function isValidTargetSetForMove(type: string, set: GardenSet) {
    if (set.isDivine) return false;
    if (type === 'naturalDisaster') return true;
    if (type === 'playBug') return !(set.isSolid && G.season !== 'autumn');
    if (type === 'playWindSingle') return !set.isSolid && !set.containsTripleRainbow && set.flowers.length > 0;
    if (type === 'playWindDouble') return !set.isSolid && set.flowers.length > 0;
    if (type === 'playBee') return true;
    return true;
  }

  function toggleDoubleWindTargetSet(setId: string) {
    if (effectiveMoveType !== 'playWindDouble') {
      setTargetSet(setId);
      return;
    }

    if (!targetSet || targetSet === setId) {
      setTargetSet(setId);
      setWindExtraTargetSets(prev => prev.filter(id => id !== setId));
      return;
    }

    setWindExtraTargetSets(prev =>
      prev.includes(setId)
        ? prev.filter(id => id !== setId)
        : [...prev, setId],
    );
  }

  function stagePlayFromCard(cardId: string, targetPlayerId: string, targetSetId: string | '') {
    if (!me) return;
    const card = me.hand.find(c => c.id === cardId);
    if (!card) return;
    const nextMove = moveTypeFromCard(card, targetPlayerId);
    if (!nextMove) return;
    const stagedTargetPlayerId = isFlower(card) || moveNeedsTargetPlayer(nextMove)
      ? targetPlayerId
      : '';
    const resolvedTargetSetId = isFlower(card)
      ? resolvePlantTargetSetId(cardId, targetPlayerId, targetSetId)
      : moveRequiresTargetSet(nextMove)
        ? targetSetId
        : '';

    setMoveType(nextMove);
    setPickedCards([card.id]);
    setTargetPlayer(stagedTargetPlayerId);
    setTargetSet(resolvedTargetSetId);
    setWindExtraTargetSets([]);
    setChosenColor('');
    setDiscardChoice('');
    setDoubleHappinessMode('');
    setError('');
    setArmedCardId(card.id);

    if (isFlower(card)) {
      setStep('confirm');
      clearDragState();
      setArmedCardId(null);
      return;
    }

    if (nextMove === 'playBee') {
      setStep('pick-card');
      clearDragState();
      return;
    }

    if (nextMove === 'tradePresent') {
      setStep(targetPlayerId ? 'pick-card' : 'pick-target');
      clearDragState();
      return;
    }

    if (nextMove === 'doubleHappiness') {
      setStep('pick-target');
      clearDragState();
      return;
    }

    if (moveRequiresTargetSet(nextMove) && !resolvedTargetSetId) {
      setStep('pick-target');
      clearDragState();
      return;
    }

    if (nextMove === 'doubleHappinessTake' || nextMove === 'tradeFate' || nextMove === 'letGo' || nextMove === 'playSeason' || nextMove === 'playEclipse' || nextMove === 'playGreatReset' || nextMove === 'playWindSingle' || nextMove === 'playBug' || nextMove === 'naturalDisaster') {
      setStep('confirm');
      clearDragState();
      setArmedCardId(null);
      return;
    }

    setStep('confirm');
    clearDragState();
    setArmedCardId(null);
  }

  function plantCardOntoGarden(targetPlayerId: string, targetSetId: string | '') {
    const activeCardId = draggingCardId ?? armedCardId;
    if (!activeCardId) return;
    stagePlayFromCard(activeCardId, targetPlayerId, targetSetId);
  }

  useEffect(() => {
    setCounterPickedCards([]);
  }, [G.pendingAction?.selectionKind, G.pendingAction?.original.type, G.phase]);

  useEffect(() => {
    const nextIds = myHandRaw.map(card => card.id);
    setHandOrderIds(prev => {
      const kept = prev.filter(id => nextIds.includes(id));
      const appended = nextIds.filter(id => !kept.includes(id));
      const merged = [...kept, ...appended];
      return merged.length === prev.length && merged.every((id, index) => id === prev[index]) ? prev : merged;
    });
  }, [myHandRaw]);

  useEffect(() => {
    if (!handInfoCardId) return;
    if (myHand.some(card => card.id === handInfoCardId)) return;
    setHandInfoCardId(null);
  }, [handInfoCardId, myHand]);

  useEffect(() => {
    if (!handInfoCardId || myTurn) return;
    const currentHandInfoCardId = handInfoCardId;
    function handleGlobalPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const selectedCard = handCardRefs.current[currentHandInfoCardId];
      if (selectedCard?.contains(target)) return;
      setHandInfoCardId(null);
    }
    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
  }, [handInfoCardId, myTurn]);

  useEffect(() => {
    if (!myTurn) return;
    setHandInfoCardId(null);
  }, [myTurn]);

  useEffect(() => {
    if (moveType !== 'playWindSingle' && windAttackDoubleMode) {
      setWindAttackDoubleMode(false);
    }
  }, [moveType, windAttackDoubleMode]);

  useEffect(() => {
    if (effectiveMoveType !== 'playWindDouble' && windExtraTargetSets.length > 0) {
      setWindExtraTargetSets([]);
    }
  }, [effectiveMoveType, windExtraTargetSets.length]);

  useEffect(() => {
    if (moveType !== 'doubleHappiness' && doubleHappinessMode) {
      setDoubleHappinessMode('');
    }
  }, [moveType, doubleHappinessMode]);

  useEffect(() => {
    if (moveUsesEditableSetTarget(effectiveMoveType) || moveType === 'plantOwn' || moveType === 'plantOpponent') return;
    if (!targetSet && windExtraTargetSets.length === 0) return;
    setTargetSet('');
    setWindExtraTargetSets([]);
  }, [effectiveMoveType, moveType, targetSet, windExtraTargetSets.length]);

  useEffect(() => {
    if (moveType === 'playWindSingle' && windAttackDoubleMode && !canUpgradeSingleWind) {
      setWindAttackDoubleMode(false);
    }
  }, [moveType, windAttackDoubleMode, canUpgradeSingleWind]);

  useEffect(() => {
    if (!targetPlayer || !targetSet || !['playWindSingle', 'playWindDouble', 'playBug', 'naturalDisaster', 'playBee'].includes(effectiveMoveType)) return;
    const target = G.players.find(player => player.id === targetPlayer);
    const selectedSet = target?.garden.sets.find(set => set.id === targetSet);
    if (selectedSet && isValidTargetSetForMove(effectiveMoveType, selectedSet)) return;
    setTargetSet('');
    setWindExtraTargetSets([]);
  }, [effectiveMoveType, G.players, targetPlayer, targetSet]);

  useEffect(() => {
    if (effectiveMoveType !== 'playWindDouble') return;
    const target = G.players.find(player => player.id === targetPlayer);
    if (!target) {
      if (windExtraTargetSets.length > 0) setWindExtraTargetSets([]);
      return;
    }
    const validIds = new Set(
      target.garden.sets
        .filter(set => set.id !== targetSet && isValidTargetSetForMove('playWindDouble', set))
        .map(set => set.id),
    );
    const filtered = windExtraTargetSets.filter(setId => validIds.has(setId));
    if (filtered.length !== windExtraTargetSets.length) {
      setWindExtraTargetSets(filtered);
    }
  }, [effectiveMoveType, G.players, targetPlayer, targetSet, windExtraTargetSets]);

  useEffect(() => {
    const previousSnapshot = previousGardenStateRef.current;
    const currentSnapshot = snapshotGardenState(G.players);
    const nextSettles: Array<{ playerId: string; changedSetIds: string[] }> = [];

    for (const player of G.players) {
      const previous = previousSnapshot[player.id];
      const current = currentSnapshot[player.id];
      if (!previous || previous.signature === current.signature) continue;
      if (player.garden.sets.length === 0) continue;

      const changedSetIds = player.garden.sets
        .filter(set => previous.setSignatures[set.id] !== current.setSignatures[set.id])
        .map(set => set.id);

      nextSettles.push({
        playerId: player.id,
        changedSetIds: changedSetIds.length > 0 ? changedSetIds : player.garden.sets.map(set => set.id),
      });
    }

    if (nextSettles.length > 0) {
      setSettlingGardens(prev => {
        const next = { ...prev };
        for (const settle of nextSettles) {
          if (gardenSettleTimersRef.current[settle.playerId] !== undefined) {
            window.clearTimeout(gardenSettleTimersRef.current[settle.playerId]);
          }
          next[settle.playerId] = {
            key: `${settle.playerId}-${Date.now()}-${settle.changedSetIds.join('-')}`,
            changedSetIds: settle.changedSetIds,
          };
          gardenSettleTimersRef.current[settle.playerId] = window.setTimeout(() => {
            setSettlingGardens(currentGardens => {
              const updated = { ...currentGardens };
              delete updated[settle.playerId];
              return updated;
            });
            delete gardenSettleTimersRef.current[settle.playerId];
          }, 920);
        }
        return next;
      });
    }

    previousGardenStateRef.current = currentSnapshot;
  }, [G.players]);

  useEffect(() => {
    const previousLength = previousLogLengthRef.current;
    if (G.log.length > previousLength) {
      for (let i = previousLength; i < G.log.length; i += 1) {
        const entry = G.log[i];
        if (typeof entry !== 'string' || !/\bplant(ed|ing)?\b/i.test(entry)) continue;
        if (pendingLocalPlantSoundLogSkipsRef.current > 0) {
          pendingLocalPlantSoundLogSkipsRef.current -= 1;
          continue;
        }
          playMoveSfx();
        break;
      }
    }
    previousLogLengthRef.current = G.log.length;
  }, [G.log.length]);

  useEffect(() => {
    if (matchResult?.finishedAt) {
      setNowMs(matchResult.finishedAt);
      return undefined;
    }

    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [matchResult?.finishedAt]);

  useEffect(() => {
    if (!matchResult) return;
    if (autoOpenedMatchResultRef.current === matchResult.finishedAt) return;
    autoOpenedMatchResultRef.current = matchResult.finishedAt;
    resetAll();
    resetBlessing();
    setPlayerInfoPlayerId(null);
    setModalOpen('results');
  }, [matchResult]);

  useEffect(() => {
    if (!pointerDragActive) return undefined;

    const onPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (session.mode === 'pending') {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (Math.hypot(dx, dy) < CARD_GESTURE_DEADZONE_PX) return;

        if (session.canPlay) {
          const pulledUp = dy <= -CARD_PLAY_LIFT_PX && absY >= absX * 0.7;
          const scrollingSideways = absX >= CARD_SCROLL_INTENT_PX && absX > absY;
          session.mode = pulledUp ? 'play' : scrollingSideways ? 'scroll' : 'pending';
        } else if (session.canReorder) {
          const reorderingSideways = absX >= CARD_REORDER_INTENT_PX && absX >= absY * 0.8;
          session.mode = reorderingSideways && pointInsideHandReorderZone(event.clientX, event.clientY)
            ? 'reorder'
            : 'pending';
        }

        if (session.mode === 'pending') return;
        if (session.mode === 'scroll') {
          dragSessionRef.current = null;
          setPointerDragActive(false);
          return;
        }
        session.dragging = true;
        if (session.mode === 'play') {
          setDraggingCardId(session.cardId);
          setArmedCardId(session.cardId);
        } else {
          reorderHandCard(session.cardId, event.clientX);
        }
      }

      if (session.mode === 'reorder') {
        event.preventDefault();
        reorderHandCard(session.cardId, event.clientX);
        return;
      }

      event.preventDefault();
      scheduleDragPreview({
        cardId: session.cardId,
        x: event.clientX - session.offsetX,
        y: event.clientY - session.offsetY,
        width: session.width,
        height: session.height,
      });
      updateDragHover(event.clientX, event.clientY);
      scheduleProximityUpdate(event.clientX, event.clientY);
    };

    const finishPointerSession = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const wasDragging = session.dragging;
      const dropTarget = session.mode === 'play' && wasDragging ? hitTestGardenDrop(event.clientX, event.clientY) : null;
      const endedInReorder = session.mode === 'reorder' && wasDragging;

      dragSessionRef.current = null;
      setPointerDragActive(false);
      clearDragState();

      if (!wasDragging) return;

      suppressNextCardClick(session.cardId);
      if (endedInReorder) {
        showHandCardInfo(session.cardId);
        return;
      }
      if (dropTarget) {
        stagePlayFromCard(session.cardId, dropTarget.playerId, dropTarget.setId);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointerSession);
    window.addEventListener('pointercancel', finishPointerSession);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishPointerSession);
      window.removeEventListener('pointercancel', finishPointerSession);
    };
  }, [pointerDragActive, stagePlayFromCard]);

  useEffect(() => () => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
    }
  }, []);

  useEffect(() => {
    setIsSubmitting(false);
    if (submitUnlockRef.current !== null) {
      window.clearTimeout(submitUnlockRef.current);
      submitUnlockRef.current = null;
    }
  }, [ctx.currentPlayer, G.currentPlayerIndex, G.phase, G.movesRemaining, G.log.length, G.pendingAction?.selectionKind]);

  useEffect(() => {
    const pending = awaitingMoveResolutionRef.current;
    if (!pending) return;
    const resolved =
      pending.phase !== G.phase ||
      pending.logLength !== G.log.length ||
      pending.movesRemaining !== G.movesRemaining ||
      pending.handLength !== (me?.hand.length ?? 0) ||
      pending.currentPlayerIndex !== G.currentPlayerIndex ||
      pending.pendingSelection !== G.pendingAction?.selectionKind;
    if (!resolved) return;
    awaitingMoveResolutionRef.current = null;
    resetAll();
  }, [G.currentPlayerIndex, G.log.length, G.movesRemaining, G.pendingAction?.selectionKind, G.phase, me?.hand.length]);

  // Winter draw auto-skip: engine correctly draws 0 cards for non-empty hands in winter.
  // Auto-trigger pass so players don't have to click a draw button that does nothing.
  // (Empty hand in winter still draws 7, so we keep the button visible for that case.)
  useEffect(() => {
    if (!myTurn || G.phase !== 'draw' || drawPhaseSeason !== 'winter') return;
    const myPlayer = G.players.find(p => p.id === playerID);
    if (!myPlayer || myPlayer.hand.length === 0) return;
    const timer = window.setTimeout(() => { movesRef.current.pass(); }, 350);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, G.phase, drawPhaseSeason, G.currentPlayerIndex, playerID]);

  useEffect(() => {
    const previous = previousDiscardCountRef.current;
    const current = G.discardPile.length;
    const newest = current > 0 ? G.discardPile[current - 1] : null;

    if (current > previous && newest) {
      setDiscardFlyCard(newest);
      window.setTimeout(() => setDiscardFlyCard(null), 850);
    }

    previousDiscardCountRef.current = current;
  }, [G.discardPile]);

  useEffect(() => {
    const latestLog = G.log[G.log.length - 1] ?? '';
    const previousSnapshot = previousGardenIdsRef.current;
    const currentSnapshot = snapshotGardenIds(G.players);
    const lowerLog = latestLog.toLowerCase();
    const removedCountsByPlayer = new Map<string, number>();

    const triggerCardPlayFx = (nextFx: CardPlayEffect) => {
      if (cardPlayFxTimerRef.current !== null) {
        window.clearTimeout(cardPlayFxTimerRef.current);
      }
      setCardPlayFx(nextFx);
      cardPlayFxTimerRef.current = window.setTimeout(() => {
        setCardPlayFx('none');
        cardPlayFxTimerRef.current = null;
      }, 1000);
    };

    const triggerGardenVisualEffect = (playerId: string, type: GardenVisualEffect['type']) => {
      if (gardenVisualEffectTimerRef.current !== null) {
        window.clearTimeout(gardenVisualEffectTimerRef.current);
      }
      setGardenVisualEffect({ key: `${type}-${playerId}-${G.log.length}`, playerId, type });
      gardenVisualEffectTimerRef.current = window.setTimeout(() => {
        setGardenVisualEffect(null);
        gardenVisualEffectTimerRef.current = null;
      }, 2000);
    };

    const isWindLog = /wind/i.test(latestLog) && /(blew|blow|counter wind)/i.test(latestLog);
    if (isWindLog) {
      const removed = new Map<string, string>();
      const added = new Map<string, string>();

      for (const player of G.players) {
        const prevIds = new Set(previousSnapshot[player.id] ?? []);
        const currIds = new Set(currentSnapshot[player.id] ?? []);
        for (const id of previousSnapshot[player.id] ?? []) {
          if (!currIds.has(id)) {
            removed.set(id, player.id);
            removedCountsByPlayer.set(player.id, (removedCountsByPlayer.get(player.id) ?? 0) + 1);
          }
        }
        for (const id of currentSnapshot[player.id] ?? []) {
          if (!prevIds.has(id)) added.set(id, player.id);
        }
      }

      const flights: WindFlight[] = [];
      for (const [cardId, fromPlayerId] of removed.entries()) {
        const toPlayerId = added.get(cardId);
        if (!toPlayerId) continue;
        const card = G.players
          .flatMap(player => player.garden.sets.flatMap(set => set.flowers))
          .find(flower => flower.id === cardId);
        const fromEl = gardenRefs.current[fromPlayerId];
        const toEl = gardenRefs.current[toPlayerId];
        if (!card || !fromEl || !toEl) continue;

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        flights.push({
          id: `${cardId}-${G.log.length}`,
          card,
          fromPlayerId,
          toPlayerId,
          start: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
          end: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
          delayMs: flights.length * 90,
        });
      }

      if (flights.length > 0) {
        setWindFlights(flights);
        window.setTimeout(() => setWindFlights([]), 1100);
      }
    } else {
      for (const player of G.players) {
        const currIds = new Set(currentSnapshot[player.id] ?? []);
        for (const id of previousSnapshot[player.id] ?? []) {
          if (!currIds.has(id)) {
            removedCountsByPlayer.set(player.id, (removedCountsByPlayer.get(player.id) ?? 0) + 1);
          }
        }
      }
    }

    if (/natural disaster|disaster/.test(lowerLog)) {
      const attackedPlayerId = [...removedCountsByPlayer.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (attackedPlayerId) {
        triggerGardenVisualEffect(attackedPlayerId, 'natural-disaster');
      }
    }

    if (/trade fate|swapped (their|the) entire hand|swap(?:ped)? .*whole hand|whole hand swap|swapped hands/.test(lowerLog)) {
      triggerCardPlayFx('trade-fate');
    } else if (/wind/.test(lowerLog) && /(played|blew|blow|counter)/.test(lowerLog)) {
      triggerCardPlayFx('wind-blow');
    }

    if (/eclipse/i.test(latestLog)) {
      setSceneFx('eclipse');
      window.setTimeout(() => setSceneFx('none'), 2000);
    } else if (/great reset/i.test(latestLog)) {
      setSceneFx('reset');
      window.setTimeout(() => setSceneFx('none'), 2000);
    }

    if (/(wind|bug|disaster|lightning|impact)/i.test(latestLog)) {
      setScenePulse(`pulse-${G.log.length}`);
      window.setTimeout(() => setScenePulse(null), 1200);
    }

    previousGardenIdsRef.current = currentSnapshot;
  }, [G.log.length, G.players]);

  useEffect(() => () => {
    if (submitUnlockRef.current !== null) {
      window.clearTimeout(submitUnlockRef.current);
    }
    if (cardPlayFxTimerRef.current !== null) {
      window.clearTimeout(cardPlayFxTimerRef.current);
    }
    if (gardenVisualEffectTimerRef.current !== null) {
      window.clearTimeout(gardenVisualEffectTimerRef.current);
    }
    for (const timer of Object.values(gardenSettleTimersRef.current)) {
      window.clearTimeout(timer);
    }
  }, []);

  // Force body to non-scrollable while game board is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // ── Chat polling ───────────────────────────────────────────
  useEffect(() => {
    if (!matchCtx) return;
    let cancelled = false;
    const fetchChat = async () => {
      try {
        const res = await fetch(`${matchCtx.server}/chat/${matchCtx.matchID}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { messages?: ChatMessage[] };
        const msgs = data.messages ?? [];
        setChatMessages(msgs);
        if (msgs.length > prevMsgCountRef.current && !chatOpen) {
          setChatUnread(u => u + (msgs.length - prevMsgCountRef.current));
        }
        prevMsgCountRef.current = msgs.length;

        // Show chat bubbles at each sender's garden
        const latestByPlayer: Record<string, ChatMessage> = {};
        for (const msg of msgs) {
          const pid = msg.playerID ?? '';
          if (!pid) continue;
          if (!latestByPlayer[pid] || msg.createdAt > latestByPlayer[pid].createdAt) {
            latestByPlayer[pid] = msg;
          }
        }
        for (const [pid, msg] of Object.entries(latestByPlayer)) {
          if (prevLastMsgIdRef.current[pid] === msg.id) continue;
          prevLastMsgIdRef.current[pid] = msg.id;
          if (cancelled) continue;
          setChatBubbles(prev => ({ ...prev, [pid]: { text: msg.text, key: msg.id } }));
          if (bubbleTimersRef.current[pid]) window.clearTimeout(bubbleTimersRef.current[pid]);
          bubbleTimersRef.current[pid] = window.setTimeout(() => {
            setChatBubbles(prev => { const next = { ...prev }; delete next[pid]; return next; });
          }, 5000);
        }
      } catch { /* best-effort */ }
    };
    void fetchChat();
    const iv = window.setInterval(fetchChat, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      for (const t of Object.values(bubbleTimersRef.current)) window.clearTimeout(t);
    };
  }, [matchCtx, chatOpen]);

  useEffect(() => {
    const currentSeatPresence = matchCtx?.seatPresence ?? {};
    const previousSeatPresence = previousSeatPresenceRef.current;

    if (!seatPresencePrimedRef.current) {
      seatPresencePrimedRef.current = true;
      previousSeatPresenceRef.current = currentSeatPresence;
      return;
    }

    for (const seatId of new Set([...Object.keys(previousSeatPresence), ...Object.keys(currentSeatPresence)])) {
      const before = previousSeatPresence[seatId];
      const after = currentSeatPresence[seatId];
      if (!before?.occupied && after?.occupied) {
        pushLocalLogEntry(`${after.name} joined the room`);
      } else if (before?.occupied && !after?.occupied) {
        pushLocalLogEntry(`${before.name} left the room`);
      }
    }

    previousSeatPresenceRef.current = currentSeatPresence;
  }, [matchCtx?.seatPresence]);

  // ── Log unread tracking ────────────────────────────────────
  const prevLogLenRef = useRef(G.log.length);
  const actionSheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (G.log.length > prevLogLenRef.current && !logOpen) {
      setLogUnread(u => u + (G.log.length - prevLogLenRef.current));
    }
    prevLogLenRef.current = G.log.length;
  }, [G.log.length, logOpen]);

  useEffect(() => {
    const latestEntry = G.log[G.log.length - 1];
    if (!latestEntry) return;
    if (!arenaLogToastPrimedRef.current) {
      arenaLogToastPrimedRef.current = true;
      return;
    }
    showArenaToast(displayLogEntry(latestEntry), `${G.log.length}-${latestEntry}`);
  }, [G.log.length]);

  useEffect(() => () => {
    if (arenaLogToastTimerRef.current !== null) {
      window.clearTimeout(arenaLogToastTimerRef.current);
    }
  }, []);

  // ── Scroll chat to bottom on new messages ─────────────────
  useEffect(() => {
    if (chatMsgsRef.current) {
      chatMsgsRef.current.scrollTop = chatMsgsRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  async function sendChatText(text: string) {
    if (!matchCtx || !text.trim() || chatSending) return false;
    setChatSending(true);
    setChatError('');
    try {
      const res = await fetch(`${matchCtx.server}/chat/${matchCtx.matchID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID: matchCtx.playerID, playerName: matchCtx.playerName, text: text.trim() }),
      });
      const data = await res.json() as { error?: string; messages?: ChatMessage[] };
      if (!res.ok) throw new Error(data.error ?? 'Send failed');
      setChatMessages(data.messages ?? []);
      return true;
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Error');
      return false;
    } finally {
      setChatSending(false);
    }
  }

  async function sendChatMessage() {
    const text = chatDraft.trim();
    if (!text) return;
    const sent = await sendChatText(text);
    if (sent) setChatDraft('');
  }

  function runMove(fn: () => void) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    fn();
    if (submitUnlockRef.current !== null) {
      window.clearTimeout(submitUnlockRef.current);
    }
    submitUnlockRef.current = window.setTimeout(() => {
      setIsSubmitting(false);
      submitUnlockRef.current = null;
    }, 1500);
  }

  // ── Cards filtered by move type ──────────────────────────────
  function relevantCards(type: string): Card[] {
    if (!me) return [];
    const hand = myHand;
    if (type === 'plantOwn' || type === 'plantOpponent') return hand.filter(isFlower);
    if (type === 'playWindSingle') return hand.filter(c => isPower(c, 'wind'));
    if (type === 'playWindDouble') return hand.filter(c => isPower(c, 'wind'));
    if (type === 'playBug')     return hand.filter(c => isPower(c, 'bug'));
    if (type === 'playBee')     return hand.filter(c => isPower(c, 'bee'));
    if (type === 'doubleHappiness') return hand.filter(c => isPower(c, 'double_happiness'));
    if (type === 'doubleHappinessTake') return hand.filter(c => isPower(c, 'double_happiness'));
    if (type === 'doubleHappinessGive') return hand;
    if (type === 'tradePresent') return hand;
    if (type === 'tradeFate')   return hand.filter(c => isPower(c, 'trade_fate'));
    if (type === 'letGo')       return hand.filter(c => isPower(c, 'let_go'));
    if (type === 'playSeason')  return hand.filter(c =>
      ['spring','summer','autumn','winter'].some(s => isPower(c, s)));
    if (type === 'naturalDisaster') return hand.filter(c => isPower(c, 'natural_disaster'));
    if (type === 'playEclipse') return hand.filter(c => isPower(c, 'eclipse'));
    if (type === 'playGreatReset') return hand.filter(c => isPower(c, 'great_reset'));
    if (type === 'discardFlower') return hand.filter(isFlower);
    return [];
  }

  const needsTargetPlayer = moveNeedsTargetPlayer(moveType);

  const requiresTargetSet = moveRequiresTargetSet(effectiveMoveType);

  const needsColor = (type: string) => {
    if (type === 'playBee') return true;
    const cardId = pickedCards[0];
    if (!cardId || !me) return false;
    const card = me.hand.find(c => c.id === cardId);
    return !!card && isFlower(card) && wildcardNeedsChosenColor(card);
  };

  const selectedCards = pickedCards
    .map(id => me?.hand.find(card => card.id === id))
    .filter((card): card is Card => !!card);
  const selectedPrimaryFlower = (() => {
    const card = selectedCards[0];
    return card && isFlower(card) ? card : null;
  })();
  const selectedTradePresentCard = moveType === 'tradePresent'
    ? (() => {
        const explicit = pickedCards[0];
        return (explicit ? myHand.find(card => card.id === explicit) : null) ?? selectedCards.find(card => isPower(card, 'trade_present')) ?? null;
      })()
    : null;
  const selectedTradePresentOfferCard = moveType === 'tradePresent'
    ? selectedCards.find(card => card.id !== selectedTradePresentCard?.id) ?? null
    : null;
  const selectedTargetPlayer = G.players.find(p => p.id === targetPlayer) ?? null;
  const effectiveTargetSetId = moveType === 'plantOwn' || moveType === 'plantOpponent' || moveType === 'playBee'
    ? resolvePlantTargetSetId(pickedCards[0] ?? '', targetPlayer || playerID || '', targetSet)
    : targetSet;
  const selectedTargetSet = selectedTargetPlayer?.garden.sets.find(set => set.id === effectiveTargetSetId) ?? null;
  const selectedBeeDiscardFlower = discardChoice
    ? beeDiscardFlowers.find(card => card.id === discardChoice) ?? null
    : null;
  const plantTargetPlayer = moveType === 'plantOwn'
    ? me ?? null
    : moveType === 'plantOpponent'
      ? selectedTargetPlayer
      : null;
  const plantEditableSets = plantTargetPlayer?.garden.sets.filter(set => !set.isDivine) ?? [];
  const regularPlantAutoTargetSet = moveType === 'plantOwn' || moveType === 'plantOpponent'
    ? selectedTargetSet
    : null;
  const plantNeedsColorForNewSet = (moveType === 'plantOwn' || moveType === 'plantOpponent')
    && canChooseColorForNewSet(selectedPrimaryFlower)
    && !effectiveTargetSetId;
  const beeNeedsColorForNewSet = moveType === 'playBee'
    && !!selectedBeeDiscardFlower
    && !effectiveTargetSetId;
  const selectedWindTargetSetIds = effectiveMoveType === 'playWindDouble'
    ? [targetSet, ...windExtraTargetSets].filter((setId): setId is string => !!setId)
    : targetSet
      ? [targetSet]
      : [];
  const selectedWindTargetSets = selectedWindTargetSetIds
    .map(setId => selectedTargetPlayer?.garden.sets.find(set => set.id === setId) ?? null)
    .filter((set): set is GardenSet => !!set);
  const selectedWindStealCount = effectiveMoveType === 'playWindDouble'
    ? Math.min(4, selectedWindTargetSets.reduce((sum, set) => sum + set.flowers.length, 0))
    : selectedTargetSet
      ? Math.min(1, selectedTargetSet.flowers.length)
      : 0;
  const remainingDoubleWindFlowers = effectiveMoveType === 'playWindDouble'
    ? Math.max(0, 4 - selectedWindStealCount)
    : 0;
  const moveInfo = moveDetails(effectiveMoveType);

  useEffect(() => {
    if (step !== 'pick-target' || effectiveMoveType !== 'playWindDouble' || !targetPlayer) return;
    const sheet = actionSheetRef.current;
    if (!sheet) return;
    const raf = window.requestAnimationFrame(() => {
      sheet.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [step, effectiveMoveType, targetPlayer]);

  function dispatch() {
    setError('');
    const [c1, c2] = pickedCards;
    if (!c1) { setError('Select a card first'); return; }
    if (needsTargetPlayer && !targetPlayer) { setError('Select a target player'); return; }
    if (requiresTargetSet && !targetSet) { setError('Select a target set'); return; }
    if (moveType === 'doubleHappiness' && !doubleHappinessMode) { setError('Choose whether Double Happiness will Take 2 or Give 2.'); return; }
    if (moveType === 'playBee' && !discardChoice) { setError('Select a flower from the discard pile'); return; }
    if (beeNeedsColorForNewSet && !chosenColor) {
      setError('Choose a color when Bee starts a new set');
      return;
    }
    if (effectiveMoveType === 'playWindDouble' && remainingDoubleWindFlowers > 0) {
      const availableFollowUpSets = (selectedTargetPlayer?.garden.sets ?? []).filter(set =>
        set.id !== targetSet
        && !windExtraTargetSets.includes(set.id)
        && isValidTargetSetForMove('playWindDouble', set),
      );
      if (availableFollowUpSets.length > 0) {
        setError(`Choose ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} worth of Wind target(s).`);
        return;
      }
    }
    const resolvedTargetSet = (moveType === 'plantOwn' || moveType === 'plantOpponent' || moveType === 'playBee')
      ? resolvePlantTargetSetId(c1, targetPlayer || playerID || '', targetSet)
      : targetSet;
    if ((moveType === 'plantOwn' || moveType === 'plantOpponent')
      && wildcardNeedsChosenColor(selectedPrimaryFlower)
      && !resolvedTargetSet
      && !chosenColor) {
      setError('Choose a color when Rainbow starts a new set');
      return;
    }

    const pickedHandCards = pickedCards
      .map(id => me?.hand.find(card => card.id === id))
      .filter((card): card is Card => !!card);
    const triggerLocalPlantSfx = effectiveMoveType === 'plantOwn' || effectiveMoveType === 'plantOpponent' || effectiveMoveType === 'playBee';

      switch (effectiveMoveType) {
      case 'plantOwn':
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        runMove(() => m.plantOwn(c1, resolvedTargetSet, chosenColor || undefined));
        break;
      case 'plantOpponent':
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        runMove(() => m.plantOpponent(c1, targetPlayer, resolvedTargetSet, chosenColor || undefined));
        break;
      case 'playWindSingle':
        runMove(() => m.playWindSingle(c1, targetPlayer, targetSet));
        break;
      case 'playWindDouble':
        if (moveType === 'playWindSingle') {
          if (!autoDoubleWindCard) { setError('You need 2 Wind cards for the double Wind move.'); return; }
          runMove(() => m.playWindDouble(c1, autoDoubleWindCard.id, targetPlayer, targetSet, windExtraTargetSets));
          break;
        }
        if (!c2) { setError('Select 2 Wind cards'); return; }
        runMove(() => m.playWindDouble(c1, c2, targetPlayer, targetSet, windExtraTargetSets));
        break;
      case 'playBug':
        runMove(() => m.playBug(c1, targetPlayer, targetSet));
        break;
      case 'playBee':
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        runMove(() => m.playBee(c1, discardChoice, targetPlayer || playerID!, resolvedTargetSet, chosenColor || undefined));
        break;
      case 'doubleHappinessTake': {
        const dhCard = pickedHandCards.find(card => isPower(card, 'double_happiness'));
        if (!dhCard) { setError('Select the Double Happiness card'); return; }
        runMove(() => m.doubleHappinessTake(dhCard.id, targetPlayer));
        break;
      }
      case 'doubleHappinessGive': {
        const dhCard = pickedHandCards[0];
        const giveIds = pickedHandCards.slice(1).map(card => card.id);
        if (!dhCard || !isPower(dhCard, 'double_happiness') || giveIds.length !== 2) { setError('Select Double Happiness + 2 cards to give'); return; }
        runMove(() => m.doubleHappinessGive(dhCard.id, targetPlayer, giveIds[0], giveIds[1]));
        break;
      }
      case 'tradePresent': {
        const tradeCard = selectedTradePresentCard;
        const offeredCard = selectedTradePresentOfferCard;
        if (!tradeCard || !offeredCard) { setError('Select Trade Present + 1 card to offer'); return; }
        runMove(() => m.tradePresent(tradeCard.id, targetPlayer, offeredCard.id));
        break;
      }
      case 'tradeFate':
        runMove(() => m.tradeFate(c1, targetPlayer));
        break;
      case 'letGo':
        runMove(() => m.letGo(c1));
        break;
      case 'playSeason':
        runMove(() => m.playSeason(c1));
        break;
      case 'naturalDisaster':
        runMove(() => m.naturalDisaster(c1, targetPlayer, targetSet));
        break;
      case 'playEclipse':
        runMove(() => m.playEclipse(c1));
        break;
      case 'playGreatReset':
        runMove(() => m.playGreatReset(c1));
        break;
      case 'discardFlower':
        runMove(() => m.discardFlower(c1));
        break;
      default:
        setError('Unknown move');
        return;
    }
    awaitingMoveResolutionRef.current = {
      phase: G.phase,
      logLength: G.log.length,
      movesRemaining: G.movesRemaining,
      handLength: me?.hand.length ?? 0,
      currentPlayerIndex: G.currentPlayerIndex,
      pendingSelection: G.pendingAction?.selectionKind,
    };
  }

  function renderColorPicker(prompt: string) {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>{prompt}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHOOSABLE_FLOWER_COLORS.map(col => (
            <button
              key={col}
              style={btn(chosenColor === col ? '#4ecca3' : '#333', chosenColor === col ? '#000' : '#fff')}
              onClick={() => setChosenColor(col)}
            >
              <span className="inline-card-label">
                {flowerArt(col)
                  ? <img src={flowerArt(col)} alt={col} className="inline-flower-icon" />
                  : <span aria-hidden="true">{FLOWER_EMOJI[col] ?? '🌺'}</span>}
                <span>{col}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Action panel ──────────────────────────────────────────────

  function ActionPanel() {
    if (isCounter && amTarget && inStage) {
      const pa = G.pendingAction!;
      const attacker = nameOf(G.players.find(p => p.id === pa.original.playerId));
      const myWind = me?.hand.filter(c => isPower(c, 'wind')) ?? [];
      const myDP   = me?.hand.filter(c => isPower(c, 'divine_protection')) ?? [];
      const offeredTradeCard = pa.selectionKind === 'trade_present' ? pa.offeredCard : undefined;

      if (pa.selectionKind) {
        const requiredCount = pa.selectionKind === 'trade_present' ? 1 : Math.min(2, me?.hand.length ?? 0);
        const helper = pa.selectionKind === 'trade_present'
          ? 'Choose 1 card from your hand to exchange. The offered card stays hidden until the trade finishes.'
          : `Choose ${requiredCount} card(s) from your hand to give.`;

        return (
          <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 16, marginTop: 12 }}>
            <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🃏 Choose Your Card{requiredCount > 1 ? 's' : ''}</h3>
            <p style={{ color: '#ccc', fontSize: 13, marginBottom: 12 }}>
              <b>{attacker}</b> played <b>{pa.original.type.replace(/_/g,' ')}</b> on you. {helper}
            </p>
            {offeredTradeCard && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}>
                <CardChip card={offeredTradeCard} small />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#e6c84a', fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
                    Offered card
                  </div>
                  <div style={{ color: '#f4f1ff', fontSize: 13 }}>
                    You will receive <InlineCardLabel card={offeredTradeCard} /> if you choose a card to trade.
                  </div>
                </div>
              </div>
            )}
            {pa.original.targetSetId && (
              <p style={{ color: '#ffcc80', fontSize: 12, marginBottom: 10 }}>
                Targeted set: <b>{attackedSetLabel}</b>
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 12 }}>
              {myHand.map(card => (
                <CardChip
                  key={card.id}
                  card={card}
                  selected={counterPickedCards.includes(card.id)}
                  onClick={() => {
                    setCounterPickedCards(prev => {
                      if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
                      if (prev.length >= requiredCount) return prev;
                      return [...prev, card.id];
                    });
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                style={btn('#4ecca3', '#1a1a2e')}
                onClick={() => runMove(() => m.selectResponseCards(...counterPickedCards))}
                disabled={counterPickedCards.length !== requiredCount}
              >
                ✔ Confirm Selection
              </button>
            </div>
          </div>
        );
      }

      return (
        <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 16, marginTop: 12 }}>
          <h3 style={{ color: '#e94560', marginBottom: 8 }}>⚡ Counter Window</h3>
          <p style={{ color: '#ccc', fontSize: 13, marginBottom: 12 }}>
            <b>{attacker}</b> played <b>{pa.original.type.replace(/_/g,' ')}</b> on you.
          </p>
          {pa.original.targetSetId && (
            <p style={{ color: '#ffcc80', fontSize: 12, marginBottom: 12 }}>
              Targeted set: <b>{attackedSetLabel}</b>
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={btn('#555')} onClick={() => runMove(() => m.allowAction())}>✅ Allow</button>
            {isWindCounterWindow && myWind.length >= 1 && (
              <>
                <button
                  style={btn('#1e6091')}
                  onClick={() => defendWithWind(1)}
                >
                  💨 Use 1 Wind Card
                </button>
                {myWind.length >= 2 && (
                  <button
                    style={btn('#1e6091')}
                    onClick={() => defendWithWind(2)}
                  >
                    💨💨 Use 2 Wind Cards
                  </button>
                )}
              </>
            )}
            {myDP.length > 0 && (
              <button style={btn('#7b2d8b')}
                onClick={() => runMove(() => m.counterDivine(myDP[0].id))}>
                🛡️ Divine Protection (coin flip)
              </button>
            )}
          </div>
        </div>
      );
    }

    if (isCounter) {
      const tname = nameOf(G.players.find(p => p.id === G.pendingAction?.targetPlayerId));
      return (
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 12, color: '#888' }}>
          ⏳ Waiting for <b style={{ color: '#fff' }}>{tname}</b> to respond to your play…
          {G.pendingAction?.original.targetSetId && (
            <div style={{ color: '#ffcc80', fontSize: 12, marginTop: 8 }}>
              Targeted set: <b>{attackedSetLabel}</b>
            </div>
          )}
        </div>
      );
    }

    if (!myTurn) {
      const cur = nameOf(G.players.find(p => p.id === G.turnOrder[G.currentPlayerIndex]));
      return (
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 12, color: '#888' }}>
          ⏳ Waiting for <b style={{ color: '#fff' }}>{cur}</b>'s turn…
        </div>
      );
    }

    if (G.phase === 'blessing') {
      if (!G.blessingState) {
        return (
          <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
            <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>👑 Blessing Phase</h3>
            <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
              You hold God's Favourite. Flip a coin — <b>Heads</b> lets you peek at the top 7 cards of the draw pile.
            </p>
            <button style={{ ...btn('#e6c84a', '#1a1a2e'), fontSize: 16, padding: '12px 28px' }}
              onClick={() => runMove(() => m.blessingFlip())}>
              🪙 Flip Coin
            </button>
          </div>
        );
      }

      const bs = G.blessingState;

      if (bs.coinResult === 'tails') {
        return (
          <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, marginTop: 12, color: '#888' }}>
            🪙 <b style={{ color: '#ccc' }}>Tails</b> — no bonus. Proceeding to draw…
          </div>
        );
      }

      if (bs.emptyHandMode) {
        const cards = bs.revealedCards;
        const arranged = blessingArranged.length === cards.length
          ? blessingArranged
          : cards.map(c => c.id);

        return (
          <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
            <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🪙 Heads! (Empty Hand Bonus)</h3>
            <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
              You already drew 7 cards. Arrange these 7 cards in the order you want them back on top of the draw pile (position 1 = next drawn):
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {arranged.map((id, idx) => {
                const card = cards.find(c => c.id === id)!;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#888', fontSize: 12, minWidth: 20 }}>#{idx + 1}</span>
                    <CardChip card={card} />
                    <button style={btn('#333')} onClick={() => moveBlessingCard(idx, -1)} disabled={idx === 0}>▲</button>
                    <button style={btn('#333')} onClick={() => moveBlessingCard(idx, 1)} disabled={idx === arranged.length - 1}>▼</button>
                  </div>
                );
              })}
            </div>
            <button style={{ ...btn('#4ecca3', '#1a1a2e'), fontSize: 15, padding: '10px 24px' }}
              onClick={() => {
                runMove(() => m.blessingChoose([], arranged.length === cards.length ? arranged : cards.map(c => c.id)));
                resetBlessing();
              }}>
              ✔ Confirm Order
            </button>
          </div>
        );
      }

      const cards = bs.revealedCards;

      if (blessingStep === 'pick') {
        return (
          <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
            <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🪙 Heads! Pick 2 Cards</h3>
            <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
              Choose <b>2 cards</b> to take into your hand. The remaining 5 will go back on top of the draw pile.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 14 }}>
              {cards.map(card => (
                <CardChip key={card.id} card={card}
                  selected={blessingPicked.includes(card.id)}
                  onClick={() => {
                    setBlessingPicked(prev => {
                      if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
                      if (prev.length >= 2) return prev;
                      return [...prev, card.id];
                    });
                  }}
                />
              ))}
            </div>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
              Selected: {blessingPicked.length}/2
            </p>
            {blessingPicked.length === 2 && (
              <button style={{ ...btn('#e6c84a', '#1a1a2e'), fontSize: 14, padding: '10px 24px' }}
                onClick={() => {
                  const remaining = cards.filter(c => !blessingPicked.includes(c.id)).map(c => c.id);
                  setBlessingArranged(remaining);
                  setBlessingStep('arrange');
                }}>
                Next: Arrange Remaining 5 →
              </button>
            )}
          </div>
        );
      }

      return (
        <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
          <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>✨ Arrange Top 5 Cards</h3>
          <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
            Set the order these 5 cards go back on top of the draw pile. Position #1 will be drawn next.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {blessingArranged.map((id, idx) => {
              const card = cards.find(c => c.id === id)!;
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#888', fontSize: 12, minWidth: 20 }}>#{idx + 1}</span>
                  <CardChip card={card} />
                  <button style={btn('#333')} onClick={() => moveBlessingCard(idx, -1)} disabled={idx === 0}>▲</button>
                  <button style={btn('#333')} onClick={() => moveBlessingCard(idx, 1)} disabled={idx === blessingArranged.length - 1}>▼</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={btn('#555')} onClick={() => setBlessingStep('pick')}>← Back</button>
            <button style={{ ...btn('#4ecca3', '#1a1a2e'), fontSize: 14, padding: '10px 24px' }}
              onClick={() => {
                runMove(() => m.blessingChoose(blessingPicked, blessingArranged));
                resetBlessing();
              }}>
              ✔ Confirm & Continue
            </button>
          </div>
        </div>
      );
    }

    if (G.phase === 'draw') {
      return (
        <button style={{ ...btn('#4ecca3', '#1a1a2e'), marginTop: 12, fontSize: 15, padding: '12px 28px' }}
          onClick={() => runMove(() => m.pass())}>
          🃏 Draw Cards
        </button>
      );
    }

    if (G.phase !== 'action') return null;

    if (step === 'menu') {
      const hand = me?.hand ?? [];
      const has = (name: string) => hand.some(c => isPower(c, name));
      const hasFlower = hand.some(isFlower);
      return (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#aaa', fontSize: 13, marginBottom: 10 }}>
            Moves left: <b style={{ color: '#4ecca3' }}>{G.movesRemaining}</b>
            {G.season && <span style={{ marginLeft: 12, color: '#ffcc80' }}>
              Season: {G.season}
            </span>}
          </div>
          <div style={{ background: '#0f3460', borderRadius: 10, padding: '10px 12px', marginBottom: 12, color: '#b8c1ec', fontSize: 13 }}>
            Tap a move to see what it does, what card it needs, and what you still need to choose before confirming.
            <div style={{ marginTop: 6, color: '#d7e3ff' }}>Tip: drag a flower card straight onto a garden set to start planting instantly.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasFlower && <button style={btn()} onClick={() => { setMoveType('plantOwn'); setStep('pick-card'); }}>🌱 Plant (own)</button>}
            {hasFlower && opponents.length > 0 && <button style={btn()} onClick={() => { setMoveType('plantOpponent'); setStep('pick-card'); }}>🌿 Plant (opponent)</button>}
            {has('wind') && <button style={btn()} onClick={() => { setMoveType('playWindSingle'); setStep('pick-card'); }}>💨 Wind ×1</button>}
            {has('bug') && <button style={btn()} onClick={() => { setMoveType('playBug'); setStep('pick-card'); }}>🐛 Bug</button>}
            {has('bee') && <button style={btn()} onClick={() => { setMoveType('playBee'); setStep('pick-card'); }}>🐝 Bee</button>}
            {has('double_happiness') && <button style={btn()} onClick={() => { setMoveType('doubleHappiness'); setStep('pick-card'); }}>🎉 Double Happiness</button>}
            {has('trade_present') && <button style={btn()} onClick={() => beginTradePresentFlow()}>🎁 Trade Present</button>}
            {has('trade_fate') && <button style={btn()} onClick={() => { setMoveType('tradeFate'); setStep('pick-card'); }}>🔀 Trade Fate</button>}
            {has('let_go') && <button style={btn()} onClick={() => { setMoveType('letGo'); setStep('pick-card'); }}>✋ Let Go</button>}
            {['spring','summer','autumn','winter'].some(s => has(s)) && (
              <button style={btn()} onClick={() => { setMoveType('playSeason'); setStep('pick-card'); }}>🌸 Season</button>
            )}
            {has('natural_disaster') && hasNaturalDisasterTarget && <button style={btn()} onClick={() => { setMoveType('naturalDisaster'); setStep('pick-card'); }}>🌪️ Nat. Disaster</button>}
            {has('eclipse') && <button style={btn()} onClick={() => { setMoveType('playEclipse'); setStep('pick-card'); }}>🌑 Eclipse</button>}
            {has('great_reset') && <button style={btn()} onClick={() => { setMoveType('playGreatReset'); setStep('pick-card'); }}>♻️ Great Reset</button>}
            {G.season === 'autumn' && hasFlower && (
              <button style={btn('#8b4513')} onClick={() => { setMoveType('discardFlower'); setStep('pick-card'); }}>🍂 Discard Flower</button>
            )}
            <button style={btn('#333')} onClick={() => runMove(() => m.pass())}>⏩ Pass Turn</button>
          </div>
        </div>
      );
    }

    if (step === 'pick-card') {
      const cards = relevantCards(moveType);
      const maxCards = selectionLimit(moveType);
      const helperText =
        moveType === 'doubleHappiness' ? 'Select the Double Happiness card:' :
        moveType === 'doubleHappinessGive' ? 'Select Double Happiness + 2 cards to give:' :
        moveType === 'tradePresent'
          ? `Choose 1 card to offer${selectedTargetPlayer ? ` to ${nameOf(selectedTargetPlayer)}` : ''}:`
          : 
        maxCards > 1 ? `Select up to ${maxCards} cards:` : 'Select a card to play:';

      return (
        <div style={{ background: '#16213e', borderRadius: 12, padding: 16, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#4ecca3', fontWeight: 700 }}>{moveLabel(moveType)}</span>
            <button style={btn('#333')} onClick={resetAll}>✕ Cancel</button>
          </div>
          <div style={{ background: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>What this move does</div>
            <p style={{ color: '#cbd5ff', fontSize: 13, margin: '0 0 8px 0' }}>{moveInfo.summary}</p>
            <div style={{ color: '#9fb0ff', fontSize: 12, marginBottom: 6 }}>What you still need to do</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#b8c1ec', fontSize: 12, lineHeight: 1.5 }}>
              {moveInfo.steps.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
          {moveType === 'tradePresent' && selectedTradePresentCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Trade setup</div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.6 }}>
                Target:{' '}
                <b style={{ color: '#fff' }}>
                  {selectedTargetPlayer ? nameOf(selectedTargetPlayer) : 'not chosen yet'}
                </b>
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.6 }}>
                Exchange card:{' '}
                <b style={{ color: '#fff' }}><InlineCardLabel card={selectedTradePresentCard} /></b>
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.6 }}>
                Your offer:{' '}
                <b style={{ color: '#fff' }}>
                  {selectedTradePresentOfferCard ? <InlineCardLabel card={selectedTradePresentOfferCard} /> : 'pick 1 card below'}
                </b>
              </div>
            </div>
          )}
          <p style={{ color: '#aaa', fontSize: 13, marginBottom: 10 }}>{helperText}</p>
          {(moveType === 'doubleHappiness' || moveType === 'doubleHappinessTake' || moveType === 'tradePresent') && (
            <p style={{ color: '#888', fontSize: 12, marginTop: -4, marginBottom: 10 }}>
              {moveType === 'tradePresent'
                ? 'After you confirm, the target player will choose their own card.'
                : 'If you use Take 2, the target player will choose which card(s) they give you after you confirm.'}
            </p>
          )}
          {moveType === 'tradePresent' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Choose which Trade Present card to cast
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {myHand.filter(card => isPower(card, 'trade_present')).map(card => (
                    <CardChip
                      key={card.id}
                      card={card}
                      selected={selectedTradePresentCard?.id === card.id}
                      onClick={() => {
                        const preservedOfferId = selectedTradePresentOfferCard?.id;
                        setPickedCards(preservedOfferId && preservedOfferId !== card.id
                          ? [card.id, preservedOfferId]
                          : [card.id]);
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {helperText}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {myHand.filter(card => card.id !== selectedTradePresentCard?.id).map(card => (
                    <CardChip
                      key={card.id}
                      card={card}
                      selected={selectedTradePresentOfferCard?.id === card.id}
                      onClick={() => {
                        if (!selectedTradePresentCard) return;
                        setPickedCards(prev => {
                          const tradeCardId = selectedTradePresentCard.id;
                          return prev.includes(card.id)
                            ? [tradeCardId]
                            : [tradeCardId, card.id];
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : cards.length === 0 ? (
            <p style={{ color: '#e94560', fontSize: 13 }}>No matching cards in hand.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {cards.map(c => (
                <CardChip key={c.id} card={c}
                  selected={pickedCards.includes(c.id)}
                  onClick={() => {
                    if (maxCards === 1) {
                      setPickedCards([c.id]);
                    } else {
                      toggleCard(c.id);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {selectedCards.length > 0 && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Selected card details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedCards.map(card => (
                  <div key={card.id} style={{ color: '#cbd5ff', fontSize: 13, lineHeight: 1.4 }}>
                    <b><InlineCardLabel card={card} /></b>
                    <div style={{ color: '#9fb0ff', fontSize: 12 }}>{cardDetail(card)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {moveType === 'playBee' && pickedCards.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>Choose a flower from the discard pile:</p>
              {beeDiscardFlowers.length === 0 ? (
                <p style={{ color: '#e94560', fontSize: 13 }}>No eligible flower cards in the discard pile.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {beeDiscardFlowers.map(card => (
                    <CardChip key={card.id} card={card}
                      selected={discardChoice === card.id}
                      onClick={() => setDiscardChoice(card.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {needsColor(moveType) && renderColorPicker(
            moveType === 'playBee'
              ? 'Choose a color now if Bee might need to start a new set:'
              : 'Choose a color now if this rainbow might need to start a new set:'
          )}

          {((moveType === 'tradePresent' && !!selectedTradePresentOfferCard)
            || (pickedCards.length > 0 && moveType !== 'tradePresent'))
            && (moveType !== 'playBee' || !!discardChoice) && (
            <button style={{ ...btn('#4ecca3', '#1a1a2e'), marginTop: 14 }}
              onClick={() => {
                if (moveType === 'tradePresent') {
                  setStep('confirm');
                  return;
                }
                needsTargetPlayer ? setStep('pick-target') : setStep('confirm');
              }}>
              {moveType === 'tradePresent' ? 'Review trade →' : 'Next →'}
            </button>
          )}
          {error && <p style={{ color: '#e94560', fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>
      );
    }

    if (step === 'pick-target') {
      const tgt = G.players.find(p => p.id === targetPlayer);
      const showSetPicker = ['playWindSingle','playWindDouble','playBug','naturalDisaster','playBee'].includes(moveType);
      const validSets = !tgt ? [] : tgt.garden.sets.filter(s => isValidTargetSetForMove(effectiveMoveType, s));
      const availableDoubleWindFollowUps = effectiveMoveType === 'playWindDouble'
        ? validSets.filter(s => s.id !== targetSet)
        : [];
      const remainingFollowUpChoices = availableDoubleWindFollowUps.filter(s => !windExtraTargetSets.includes(s.id));
      const requiresMoreDoubleWindTargets = effectiveMoveType === 'playWindDouble'
        && !!targetSet
        && remainingDoubleWindFlowers > 0
        && remainingFollowUpChoices.length > 0;
      const selectedDhCard = moveType === 'doubleHappiness'
        ? myHand.find(card => card.id === pickedCards[0] && isPower(card, 'double_happiness')) ?? null
        : null;
      const doubleHappinessGiveCards = moveType === 'doubleHappiness'
        ? pickedCards
          .slice(1)
          .map(id => myHand.find(card => card.id === id))
          .filter((card): card is Card => !!card)
        : [];
      const canAdvanceFromTarget = !!targetPlayer
        && (!requiresTargetSet || !!targetSet)
        && !requiresMoreDoubleWindTargets
        && (moveType !== 'doubleHappiness'
          || (!!doubleHappinessMode && (doubleHappinessMode !== 'give' || doubleHappinessGiveCards.length === 2)));
      const showDoubleWindPrompt = effectiveMoveType === 'playWindDouble' && !!selectedTargetPlayer;

      return (
        <div style={{ background: '#16213e', borderRadius: 12, padding: 16, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#4ecca3', fontWeight: 700 }}>Select Target</span>
            <button
              style={btn('#333')}
              onClick={() => moveType === 'tradePresent' ? resetAll() : setStep('pick-card')}
            >
              ← Back
            </button>
            <button style={btn('#333')} onClick={resetAll}>✕ Cancel</button>
          </div>
          {effectiveMoveType === 'playWindDouble' && (
            showDoubleWindPrompt ? (
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 6,
                  marginBottom: 14,
                  background: 'linear-gradient(180deg, rgba(12,34,74,0.98), rgba(15,52,96,0.98))',
                  border: '1px solid rgba(78, 204, 163, 0.55)',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
                  borderRadius: 14,
                  padding: 14,
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: '#4ecca3', fontWeight: 800, fontSize: 14 }}>Double Wind target picker</div>
                    <div style={{ color: '#e7ecff', fontSize: 12, marginTop: 3 }}>
                      Choose which set(s) on <b style={{ color: '#fff' }}>{nameOf(selectedTargetPlayer!)}</b> should be blown.
                    </div>
                  </div>
                  <button
                    style={btn('#333')}
                    onClick={() => {
                      setTargetPlayer('');
                      setTargetSet('');
                      setWindExtraTargetSets([]);
                    }}
                  >
                    Change player
                  </button>
                </div>
                <div style={{ color: '#9fb0ff', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
                  Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                  {remainingDoubleWindFlowers > 0
                    ? ` Pick ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} from another set if available.`
                    : ' You have enough flowers selected.'}
                </div>
                <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Primary target set
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: targetSet ? 10 : 0 }}>
                  {validSets.map(s => (
                    <SetChip
                      key={s.id}
                      set={s}
                      highlight={targetSet === s.id}
                      onClick={() => {
                        setTargetSet(s.id);
                        setWindExtraTargetSets(prev => prev.filter(id => id !== s.id));
                      }}
                    />
                  ))}
                </div>
                {targetSet && (
                  <>
                    {availableDoubleWindFollowUps.length > 0 && (
                      <>
                        <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                          Follow-up target sets
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 10 }}>
                          {availableDoubleWindFollowUps.map(s => (
                            <SetChip
                              key={s.id}
                              set={s}
                              highlight={windExtraTargetSets.includes(s.id)}
                              onClick={() => toggleDoubleWindTargetSet(s.id)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        style={btn(canAdvanceFromTarget ? '#4ecca3' : '#333', canAdvanceFromTarget ? '#1a1a2e' : '#fff')}
                        onClick={() => canAdvanceFromTarget && setStep('confirm')}
                        disabled={!canAdvanceFromTarget}
                      >
                        Done targeting
                      </button>
                      <button
                        style={btn('#333')}
                        onClick={() => {
                          setTargetSet('');
                          setWindExtraTargetSets([]);
                        }}
                      >
                        Clear set picks
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 14, background: '#1a1a2e', borderRadius: 10, padding: 12, color: '#9fb0ff', fontSize: 12, lineHeight: 1.5 }}>
                Choose a target player first, and the Double Wind set picker will appear here at the top.
              </div>
            )
          )}
          <div style={{ background: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{moveLabel(effectiveMoveType)}</div>
            <p style={{ color: '#cbd5ff', fontSize: 13, margin: '0 0 8px 0' }}>{moveInfo.summary}</p>
            <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5 }}>
              Selected card{selectedCards.length === 1 ? '' : 's'}:{' '}
              {selectedCards.map((card, index) => (
                <span key={card.id}>
                  {index > 0 ? ', ' : null}
                  <InlineCardLabel card={card} />
                </span>
              ))}
            </div>
            <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
              {moveType === 'playBee'
                ? 'Next: choose whose garden Bee will plant into, then choose a set or start a new one.'
                : moveType === 'tradePresent'
                  ? 'Next: choose who you want to trade with. Then you will pick the single card you want to offer them.'
                : effectiveMoveType === 'playWindDouble'
                  ? 'Next: choose a player below. Double Wind will immediately open a focused set picker so you can choose all target sets in one place.'
                  : 'Next: choose a player, then finish any required target-set selection.'}
            </div>
          </div>
          {moveType === 'playWindSingle' && selectedPrimaryWindCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Wind strength</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button
                  style={btn(!windAttackDoubleMode ? '#4ecca3' : '#333', !windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                  onClick={() => setWindAttackDoubleMode(false)}
                >
                  💨 Use 1 Wind card
                </button>
                {canUpgradeSingleWind && (
                  <button
                    style={btn(windAttackDoubleMode ? '#4ecca3' : '#333', windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                    onClick={() => setWindAttackDoubleMode(true)}
                  >
                    💨💨 Use 2 Wind cards
                  </button>
                )}
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5 }}>
                {canUpgradeSingleWind
                  ? windAttackDoubleMode
                    ? 'Double Wind is armed. Confirming this attack will spend your selected Wind plus one more Wind card automatically.'
                    : 'You have a second Wind card available, so you can upgrade this single Wind attack into the stronger double-Wind move.'
                  : 'You only have one Wind card ready, so this attack will proceed as a normal single Wind move.'}
              </div>
            </div>
          )}
          {moveType === 'doubleHappiness' && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Double Happiness mode</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button
                  style={btn(doubleHappinessMode === 'take' ? '#4ecca3' : '#333', doubleHappinessMode === 'take' ? '#1a1a2e' : '#fff')}
                  onClick={() => {
                    setDoubleHappinessMode('take');
                    setPickedCards(prev => prev.slice(0, 1));
                  }}
                >
                  🎉 Take 2 from target
                </button>
                <button
                  style={btn(doubleHappinessMode === 'give' ? '#4ecca3' : '#333', doubleHappinessMode === 'give' ? '#1a1a2e' : '#fff')}
                  onClick={() => setDoubleHappinessMode('give')}
                >
                  🎁 Give 2 to target
                </button>
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5 }}>
                {doubleHappinessMode === 'take'
                  ? 'The target will choose which 2 cards they give you after you confirm.'
                  : doubleHappinessMode === 'give'
                    ? 'Choose the 2 cards from your own hand that you want to send to the target.'
                    : 'Choose whether this Double Happiness will take cards from the target or give cards to them.'}
              </div>
              {doubleHappinessMode === 'give' && selectedDhCard && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>
                    Select 2 extra cards to give:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {myHand.filter(card => card.id !== selectedDhCard.id).map(card => {
                      const isSelected = pickedCards.includes(card.id);
                      const giveCount = doubleHappinessGiveCards.length;
                      const canSelect = isSelected || giveCount < 2;
                      return (
                        <CardChip
                          key={card.id}
                          card={card}
                          selected={isSelected}
                          dim={!canSelect}
                          onClick={() => {
                            if (!canSelect) return;
                            setPickedCards(prev => {
                              const base = prev.slice(0, 1);
                              const extras = prev.slice(1);
                              if (extras.includes(card.id)) {
                                return [...base, ...extras.filter(id => id !== card.id)];
                              }
                              if (extras.length >= 2) return prev;
                              return [...base, ...extras, card.id];
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ color: '#9fb0ff', fontSize: 12, marginTop: 8 }}>
                    Selected to give: <b style={{ color: '#fff' }}>{doubleHappinessGiveCards.length}</b> / 2
                  </div>
                </div>
              )}
            </div>
          )}
          {!showDoubleWindPrompt && (
            <>
              <p style={{ color: '#aaa', fontSize: 13, marginBottom: 10 }}>
                {moveType === 'playBee'
                  ? 'Choose whose garden Bee will plant into:'
                  : moveType === 'tradePresent'
                    ? 'Who do you want to trade with?'
                    : 'Who do you want to target?'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {targetablePlayers.map(p => (
                  <button key={p.id} style={btn(targetPlayer === p.id ? '#e94560' : '#333')}
                    onClick={() => { setTargetPlayer(p.id); setTargetSet(''); setWindExtraTargetSets([]); }}>
                    {nameOf(p)} ({p.hand.length} cards, {p.garden.sets.length} sets)
                  </button>
                ))}
              </div>
            </>
          )}

          {showSetPicker && tgt && effectiveMoveType !== 'playWindDouble' && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>
                {moveType === 'playBee'
                  ? 'Choose a set to add to, or start a new set:'
                  : effectiveMoveType === 'playWindDouble'
                    ? 'Choose which set(s) Double Wind should blow from:'
                    : 'Select their set:'}
              </p>
              {selectedTargetPlayer && (
                <div style={{ color: '#9fb0ff', fontSize: 12, marginBottom: 8 }}>
                  Targeting <b style={{ color: '#fff' }}>{nameOf(selectedTargetPlayer)}</b>
                  {selectedTargetSet && effectiveMoveType !== 'playWindDouble' && <span> · currently selected set has <b style={{ color: '#fff' }}>{selectedTargetSet.flowers.length}</b> flower(s)</span>}
                </div>
              )}
              {validSets.length === 0 && moveType !== 'playBee' ? (
                <p style={{ color: '#e94560', fontSize: 13 }}>No valid sets to target.</p>
              ) : (
                <>
                  {effectiveMoveType === 'playWindDouble' ? (
                    <>
                      <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                        Primary target set
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 10 }}>
                        {validSets.map(s => (
                          <SetChip
                            key={s.id}
                            set={s}
                            highlight={targetSet === s.id}
                            onClick={() => {
                              setTargetSet(s.id);
                              setWindExtraTargetSets(prev => prev.filter(id => id !== s.id));
                            }}
                          />
                        ))}
                      </div>
                      {targetSet && (
                        <>
                          <div style={{ color: '#9fb0ff', fontSize: 12, marginBottom: 8 }}>
                            Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                            {remainingDoubleWindFlowers > 0
                              ? ` Pick ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} from another set if available.`
                              : ' You have enough flowers selected.'}
                          </div>
                          {availableDoubleWindFollowUps.length > 0 && (
                            <>
                              <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                                Follow-up target sets
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                {availableDoubleWindFollowUps.map(s => (
                                  <SetChip
                                    key={s.id}
                                    set={s}
                                    highlight={windExtraTargetSets.includes(s.id)}
                                    onClick={() => toggleDoubleWindTargetSet(s.id)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {validSets.map(s => (
                        <SetChip key={s.id} set={s} highlight={targetSet === s.id}
                          onClick={() => setTargetSet(s.id)} />
                      ))}
                      {moveType === 'playBee' && (
                        <button style={{ ...btn(targetSet === '' ? '#4ecca3' : '#333', targetSet === '' ? '#1a1a2e' : '#fff'), marginTop: 6 }}
                          onClick={() => setTargetSet('')}>
                          ➕ Start new set
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {moveType === 'playBee' && !!targetPlayer && !targetSet && renderColorPicker('Bee is starting a new set here, so choose the color for that new set:')}

          {canAdvanceFromTarget && effectiveMoveType !== 'playWindDouble' && (
            <button
              style={btn('#4ecca3', '#1a1a2e')}
              onClick={() => setStep(moveType === 'tradePresent' ? 'pick-card' : 'confirm')}
            >
              {moveType === 'tradePresent' ? 'Choose offer →' : 'Next →'}
            </button>
          )}
          {error && <p style={{ color: '#e94560', fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>
      );
    }

    if (step === 'confirm') {
      const pickedCardObjects = pickedCards
        .map(id => me?.hand.find(c => c.id === id))
        .filter((card): card is Card => !!card);
      const previewCardObjects = effectiveMoveType === 'playWindDouble' && moveType === 'playWindSingle' && autoDoubleWindCard
        ? [...pickedCardObjects, autoDoubleWindCard]
        : pickedCardObjects;
      const tname = nameOf(G.players.find(p => p.id === targetPlayer));
      const beeDiscardCard = selectedBeeDiscardFlower;
      const confirmTargetSets = moveType === 'plantOwn' || moveType === 'plantOpponent'
        ? plantEditableSets
        : (selectedTargetPlayer?.garden.sets.filter(set => isValidTargetSetForMove(effectiveMoveType, set)) ?? []);
      const confirmDoubleWindFollowUps = effectiveMoveType === 'playWindDouble'
        ? confirmTargetSets.filter(set => set.id !== targetSet)
        : [];
      return (
        <div style={{ background: '#16213e', borderRadius: 12, padding: 16, marginTop: 12 }}>
          <h4 style={{ color: '#4ecca3', marginBottom: 10 }}>Confirm Move</h4>
          <div style={{ background: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{moveLabel(effectiveMoveType)}</div>
            <p style={{ color: '#cbd5ff', fontSize: 13, margin: '0 0 8px 0' }}>{moveInfo.summary}</p>
            <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5 }}>
              Review your choices below, then confirm to send the move.
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>
            Action: <b>{moveLabel(effectiveMoveType)}</b>
          </p>
          <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>
            Card(s):{' '}
            <b>
              {previewCardObjects.map((card, index) => (
                <span key={card.id}>
                  {index > 0 ? ', ' : null}
                  <InlineCardLabel card={card} />
                </span>
              ))}
            </b>
          </p>
          {moveType === 'playWindSingle' && canUpgradeSingleWind && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: '#9fb0ff', margin: '0 0 8px 0' }}>
                Wind mode: <b>{windAttackDoubleMode ? 'Double Wind enabled' : 'Single Wind'}</b>
                {windAttackDoubleMode && ' · the second Wind card will be used automatically on confirm.'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  style={btn(!windAttackDoubleMode ? '#4ecca3' : '#333', !windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                  onClick={() => setWindAttackDoubleMode(false)}
                >
                  💨 Use 1 Wind card
                </button>
                <button
                  style={btn(windAttackDoubleMode ? '#4ecca3' : '#333', windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                  onClick={() => setWindAttackDoubleMode(true)}
                >
                  💨💨 Use 2 Wind cards
                </button>
              </div>
            </div>
          )}
          {tname && <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>Target: <b>{tname}</b></p>}
          {moveType === 'tradePresent' && selectedTradePresentOfferCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: '#ccc', margin: '0 0 6px 0' }}>
                You are offering: <b><InlineCardLabel card={selectedTradePresentOfferCard} /></b>
              </p>
              <p style={{ fontSize: 12, color: '#9fb0ff', margin: 0 }}>
                {tname || 'The target player'} will see this card, then choose 1 card from their own hand to trade back.
              </p>
            </div>
          )}
          {moveType === 'playBee' && beeDiscardCard && (
            <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>Discard flower: <b><InlineCardLabel card={beeDiscardCard} /></b></p>
          )}
          {(moveType === 'plantOwn' || moveType === 'plantOpponent') && selectedPrimaryFlower && (
            wildcardNeedsChosenColor(selectedPrimaryFlower) || selectedPrimaryFlower.color === 'triple_rainbow' ? (
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Plant destination</div>
                <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                  Choose an existing set, or leave this as a new set. Wildcard flowers can be retargeted here without backing out.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {confirmTargetSets.map(set => (
                    <SetChip
                      key={set.id}
                      set={set}
                      highlight={effectiveTargetSetId === set.id}
                      onClick={() => setTargetSet(set.id)}
                    />
                  ))}
                  <button
                    style={{ ...btn(effectiveTargetSetId === '' ? '#4ecca3' : '#555', effectiveTargetSetId === '' ? '#1a1a2e' : '#fff'), fontSize: 11, padding: '3px 8px' }}
                    onClick={() => setTargetSet('')}
                  >
                    + New set
                  </button>
                </div>
                {plantNeedsColorForNewSet && renderColorPicker(
                  selectedPrimaryFlower.color === 'triple_rainbow'
                    ? 'Choose a color to use Triple Rainbow like a rainbow flower, or leave it blank to keep it standalone:'
                    : 'Choose the color for the new rainbow set:'
                )}
                {!plantNeedsColorForNewSet && effectiveTargetSetId === '' && selectedPrimaryFlower.color === 'triple_rainbow' && (
                  <p style={{ fontSize: 12, color: '#9fb0ff', margin: '8px 0 0 0' }}>
                    Triple Rainbow can stand alone as a new set, or you can give it a color so it works like a rainbow flower.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Plant destination</div>
                <p style={{ fontSize: 12, color: '#9fb0ff', margin: '0 0 6px 0' }}>
                  Regular flowers auto-match by color, so there is no manual set choice for this play.
                </p>
                <p style={{ fontSize: 13, color: '#ccc', margin: 0 }}>
                  Destination:{' '}
                  <b>
                    {regularPlantAutoTargetSet
                      ? describeGardenSet(regularPlantAutoTargetSet)
                      : `a new ${selectedPrimaryFlower.color} set`}
                  </b>
                </p>
              </div>
            )
          )}
          {moveType === 'playBee' && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Bee destination</div>
              <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                Choose which set Bee should add to, or start a new one from here.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {confirmTargetSets.map(set => (
                  <SetChip
                    key={set.id}
                    set={set}
                    highlight={effectiveTargetSetId === set.id}
                    onClick={() => setTargetSet(set.id)}
                  />
                ))}
                <button
                  style={{ ...btn(effectiveTargetSetId === '' ? '#4ecca3' : '#555', effectiveTargetSetId === '' ? '#1a1a2e' : '#fff'), fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setTargetSet('')}
                >
                  + New set
                </button>
              </div>
              {beeNeedsColorForNewSet && renderColorPicker("Choose the color for Bee's new set:")}
            </div>
          )}
          {moveUsesEditableSetTarget(effectiveMoveType) && moveType !== 'playBee' && moveType !== 'plantOwn' && moveType !== 'plantOpponent' && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>
                {effectiveMoveType === 'playWindDouble' ? 'Double Wind targets' : 'Target set'}
              </div>
              {confirmTargetSets.length === 0 ? (
                <p style={{ fontSize: 13, color: '#e94560', margin: 0 }}>No valid sets are available right now.</p>
              ) : effectiveMoveType === 'playWindDouble' ? (
                <>
                  <div style={{ color: '#9fb0ff', fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
                    Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                    {remainingDoubleWindFlowers > 0
                      ? ` Choose ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} worth of targets if another vulnerable set exists.`
                      : ' You have enough flowers selected.'}
                  </div>
                  <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Primary target set</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: targetSet ? 10 : 0 }}>
                    {confirmTargetSets.map(set => (
                      <SetChip
                        key={set.id}
                        set={set}
                        highlight={targetSet === set.id}
                        onClick={() => {
                          setTargetSet(set.id);
                          setWindExtraTargetSets(prev => prev.filter(id => id !== set.id));
                        }}
                      />
                    ))}
                  </div>
                  {targetSet && confirmDoubleWindFollowUps.length > 0 && (
                    <>
                      <div style={{ color: '#f4f1ff', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Follow-up target sets</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 8 }}>
                        {confirmDoubleWindFollowUps.map(set => (
                          <SetChip
                            key={set.id}
                            set={set}
                            highlight={windExtraTargetSets.includes(set.id)}
                            onClick={() => toggleDoubleWindTargetSet(set.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {selectedWindTargetSets.length > 0 && (
                    <p style={{ fontSize: 13, color: '#ccc', margin: '4px 0 0 0' }}>
                      Selected sets: <b>{selectedWindTargetSets.map(set => describeGardenSet(set)).join(' + ')}</b>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 8 }}>
                    {confirmTargetSets.map(set => (
                      <SetChip
                        key={set.id}
                        set={set}
                        highlight={targetSet === set.id}
                        onClick={() => setTargetSet(set.id)}
                      />
                    ))}
                  </div>
                  {targetSet && (
                    <p style={{ fontSize: 13, color: '#ccc', margin: '4px 0 0 0' }}>
                      Selected set: <b>{selectedTargetSet ? describeGardenSet(selectedTargetSet) : 'selected ✓'}</b>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {moveType !== 'plantOwn' && moveType !== 'plantOpponent' && moveType !== 'playBee' && effectiveTargetSetId && effectiveMoveType !== 'playWindDouble' && (
            <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>
              Set: <b>{selectedTargetSet ? describeGardenSet(selectedTargetSet) : 'selected ✓'}</b>
            </p>
          )}
          {moveType === 'playBee' && !effectiveTargetSetId && <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>Set: <b>start new set</b></p>}
          {chosenColor && <p style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>Color: <b>{chosenColor}</b></p>}
          {error && <p style={{ color: '#e94560', fontSize: 13, marginBottom: 8 }}>⚠️ {error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button style={btn('#4ecca3', '#1a1a2e')} onClick={dispatch} disabled={isSubmitting}>✔ Confirm</button>
            <button
              style={btn('#555')}
              onClick={() => setStep(moveType === 'tradePresent' ? 'pick-card' : (needsTargetPlayer ? 'pick-target' : 'pick-card'))}
            >
              ← Back
            </button>
            <button style={btn('#333')} onClick={resetAll}>✕ Cancel</button>
          </div>
        </div>
      );
    }

    return null;
  }


  // ── Page layout ───────────────────────────────────────────────

  const hand = me?.hand ?? [];
  const has = (name: string) => hand.some(c => isPower(c, name));
  const hasFlower = hand.some(isFlower);
  const joinedRoomCount = G.players.filter(player => player.name.trim()).length;
  const roomReadyEnabled = joinedRoomCount >= G.minPlayers;
  const myReady = !!playerID && G.readyPlayerIds.includes(playerID);
  const iAmRoomOwner = !!playerID && G.ownerPlayerId === playerID;
  const roomOwnerName = nameOf(G.players.find(player => player.id === G.ownerPlayerId) ?? null) || 'Room owner';
  const showActionOverlay =
    (myTurn && step !== 'menu' && G.phase === 'action') ||
    (myTurn && G.phase === 'blessing') ||
    (isCounter && amTarget && inStage);
  const draggedHandCard = dragPreview ? myHand.find(card => card.id === dragPreview.cardId) ?? null : null;

  const shellClass = [
    'v2-shell page',
    theme.pageClass,
    chatOpen ? 'chat-open' : '',
    logOpen ? 'log-open' : '',
    sceneFx !== 'none' ? `scene-${sceneFx}` : '',
  ].filter(Boolean).join(' ');
  const centerUiGif = turnRemainingSec > 0 && turnRemainingSec < 10 ? middleUiFastGif : middleUiSlowGif;
  const cardPlayFxSrc = cardPlayFx === 'trade-fate'
    ? swapLifeGif
    : cardPlayFx === 'wind-blow'
      ? windBlowGif
      : null;

  if (G.phase === 'waiting') {
    return (
      <div className={shellClass} style={theme.pageStyle}>
        <div className="waiting-room-shell">
          <div
            className="waiting-room-panel"
            style={{
              background: theme.panel,
              border: `1px solid ${theme.border}`,
              boxShadow: `0 24px 60px ${theme.glow}`,
            }}
          >
            <div className="waiting-room-header">
              <div className="waiting-room-heading">
                <div className="waiting-room-kicker" style={{ color: theme.muted }}>
                  Waiting Room
                </div>
                <h1 className="waiting-room-title" style={{ color: theme.text }}>{G.roomName || 'Flower Room'}</h1>
                <div className="waiting-room-subtitle" style={{ color: theme.muted }}>
                  Hosted by <b style={{ color: theme.text }}>{roomOwnerName}</b> · room ID <span style={{ fontFamily: 'monospace', color: theme.text }}>{matchCtx?.matchID}</span>
                </div>
              </div>
              <div
                className="waiting-room-rules"
                style={{
                  background: theme.panelSoft,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                <div className="waiting-room-card-label">Room rules</div>
                <div className="waiting-room-card-copy" style={{ color: theme.muted }}>
                  {G.minPlayers}-{G.maxPlayers} players. Seats shuffle when the owner starts the game, and the opening player is chosen from that shuffled order.
                </div>
              </div>
            </div>

            <div className="waiting-room-seat-grid">
              {G.players.map((player, index) => {
                const occupied = !!player.name.trim();
                const isMine = player.id === playerID;
                const isOwnerSeat = player.id === G.ownerPlayerId;
                const isReady = G.readyPlayerIds.includes(player.id);
                return (
                  <div
                    key={player.id}
                    className="waiting-room-seat-card"
                    style={{
                      border: `1px solid ${occupied ? theme.accent : theme.border}`,
                      background: occupied ? theme.panelSoft : theme.panelAlt,
                      opacity: occupied ? 1 : 0.82,
                    }}
                  >
                    <div className="waiting-room-seat-top">
                      <div className="waiting-room-seat-index" style={{ color: theme.muted }}>Seat {index + 1}</div>
                      <div className="waiting-room-seat-badges">
                        {isOwnerSeat && (
                          <span className="waiting-room-badge" style={{ color: theme.text, background: theme.panel }}>
                            Owner
                          </span>
                        )}
                        {occupied && isReady && (
                          <span className="waiting-room-badge" style={{ color: '#1a1a2e', background: '#4ecca3' }}>
                            Ready
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="waiting-room-seat-name" style={{ color: occupied ? theme.text : theme.muted }}>
                      {occupied ? player.name : 'Open seat'}
                    </div>
                    <div className="waiting-room-seat-copy" style={{ color: theme.muted }}>
                      {occupied
                        ? isMine
                          ? 'This is your seat.'
                          : 'Joined and waiting.'
                        : 'Another player can join here.'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="waiting-room-footer-grid">
              <div
                className="waiting-room-info-card"
                style={{
                  background: theme.panelSoft,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div className="waiting-room-card-label" style={{ color: theme.muted }}>Status</div>
                <div className="waiting-room-status-value" style={{ color: theme.text }}>
                  {joinedRoomCount}/{G.maxPlayers} joined
                </div>
                <div className="waiting-room-card-copy" style={{ color: theme.muted }}>
                  {roomReadyEnabled
                    ? 'Minimum players reached. Everyone can ready up, and the owner can start whenever the room is set.'
                    : `Need ${G.minPlayers - joinedRoomCount} more player${G.minPlayers - joinedRoomCount === 1 ? '' : 's'} before ready becomes available.`}
                </div>
              </div>

              <div
                className="waiting-room-actions-card"
                style={{
                  background: theme.panelSoft,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div className="waiting-room-card-label" style={{ color: theme.muted }}>Actions</div>
                <button
                  type="button"
                  className="waiting-room-action-button"
                  disabled={!playerID || !me?.name.trim() || !roomReadyEnabled || isSubmitting}
                  onClick={() => runMove(() => m.toggleReady())}
                  style={btn(myReady ? '#d8dde4' : '#4ecca3', myReady ? '#1a1a2e' : '#1a1a2e')}
                >
                  {myReady ? 'Unready' : 'Ready'}
                </button>
                {iAmRoomOwner && (
                  <button
                    type="button"
                    className="waiting-room-action-button"
                    disabled={!roomReadyEnabled || isSubmitting}
                    onClick={() => runMove(() => m.startGame())}
                    style={btn('#e94560', '#fff')}
                  >
                    {isSubmitting ? 'Starting...' : 'Start Game'}
                  </button>
                )}
                {!iAmRoomOwner && (
                  <div className="waiting-room-card-copy" style={{ color: theme.muted }}>
                    The room owner starts the match once the table is ready.
                  </div>
                )}
                <button
                  type="button"
                  className="waiting-room-action-button"
                  onClick={() => matchCtx?.onLeave()}
                  style={btn('#555')}
                >
                  Leave Room
                </button>
                {error && (
                  <div style={{ color: '#e94560', fontSize: 13 }}>⚠️ {error}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={theme.pageStyle}>
      <svg className="garden-goo-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="garden-goo-filter" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7.5" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          <filter id="garden-goo-filter-chips" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
          </filter>
        </defs>
      </svg>

      {/* Fixed overlays */}
      <div className={`turn-aura ${turnRemainingSec > 0 && turnRemainingSec <= 10 ? 'is-urgent' : ''} ${G.phase !== 'game_over' ? 'is-active' : ''}`} />
      {sceneFx !== 'none' && <div className={`scene-overlay scene-${sceneFx}`} aria-hidden="true" />}
      {cardPlayFxSrc && (
        <div className={`card-play-fx card-play-fx--${cardPlayFx}`} aria-hidden="true">
          <img src={cardPlayFxSrc} alt="" className="card-play-fx__image" />
        </div>
      )}
      {discardFlyCard && (
        <div className="discard-fly-overlay" aria-hidden="true">
          <div className="discard-fly-card"><CardChip card={discardFlyCard} /></div>
        </div>
      )}
      {windFlights.map(flight => (
        <div key={flight.id} className="wind-fly-overlay" aria-hidden="true"
          style={{ left: flight.start.x, top: flight.start.y } as React.CSSProperties}>
          <div className="wind-fly-card"
            style={{
              animationDelay: `${flight.delayMs}ms`,
              ['--wind-end-x' as never]: `${flight.end.x - flight.start.x}px`,
              ['--wind-end-y' as never]: `${flight.end.y - flight.start.y}px`,
            } as React.CSSProperties}>
            <CardChip card={flight.card} small />
          </div>
        </div>
      ))}
      {dragPreview && draggedHandCard && (
        <div
          className="drag-card-overlay"
          aria-hidden="true"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            width: dragPreview.width,
            height: dragPreview.height,
          } as React.CSSProperties}
        >
          <CardChip card={draggedHandCard} selected />
        </div>
      )}
      {tetherLine && (
        <svg className="tether-overlay" aria-hidden="true">
          <defs>
            <linearGradient id="tetherGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff7eb6" />
              <stop offset="50%" stopColor="#8e6bff" />
              <stop offset="100%" stopColor="#ffd166" />
            </linearGradient>
          </defs>
          <path
            d={`M ${tetherLine.x1} ${tetherLine.y1} C ${(tetherLine.x1 + tetherLine.x2) / 2} ${tetherLine.y1 - 120}, ${(tetherLine.x1 + tetherLine.x2) / 2} ${tetherLine.y2 + 40}, ${tetherLine.x2} ${tetherLine.y2}`}
            className="tether-path"
          />
        </svg>
      )}

      {/* ── HEADER ── */}
      <header className="v2-header" style={{ background: theme.panel, borderBottom: `1px solid ${theme.border}` }}>
        <div className="v2-header-left">
          <span style={{ fontWeight: 800, fontSize: 13, color: theme.text }}>🌸 Flower</span>
          {G.godsFavouritePlayerId && (
            <span style={{ fontSize: 11, color: '#e6c84a', marginLeft: 6 }}>
              👑 {nameOf(G.players.find(p => p.id === G.godsFavouritePlayerId))}
            </span>
          )}
        </div>
        <div className="v2-header-center">
          {G.season ? (
            <span className="pill" style={{ background: SEASON_COLOR[G.season], color: '#1a1a2e', fontSize: 11, padding: '2px 8px' }}>
              {POWER_EMOJI[G.season]} {G.season} ×{G.seasonTurnsRemaining}
            </span>
          ) : (
            <span style={{ color: theme.muted, fontSize: 11 }}>No season</span>
          )}
        </div>
        <div className="v2-header-right">
          <div className="v2-deck-cluster" style={{ color: theme.muted }} aria-label="Deck and discard counts">
            <span className="v2-deck-pill" title="Cards in draw pile">🂠 {G.drawPile.length}</span>
            <span className="v2-deck-pill v2-discard-pill" title="Cards in discard pile">🗑 {G.discardPile.length}</span>
          </div>
          <span style={{ color: theme.muted, fontSize: 11 }} title="Total game time">⌛ {totalTimerLabel}</span>
          <span style={{ color: turnRemainingSec > 0 && turnRemainingSec <= 10 ? '#e94560' : theme.muted, fontSize: 11 }}>⏱ {turnTimerLabel}</span>
        </div>
      </header>

      {/* ── PLAYFIELD ── */}
      <div className="v2-playfield">
        <div className="arena-overlay-controls" aria-label="Arena controls">
          <button
            className={`arena-corner-btn arena-corner-btn-chat ${chatOpen ? 'is-open' : ''}`}
            style={{ color: theme.text, background: theme.panel }}
            onClick={() => {
              setChatOpen(open => !open);
              if (!chatOpen) setChatUnread(0);
            }}
            title={chatOpen ? 'Close chat' : 'Open chat'}
            aria-label="Toggle chat"
          >
            <span className="arena-corner-btn__icon" aria-hidden="true">💬</span>
            <span className="arena-corner-btn__label">Chat</span>
            {chatUnread > 0 && !chatOpen && (
              <span className="v2-badge arena-corner-btn__badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
            )}
          </button>
          <button
            className={`arena-corner-btn arena-corner-btn-log ${logOpen ? 'is-open' : ''}`}
            style={{ color: theme.text, background: theme.panel }}
            onClick={() => {
              setLogOpen(open => !open);
              if (!logOpen) setLogUnread(0);
            }}
            title={logOpen ? 'Close log' : 'Open log'}
            aria-label="Toggle log"
          >
            <span className="arena-corner-btn__icon" aria-hidden="true">📜</span>
            <span className="arena-corner-btn__label">Log</span>
            {logUnread > 0 && !logOpen && (
              <span className="v2-badge arena-corner-btn__badge">{logUnread > 9 ? '9+' : logUnread}</span>
            )}
          </button>
        </div>

        <div className="arena-quick-chat-anchor">
          {quickChatOpen && (
            <div className="arena-quick-chat-panel" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
              {QUICK_CHAT_OPTIONS.map(option => (
                <button
                  key={option.text}
                  className="arena-quick-chat-option"
                  type="button"
                  title={`Send ${option.text}`}
                  onClick={async () => {
                    const sent = await sendChatText(option.text);
                    if (sent) setQuickChatOpen(false);
                  }}
                >
                  {option.emoji}
                </button>
              ))}
            </div>
          )}
          <button
            className={`arena-quick-chat-btn ${quickChatOpen ? 'is-open' : ''}`}
            style={{ color: theme.text, background: theme.panel }}
            type="button"
            onClick={() => setQuickChatOpen(open => !open)}
            title={quickChatOpen ? 'Close quick chat' : 'Open quick chat'}
            aria-label="Toggle quick chat"
          >
            <span aria-hidden="true">🙂</span>
          </button>
        </div>

        <div className={`v2-drawer v2-chat-drawer ${chatOpen ? 'is-open' : ''}`}
          style={{ background: theme.panelSoft }}>
          <div className="v2-drawer-content">
            <div className="v2-chat-msgs" ref={chatMsgsRef}>
              {chatMessages.length === 0
                ? <div style={{ color: theme.muted, fontSize: 12, padding: 8 }}>No messages yet.</div>
                : chatMessages.map((msg, i) => (
                  <div key={i} className={`v2-chat-row ${msg.playerID === matchCtx?.playerID ? 'is-me' : ''}`}>
                    <div className="v2-chat-meta" style={{ color: theme.muted }}>
                      <span>{msg.playerName}</span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="v2-chat-bubble" style={{ background: msg.playerID === matchCtx?.playerID ? theme.accent : theme.panelAlt, color: theme.text }}>
                      {msg.text}
                    </div>
                  </div>
                ))
              }
            </div>
            {chatError && <div style={{ color: '#e94560', fontSize: 11, padding: '2px 8px' }}>{chatError}</div>}
            <div className="v2-chat-composer" style={{ borderTop: `1px solid ${theme.border}` }}>
              <textarea
                className="v2-chat-input"
                style={{ background: theme.panel, color: theme.text, border: `1px solid ${theme.border}` }}
                value={chatDraft}
                onChange={e => setChatDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChatMessage(); } }}
                placeholder="Say something…"
                rows={1}
                disabled={chatSending}
              />
              <button
                className="icon-btn"
                style={{ color: theme.accent }}
                onClick={() => void sendChatMessage()}
                disabled={chatSending || !chatDraft.trim()}
                title="Send"
              >➤</button>
            </div>
          </div>
        </div>

        <div className={`v2-drawer v2-log-drawer ${logOpen ? 'is-open' : ''}`}
          style={{ background: theme.panelSoft }}>
          <div className="v2-log-inner">
            {displayLogItems.length === 0
              ? <div style={{ color: theme.muted, fontSize: 12, padding: 8 }}>No events yet.</div>
              : [...displayLogItems].reverse().map((entry) => (
                <div key={entry.key} className="v2-log-entry" style={{ color: theme.text }}>
                  › {entry.text}
                </div>
              ))
            }
          </div>
        </div>

        {G.phase === 'game_over' && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})`,
            color: theme.text, borderRadius: 12, padding: '10px 20px',
            fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {resultWinnerLabel} wins!
          </div>
        )}

        {arenaLogToast && (
          <div key={arenaLogToast.key} className="arena-log-toast" style={{ color: theme.text, background: theme.panel }}>
            {arenaLogToast.text}
          </div>
        )}

        {/* Arena */}
        <div
          ref={arenaRef}
          className="board-arena board-arena-radial"
          onWheel={event => {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
              adjustArenaZoom(event.deltaY < 0 ? 0.08 : -0.08, { clientX: event.clientX, clientY: event.clientY });
              return;
            }
            setArenaPan(current => ({
              x: current.x - event.deltaX,
              y: current.y - event.deltaY,
            }));
          }}
        >
          <div
            className="arena-pan-stage"
            style={{ ['--arena-pan-x' as string]: `${arenaPan.x}px`, ['--arena-pan-y' as string]: `${arenaPan.y}px` } as React.CSSProperties}
          >
            <div className="arena-zoom-stage" style={{ ['--arena-zoom' as string]: String(arenaZoom) } as React.CSSProperties}>
              <div className={`arena-core ${turnRemainingSec > 0 && turnRemainingSec <= 10 ? 'is-urgent' : ''}`} aria-hidden="true">
                <img className="arena-core-ui" src={centerUiGif} alt="" />
              </div>

              {arenaLayout.map(layout => {
            const player = layout.player;
            const isActive = G.turnOrder[G.currentPlayerIndex] === player.id;
            const isMe = player.id === playerID;
            const isGodsFav = G.godsFavouritePlayerId === player.id;
            const canDropTarget = myTurn && G.phase === 'action';
            const activeGardenCardId = draggingCardId ?? armedCardId;
            const gardenPanelClass = [
              'player-garden',
              isActive ? 'is-current-turn' : '',
              isMe ? 'is-me' : '',
              isGodsFav ? 'is-gods-fav' : '',
              gardenDensityClass(player.garden.sets.length),
              activeGardenPlayerId === player.id ? 'is-targeted' : '',
              settlingGardens[player.id] ? 'is-settling' : '',
            ].filter(Boolean).join(' ');
            const setCount = player.garden.sets.length;
            const gardenSize = Math.max(148, Math.min(216, layout.size));
            const estimatedRows = Math.max(1, Math.ceil(setCount / (compactLayout ? 2 : 3)));
            const gardenHeight = Math.max(136, 102 + estimatedRows * 34);
            const targeting = activeGardenPlayerId === player.id || targetPlayer === player.id;
            const gardenFx = gardenVisualEffect?.playerId === player.id ? gardenVisualEffect : null;
            const gardenSettle = settlingGardens[player.id] ?? null;
            return (
              <div
                key={player.id}
                className={gardenPanelClass}
                style={{
                  ['--pg-x' as string]: `${layout.x}px`,
                  ['--pg-y' as string]: `${layout.y}px`,
                  ['--pg-w' as string]: `${gardenSize}px`,
                  ['--pg-h' as string]: `${gardenHeight}px`,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  borderRadius: 0,
                } as React.CSSProperties}
                ref={(node) => { gardenRefs.current[player.id] = node; }}
              >
                <div className={`garden-body ${gardenSettle ? 'is-settling' : ''}`}>
                  <GardenBlob
                    seed={player.id}
                    totalFlowers={layout.totalFlowers}
                    totalSets={layout.totalSets}
                    isActive={isActive}
                    isMe={isMe}
                    isTargeted={targeting}
                    accent={isMe ? theme.accent : theme.accent2}
                    accent2={isActive ? theme.accent2 : theme.accent}
                    accent3={targeting ? theme.accent : theme.accent2}
                  />
                  {gardenFx?.type === 'natural-disaster' && (
                    <div key={gardenFx.key} className="garden-visual-fx garden-visual-fx--natural-disaster" aria-hidden="true">
                      <img src={naturalDisasterGif} alt="" className="garden-visual-fx__image" />
                    </div>
                  )}
                  {chatBubbles[player.id] && (
                    <div key={chatBubbles[player.id].key} className="garden-chat-bubble">
                      💬 {chatBubbles[player.id].text}
                    </div>
                  )}
                  <button
                    type="button"
                    className="garden-mini-meta"
                    onClick={() => setPlayerInfoPlayerId(player.id)}
                    title={`Open ${nameOf(player)} details`}
                    aria-label={`Open ${nameOf(player)} details`}
                  >
                    <span className="garden-mini-meta__name">
                      {nameOf(player)}
                      <span className="garden-mini-meta__count" aria-hidden="true">
                        🃏 {player.hand.length}
                      </span>
                    </span>
                  </button>
                  <div
                    className="garden-zone"
                    style={{ background: 'transparent', border: 'none' }}
                  >
                    <div
                      className={`garden-grid ${gardenDensityClass(player.garden.sets.length)} ${activeGardenCardId ? 'is-dragging' : ''} ${player.garden.sets.length === 0 ? 'is-empty' : ''}`}
                    >
                      {player.garden.sets.length === 0
                        ? <div className="garden-empty-slot"
                            onClick={canDropTarget && activeGardenCardId
                              ? () => stagePlayFromCard(activeGardenCardId, player.id, '')
                              : isMe && myTurn && G.phase === 'action'
                              ? () => { setMoveType('plantOwn'); setTargetSet(''); setStep('pick-card'); }
                              : undefined}>
                            Tap or drop a flower here
                          </div>
                        : player.garden.sets.map((s) => {
                          return (
                          <SetChip
                            key={s.id}
                            set={s}
                            sizeClass={setSizeClass(s)}
                            isNewGrowth={gardenSettle?.changedSetIds.includes(s.id)}
                            highlight={(targeting && activeGardenSetId === s.id) || (player.id === attackedGardenPlayerId && s.id === attackedGardenSetId)}
                            dragActive={activeGardenCardId !== null && canDropTarget}
                            setRef={(node) => { gardenSetRefs.current[gardenSetRefKey(player.id, s.id)] = node; }}
                            onClick={canDropTarget && activeGardenCardId ? () => stagePlayFromCard(activeGardenCardId, player.id, s.id) : isMe && myTurn && G.phase === 'action' ? () => {
                              if (suppressSetClickRef.current === s.id) { suppressSetClickRef.current = null; return; }
                              setTargetPlayer(player.id);
                              setTargetSet(s.id);
                              setMoveType('plantOwn');
                              setStep('pick-card');
                            } : undefined}
                          />
                          );
                        })
                      }
                    </div>
                  </div>
                  {step === 'confirm' && targetPlayer === player.id && (
                    <div className="garden-quick-confirm" style={{
                      marginTop: 6, padding: '6px 8px', borderRadius: 10,
                      background: theme.panelSoft, border: `1px solid ${theme.accent}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 6, flexWrap: 'wrap',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: theme.muted, marginBottom: 1 }}>Ready here</div>
                        <div style={{ fontWeight: 800, color: theme.text, fontSize: 11 }}>{moveLabel(moveType)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={btn(theme.accent, '#1a1a2e')} onClick={dispatch} disabled={isSubmitting}>✔</button>
                        <button style={btn('#555')} onClick={resetAll}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
            })}
            </div>
          </div>
        </div>

        {/* Action overlay — wizard steps slide over playfield */}
        {showActionOverlay && (
          <div className="v2-action-overlay" onClick={e => { if (e.target === e.currentTarget) resetAll(); }}>
            <div ref={actionSheetRef} className="v2-action-sheet" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
              <ActionPanel />
            </div>
          </div>
        )}

        {/* Floating timer pill — above the action row */}
        <div className={`v2-timer-pill ${turnRemainingSec > 0 && turnRemainingSec <= 10 ? 'is-urgent' : ''}`}
          style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          <span className="v2-timer-pill-name" style={{ color: theme.muted }}>
            {timerLabel}
          </span>
          <span className="v2-timer-pill-clock" style={{ color: turnRemainingSec > 0 && turnRemainingSec <= 10 ? '#e94560' : theme.text }}>
            {turnTimerLabel}
          </span>
          <span className="v2-timer-pill-total" style={{ color: theme.muted }}>
            {totalTimerLabel}
          </span>
          {myTurn && G.phase === 'action' && (
            <span className="v2-timer-pill-moves" style={{ color: theme.muted }}>
              · {G.movesRemaining}mv
            </span>
          )}
        </div>
      </div>

      {/* ── ACTION ROW ── */}
      <div className="v2-action-row" style={{ background: theme.panel, borderTop: `1px solid ${theme.border}` }}>
        {/* Left: Moves */}
        <div className="v2-moves-panel" style={{ borderRight: `1px solid ${theme.border}` }}>
          {myTurn && G.phase === 'action' ? (
            <>
              <div style={{ fontSize: 10, color: theme.muted, marginBottom: 4 }}>
                Moves: <b style={{ color: theme.accent }}>{G.movesRemaining}</b>
              </div>
              <div className="v2-move-buttons">
                {hasFlower && <button className="v2-move-btn" title="Plant (own)" onClick={() => { setMoveType('plantOwn'); setStep('pick-card'); }}>🌱</button>}
                {hasFlower && opponents.length > 0 && <button className="v2-move-btn" title="Plant (opponent)" onClick={() => { setMoveType('plantOpponent'); setStep('pick-card'); }}>🌿</button>}
                {has('wind') && <button className="v2-move-btn" title="Wind ×1" onClick={() => { setMoveType('playWindSingle'); setStep('pick-card'); }}>💨</button>}
                {has('bug') && <button className="v2-move-btn" title="Bug" onClick={() => { setMoveType('playBug'); setStep('pick-card'); }}>🐛</button>}
                {has('bee') && <button className="v2-move-btn" title="Bee" onClick={() => { setMoveType('playBee'); setStep('pick-card'); }}>🐝</button>}
                {has('double_happiness') && <button className="v2-move-btn" title="Double Happiness" onClick={() => { setMoveType('doubleHappiness'); setStep('pick-card'); }}>🎉</button>}
                {has('trade_present') && <button className="v2-move-btn" title="Trade Present" onClick={() => beginTradePresentFlow()}>🎁</button>}
                {has('trade_fate') && <button className="v2-move-btn" title="Trade Fate" onClick={() => { setMoveType('tradeFate'); setStep('pick-card'); }}>🔀</button>}
                {has('let_go') && <button className="v2-move-btn" title="Let Go" onClick={() => { setMoveType('letGo'); setStep('pick-card'); }}>✋</button>}
                {['spring','summer','autumn','winter'].some(s => has(s)) && <button className="v2-move-btn" title="Season" onClick={() => { setMoveType('playSeason'); setStep('pick-card'); }}>🌸</button>}
                {has('natural_disaster') && hasNaturalDisasterTarget && <button className="v2-move-btn" title="Natural Disaster" onClick={() => { setMoveType('naturalDisaster'); setStep('pick-card'); }}>🌪️</button>}
                {has('eclipse') && <button className="v2-move-btn" title="Eclipse" onClick={() => { setMoveType('playEclipse'); setStep('pick-card'); }}>🌑</button>}
                {has('great_reset') && <button className="v2-move-btn" title="Great Reset" onClick={() => { setMoveType('playGreatReset'); setStep('pick-card'); }}>♻️</button>}
                {G.season === 'autumn' && hasFlower && <button className="v2-move-btn" title="Discard Flower" onClick={() => { setMoveType('discardFlower'); setStep('pick-card'); }}>🍂</button>}
                <button className="v2-move-btn" style={{ opacity: 0.7 }} title="Pass turn" onClick={() => runMove(() => m.pass())}>⏩</button>
              </div>
            </>
          ) : G.phase === 'draw' && myTurn ? (
            drawPhaseSeason === 'winter' && (me?.hand.length ?? 0) > 0
              ? <div style={{ fontSize: 11, color: theme.muted }}>❄️ No draw in winter…</div>
              : <button className="v2-move-btn" style={{ fontSize: 18 }} title="Draw cards" onClick={() => runMove(() => m.pass())}>🃏</button>
          ) : G.phase === 'blessing' && myTurn ? (
            <div style={{ fontSize: 11, color: '#e6c84a' }}>👑 Blessing…</div>
          ) : isCounter && amTarget && inStage ? (
            <div style={{ fontSize: 11, color: '#e94560' }}>⚡ Counter!</div>
          ) : (
            <div style={{ fontSize: 11, color: theme.muted }}>
              {isCounter
                ? `⏳ ${nameOf(G.players.find(p => p.id === G.pendingAction?.targetPlayerId))}…`
                : `⏳ ${nameOf(G.players.find(p => p.id === G.turnOrder[G.currentPlayerIndex]))}`
              }
            </div>
          )}
        </div>

        {/* Center: Hand */}
        <div
          ref={handDockRef}
          className={`v2-hand-dock ${myTurn && G.phase === 'action' ? 'is-play-turn' : 'is-reorder-turn'}`}
        >
          {showHandInfoCard && (
            <div
              className="hand-card-info-pop"
              style={{ ['--hand-info-anchor' as string]: `${handInfoAnchor * 100}%` } as React.CSSProperties}
            >
              <div className="hand-card-info-pop__title">{cardName(showHandInfoCard)}</div>
              <div className="hand-card-info-pop__body">{cardDetail(showHandInfoCard)}</div>
            </div>
          )}
          <div ref={handRowRef} className="hand-dock player-hand-row v2-hand-row">
            {myHand.length === 0 ? (
              <span style={{ color: theme.muted, fontSize: 12 }}>Empty</span>
            ) : myHand.map((c, i) => {
              const mid = (myHand.length - 1) / 2;
              return (
                <div
                  key={c.id}
                  ref={(node) => { handCardRefs.current[c.id] = node; }}
                  className={`hand-card-fan ${draggingCardId === c.id ? 'is-drag-origin' : ''}`}
                  style={{ transform: `translateY(${Math.abs(i - mid) * 2}px) rotate(${(i - mid) * 4}deg)` }}
                >
                  <CardChip
                    card={c}
                    selected={armedCardId === c.id || pickedCards.includes(c.id) || counterPickedCards.includes(c.id)}
                    draggable
                    dragging={draggingCardId === c.id}
                    onClick={() => handleHandCardClick(c.id)}
                    onPointerDown={(event) => startCardPointerSession(c.id, event)}
                  />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── FOOTER ── */}
      <footer className="v2-footer" style={{ background: theme.panel, borderTop: `1px solid ${theme.border}` }}>
        <button className="v2-footer-btn" style={{ color: theme.muted }} onClick={() => setModalOpen('menu')}>
          <span>☰</span><span className="v2-footer-label">Menu</span>
        </button>
        <button className="v2-footer-btn" style={{ color: theme.muted }} onClick={() => setModalOpen('rules')}>
          <span>📖</span><span className="v2-footer-label">Rules</span>
        </button>
        {matchResult && (
          <button className="v2-footer-btn" style={{ color: theme.muted }} onClick={() => setModalOpen('results')}>
            <span>🏁</span><span className="v2-footer-label">Results</span>
          </button>
        )}
        <a href="https://flowerbug.a133.mov" target="_blank" rel="noreferrer" className="v2-footer-btn" style={{ color: theme.muted }}>
          <span>🐛</span><span className="v2-footer-label">Report Bug</span>
        </a>
        <button className="v2-footer-btn" style={{ color: '#e94560' }} onClick={() => matchCtx?.onLeave()}>
          <span>✕</span><span className="v2-footer-label">Exit</span>
        </button>
      </footer>

      {/* ── MODALS ── */}
      {modalOpen && (
        <div className="v2-modal-backdrop" onClick={() => setModalOpen(null)}>
          <div className={`v2-modal${modalOpen === 'results' ? ' v2-modal--results' : ''}`} style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
            onClick={e => e.stopPropagation()}>
            <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ fontWeight: 700, color: theme.text }}>
                {modalOpen === 'menu'
                  ? 'Match Info'
                  : modalOpen === 'results'
                    ? 'Match Results'
                  : 'Rules'}
              </span>
              <button className="icon-btn" onClick={() => setModalOpen(null)}>✕</button>
            </div>
            <div className={`v2-modal-body${modalOpen === 'results' ? ' v2-modal-body--results' : ''}`} style={{ color: theme.text }}>
              {modalOpen === 'menu' && (
                <>
                  <div style={{ marginBottom: 10, fontSize: 13 }}>Match: <b>{matchCtx?.matchID ?? '—'}</b></div>
                  <div style={{ marginBottom: 10, fontSize: 13 }}>You: <b>{matchCtx?.playerName ?? playerID}</b></div>
                  <div style={{ marginBottom: 10, fontSize: 13 }}>Phase: <b>{G.phase}</b></div>
                  <div style={{ marginBottom: 10, fontSize: 13 }}>Season: <b>{formatSeasonLabel(G.season)}</b></div>
                  <div style={{ marginBottom: 16, fontSize: 13 }}>Total time: <b>{totalTimerLabel}</b></div>
                  {matchResult && (
                    <button style={{ ...btn(theme.accent, '#1a1a2e'), fontSize: 12, marginBottom: 10 }}
                      onClick={() => setModalOpen('results')}>
                      View Results
                    </button>
                  )}
                  <button style={{ ...btn('#555'), fontSize: 12 }}
                    onClick={() => { void navigator.clipboard.writeText(matchCtx?.matchID ?? ''); }}>
                    📋 Copy Match ID
                  </button>
                </>
              )}
              {modalOpen === 'results' && matchResult && (
                <>
                  <div className="v2-results-summary-grid">
                    <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                      <div className="v2-results-summary-label" style={{ color: theme.muted }}>Winner</div>
                      <div className="v2-results-summary-value">{matchResult.winnerName ?? 'Unknown'}</div>
                    </div>
                    <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                      <div className="v2-results-summary-label" style={{ color: theme.muted }}>Final Time</div>
                      <div className="v2-results-summary-value">{formatElapsedClock(matchResult.durationSec)}</div>
                    </div>
                    <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                      <div className="v2-results-summary-label" style={{ color: theme.muted }}>Season</div>
                      <div className="v2-results-summary-value">{formatSeasonLabel(matchResult.seasonAtFinish)}</div>
                    </div>
                    <div className="v2-results-summary-card" style={{ background: theme.panelSoft, border: `1px solid ${theme.border}` }}>
                      <div className="v2-results-summary-label" style={{ color: theme.muted }}>Cards Left</div>
                      <div className="v2-results-summary-value">{matchResult.drawPileCount} draw / {matchResult.discardPileCount} discard</div>
                    </div>
                  </div>
                  <div className="v2-results-section-label" style={{ color: theme.muted }}>Player state at finish</div>
                  <div className="v2-results-player-list">
                    {matchResult.players.map((player) => (
                      <div
                        key={player.playerId}
                        className="v2-results-player-card"
                        style={{
                          background: player.won ? theme.panelAlt : theme.panelSoft,
                          border: `1px solid ${player.won ? theme.accent : theme.border}`,
                        }}
                      >
                        <div className="v2-results-player-head">
                          <div style={{ minWidth: 0 }}>
                            <div className="v2-results-player-name" style={{ color: theme.text }}>{player.playerName}</div>
                            <div className="v2-results-player-meta" style={{ color: theme.muted }}>
                              {player.won ? 'Winner' : 'Finished'}
                              {player.isGodsFavourite ? " · God's Favourite" : ''}
                            </div>
                          </div>
                          <div className="v2-results-player-badge" style={{
                            background: player.won ? theme.accent : theme.panel,
                            color: player.won ? '#1a1a2e' : theme.text,
                          }}>
                            {player.won ? 'WIN' : 'END'}
                          </div>
                        </div>
                        <div className="v2-results-player-stats">
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Flowers Planted</div><div className="v2-results-player-stat-value">{player.flowersPlanted}</div></div>
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Garden Sets</div><div className="v2-results-player-stat-value">{player.gardenSetCount}</div></div>
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Completed Sets</div><div className="v2-results-player-stat-value">{player.completeSetCount}</div></div>
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Flowers In Garden</div><div className="v2-results-player-stat-value">{player.totalFlowers}</div></div>
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Solid Sets</div><div className="v2-results-player-stat-value">{player.solidSetCount}</div></div>
                          <div><div className="v2-results-player-stat-label" style={{ color: theme.muted }}>Cards In Hand</div><div className="v2-results-player-stat-value">{player.handCount}</div></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="v2-results-actions">
                    <button
                      style={{ ...btn(theme.accent, '#1a1a2e'), fontSize: 12 }}
                      onClick={() => matchCtx?.onLeave()}
                    >
                      Back to Lobby
                    </button>
                    <button
                      style={{ ...btn('#555'), fontSize: 12 }}
                      onClick={() => { void navigator.clipboard.writeText(matchCtx?.matchID ?? ''); }}
                    >
                      Copy Match ID
                    </button>
                  </div>
                </>
              )}
              {modalOpen === 'rules' && (
                <div style={{ fontSize: 13, color: theme.muted, lineHeight: 1.6 }}>
                  <p>Plant flowers into gardens. Complete sets of 3+ matching flowers to score. Use power cards to disrupt opponents.</p>
                  <p>The player with the most complete sets when the draw pile empties wins!</p>
                  <p>God's Favourite cannot win until they pass it on.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {playerInfoPlayerId && (() => {
        const infoPlayer = G.players.find(p => p.id === playerInfoPlayerId);
        if (!infoPlayer) return null;
        return (
          <div className="v2-modal-backdrop" onClick={() => setPlayerInfoPlayerId(null)}>
            <div className="v2-modal" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
              onClick={e => e.stopPropagation()}>
              <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ fontWeight: 700, color: theme.text }}>🌿 {nameOf(infoPlayer)}</span>
                <button className="icon-btn" onClick={() => setPlayerInfoPlayerId(null)}>✕</button>
              </div>
              <div className="v2-modal-body" style={{ color: theme.text }}>
                <div style={{ marginBottom: 12, fontSize: 13 }}>
                  🃏 <b>{infoPlayer.hand.length}</b> card{infoPlayer.hand.length !== 1 ? 's' : ''} in hand
                </div>
                <div style={{ fontSize: 12, color: theme.muted, marginBottom: 6 }}>
                  {infoPlayer.garden.sets.length === 0 ? 'No sets yet.' : `${infoPlayer.garden.sets.length} set${infoPlayer.garden.sets.length !== 1 ? 's' : ''}:`}
                </div>
                {infoPlayer.garden.sets.map(set => {
                  const setColor = gardenSetColor(set);
                  const badge = set.isToken ? '💎' : set.isDivine ? '👑' : set.isSolid ? '💛' : set.isComplete ? '✅' : '';
                  return (
                    <div key={set.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 6, padding: '5px 8px',
                      background: theme.panelSoft, borderRadius: 8,
                      fontSize: 13,
                    }}>
                      <span style={{ fontSize: 15 }}>{set.isToken ? '💎' : setColor ? (FLOWER_EMOJI[setColor] ?? '🌸') : '🌈'}</span>
                      <span style={{ flex: 1 }}>
                        {set.isToken ? 'Token set' : set.flowers.map(f => FLOWER_EMOJI[flowerDisplayColor(f)] ?? '🌸').join('')}
                      </span>
                      {badge && <span>{badge}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
      {showDisconnect && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 18,
            padding: '32px 28px',
            textAlign: 'center',
            maxWidth: 340,
            width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {disconnectReason === 'match-gone' ? '🚫' : '🔌'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, color: theme.text, marginBottom: 8 }}>
              {disconnectReason === 'match-gone' ? 'Match Ended' : 'Connection Lost'}
            </div>
            <div style={{ fontSize: 13, color: theme.muted, marginBottom: 24, lineHeight: 1.6 }}>
              {disconnectReason === 'match-gone'
                ? 'This match no longer exists on the server — it may have been ended or deleted.'
                : 'You\'ve been disconnected from the game server. Refresh the page to reconnect — your match is saved.'}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%', padding: '11px 0',
                background: 'linear-gradient(135deg,#e94560,#c73652)',
                color: '#fff', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              🔄 {disconnectReason === 'match-gone' ? 'Back to Lobby' : 'Refresh Page'}
            </button>
            <button
              onClick={() => setDisconnectReason(null)}
              style={{
                width: '100%', padding: '8px 0',
                background: 'transparent', border: `1px solid ${theme.border}`,
                color: theme.muted, borderRadius: 10,
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Dismiss (stay on page)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
