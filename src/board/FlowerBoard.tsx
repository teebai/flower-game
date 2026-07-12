// ============================================================
// FLOWER GAME — MAIN GAME BOARD (v2)
// ============================================================

import { ErrorBoundary } from '../ErrorBoundary';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, Card, FlowerCard, GardenSet, PendingAction, Player, FlowerColor, Season, PowerCardName } from '../types/gameTypes';
import {
  FLOWER_EMOJI, POWER_EMOJI, SEASON_COLOR,
  cardLabel, cardName, isFlower, isPower, cardDetail, escapeRegExp,
} from '../cards/cardUtils';
import { flowerDisplayColor, gardenSetColor } from '../utils/gardenUtils';
import { formatElapsedClock, formatSeasonLabel } from '../utils/formatters';
import { hapticValidTarget, hapticDropSuccess, hapticInvalid } from '../utils/haptics';
import { CardChip } from '../cards/CardChip';
import { DEFAULT_CARD_ART } from '../cards/defaultCardArt';

import swapLifeGif from '../assets/garden/swap-life.gif';
import windBlowGif from '../assets/garden/wind-blow.gif';
import naturalDisasterGif from '../assets/garden/natural-disaster.gif';
import { MatchContext } from '../matchContext';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useCardTargeting, type GardenDropHit } from './hooks/useCardTargeting';
import { InlineCardLabel } from './components/InlineCardLabel';
import { WaitingRoom } from './components/WaitingRoom';
import { GardenFlowerField } from './GardenFlowerField';
import { computeSectorLayout, type SectorGardenLayout } from './sectorLayout';
import { GrassField } from './GrassField';
import { WindPathCanvas } from './WindPathCanvas';
import { BugAnimationOverlay } from './BugAnimationOverlay';
import type { BugAnimation } from './BugAnimationOverlay';
import { BeeAnimationOverlay } from './BeeAnimationOverlay';
import type { BeeAnimation } from './BeeAnimationOverlay';
import { NaturalDisasterOverlay } from './NaturalDisasterOverlay';
import type { NaturalDisasterAnimation } from './NaturalDisasterOverlay';
import { ActionAnimationOverlay } from './ActionAnimationOverlay';
import { getActionAnimation } from '../cards/actionAnimations';
import { DisconnectOverlay } from './components/DisconnectOverlay';
import { PlayerInfoModal } from './components/PlayerInfoModal';
import { GameModals } from './components/GameModals';
import { ActionZone } from './components/ActionZone';
import { CounterWindow } from './components/CounterWindow';
import { GameMenu } from './components/GameMenu';
import { ParticleBurstOverlay, type ParticleBurst } from './components/ParticleBurstOverlay';
import {
  type DanmakuComment,
  subscribeDanmaku,
  getDanmakuSnapshot,
  cleanupDanmakuComments,
  addDanmakuComment,
  assignDanmakuLane,
  occupyLane,
  getWhimsicalColor,
  DANMAKU_LANE_HEIGHT,
  DANMAKU_TOP_OFFSET,
  DANMAKU_MIN_DURATION,
  DANMAKU_MAX_DURATION,
} from '../danmakuStore';
import { BlessingPanel } from './components/BlessingPanel';
import { CoinFlipOverlay } from './components/CoinFlipOverlay';
import { DivineFavouriteTransition } from './DivineFavouriteTransition';
import { GameCanvas } from '../renderer/GameCanvas';
import { addToast } from '../stores/toastStore';

const CENTER_GIF = '/player_name.gif';

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

const BURST_COLOR: Record<string, string> = {
  blue: '#5a8aff', purple: '#b85aff', red: '#ff5a5a', orange: '#ff9a3a',
  yellow: '#ffd93a', green: '#5aff7a', black: '#a0a0b0',
  rainbow: '#ffcc00', triple_rainbow: '#ff66cc', divine: '#ffd700',
};

function getGardenSetCenter(
  gardenRefs: React.RefObject<Record<string, HTMLDivElement | null>>,
  gardenSetRefs: React.RefObject<Record<string, HTMLDivElement | null>>,
  playerId: string,
  setId: string,
  arenaLayout?: SectorGardenLayout[],
  arenaRef?: React.RefObject<HTMLDivElement | null>,
  zoom?: number,
  panX?: number,
  panY?: number,
): { x: number; y: number } | null {
  // Prefer exact set element
  const setKey = `${playerId}::${setId}`;
  const setEl = gardenSetRefs.current?.[setKey];
  if (setEl) {
    const rect = setEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  // Fallback to garden cluster center (sector-based layout)
  if (arenaLayout && arenaRef?.current) {
    const layout = arenaLayout.find((l) => l.player.id === playerId);
    if (layout) {
      const arenaRect = arenaRef.current.getBoundingClientRect();
      const arenaCx = arenaRect.left + arenaRect.width / 2;
      const arenaCy = arenaRect.top + arenaRect.height / 2;
      const z = zoom ?? 1;
      const px = panX ?? 0;
      const py = panY ?? 0;
      return {
        x: arenaCx + (layout.clusterOffsetX + px) * z,
        y: arenaCy + (layout.clusterOffsetY + py) * z,
      };
    }
  }
  // Ultimate fallback: garden element rect
  const gardenEl = gardenRefs.current?.[playerId];
  if (gardenEl) {
    const rect = gardenEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return null;
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
        background: 'radial-gradient(circle at center, #9AFEFF 0%, #F0FFFF 30%, #967BB6 100%)',
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
      pageStyle: { background: 'radial-gradient(circle at center, #FFF0F5 0%, #F9B7FF 30%, #7FFFD4 100%)', color: '#5b2944' },
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
      pageStyle: { background: 'radial-gradient(circle at center, #FFFFC2 0%, #C3FDB8 30%, #FFBF00 100%)' },
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
      pageStyle: { background: 'radial-gradient(circle at center, #FBD5AB 0%, #C19A6B 30%, #43302E 100%)' },
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
    pageStyle: { background: 'radial-gradient(circle at center, #93FFE8 0%, #C3FDB8 30%, #5865F2 100%)' },
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


function gardenDensityClass(count: number): string {
  if (count >= 6) return 'garden-density-compact';
  if (count >= 4) return 'garden-density-comfy';
  return 'garden-density-spacious';
}

type ArenaGardenLayout = SectorGardenLayout;

// ── Sector-based garden layout ─────────────────────────────
// Each garden is a sector (pie slice) of the circular arena.
// Gardens partition the circle — no collision resolution needed.
// ────────────────────────────────────────────────────────────

/** Radial garden positioning: player 0 at bottom, others distribute clockwise */
function getGardenRadialOffset(playerCount: number, index: number) {
  const isMobile = window.innerWidth <= 640;
  const W = window.innerWidth;
  const H = window.innerHeight;

  const radius = Math.round(Math.min(W * 0.28, H * 0.35));

  const step = 360 / playerCount;
  const angleDeg = 90 + (index * step);
  const rad = (angleDeg * Math.PI) / 180;

  return {
    x: Math.round(Math.cos(rad) * radius),
    y: Math.round(Math.sin(rad) * radius),
    // Mobile gardens are smaller
    w: isMobile ? 280 : 520,
    h: isMobile ? 220 : 400,
  };
}

/** Generate SVG <clipPath> elements for each garden sector */
function SectorClipPaths({ count, myPlayerIndex = 0 }: { count: number; myPlayerIndex?: number }) {
  const paths: JSX.Element[] = [];
  const sectorAngle = (2 * Math.PI) / count;
  const baseAngle = -Math.PI / 2;

  for (let i = 0; i < count; i++) {
    const screenAngle = ((i - myPlayerIndex) * sectorAngle) + baseAngle;
    // Convert math angle (counter-clockwise from right) to SVG unit-circle coords (Y-down)
    const startAngle = screenAngle - sectorAngle / 2;
    const endAngle = screenAngle + sectorAngle / 2;

    const startX = 0.5 + 0.5 * Math.cos(startAngle);
    const startY = 0.5 - 0.5 * Math.sin(startAngle);
    const endX = 0.5 + 0.5 * Math.cos(endAngle);
    const endY = 0.5 - 0.5 * Math.sin(endAngle);
    const largeArc = sectorAngle > Math.PI ? 1 : 0;

    // sweep=0 (counter-clockwise) gives the correct sector in SVG Y-down space
    const d = `M 0.5 0.5 L ${startX.toFixed(4)} ${startY.toFixed(4)} A 0.5 0.5 0 ${largeArc} 0 ${endX.toFixed(4)} ${endY.toFixed(4)} Z`;

    paths.push(
      <clipPath id={`sector-${i}`} key={i} clipPathUnits="objectBoundingBox">
        <path d={d} />
      </clipPath>
    );
  }

  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>{paths}</defs>
    </svg>
  );
}

/** Draw sector boundary lines (radial dividers between gardens) */
function SectorBoundaries({ count, myPlayerIndex = 0, arenaDiameter }: { count: number; myPlayerIndex?: number; arenaDiameter: number }) {
  return null;
}

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

type DragTarget = { playerId: string; setId?: string; flowerId?: string };

type ActionFlow =
  | { mode: 'idle'; hoveredPlayer?: string; hoveredSet?: string }
  | { mode: 'picking-card'; cardId?: string; hoveredPlayer?: string; hoveredSet?: string }
  | { mode: 'picking-target'; cardId: string; windExtraTargets?: string[]; hoveredPlayer?: string; hoveredSet?: string }
  | { mode: 'selecting'; cardId: string; targets: DragTarget[]; windExtraTargets?: string[]; hoveredPlayer?: string; hoveredSet?: string }
  | { mode: 'selecting-flowers'; cardId: string; targetPlayer: string; hoveredPlayer?: string; hoveredSet?: string }
  | { mode: 'confirming'; cardId: string; targets?: DragTarget[]; windExtraTargets?: string[]; doubleHappinessMode?: 'take' | 'give'; hoveredPlayer?: string; hoveredSet?: string };





// ── Drag overlay (memoized to avoid re-renders during drag) ──
const DragCardOverlay = memo(function DragCardOverlay({
  x,
  y,
  width,
  height,
  isOverValidTarget,
  isSnappingBack,
  card,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  isOverValidTarget: boolean;
  isSnappingBack: boolean;
  card: Card;
}) {
  const scale = isSnappingBack ? 0.92 : isOverValidTarget ? 0.75 : 1.08;
  return (
    <div
      className={`drag-card-overlay ${isSnappingBack ? 'is-snapping-back' : ''}`}
      aria-hidden="true"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        width,
        height,
      } as React.CSSProperties}
    >
      <CardChip card={card} selected />
    </div>
  );
});

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
  cursor: 'pointer', fontWeight: 600, fontSize: 39,
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
  const powerLabel = set.isToken ? '' : set.isDivine ? '👑' : set.isComplete ? '✓' : '';
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
        ['--garden-set-border' as string]: highlight ? '#e94560' : 'transparent',
        ['--garden-set-bg' as string]: 'transparent',
        ['--garden-set-shadow' as string]: highlight ? '0 0 10px #e94560' : 'none',
        ['--garden-set-glow' as string]: glowColor && !highlight ? `drop-shadow(0 0 6px ${glowColor})` : 'none',
        cursor: onClick ? 'pointer' : onPointerDown ? 'grab' : 'default',
        ...clusterStyle,
      }}
    >
      {set.isToken && (
        <span className="mini-token-placeholder" aria-label="token">
          💎
        </span>
      )}
      {!set.isToken && visibleFlowers.map(f => {
        const displayColor = flowerDisplayColor(f);
        const art = flowerArt(displayColor);
        return (
          <span key={f.id} className="mini-flower-token">
            {art
              ? <img src={art} alt={displayColor} draggable={false} />
              : <span>{FLOWER_EMOJI[displayColor] ?? '🌺'}</span>}
          </span>
        );
      })}
      {!set.isToken && hiddenFlowerCount > 0 && (
        <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>
          +{hiddenFlowerCount}
        </span>
      )}
      {powerLabel && (
        <span style={{ fontSize: 27, color: 'rgba(255,255,255,0.5)', alignSelf: 'flex-end' }}>
          {powerLabel}
        </span>
      )}
    </div>
  );
}

// ── Main Board ─────────────────────────────────────────────────

type Moves = Record<string, (...args: unknown[]) => void> & {
  blessingChoose?: (picked: string[], arranged: string[]) => void;
  dismissCoinFlip?: () => void;
};

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

const EMPTY_ARRAY: string[] = [];
const EMPTY_SET = new Set<string>();

export function FlowerBoard({ G, ctx, moves, playerID, playerNames, isConnected }: FlowerBoardProps) {
  const m = moves as unknown as Moves;
  const matchCtx = useContext(MatchContext);

  // ── Disconnect detection ─────────────────────────────────────
  const wasConnectedRef = useRef(false);
  const disconnectTimerRef = useRef<number | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<'socket' | 'match-gone' | null>(null);
  const showDisconnect = disconnectReason !== null;

  // ── Interactive grass background (waiting phase) ─────────────
  const [waitingCursorPos, setWaitingCursorPos] = useState<{ x: number; y: number } | null>(null);
  const handleWaitingPointerMove = useCallback((e: React.PointerEvent) => {
    setWaitingCursorPos({ x: e.clientX, y: e.clientY });
  }, []);

  // ── Danmaku overlay (waiting phase) ──────────────────────────
  const danmakuComments = useSyncExternalStore(
    subscribeDanmaku,
    getDanmakuSnapshot,
  );

  // Preload coin flip assets so they're cached before the overlay fires
  useEffect(() => {
    ['coin_head.png', 'coin_tail.png'].forEach((src) => {
      const img = new Image();
      img.src = `/coins/${src}`;
    });
  }, []);

  useEffect(() => {
    if (danmakuComments.length === 0) return;
    const timer = setTimeout(() => {
      cleanupDanmakuComments();
    }, 1500);
    return () => clearTimeout(timer);
  }, [danmakuComments.length > 0]);

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

  // ── Action flow (button-driven wizard) ─────────────────────
  const [actionFlow, setActionFlow] = useState<ActionFlow>({ mode: 'idle' });
  const activeCardId = actionFlow.mode !== 'idle' ? actionFlow.cardId : undefined;
  const hoveredPlayerId = actionFlow.hoveredPlayer ?? null;
  const hoveredSetId = actionFlow.hoveredSet ?? null;
  const windExtraTargetSets = actionFlow.mode === 'picking-target' || actionFlow.mode === 'selecting' || actionFlow.mode === 'confirming' ? actionFlow.windExtraTargets ?? [] : [];
  const setWindExtraTargetSets = (next: string[] | ((prev: string[]) => string[])) => {
    setActionFlow(prev => {
      if (prev.mode !== 'picking-target' && prev.mode !== 'selecting' && prev.mode !== 'confirming') return prev;
      const nextValue = typeof next === 'function' ? next(prev.windExtraTargets ?? []) : next;
      return { ...prev, windExtraTargets: nextValue };
    });
  };

  const handRowRef = useRef<HTMLDivElement | null>(null);

  // ── Drag & drop (pointer-driven) ─────────────────────────────
  const drag = useDragAndDrop({
    handRowRef,
    onDragStart: (cardId: string) => {
      setActionFlow({ mode: 'picking-card', cardId });
    },
    onDragMove: (pos: { x: number; y: number }) => {
      scheduleProximityUpdate(pos.x, pos.y);
    },
    onDragCancel: () => {
      clearProximity();
    },
    onDragEnd: (cardId: string, pos: { x: number; y: number }, wasReorder: boolean) => {
      // debug: onDragEnd
      if (wasReorder) return;
      // Phase guard: drag-to-play only works during action phase on your turn
      if (!myTurn || G.phase !== 'action') {
        drag.clearDrag();
        clearProximity();
        return;
      }

      // Hit-test from the actual drop position (more reliable than the
      // last pointermove-derived hoveredTarget which may be slightly stale).
      let hit: GardenDropHit | null = null;
      const elements = document.elementsFromPoint(pos.x, pos.y);
      for (const el of elements) {
        const setId = el.getAttribute('data-set-id');
        const playerId = el.getAttribute('data-player-id');
        if (setId && playerId) { hit = { playerId, setId }; break; }
      }
      if (!hit) {
        for (const el of elements) {
          const playerId = el.getAttribute('data-garden-id');
          if (playerId) { hit = { playerId, setId: '' }; break; }
        }
      }
      // debug: drag hit

      // Touch fallback: if dropped back in the hand zone with NO garden hit, treat as reorder
      if (!hit && pointInsideHandReorderZone(pos.x, pos.y)) {
        reorderHandCard(cardId, pos.x);
        clearProximity();
        return;
      }
      if (!hit) {
        // Invalid drop: snap back to original card position
        const originEl = handCardRefs.current[cardId];
        if (originEl) {
          const rect = originEl.getBoundingClientRect();
          drag.snapBack(rect.left, rect.top);
        } else {
          drag.clearDrag();
        }
        clearProximity();
        return;
      }
      if (hit) {
        const layout = arenaLayout.find((l) => l.player.id === hit.playerId);
        const arenaNode = arenaRef.current;
        if (layout && arenaNode) {
          const arenaRect = arenaNode.getBoundingClientRect();
          const arenaCx = arenaRect.left + arenaRect.width / 2;
          const arenaCy = arenaRect.top + arenaRect.height / 2;
          const z = arenaZoomRef.current;
          const px = arenaPanRef.current.x;
          const py = arenaPanRef.current.y;
          const gardenCx = arenaCx + (layout.clusterOffsetX + px) * z;
          const gardenCy = arenaCy + (layout.clusterOffsetY + py) * z;
          lastDropRef.current = {
            playerId: hit.playerId,
            setId: hit.setId,
            x: pos.x - gardenCx,
            y: pos.y - gardenCy,
            time: Date.now(),
          };
        }
        suppressNextCardClick(cardId);
        const card = me?.hand.find(c => c.id === cardId);
        const moveType = card ? moveTypeFromCard(card, hit.playerId) : null;
        // Check validity for set-targeting moves
        if (moveType && moveRequiresTargetSet(moveType) && hit.setId) {
          const targetPlayer = G.players.find(p => p.id === hit.playerId);
          const targetSet = targetPlayer?.garden.sets.find(s => s.id === hit.setId);
          if (targetSet && !isValidTargetSetForMove(moveType, targetSet)) {
            // Invalid target: snap back
            hapticInvalid();
            const originEl = handCardRefs.current[cardId];
            if (originEl) {
              const rect = originEl.getBoundingClientRect();
              drag.snapBack(rect.left, rect.top);
            } else {
              drag.clearDrag();
            }
            clearProximity();
            return;
          }
        }
        const isSimple = moveType && ['plantOwn', 'plantOpponent', 'playSeason', 'playEclipse', 'playGreatReset', 'letGo', 'naturalDisaster'].includes(moveType);
        if (isSimple && card) {
          const resolvedTargetSet = isFlower(card)
            ? resolvePlantTargetSetId(card.id, hit.playerId, hit.setId || '')
            : moveRequiresTargetSet(moveType)
              ? (hit.setId || '')
              : '';
          switch (moveType) {
            case 'plantOwn':
              runMove(() => m.plantOwn(card.id, resolvedTargetSet || undefined));
              break;
            case 'plantOpponent':
              runMove(() => m.plantOpponent(card.id, hit.playerId, resolvedTargetSet || undefined));
              break;
            case 'playSeason': {
              const seasonName = (!isFlower(card) && card.kind === 'power') ? card.name : 'spring';
              runMoveWithAnim(() => m.playSeason(card.id), { name: seasonName as PowerCardName, phase: 'cast' });
              break;
            }
            case 'playEclipse':
              runMoveWithAnim(() => m.playEclipse(card.id), { name: 'eclipse', phase: 'cast' });
              break;
            case 'playGreatReset':
              runMoveWithAnim(() => m.playGreatReset(card.id), { name: 'great_reset', phase: 'cast' });
              break;
            case 'letGo':
              runMoveWithAnim(() => m.letGo(card.id), { name: 'let_go', phase: 'cast' });
              break;
            case 'naturalDisaster': {
              // Create per-set natural disaster animation
              const ndTargetEl = gardenRefs.current[hit.playerId];
              let ndTargetX = window.innerWidth / 2;
              let ndTargetY = window.innerHeight / 2;
              if (ndTargetEl && resolvedTargetSet) {
                const setEl = ndTargetEl.querySelector(`[data-set-id="${resolvedTargetSet}"]`) as HTMLElement | null;
                if (setEl) {
                  const rect = setEl.getBoundingClientRect();
                  ndTargetX = rect.left + rect.width / 2;
                  ndTargetY = rect.top + rect.height / 2;
                }
              }
              const ndAnimId = `nd-${Date.now()}`;
              pendingNdRef.current.set(ndAnimId, {
                targetPlayerId: hit.playerId,
                targetSetId: resolvedTargetSet,
                createdAt: Date.now(),
                seenPending: false,
              });
              setNdAnimations(prev => [...prev, {
                id: ndAnimId,
                phase: 'landing' as const,
                targetX: ndTargetX,
                targetY: ndTargetY,
                targetSetId: resolvedTargetSet,
                targetPlayerId: hit.playerId,
                phaseStartTime: 0,
                startTime: Date.now(),
              }].slice(-20));
              runMoveWithAnim(() => m.naturalDisaster(card.id, hit.playerId, resolvedTargetSet), { name: 'natural_disaster', phase: 'cast', targetPlayerId: hit.playerId });
              break;
            }
          }
          hapticDropSuccess();
          resetAll();
        } else {
          hapticDropSuccess();
          stagePlayFromCard(cardId, hit.playerId, hit.setId || '');
        }
      }
      clearProximity();
    },
    onReorder: (cardId: string, clientX: number) => {
      reorderHandCard(cardId, clientX);
    },
  });

  const gardenRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const gardenSetRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const targeting = useCardTargeting({
    draggedCardId: drag.draggedCardId,
    players: G.players,
    myPlayerId: playerID ?? null,
    pointerPosition: drag.pointerPosition,
  });

  const isDragging = drag.mode === 'dragging';
  const dragPreview = drag.dragPreview;
  const dragTarget = targeting.hoveredTarget;
  const [moveType, setMoveType]   = useState('');
  const [pickedCards, setPickedCards] = useState<string[]>([]);
  const [targetPlayer, setTargetPlayer] = useState('');
  const [targetSet, setTargetSet]     = useState('');
  const [selectedFlowerIds, setSelectedFlowerIds] = useState<string[]>([]);
  const lastDropRef = useRef<{ playerId: string; setId: string; x: number; y: number; time: number } | null>(null);
  const [chosenColor, setChosenColor] = useState('');
  const [discardChoice, setDiscardChoice] = useState('');
  const [windAttackDoubleMode, setWindAttackDoubleMode] = useState(false);
  const [doubleHappinessMode, setDoubleHappinessMode] = useState<'take' | 'give' | ''>('');
  const [counterPickedCards, setCounterPickedCards] = useState<string[]>([]);
  const [counterTimeRemaining, setCounterTimeRemaining] = useState(30);
  const [error, setError] = useState('');

  const [visualGodsFavouritePlayerId, setVisualGodsFavouritePlayerId] = useState<string | null>(null);
  const [divineTransition, setDivineTransition] = useState<{
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromSize?: number;
    toSize?: number;
  } | null>(null);
  const prevGodsFavRef = useRef<string | null>(null);
  const pendingVisualGodsFavRef = useRef<string | null>(null);
  const godsFavouritePlayerIdRef = useRef(G.godsFavouritePlayerId);
  godsFavouritePlayerIdRef.current = G.godsFavouritePlayerId;

  const handleTransitionComplete = useCallback(() => {
    setDivineTransition(null);
    const target = pendingVisualGodsFavRef.current;
    if (target && godsFavouritePlayerIdRef.current === target) {
      setVisualGodsFavouritePlayerId(target);
    }
  }, []);

  useEffect(() => {
    const current = G.godsFavouritePlayerId;
    const previous = prevGodsFavRef.current;
    const computeGardenCenter = (pid: string) => {
      const layout = layoutCacheRef.current.find((l) => l.player.id === pid);
      const arenaNode = arenaRef.current;
      if (!layout || !arenaNode) return null;
      const arenaRect = arenaNode.getBoundingClientRect();
      const arenaCx = arenaRect.left + arenaRect.width / 2;
      const arenaCy = arenaRect.top + arenaRect.height / 2;
      const z = arenaZoomRef.current;
      const px = arenaPanRef.current.x;
      const py = arenaPanRef.current.y;
      return {
        x: arenaCx + (layout.clusterOffsetX + px) * z,
        y: arenaCy + (layout.clusterOffsetY + py) * z,
      };
    };
    if (previous && current && previous !== current) {
      /* Transfer from one garden to another — hide particles during flight */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = current;
      const fromPos = computeGardenCenter(previous);
      const toPos = computeGardenCenter(current);
      if (fromPos && toPos) {
        setDivineTransition({
          id: `divine-${Date.now()}`,
          fromX: fromPos.x,
          fromY: fromPos.y,
          toX: toPos.x,
          toY: toPos.y,
          fromSize: arenaDiameter * 0.18,
          toSize: arenaDiameter * 0.18,
        });
      }
    } else if (!previous && current) {
      /* First-time appearance — hide particles until orbs arrive */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = current;
      const toPos = computeGardenCenter(current);
      if (toPos) {
        setDivineTransition({
          id: `divine-${Date.now()}`,
          fromX: toPos.x,
          fromY: toPos.y - 300,
          toX: toPos.x,
          toY: toPos.y,
        });
      }
    } else if (previous && !current) {
      /* Removal — hide particles immediately */
      setVisualGodsFavouritePlayerId(null);
      pendingVisualGodsFavRef.current = null;
      setDivineTransition(null);
    } else if (!previous && !current) {
      /* No change, both null */
      pendingVisualGodsFavRef.current = null;
    }
    prevGodsFavRef.current = current;
  }, [G.godsFavouritePlayerId]);

  const [blessingPicked, setBlessingPicked] = useState<string[]>([]);
  const [blessingArranged, setBlessingArranged] = useState<string[]>([]);

  // Robust client-side auto-dismiss for coin flip — fallback if overlay timer fails
  useEffect(() => {
    if (!G.coinFlip) return;
    const elapsed = Date.now() - G.coinFlip.revealedAt;
    const remaining = Math.max(0, 8000 - elapsed);
    const timer = setTimeout(() => {
      if (G.coinFlip) {
        m.dismissCoinFlip?.();
      }
    }, remaining);
    return () => clearTimeout(timer);
  }, [G.coinFlip]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [windFlights, setWindFlights] = useState<import('./WindPathCanvas').WindFlight[]>([]);
  const [windLandedFlowerIds, setWindLandedFlowerIds] = useState<Record<string, Set<string>>>({});
  const [bugAnimations, setBugAnimations] = useState<BugAnimation[]>([]);
  const [beeAnimations, setBeeAnimations] = useState<BeeAnimation[]>([]);
  const [ndAnimations, setNdAnimations] = useState<NaturalDisasterAnimation[]>([]);
  const pendingBugRef = useRef<Map<string, {
    targetPlayerId: string;
    targetSetId: string;
    flowerIdsBefore: string[];
    createdAt: number;
    seenPending: boolean;
  }>>(new Map());
  const pendingNdRef = useRef<Map<string, {
    targetPlayerId: string;
    targetSetId: string;
    createdAt: number;
    seenPending: boolean;
  }>>(new Map());
  const [activeAnimation, setActiveAnimation] = useState<{ name: PowerCardName; phase: 'cast' | 'success' | 'win'; targetPlayerId?: string } | null>(null);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [localLogEntries, setLocalLogEntries] = useState<LocalLogEntry[]>([]);

  // ── V2 drawer / modal state ────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [modalOpen, setModalOpen] = useState<'menu' | 'rules' | 'results' | null>(null);
  const [playerInfoPlayerId, setPlayerInfoPlayerId] = useState<string | null>(null);
  const [discardPopupOpen, setDiscardPopupOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

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
  const cardPlayFxTimerRef = useRef<number | null>(null);
  const seatPresencePrimedRef = useRef(false);
  const previousSeatPresenceRef = useRef(matchCtx?.seatPresence ?? {});
  const [discardFlyCard, setDiscardFlyCard] = useState<Card | null>(null);
  const [drawFlyAnim, setDrawFlyAnim] = useState<{ count: number; startIndex: number } | null>(null);
  const [sceneFx, setSceneFx] = useState<'none' | 'eclipse' | 'reset' | 'disaster'>('none');
  const [cardPlayFx, setCardPlayFx] = useState<CardPlayEffect>('none');
  const [gardenVisualEffect, setGardenVisualEffect] = useState<GardenVisualEffect | null>(null);
  const [settlingGardens, setSettlingGardens] = useState<Record<string, GardenSettleState>>({});
  const [scenePulse, setScenePulse] = useState<string | null>(null);
  const [grassWindGust, setGrassWindGust] = useState(0);
  const [gameCursorPos, setGameCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [windDeparting, setWindDeparting] = useState<{ playerId: string; setId: string } | null>(null);
  const [plantBursts, setPlantBursts] = useState<ParticleBurst[]>([]);

  const [gardenContentSizes, setGardenContentSizes] = useState<Record<string, { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number }>>({});
  const [arenaZoom, setArenaZoom] = useState(1);
  const [arenaPan, setArenaPan] = useState({ x: 0, y: 0 });

  // ── Pan clamping: very wide bounds so users can explore off-screen ──
  const MAX_PAN = 5000;
  const setClampedArenaPan = useCallback((value: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
    const clamp = (pan: { x: number; y: number }) => ({
      x: Math.max(-MAX_PAN, Math.min(MAX_PAN, pan.x)),
      y: Math.max(-MAX_PAN, Math.min(MAX_PAN, pan.y)),
    });
    if (typeof value === 'function') {
      setArenaPan(prev => clamp(value(prev)));
    } else {
      setArenaPan(clamp(value));
    }
  }, []);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  // ── Auto-zoom with manual override + 3s revert ─────────────
  const isManualZoomRef = useRef(false);
  // manualZoomTimerRef removed — pan/zoom now persists until double-tap or turn change
  const animZoomRef = useRef<number | null>(null);

  // Reset manual zoom on mount so auto-zoom can animate from the initial layout.
  useEffect(() => {
    isManualZoomRef.current = false;
  }, []);

  const markManualInteraction = useCallback(() => {
    isManualZoomRef.current = true;
  }, []);
  useEffect(() => {
    return () => {
      if (animZoomRef.current) {
        cancelAnimationFrame(animZoomRef.current);
      }
    };
  }, []);

  // Resume auto-camera when the active player changes (turn end)
  useEffect(() => {
    isManualZoomRef.current = false;
  }, [G.currentPlayerIndex]);

  // ── Grass wind gust decay ────────────────────────────────────
  useEffect(() => {
    if (grassWindGust <= 0) return;
    let raf: number;
    const decay = () => {
      setGrassWindGust(prev => {
        const next = prev * 0.92 - 0.005;
        return next > 0.01 ? next : 0;
      });
      raf = requestAnimationFrame(decay);
    };
    raf = requestAnimationFrame(decay);
    return () => cancelAnimationFrame(raf);
  }, [grassWindGust > 0]);


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
  const handCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const arenaPanRef = useRef(arenaPan);
  const arenaZoomRef = useRef(arenaZoom);

  const proximityFrameRef = useRef<number | null>(null);
  const cachedGardenRectsRef = useRef<Record<string, { cx: number; cy: number }>>({});
  const gardenRectsUpdateTimerRef = useRef<number | null>(null);
  const layoutCacheRef = useRef<SectorGardenLayout[]>([]);
  const suppressCardClickRef = useRef<string | null>(null);
  const suppressSetClickRef = useRef<string | null>(null);
  const previousDiscardCountRef = useRef<number>(G.discardPile.length);
  const previousGardenIdsRef = useRef<Record<string, string[]>>(snapshotGardenIds(G.players));
  const previousGardenStateRef = useRef<GardenSnapshot>(snapshotGardenState(G.players));
  const submitUnlockRef = useRef<number | null>(null);
  const dispatchGuardRef = useRef(false);
  const actionSheetRef = useRef<HTMLDivElement | null>(null);
  const gardenVisualEffectTimerRef = useRef<number | null>(null);
  const gardenSettleTimersRef = useRef<Record<string, number>>({});
  const previousLogLengthRef = useRef<number>(G.log.length);
  const pendingLocalPlantSoundLogSkipsRef = useRef<number>(0);
  const autoOpenedMatchResultRef = useRef<number | null>(null);
  const handDockRef = useRef<HTMLDivElement | null>(null);
  const [handOrderIds, setHandOrderIds] = useState<string[]>([]);
  const clampArenaZoom = (next: number) => {
    const minZ = window.innerWidth <= 640 ? 0.08 : 0.12;
    return Math.max(minZ, Math.min(3.0, Number(next.toFixed(2))));
  };
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
    setClampedArenaPan({
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

  // Re-clamp pan whenever zoom changes so bounds shrink/grow correctly
  useEffect(() => {
    setClampedArenaPan(prev => prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaZoom]);

  useEffect(() => {
    return () => {
      if (proximityFrameRef.current !== null) {
        cancelAnimationFrame(proximityFrameRef.current);
        proximityFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const node = arenaRef.current;
    if (!node) return;

    type Session =
      | { mode: 'none' }
      | { mode: 'pan'; startX: number; startY: number; startPanX: number; startPanY: number }
      | { mode: 'pinch'; startZoom: number; startDist: number; contentX: number; contentY: number };

    let session: Session = { mode: 'none' };

    const getPos = (touches: TouchList) => {
      const rect = node.getBoundingClientRect();
      return Array.from(touches).map(t => ({
        cx: t.clientX,
        cy: t.clientY,
        x: t.clientX - rect.left - rect.width / 2,
        y: t.clientY - rect.top - rect.height / 2,
      }));
    };

    const startPinch = (pos: ReturnType<typeof getPos>) => {
      const dx = pos[0].cx - pos[1].cx;
      const dy = pos[0].cy - pos[1].cy;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pos[0].x + pos[1].x) / 2;
      const midY = (pos[0].y + pos[1].y) / 2;
      const pan = arenaPanRef.current;
      const zoom = arenaZoomRef.current;
      return {
        mode: 'pinch' as const,
        startZoom: zoom,
        startDist: dist,
        contentX: (midX - pan.x) / zoom,
        contentY: (midY - pan.y) / zoom,
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (drag.mode !== 'idle') return;
      const pos = getPos(e.targetTouches);
      if (pos.length === 1) {
        const pan = arenaPanRef.current;
        session = {
          mode: 'pan',
          startX: pos[0].cx,
          startY: pos[0].cy,
          startPanX: pan.x,
          startPanY: pan.y,
        };
      } else if (pos.length === 2) {
        session = startPinch(pos);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (drag.mode !== 'idle') return;
      const pos = getPos(e.targetTouches);

      if (session.mode === 'pan' && pos.length === 1) {
        const dx = pos[0].cx - session.startX;
        const dy = pos[0].cy - session.startY;
        e.preventDefault();
        markManualInteraction();
        setClampedArenaPan({
          x: session.startPanX + dx,
          y: session.startPanY + dy,
        });
        return;
      }

      if (pos.length !== 2) return;

      if (session.mode !== 'pinch') {
        session = startPinch(pos);
      }
      const pinchSession = session as Extract<Session, { mode: 'pinch' }>;

      const dx = pos[0].cx - pos[1].cx;
      const dy = pos[0].cy - pos[1].cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nextZoom = clampArenaZoom(pinchSession.startZoom * (dist / pinchSession.startDist));
      const midX = (pos[0].x + pos[1].x) / 2;
      const midY = (pos[0].y + pos[1].y) / 2;

      e.preventDefault();
      markManualInteraction();
      setArenaZoom(nextZoom);
      setClampedArenaPan({
        x: midX - (pinchSession.contentX * nextZoom),
        y: midY - (pinchSession.contentY * nextZoom),
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (drag.mode !== 'idle') return;
      const pos = getPos(e.targetTouches);
      if (pos.length === 0) {
        session = { mode: 'none' };
      } else if (pos.length === 1) {
        session = {
          mode: 'pan',
          startX: pos[0].cx,
          startY: pos[0].cy,
          startPanX: arenaPanRef.current.x,
          startPanY: arenaPanRef.current.y,
        };
      } else if (pos.length === 2) {
        session = startPinch(pos);
      }
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);

    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [drag.mode]);

  // ── Desktop mouse drag pan (pointer events, touch excluded to avoid conflict) ──
  useEffect(() => {
    const arenaNode = arenaRef.current;
    if (!arenaNode) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = arenaPanRef.current.x;
      startPanY = arenaPanRef.current.y;
      arenaNode.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      markManualInteraction();
      setClampedArenaPan({
        x: startPanX + (e.clientX - startX),
        y: startPanY + (e.clientY - startY),
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      isDragging = false;
      arenaNode.releasePointerCapture(e.pointerId);
    };

    arenaNode.addEventListener('pointerdown', onPointerDown);
    arenaNode.addEventListener('pointermove', onPointerMove);
    arenaNode.addEventListener('pointerup', onPointerUp);
    arenaNode.addEventListener('pointercancel', onPointerUp);

    return () => {
      arenaNode.removeEventListener('pointerdown', onPointerDown);
      arenaNode.removeEventListener('pointermove', onPointerMove);
      arenaNode.removeEventListener('pointerup', onPointerUp);
      arenaNode.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

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
    targeting.clearHover();
    setActionFlow(prev => ({ ...prev, hoveredPlayer: undefined, hoveredSet: undefined }));
  }

  function updateCachedGardenRects() {
    const arenaNode = arenaRef.current;
    if (!arenaNode) return;
    const arenaRect = arenaNode.getBoundingClientRect();
    const arenaCx = arenaRect.left + arenaRect.width / 2;
    const arenaCy = arenaRect.top + arenaRect.height / 2;
    const zoom = arenaZoomRef.current;
    const panX = arenaPanRef.current.x;
    const panY = arenaPanRef.current.y;

    const next: Record<string, { cx: number; cy: number }> = {};
    for (const layout of arenaLayout) {
      const sx = arenaCx + (layout.clusterOffsetX + panX) * zoom;
      const sy = arenaCy + (layout.clusterOffsetY + panY) * zoom;
      next[layout.player.id] = { cx: sx, cy: sy };
    }
    cachedGardenRectsRef.current = next;
  }

  function scheduleProximityUpdate(clientX: number, clientY: number) {
    if (proximityFrameRef.current !== null) return;
    // Throttle rect caching to every 250ms to avoid layout thrashing
    if (gardenRectsUpdateTimerRef.current === null) {
      updateCachedGardenRects();
      gardenRectsUpdateTimerRef.current = window.setTimeout(() => {
        gardenRectsUpdateTimerRef.current = null;
      }, 250);
    }
    proximityFrameRef.current = window.requestAnimationFrame(() => {
      proximityFrameRef.current = null;
      const rects = cachedGardenRectsRef.current;
      for (const [playerId, gardenEl] of Object.entries(gardenRefs.current)) {
        if (!gardenEl) continue;
        const cached = rects[playerId];
        const cx = cached ? cached.cx : 0;
        const cy = cached ? cached.cy : 0;
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

  function suppressNextCardClick(cardId: string) {
    suppressCardClickRef.current = cardId;
    window.setTimeout(() => {
      if (suppressCardClickRef.current === cardId) suppressCardClickRef.current = null;
    }, 0);
  }

  function resetAll() {
    setActionFlow({ mode: 'idle' }); setMoveType(''); setPickedCards([]);
    setTargetPlayer(''); setTargetSet(''); setSelectedFlowerIds([]); clearDropHover(); setChosenColor(''); setDiscardChoice(''); setWindAttackDoubleMode(false); setDoubleHappinessMode(''); setError('');
    drag.clearDrag();
  }

  function resetBlessing() {
    setBlessingPicked([]); setBlessingArranged([]);
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
    setChosenColor('');
    setDiscardChoice('');
    setDoubleHappinessMode('');
    setError('');
    drag.clearDrag();
    setActionFlow({ mode: targetPlayerId ? 'picking-card' : 'picking-target', cardId: tradeCard.id });
  }

  // Reset blessing state whenever a NEW blessing phase begins (different revealed cards)
  const blessingFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = G.blessingState
      ? G.blessingState.revealedCards.map(c => c.id).join(',')
      : null;
    if (G.phase === 'blessing' && fingerprint && fingerprint !== blessingFingerprintRef.current) {
      console.log('[RESET] New blessing phase detected, clearing state');
      setBlessingPicked([]);
      setBlessingArranged([]);
      blessingFingerprintRef.current = fingerprint;
    }
  }, [G.phase, G.blessingState]);

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

  // ── Garden hover level (for 3-level hover: flower → set → player) ──
  const activeGardenCardId = activeCardId;

  // ── Hover targeting mode based on dragged card type ─────────
  const hoverMode = (() => {
    if (!activeGardenCardId || !me) return 'none';
    const card = me.hand.find(c => c.id === activeGardenCardId);
    if (!card) return 'none';
    if (card.kind === 'flower') return 'set'; // Planting targets a set
    const name = card.name;
    // Single-target cards (individual flower)
    if (['wind','bug'].includes(name)) return 'flower';
    // Set-target cards
    if (['natural_disaster','double_happiness','bee'].includes(name)) return 'set';
    // Player/garden-target cards
    if (['trade_fate','trade_present'].includes(name)) return 'garden';
    // Global cards (no targeting hover needed)
    return 'none';
  })();
  const hoverLevel = useMemo(() => {
    if (!activeGardenCardId) return null;
    const activeCard = me?.hand.find((c) => c.id === activeGardenCardId);
    if (!activeCard) return null;
    const cardMoveType = moveTypeFromCard(activeCard, targetPlayer || playerID || '');
    if (!cardMoveType) return null;
    if (moveRequiresTargetSet(cardMoveType)) return 'set';
    if (moveNeedsTargetPlayer(cardMoveType) || moveUsesEditableSetTarget(cardMoveType)) return 'player';
    return null;
  }, [activeGardenCardId, me, targetPlayer, playerID]);

  const myTurn = ctx.currentPlayer === playerID;
  const nameOf = (player?: Player | null) => player ? (playerNames?.[player.id] ?? player.name) : '?';
  const displayLogEntry = (entry: string) => {
    let rendered = entry;
    for (const player of G.players) {
      const liveName = nameOf(player);
      if (!liveName || !player.name || liveName === player.name) continue;
      rendered = rendered.replace(new RegExp(`\\b${escapeRegExp(player.name)}\\b`, 'g'), liveName);
      rendered = rendered.replace(new RegExp(`\\bPlayer ${Number(player.id) + 1}\\b`, 'g'), liveName);
    }
    return rendered;
  };
  // Only depend on log length + last 200 entries to prevent recompute on every state update
  const recentLog = useMemo(() => G.log.slice(-200), [G.log.length]);
  const displayLogItems = useMemo(
    () => {
      const MAX_LOG_ITEMS = 200;
      const local = localLogEntries.slice(-MAX_LOG_ITEMS).map(entry => ({ key: entry.key, text: entry.text }));
      const remaining = MAX_LOG_ITEMS - local.length;
      const server = recentLog.slice(-Math.max(1, remaining)).map((entry, index) => ({
        key: `server-${recentLog.length - Math.max(1, remaining) + index}`,
        text: displayLogEntry(entry),
      }));
      return [...local, ...server];
    },
    [recentLog, localLogEntries],
  );
  const isCounter = G.phase === 'counter';
  const amTarget  = G.pendingAction?.targetPlayerId === playerID;
  const inStage   = !!(ctx.activePlayers && playerID !== null && ctx.activePlayers[playerID!]);
  const opponents = G.players.filter(p => p.id !== playerID);
  const beeDiscardFlowers = G.discardPile.filter((c): c is FlowerCard => c.kind === 'flower' && c.color !== 'triple_rainbow');
  const drawPhaseSeason = G.drawPhaseSeason ?? G.season;
  const emptyHand = (me?.hand.length ?? 0) === 0;
  const drawCount = emptyHand ? 7 : (drawPhaseSeason === 'winter' ? 0 : (drawPhaseSeason === 'summer' ? 3 : 2));
  const showCenterDraw = G.phase === 'draw' && myTurn && drawCount > 0 && !G.coinFlip;
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

  // Counter window countdown timer
  useEffect(() => {
    if (isCounter && amTarget && inStage && !G.pendingAction?.selectionKind) {
      setCounterTimeRemaining(30);
      const interval = setInterval(() => {
        setCounterTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isCounter, amTarget, inStage, G.pendingAction?.selectionKind]);

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
    // Defensive: filter out any corrupted/hidden cards
    const validCards = myHandRaw.filter((c: any) => c && (c.kind === 'flower' || c.kind === 'power'));
    const byId = new Map(validCards.map(card => [card.id, card]));
    const ordered = handOrderIds
      .map(id => byId.get(id))
      .filter((card): card is Card => !!card);
    const missing = validCards.filter(card => !handOrderIds.includes(card.id));
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

  // ── Compute cluster radius directly from garden sizes ──
  const arenaDiameter = Math.round(Math.min(effectiveW, effectiveH) * 0.84);

  const clusterRadius = useMemo(() => {
    const gardenReaches = G.players.map(p => {
      const size = gardenContentSizes[p.id];
      if (!size) return arenaDiameter * 0.25;
      return Math.max(
        Math.abs(size.minX), Math.abs(size.maxX),
        Math.abs(size.minY), Math.abs(size.maxY)
      );
    });

    const maxReach = Math.max(...gardenReaches);
    const gardenCount = Math.max(2, G.players.length);
    // Gap scales inversely with player count: 2p=220px, 3p=170px, 4p=120px, 6p=60px
    const gap = Math.max(60, 320 - gardenCount * 50);
    const requiredRadius = (maxReach + gap) / Math.sin(Math.PI / gardenCount);
    return Math.max(requiredRadius, arenaDiameter * 0.45);
  }, [gardenContentSizes, arenaDiameter, G.players]);

  // ── Compute arena layout fresh when cluster radius changes ──
  const playerKey = G.players.map(p => `${p.id}:${p.garden.sets.length}`).join('|');

  const arenaLayout = useMemo(() => {
    const layout = computeSectorLayout(
      G.players,
      { width: effectiveW, height: effectiveH },
      Math.max(0, myPlayerIndex),
      clusterRadius,
    );
    layoutCacheRef.current = layout;
    return layout;
  }, [effectiveW, effectiveH, myPlayerIndex, clusterRadius, playerKey]);

  // Spread badges horizontally so they never collapse on top of each other
  // at low zoom; they may float free from their gardens but remain readable.
  const spreadBadgePositions = useMemo(() => {
    const MIN_BADGE_SPREAD = 140;
    const sorted = [...arenaLayout].sort((a, b) => a.badgeOffsetX - b.badgeOffsetX);
    return sorted.map((layout, i, arr) => {
      const rawX = layout.badgeOffsetX * arenaZoom + arenaPan.x;
      const rawY = layout.badgeOffsetY * arenaZoom + arenaPan.y;
      const spreadX = rawX + (i - (arr.length - 1) / 2) * MIN_BADGE_SPREAD;
      return { layout, screenX: spreadX, screenY: rawY };
    });
  }, [arenaLayout, arenaZoom, arenaPan]);

  const sectorInnerR = Math.round(arenaDiameter * 0.5 * 0.15);
  const sectorOuterR = Math.round(arenaDiameter * 0.5);

  // Memoize sector geometry per garden so GardenFlowerField's React.memo isn't
  // busted by a new inline object on every parent render.
  const sectorGeometries = useMemo(() => {
    const map: Record<string, { centerAngle: number; halfAngle: number; innerR: number; outerR: number }> = {};
    for (const layout of arenaLayout) {
      map[layout.player.id] = {
        centerAngle: layout.sectorCenterAngle,
        halfAngle: (layout.sectorEndAngle - layout.sectorStartAngle) / 2,
        innerR: sectorInnerR,
        outerR: sectorOuterR,
      };
    }
    return map;
  }, [arenaLayout, sectorInnerR, sectorOuterR]);



  // ── Auto-zoom: smooth camera that frames all gardens ───────
  // Players can manually zoom/pan; after 3s of inactivity camera reverts.
  const maxFlowerCount = useMemo(() =>
    Math.max(0, ...G.players.map(p =>
      p.garden.sets.reduce((sum, s) => sum + s.flowers.length, 0)
    )),
  [G.players]);

  const targetAutoZoomRef = useRef(1);
  const targetAutoPanRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (arenaLayout.length === 0) return;

    let totalW: number;
    let totalH: number;

    // ALL gardens must have reported before we trust the bounds
    const hasActualSizes = arenaLayout.length > 0 &&
      arenaLayout.every(l => gardenContentSizes[l.player.id] != null);

    if (hasActualSizes) {
      let worldMinX = Infinity, worldMaxX = -Infinity;
      let worldMinY = Infinity, worldMaxY = -Infinity;
      for (const layout of arenaLayout) {
        const size = gardenContentSizes[layout.player.id];
        if (!size) continue;
        worldMinX = Math.min(worldMinX, layout.clusterOffsetX + size.minX);
        worldMaxX = Math.max(worldMaxX, layout.clusterOffsetX + size.maxX);
        worldMinY = Math.min(worldMinY, layout.clusterOffsetY + size.minY);
        worldMaxY = Math.max(worldMaxY, layout.clusterOffsetY + size.maxY);
      }
      const PAD = 100;
      worldMinX -= PAD;
      worldMaxX += PAD;
      worldMinY -= PAD;
      worldMaxY += PAD;
      totalW = Math.max(1, worldMaxX - worldMinX);
      totalH = Math.max(1, worldMaxY - worldMinY);
    } else {
      // Fallback: generous estimate based on cluster offsets
      let worldMinX = Infinity, worldMaxX = -Infinity;
      let worldMinY = Infinity, worldMaxY = -Infinity;
      for (const layout of arenaLayout) {
        const r = sectorOuterR + 20;
        worldMinX = Math.min(worldMinX, layout.clusterOffsetX - r);
        worldMaxX = Math.max(worldMaxX, layout.clusterOffsetX + r);
        worldMinY = Math.min(worldMinY, layout.clusterOffsetY - r);
        worldMaxY = Math.max(worldMaxY, layout.clusterOffsetY + r);
      }
      const PAD = 100;
      worldMinX -= PAD;
      worldMaxX += PAD;
      worldMinY -= PAD;
      worldMaxY += PAD;
      totalW = Math.max(1, worldMaxX - worldMinX);
      totalH = Math.max(1, worldMaxY - worldMinY);
    }

    const margin = 0.95;
    const maxZoom = 5.0; // was 3.0 — more zoom for small gardens
    const minZoom = window.innerWidth <= 640 ? 0.08 : 0.12;  // Late game: much more zoom-out

    const targetZoom = Math.max(minZoom, Math.min(maxZoom,
      (effectiveW * margin) / totalW,
      (effectiveH * margin) / totalH,
    ));
    targetAutoZoomRef.current = targetZoom;
    targetAutoPanRef.current = { x: 0, y: 0 };
  }, [arenaLayout, effectiveW, effectiveH, sectorOuterR, G.players.length, gardenContentSizes]);

  useEffect(() => {
    let raf: number;
    let running = true;
    const tick = () => {
      if (!running) return;
      let needsNextFrame = false;
      setArenaZoom(prev => {
        const t = targetAutoZoomRef.current;
        const diff = t - prev;
        if (Math.abs(diff) < 0.001) return t;
        needsNextFrame = true;
        return prev + diff * 0.06;
      });
      setClampedArenaPan(prev => {
        const t = targetAutoPanRef.current;
        const dx = t.x - prev.x;
        const dy = t.y - prev.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev; // same ref = no re-render
        needsNextFrame = true;
        return { x: prev.x + dx * 0.06, y: prev.y + dy * 0.06 };
      });
      // Keep the loop alive so it can resume when the target changes; this avoids
      // the previous bug where restarting the effect on every garden size change
      // reset the lerp progress and kept the camera stuck.
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    document.body.classList.remove('layout-compact');
    document.documentElement.classList.remove('layout-compact');
  }, []);
  const activeGardenPlayerId = targeting.hoveredTarget?.playerId || targetPlayer;
  const activeGardenSetId = targeting.hoveredTarget?.setId || targetSet;

  // Compute whether the hovered drag target is invalid for the dragged card
  const invalidDragTargetSetId = useMemo(() => {
    if (!drag.draggedCardId || !targeting.hoveredTarget?.setId) return null;
    const card = me?.hand.find(c => c.id === drag.draggedCardId);
    if (!card) return null;
    const hit = targeting.hoveredTarget;
    const moveType = moveTypeFromCard(card, hit.playerId);
    if (!moveType) return null;
    // Moves that don't require set targeting are always valid at garden level
    if (!moveRequiresTargetSet(moveType)) return null;
    const targetPlayer = G.players.find(p => p.id === hit.playerId);
    const targetSet = targetPlayer?.garden.sets.find(s => s.id === hit.setId);
    if (!targetSet) return null;
    return isValidTargetSetForMove(moveType, targetSet) ? null : hit.setId;
  // G.players changes are already reflected via targeting.hoveredTarget updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.draggedCardId, targeting.hoveredTarget, me?.hand]);

  // Compute whether the hovered drag target is VALID (for green glow feedback)
  const validDragTargetSetId = useMemo(() => {
    if (!drag.draggedCardId || !targeting.hoveredTarget?.setId) return null;
    const card = me?.hand.find(c => c.id === drag.draggedCardId);
    if (!card) return null;
    const hit = targeting.hoveredTarget;
    const moveType = moveTypeFromCard(card, hit.playerId);
    if (!moveType) return null;
    if (!moveRequiresTargetSet(moveType)) return hit.setId;
    const targetPlayer = G.players.find(p => p.id === hit.playerId);
    const targetSet = targetPlayer?.garden.sets.find(s => s.id === hit.setId);
    if (!targetSet) return null;
    return isValidTargetSetForMove(moveType, targetSet) ? hit.setId : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag.draggedCardId, targeting.hoveredTarget, me?.hand]);

  // Haptic feedback when dragging over a valid target for the first time
  const prevValidTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (validDragTargetSetId && validDragTargetSetId !== prevValidTargetRef.current) {
      hapticValidTarget();
    }
    prevValidTargetRef.current = validDragTargetSetId;
  }, [validDragTargetSetId]);
  const attackedGardenPlayerId = G.phase === 'counter' ? G.pendingAction?.targetPlayerId ?? '' : '';
  const attackedGardenSetId = G.phase === 'counter' ? G.pendingAction?.original.targetSetId ?? '' : '';
  const attackedGardenPlayer = attackedGardenPlayerId
    ? G.players.find(p => p.id === attackedGardenPlayerId) ?? null
    : null;
  const attackedGardenSet = attackedGardenPlayer && attackedGardenSetId
    ? attackedGardenPlayer.garden.sets.find(set => set.id === attackedGardenSetId) ?? null
    : null;
  const attackedSetLabel = describeGardenSet(attackedGardenSet);


  function pushLocalLogEntry(text: string) {
    const entry = {
      key: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: Date.now(),
    };
    setLocalLogEntries(prev => [...prev, entry].slice(-18));
    sendLogAsDanmaku(text);
  }

  function sendLogAsDanmaku(text: string) {
    const now = Date.now();
    const lane = assignDanmakuLane(now);
    const duration = DANMAKU_MIN_DURATION + Math.random() * (DANMAKU_MAX_DURATION - DANMAKU_MIN_DURATION);
    occupyLane(lane, now, duration);
    addDanmakuComment({
      id: `log-${now}-${lane}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      color: getWhimsicalColor(text + now),
      lane,
      duration: Math.round(duration),
      createdAt: now,
    });
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
    const targetId = activeGardenPlayerId || targetPlayer;
    if (!activeCardId || !targetId) return null;
    const layout = arenaLayout.find((l) => l.player.id === targetId);
    const arenaNode = arenaRef.current;
    if (!layout || !arenaNode) return null;
    const sourceRect = dragPreview
      ? { left: dragPreview.x, top: dragPreview.y, width: dragPreview.width, height: dragPreview.height }
      : handCardRefs.current[activeCardId]?.getBoundingClientRect();
    if (!sourceRect) return null;
    const arenaRect = arenaNode.getBoundingClientRect();
    const arenaCx = arenaRect.left + arenaRect.width / 2;
    const arenaCy = arenaRect.top + arenaRect.height / 2;
    const z = arenaZoomRef.current;
    const px = arenaPanRef.current.x;
    const py = arenaPanRef.current.y;
    return {
      x1: sourceRect.left + (sourceRect.width / 2),
      y1: sourceRect.top + (sourceRect.height / 2),
      x2: arenaCx + (layout.clusterOffsetX + px) * z,
      y2: arenaCy + (layout.clusterOffsetY + py) * z,
    };
  }, [dragPreview, activeCardId, activeGardenPlayerId, targetPlayer, arenaLayout]);

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

  async function handleKick(targetPlayerID: string) {
    if (!matchCtx) return;
    const { matchID, playerID, credentials, server } = matchCtx;
    if (!playerID || !credentials) return;
    try {
      const res = await fetch(`${server}/games/flower-game/${encodeURIComponent(matchID)}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID, targetPlayerID, credentials }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Kick failed' }));
        setError(data.error || `Kick failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kick failed');
    }
  }

  async function handleStart() {
    if (!matchCtx) return;
    const { matchID, playerID, credentials, server } = matchCtx;
    if (!playerID || !credentials) return;
    try {
      const res = await fetch(`${server}/games/flower-game/${encodeURIComponent(matchID)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID, credentials }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Start failed' }));
        setError(data.error || `Start failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Start failed');
    }
  }

  async function handleLeave() {
    const ctx = matchCtx;
    if (!ctx) {
      return;
    }
    const { matchID, playerID, credentials, server } = ctx;
    if (!playerID || !credentials) {
      ctx.onLeave?.();
      return;
    }
    try {
      const res = await fetch(`${server}/games/flower-game/${encodeURIComponent(matchID)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID, credentials }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Leave failed' }));
        setError(data.error || `Leave failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Leave failed');
    } finally {
      ctx.onLeave?.();
    }
  }

  function handleHandCardClick(cardId: string) {
    if (suppressCardClickRef.current === cardId) {
      suppressCardClickRef.current = null;
      return;
    }
    setError('');

    // Toggle off if already showing this card
    if (actionFlow.mode !== 'idle' && actionFlow.cardId === cardId) {
      resetAll();
      return;
    }

    // Switch card if already in some mode
    if (actionFlow.mode !== 'idle') {
      // If in picking-card mode, also update pickedCards so hand cards
      // work the same as the cards shown in the action panel
      if (actionFlow.mode === 'picking-card') {
        const card = me?.hand.find(c => c.id === cardId);
        const isRelevant = card && relevantCards(moveType).some(c => c.id === cardId);
        if (isRelevant) {
          const maxCards = selectionLimit(moveType);
          if (maxCards === 1) {
            setPickedCards([cardId]);
            // Auto-advance just like the action panel does
            if (moveType === 'tradePresent') {
              setActionFlow(prev => ({ ...prev, cardId, mode: 'confirming' }) as ActionFlow);
            } else {
              moveNeedsTargetPlayer(moveType)
                ? setActionFlow(prev => ({ ...prev, cardId, mode: 'picking-target' }) as ActionFlow)
                : setActionFlow(prev => ({ ...prev, cardId, mode: 'confirming' }) as ActionFlow);
            }
            return;
          } else {
            toggleCard(cardId);
            setActionFlow(prev => ({ ...prev, cardId }));
            return;
          }
        }
      }
      setActionFlow(prev => ({ ...prev, cardId }));
      return;
    }

    // Idle mode: infer move type from card and execute immediately or stage
    const card = me?.hand.find(c => c.id === cardId);
    if (!card) {
      setActionFlow({ mode: 'picking-card', cardId });
      return;
    }

    // Phase guard: only allow playing cards during action phase on your turn.
    // During draw phase, prompt the user to draw first instead of silently failing.
    if (myTurn && G.phase !== 'action') {
      if (G.phase === 'draw') {
        setError('🃏 Draw cards first before playing.');
      } else if (G.phase === 'blessing') {
        setError('👑 Resolve the Blessing first.');
      } else if (G.phase === 'counter') {
        setError('⏳ Wait for the counter window to resolve.');
      }
      return;
    }

    const inferredMove = moveTypeFromCard(card, playerID || '');
    if (inferredMove === 'plantOwn') {
      // Immediate plant — no confirmation popup
      const flowerCard = isFlower(card) ? card : null;
      const targetSet = resolvePlantTargetSetId(cardId, playerID || '', '');
      const needsColor = wildcardNeedsChosenColor(flowerCard) && !targetSet;
      const color = needsColor ? (flowerCard?.representedColor || 'red') : undefined;
      runMove(() => {
        m.plantOwn(cardId, targetSet || undefined, color);
      });
      return;
    }
    if (inferredMove) {
      stagePlayFromCard(cardId, playerID || '', '');
      return;
    }

    // Fallback for unrecognised cards
    setActionFlow({ mode: 'picking-card', cardId });
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
      'plantOwn', 'plantOpponent', 'playWindSingle', 'playWindDouble', 'playBug', 'playBee',
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

  function handleFlowerSelect(flowerId: string) {
    setSelectedFlowerIds((prev) => {
      if (prev.includes(flowerId)) {
        return prev.filter((id) => id !== flowerId);
      }
      if (prev.length >= 4) return prev; // max 4 flowers
      return [...prev, flowerId];
    });
  }

  function confirmFlowerSelection() {
    if (actionFlow.mode !== 'selecting-flowers') return;
    const targetPlayerId = actionFlow.targetPlayer;
    const target = G.players.find((p) => p.id === targetPlayerId);
    if (!target) return;

    // Group selected flowers by set
    const setIdMap = new Map<string, string[]>();
    for (const set of target.garden.sets) {
      for (const flower of set.flowers) {
        if (selectedFlowerIds.includes(flower.id)) {
          const arr = setIdMap.get(set.id) ?? [];
          arr.push(flower.id);
          setIdMap.set(set.id, arr);
        }
      }
    }

    const setIds = Array.from(setIdMap.keys());
    if (setIds.length === 0) {
      setError('Select at least one flower');
      return;
    }

    const primarySet = setIds[0];
    const extraSets = setIds.slice(1);

    // Validate all selected sets are valid targets
    for (const setId of setIds) {
      const set = target.garden.sets.find((s) => s.id === setId);
      if (!set || !isValidTargetSetForMove('playWindDouble', set)) {
        setError('Invalid flower selection');
        return;
      }
    }

    setTargetSet(primarySet);
    setWindExtraTargetSets(extraSets);

    // Derive wind cards
    const c1 = pickedCards[0];
    const c2 = moveType === 'playWindSingle'
      ? autoDoubleWindCard?.id
      : pickedCards[1];

    if (!c1) {
      setError('Missing Wind card');
      return;
    }
    if (moveType === 'playWindSingle' && !c2) {
      setError('You need 2 Wind cards for the double Wind move.');
      return;
    }

    runMoveWithAnim(
      () => m.playWindDouble(c1, c2!, targetPlayerId, primarySet, extraSets),
      { name: 'wind', phase: 'cast', targetPlayerId: targetPlayerId }
    );
    resetAll();
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
    setChosenColor('');
    setDiscardChoice('');
    setDoubleHappinessMode('');
    setError('');

    if (isFlower(card)) {
      // Flowers plant immediately — no confirmation popup
      const needsColor = wildcardNeedsChosenColor(card) && !resolvedTargetSetId;
      const color = needsColor ? ((card as FlowerCard).representedColor || 'red') : undefined;
      // Plant stage execution
      if (nextMove === 'plantOpponent') {
        runMove(() => m.plantOpponent(cardId, stagedTargetPlayerId, resolvedTargetSetId || undefined, color));
      } else {
        runMove(() => m.plantOwn(cardId, resolvedTargetSetId || undefined, color));
      }
      return;
    }

    if (nextMove === 'playBee') {
      setActionFlow({ mode: 'picking-card', cardId: card.id });
      drag.clearDrag();
      return;
    }

    if (nextMove === 'tradePresent') {
      setActionFlow({ mode: targetPlayerId ? 'picking-card' : 'picking-target', cardId: card.id, windExtraTargets: [] });
      drag.clearDrag();
      return;
    }

    if (nextMove === 'doubleHappiness') {
      setActionFlow({ mode: 'picking-target', cardId: card.id, windExtraTargets: [] });
      drag.clearDrag();
      return;
    }

    if ((nextMove === 'playWindDouble' || (nextMove === 'playWindSingle' && windAttackDoubleMode)) && !resolvedTargetSetId) {
      setActionFlow({ mode: 'selecting-flowers', cardId: card.id, targetPlayer: stagedTargetPlayerId });
      setSelectedFlowerIds([]);
      drag.clearDrag();
      return;
    }

    if (moveRequiresTargetSet(nextMove) && !resolvedTargetSetId) {
      setActionFlow({ mode: 'picking-target', cardId: card.id, windExtraTargets: [] });
      drag.clearDrag();
      return;
    }

    if (nextMove === 'doubleHappinessTake' || nextMove === 'tradeFate' || nextMove === 'letGo' || nextMove === 'playSeason' || nextMove === 'playEclipse' || nextMove === 'playGreatReset' || nextMove === 'playWindSingle' || nextMove === 'playBug' || nextMove === 'naturalDisaster') {
      setActionFlow({ mode: 'confirming', cardId: card.id });
      drag.clearDrag();
      return;
    }

    setActionFlow({ mode: 'confirming', cardId: card.id });
    drag.clearDrag();
  }

  function plantCardOntoGarden(targetPlayerId: string, targetSetId: string | '') {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.log.length]);

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

  // Reset the move-submit lock whenever the game state advances.
  // This covers valid moves; the timeout in runMove is a fallback for
  // invalid moves that don't trigger a state change.
  useEffect(() => {
    setIsSubmitting(false);
    if (submitUnlockRef.current !== null) {
      window.clearTimeout(submitUnlockRef.current);
      submitUnlockRef.current = null;
    }
  }, [ctx.currentPlayer, G.currentPlayerIndex, G.phase, G.movesRemaining, G.log.length, G.pendingAction?.selectionKind, G.readyPlayerIds.length, G.coinFlip?.revealedAt]);

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
  const winterAutoSkipFiredRef = useRef<string>('');
  useEffect(() => {
    if (!myTurn || G.phase !== 'draw' || drawPhaseSeason !== 'winter') return;
    const myPlayer = G.players.find(p => p.id === playerID);
    if (!myPlayer || !myPlayer.hand?.length) return;
    // Guard: only auto-skip once per unique (player + turn index) combination
    const skipKey = `${playerID}-${G.currentPlayerIndex}`;
    if (winterAutoSkipFiredRef.current === skipKey) return;
    winterAutoSkipFiredRef.current = skipKey;
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

  // ── Bug animation outcome detection ──────────────────────────
  // Watch for pending bug action to resolve (blocked or success).
  // We track seenPending to avoid resolving immediately before the
  // server round-trip sets G.pendingAction.
  useEffect(() => {
    const pendingMap = pendingBugRef.current;
    if (pendingMap.size === 0) return;

    const currentPending = G.pendingAction;
    const now = Date.now();
    const resolved: { id: string; flowersRemoved: boolean }[] = [];

    for (const [animId, pending] of pendingMap.entries()) {
      const isThisBugPending = currentPending?.original.type === 'play_bug'
        && currentPending.original.targetPlayerId === pending.targetPlayerId
        && currentPending.original.targetSetId === pending.targetSetId;

      if (isThisBugPending) {
        pending.seenPending = true;
        continue;
      }

      // Don't resolve until we've either seen it pending or a grace period passed
      if (!pending.seenPending && now - pending.createdAt < 800) {
        continue;
      }

      // This bug action has resolved — determine outcome
      const targetPlayer = G.players.find(p => p.id === pending.targetPlayerId);
      const targetSet = targetPlayer?.garden.sets.find(s => s.id === pending.targetSetId);
      const currentFlowerIds = targetSet?.flowers.map(f => f.id) ?? [];
      const flowersRemoved = pending.flowerIdsBefore.some(id => !currentFlowerIds.includes(id));
      resolved.push({ id: animId, flowersRemoved });
    }

    if (resolved.length === 0) return;

    // Update discard pile position in case it moved
    const discardEl = document.querySelector('.discard-pile') as HTMLElement | null;
    const discardRect = discardEl?.getBoundingClientRect();
    const toX = discardRect ? discardRect.left + discardRect.width / 2 : window.innerWidth / 2;
    const toY = discardRect ? discardRect.top + discardRect.height / 2 : window.innerHeight / 2;

    setBugAnimations(prev => prev.map(a => {
      const outcome = resolved.find(r => r.id === a.id);
      if (!outcome) return a;
      return {
        ...a,
        phase: outcome.flowersRemoved ? 'success' : 'blocked',
        phaseStartTime: 0,
        toX,
        toY,
      };
    }));

    for (const r of resolved) {
      pendingMap.delete(r.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.pendingAction]);

  // ── Auto-transition bug landing → idle ─────────────────────
  useEffect(() => {
    const landingAnims = bugAnimations.filter(a => a.phase === 'landing');
    if (landingAnims.length === 0) return;

    const timers = landingAnims.map(a => {
      const elapsed = a.phaseStartTime === 0 ? 0 : Date.now() - a.phaseStartTime;
      const remaining = Math.max(0, 700 - elapsed);
      return window.setTimeout(() => {
        setBugAnimations(prev => prev.map(b =>
          b.id === a.id && b.phase === 'landing'
            ? { ...b, phase: 'idle' as const, phaseStartTime: 0 }
            : b
        ));
      }, remaining + 50);
    });

    return () => timers.forEach(window.clearTimeout);
  }, [bugAnimations]);

  // ── Natural Disaster animation outcome detection ─────────────
  // Watch for pending natural disaster action to resolve (blocked or success).
  useEffect(() => {
    const pendingMap = pendingNdRef.current;
    if (pendingMap.size === 0) return;

    const currentPending = G.pendingAction;
    const now = Date.now();
    const resolved: { id: string; setDestroyed: boolean }[] = [];

    for (const [animId, pending] of pendingMap.entries()) {
      const isThisNdPending = currentPending?.original.type === 'play_natural_disaster'
        && currentPending.original.targetPlayerId === pending.targetPlayerId
        && currentPending.original.targetSetId === pending.targetSetId;

      if (isThisNdPending) {
        pending.seenPending = true;
        continue;
      }

      // Don't resolve until we've either seen it pending or a grace period passed
      if (!pending.seenPending && now - pending.createdAt < 800) {
        continue;
      }

      // This natural disaster action has resolved — determine outcome
      const targetPlayer = G.players.find(p => p.id === pending.targetPlayerId);
      const targetSet = targetPlayer?.garden.sets.find(s => s.id === pending.targetSetId);
      const setDestroyed = !targetSet; // set is gone = success, set still exists = blocked
      resolved.push({ id: animId, setDestroyed });
    }

    if (resolved.length === 0) return;

    setNdAnimations(prev => prev.map(a => {
      const outcome = resolved.find(r => r.id === a.id);
      if (!outcome) return a;
      return {
        ...a,
        phase: outcome.setDestroyed ? 'success' : 'blocked',
        phaseStartTime: 0,
      };
    }));

    for (const r of resolved) {
      pendingMap.delete(r.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.pendingAction]);

  // ── Auto-transition natural disaster landing → idle ──────────
  useEffect(() => {
    const landingAnims = ndAnimations.filter(a => a.phase === 'landing');
    if (landingAnims.length === 0) return;

    const timers = landingAnims.map(a => {
      const elapsed = a.phaseStartTime === 0 ? 0 : Date.now() - a.phaseStartTime;
      const remaining = Math.max(0, 600 - elapsed);
      return window.setTimeout(() => {
        setNdAnimations(prev => prev.map(b =>
          b.id === a.id && b.phase === 'landing'
            ? { ...b, phase: 'idle' as const, phaseStartTime: 0 }
            : b
        ));
      }, remaining + 50);
    });

    return () => timers.forEach(window.clearTimeout);
  }, [ndAnimations]);

  // ── Auto-transition bee phases ─────────────────────────────
  useEffect(() => {
    const timers: number[] = [];
    for (const a of beeAnimations) {
      if (a.phase === 'complete') continue;
      const duration =
        a.phase === 'emerge' ? 400 :
        a.phase === 'spiral' ? 1600 :
        a.phase === 'plant' ? 600 :
        a.phase === 'flyOff' ? 700 : 500;
      const elapsed = a.phaseStartTime === 0 ? 0 : Date.now() - a.phaseStartTime;
      const remaining = Math.max(0, duration - elapsed);
      const nextPhase: BeeAnimation['phase'] =
        a.phase === 'emerge' ? 'spiral' :
        a.phase === 'spiral' ? 'plant' :
        a.phase === 'plant' ? 'flyOff' : 'complete';
      timers.push(window.setTimeout(() => {
        setBeeAnimations(prev => prev.map(b =>
          b.id === a.id && b.phase === a.phase
            ? { ...b, phase: nextPhase, phaseStartTime: Date.now() }
            : b
        ));
      }, remaining + 30));
    }
    return () => timers.forEach(window.clearTimeout);
  }, [beeAnimations]);

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

      const flights: import('./WindPathCanvas').WindFlight[] = [];
      for (const [cardId, fromPlayerId] of removed.entries()) {
        const toPlayerId = added.get(cardId);
        if (!toPlayerId) continue;
        const flower = G.players
          .flatMap(player => player.garden.sets.flatMap(set => set.flowers))
          .find(f => f.id === cardId);
        const fromEl = gardenRefs.current[fromPlayerId];
        const toEl = gardenRefs.current[toPlayerId];
        if (!flower || !fromEl || !toEl) continue;

        const computeGardenScreenCenter = (pid: string) => {
          const layout = layoutCacheRef.current.find((l) => l.player.id === pid);
          const arenaNode = arenaRef.current;
          if (!layout || !arenaNode) return null;
          const arenaRect = arenaNode.getBoundingClientRect();
          const arenaCx = arenaRect.left + arenaRect.width / 2;
          const arenaCy = arenaRect.top + arenaRect.height / 2;
          const z = arenaZoomRef.current;
          const px = arenaPanRef.current.x;
          const py = arenaPanRef.current.y;
          return {
            x: arenaCx + (layout.clusterOffsetX + px) * z,
            y: arenaCy + (layout.clusterOffsetY + py) * z,
          };
        };

        // Exact flower position in source garden
        const fromFlowerEl = fromEl.querySelector(`[data-flower-id="${cardId}"]`) as HTMLElement | null;
        let fromX = 0, fromY = 0;
        if (fromFlowerEl) {
          const rect = fromFlowerEl.getBoundingClientRect();
          fromX = rect.left + rect.width / 2;
          fromY = rect.top + rect.height / 2;
        } else {
          const pos = computeGardenScreenCenter(fromPlayerId);
          fromX = pos?.x ?? 0;
          fromY = pos?.y ?? 0;
        }

        // Destination: matching set center if available, else garden center
        const destColor = flower.representedColor ?? flower.color;
        const toPlayer = G.players.find(p => p.id === toPlayerId);
        const destMatchSet = toPlayer?.garden.sets.find(s => !s.isDivine && gardenSetColor(s) === destColor);
        let toX = 0, toY = 0;
        if (destMatchSet) {
          const destSetEl = toEl.querySelector(`[data-set-id="${destMatchSet.id}"]`) as HTMLElement | null;
          if (destSetEl) {
            const rect = destSetEl.getBoundingClientRect();
            toX = rect.left + rect.width / 2;
            toY = rect.top + rect.height / 2;
          } else {
            const pos = computeGardenScreenCenter(toPlayerId);
            toX = pos?.x ?? 0;
            toY = pos?.y ?? 0;
          }
        } else {
          const pos = computeGardenScreenCenter(toPlayerId);
          toX = pos?.x ?? 0;
          toY = pos?.y ?? 0;
        }

        flights.push({
          id: `${cardId}-${G.log.length}`,
          flowerId: flower.id,
          color: flower.color,
          size: 48,
          fromX,
          fromY,
          toX,
          toY,
          startTime: performance.now() + flights.length * 120,
          duration: 3600,
        });
      }

      if (flights.length > 0) {
        setWindFlights(prev => [...prev, ...flights].slice(-30));
        // Track which flowers are landing via wind for landing animation
        const newLanded: Record<string, Set<string>> = {};
        for (const f of flights) {
          const toPlayerId = added.get(f.flowerId);
          if (!toPlayerId) continue;
          if (!newLanded[toPlayerId]) newLanded[toPlayerId] = new Set();
          newLanded[toPlayerId].add(f.flowerId);
        }
        setWindLandedFlowerIds(prev => {
          const merged: Record<string, Set<string>> = {};
          for (const pid of new Set([...Object.keys(prev), ...Object.keys(newLanded)])) {
            const set = new Set([...(prev[pid] || []), ...(newLanded[pid] || [])]);
            if (set.size > 0) merged[pid] = set;
          }
          return merged;
        });
        // Clear landed tracking after landing animation completes
        window.setTimeout(() => {
          setWindLandedFlowerIds(prev => {
            const next: Record<string, Set<string>> = {};
            for (const [pid, set] of Object.entries(prev)) {
              const remaining = new Set([...set].filter(id => !newLanded[pid]?.has(id)));
              if (remaining.size > 0) next[pid] = remaining;
            }
            return next;
          });
        }, 5000);
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
      // Lightning flash
      setSceneFx('disaster');
      window.setTimeout(() => setSceneFx('none'), 1500);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.log.length]);

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

  // ── Log unread tracking + global animation detection ──
  const prevLogLenRef = useRef(G.log.length);
  const prevLogAnimRef = useRef<Set<string>>(new Set());
  const logDanmakuPrimedRef = useRef(false);

  /** Detect power-card plays from log entries (for OTHER players' animations) */
  function detectPowerCardFromLog(entry: string): { name: PowerCardName; phase: 'cast' } | null {
    if (entry.includes('with Wind')) return { name: 'wind', phase: 'cast' };
    if (entry.includes('used Bug on')) return { name: 'bug', phase: 'cast' };
    if (entry.includes('used Bee')) return { name: 'bee', phase: 'cast' };
    if (entry.includes('used Double Happiness')) return { name: 'double_happiness', phase: 'cast' };
    if (entry.includes('(Trade Present)')) return { name: 'trade_present', phase: 'cast' };
    if (entry.includes('(Trade Fate)')) return { name: 'trade_fate', phase: 'cast' };
    if (entry.includes('played Let Go')) return { name: 'let_go', phase: 'cast' };
    if (entry.includes('played Spring')) return { name: 'spring', phase: 'cast' };
    if (entry.includes('played Summer')) return { name: 'summer', phase: 'cast' };
    if (entry.includes('played Autumn')) return { name: 'autumn', phase: 'cast' };
    if (entry.includes('played Winter')) return { name: 'winter', phase: 'cast' };
    if (entry.includes('unleashed Natural Disaster')) return { name: 'natural_disaster', phase: 'cast' };
    if (entry.includes('played Eclipse')) return { name: 'eclipse', phase: 'cast' };
    if (entry.includes('triggered Great Reset')) return { name: 'great_reset', phase: 'cast' };
    return null;
  }

  useEffect(() => {
    if (!logDanmakuPrimedRef.current) {
      logDanmakuPrimedRef.current = true;
      prevLogLenRef.current = G.log.length;
      return;
    }
    if (G.log.length > prevLogLenRef.current) {
      const newEntries = G.log.slice(prevLogLenRef.current);
      // Send new log entries as danmaku — cap at 3 per batch to avoid floods
      const entriesToSend = newEntries.slice(-3);
      for (let i = 0; i < entriesToSend.length; i++) {
        const entry = entriesToSend[i];
        window.setTimeout(() => {
          sendLogAsDanmaku(displayLogEntry(entry));
        }, i * 200);
      }
      // Check for OTHER players' power card plays to show animations
      for (let i = 0; i < newEntries.length; i++) {
        const entry = newEntries[i];
        const anim = detectPowerCardFromLog(entry);
        if (anim) {
          // Don't re-show if we already saw this exact entry
          const key = `${G.log.length - newEntries.length + i}-${entry}`;
          if (!prevLogAnimRef.current.has(key)) {
            prevLogAnimRef.current.add(key);
            // Limit set size
            if (prevLogAnimRef.current.size > 50) {
              const iter = prevLogAnimRef.current.values();
              prevLogAnimRef.current.delete(iter.next().value);
            }
            setActiveAnimation(anim);
          }
        }
      }
    }
    prevLogLenRef.current = G.log.length;
  }, [G.log.length]);

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

  function runMove(fn: () => unknown) {
    if (isSubmitting) {
      console.log('[RUNMOVE] Blocked — already submitting');
      return;
    }
    setIsSubmitting(true);
    try {
      fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Move failed';
      addToast(msg, 'error', 4000);
      setIsSubmitting(false);
      return;
    }
    if (submitUnlockRef.current !== null) {
      window.clearTimeout(submitUnlockRef.current);
    }
    // Fallback: if no state change was detected (e.g. invalid move),
    // clear the lock after a short debounce so the player isn't stuck.
    submitUnlockRef.current = window.setTimeout(() => {
      setIsSubmitting(false);
      submitUnlockRef.current = null;
    }, 600);
  }

  const handleDrawClick = useCallback(() => {
    if (drawFlyAnim) return;
    const startIdx = myHand.length;
    setDrawFlyAnim({ count: drawCount, startIndex: startIdx });
    runMove(() => m.pass());
    const totalDuration = drawCount * 300 + 1500;
    const timer = window.setTimeout(() => setDrawFlyAnim(null), totalDuration);
    return () => window.clearTimeout(timer);
  }, [drawFlyAnim, myHand.length, drawCount, runMove]);

  /** Trigger a power-card animation overlay before executing the move */
  function runMoveWithAnim(fn: () => void, anim: { name: PowerCardName; phase: 'cast' | 'success' | 'win'; targetPlayerId?: string }) {
    setActiveAnimation(anim);
    runMove(fn);
  }

  // ── Direct play (no popup) for self-targeting cards ─────────
  function playDirect(type: string) {
    const cards = relevantCards(type);
    if (cards.length === 0) { setError('No valid card'); return; }
    if (cards.length === 1) {
      const c = cards[0];
      if (type === 'letGo') runMoveWithAnim(() => m.letGo(c.id), { name: 'let_go', phase: 'cast' });
      else if (type === 'playSeason') {
        const seasonName = (!isFlower(c) && c.kind === 'power') ? c.name : 'spring';
        runMoveWithAnim(() => m.playSeason(c.id), { name: seasonName as PowerCardName, phase: 'cast' });
      }
      else if (type === 'playEclipse') runMoveWithAnim(() => m.playEclipse(c.id), { name: 'eclipse', phase: 'cast' });
      else if (type === 'playGreatReset') runMoveWithAnim(() => m.playGreatReset(c.id), { name: 'great_reset', phase: 'cast' });
      return;
    }
    // Multiple cards — fall back to pick-card step
    setMoveType(type);
    setActionFlow(prev => ({ ...prev, mode: 'picking-card' }) as ActionFlow);
  }
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
    if (actionFlow.mode !== 'picking-target' || effectiveMoveType !== 'playWindDouble' || !targetPlayer) return;
    const sheet = actionSheetRef.current;
    if (!sheet) return;
    const raf = window.requestAnimationFrame(() => {
      sheet.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [actionFlow.mode, effectiveMoveType, targetPlayer]);

  function dispatch() {
    // Guard against double-fire (React StrictMode, rapid clicks)
    if (dispatchGuardRef.current) return;
    dispatchGuardRef.current = true;
    window.setTimeout(() => { dispatchGuardRef.current = false; }, 300);

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
    const plantTargetSet = resolvedTargetSet || undefined;

      switch (effectiveMoveType) {
      case 'plantOwn':
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        {
          const pos = getGardenSetCenter(gardenRefs, gardenSetRefs, playerID || '', plantTargetSet || '', arenaLayout, arenaRef, arenaZoom, arenaPan.x, arenaPan.y);
          const color = BURST_COLOR[chosenColor || selectedPrimaryFlower?.color || 'green'] || '#5aff7a';
          if (pos) {
            setPlantBursts(prev => [...prev, { id: `plant-${Date.now()}`, x: pos.x, y: pos.y, color }]);
          }
        }
        runMove(() => m.plantOwn(c1, plantTargetSet, chosenColor || undefined));
        break;
      case 'plantOpponent':
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        {
          const pos = getGardenSetCenter(gardenRefs, gardenSetRefs, targetPlayer, plantTargetSet || '', arenaLayout, arenaRef, arenaZoom, arenaPan.x, arenaPan.y);
          const color = BURST_COLOR[chosenColor || selectedPrimaryFlower?.color || 'green'] || '#5aff7a';
          if (pos) {
            setPlantBursts(prev => [...prev, { id: `plant-${Date.now()}`, x: pos.x, y: pos.y, color }]);
          }
        }
        runMove(() => m.plantOpponent(c1, targetPlayer, plantTargetSet, chosenColor || undefined));
        break;
      case 'playWindSingle':
        setWindDeparting({ playerId: targetPlayer, setId: targetSet });
        window.setTimeout(() => setWindDeparting(null), 300);
        setGrassWindGust(1);
        runMoveWithAnim(() => m.playWindSingle(c1, targetPlayer, targetSet), { name: 'wind', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      case 'playWindDouble':
        if (moveType === 'playWindSingle') {
          if (!autoDoubleWindCard) { setError('You need 2 Wind cards for the double Wind move.'); return; }
          setWindDeparting({ playerId: targetPlayer, setId: targetSet });
          window.setTimeout(() => setWindDeparting(null), 300);
          setGrassWindGust(1);
          runMoveWithAnim(() => m.playWindDouble(c1, autoDoubleWindCard.id, targetPlayer, targetSet, windExtraTargetSets), { name: 'wind', phase: 'cast', targetPlayerId: targetPlayer });
          break;
        }
        if (!c2) { setError('Select 2 Wind cards'); return; }
        setWindDeparting({ playerId: targetPlayer, setId: targetSet });
        window.setTimeout(() => setWindDeparting(null), 300);
        setGrassWindGust(1);
        runMoveWithAnim(() => m.playWindDouble(c1, c2, targetPlayer, targetSet, windExtraTargetSets), { name: 'wind', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      case 'playBug': {
        // Start bug landing animation on a targeted flower
        const targetPlayerObj = G.players.find(p => p.id === targetPlayer);
        const targetSetObj = targetPlayerObj?.garden.sets.find(s => s.id === targetSet);
        const isAutumn = G.season === 'autumn';
        // Collect all valid flowers from the target player's garden
        const allValidSets = targetPlayerObj?.garden.sets.filter(s => !s.isDivine && !s.isToken) ?? [];
        const allFlowers = allValidSets.flatMap(s => s.flowers);
        // Pick 2 flowers of different colors for autumn bug if possible
        let victimFlowers: typeof allFlowers;
        if (isAutumn && allFlowers.length >= 2) {
          const first = allFlowers[0];
          const differentColor = allFlowers.find(f => f.color !== first.color);
          victimFlowers = differentColor ? [first, differentColor] : allFlowers.slice(0, 2);
        } else {
          victimFlowers = allFlowers.slice(0, 1);
        }
        const primaryFlower = victimFlowers[0];
        const secondFlower = victimFlowers[1];
        const flowerColor = primaryFlower?.color ?? 'red';
        const flowerIdsBefore = targetSetObj?.flowers.map(f => f.id) ?? [];

        // Find the EXACT flower DOM position(s), fall back to set center
        const targetEl = gardenRefs.current[targetPlayer];
        let fromX = 0, fromY = 0;
        if (targetEl && primaryFlower) {
          const positions: { x: number; y: number }[] = [];
          for (const f of victimFlowers) {
            const flowerEl = targetEl.querySelector(`[data-flower-id="${f.id}"]`) as HTMLElement | null;
            if (flowerEl) {
              const rect = flowerEl.getBoundingClientRect();
              positions.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }
          }
          if (positions.length > 0) {
            fromX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
            fromY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
          } else {
            const setEl = targetEl.querySelector(`[data-set-id="${targetSet}"]`) as HTMLElement | null;
            const rect = setEl?.getBoundingClientRect();
            fromX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            fromY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
          }
        } else {
          fromX = window.innerWidth / 2;
          fromY = window.innerHeight / 2;
        }

        // Find discard pile position (center of arena)
        const discardEl = document.querySelector('.discard-pile') as HTMLElement | null;
        const discardRect = discardEl?.getBoundingClientRect();
        const toX = discardRect ? discardRect.left + discardRect.width / 2 : window.innerWidth / 2;
        const toY = discardRect ? discardRect.top + discardRect.height / 2 : window.innerHeight / 2;

        const animId = `bug-${Date.now()}`;
        pendingBugRef.current.set(animId, {
          targetPlayerId: targetPlayer,
          targetSetId: targetSet,
          flowerIdsBefore,
          createdAt: Date.now(),
          seenPending: false,
        });
        setBugAnimations(prev => [...prev, {
          id: animId,
          phase: 'landing' as const,
          fromX,
          fromY,
          toX,
          toY,
          flowerColor,
          flowerId: primaryFlower?.id,
          secondFlowerColor: secondFlower?.color,
          secondFlowerId: secondFlower?.id,
          isAutumn,
          phaseStartTime: 0,
          startTime: Date.now(),
        }].slice(-20));
        runMoveWithAnim(() => m.playBug(c1, targetPlayer, targetSet), { name: 'bug', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      }
      case 'playBee': {
        if (triggerLocalPlantSfx) {
          unlockMoveSfx();
          playMoveSfx();
          pendingLocalPlantSoundLogSkipsRef.current += 1;
        }
        {
          const beeTargetId = targetPlayer || playerID || '';
          const pos = getGardenSetCenter(gardenRefs, gardenSetRefs, beeTargetId, resolvedTargetSet || '', arenaLayout, arenaRef, arenaZoom, arenaPan.x, arenaPan.y);
          const discardFlowerCard = G.discardPile.find(c => c.id === discardChoice) as FlowerCard | undefined;
          const color = BURST_COLOR[discardFlowerCard?.color || chosenColor || 'green'] || '#5aff7a';
          if (pos) {
            setPlantBursts(prev => [...prev, { id: `plant-${Date.now()}`, x: pos.x, y: pos.y, color }]);
          }
        }

        // Bee animation: discard pile → target garden set
        const discardEl2 = document.querySelector('.discard-pile') as HTMLElement | null;
        const discardRect2 = discardEl2?.getBoundingClientRect();
        const beeFromX = discardRect2 ? discardRect2.left + discardRect2.width / 2 : window.innerWidth / 2;
        const beeFromY = discardRect2 ? discardRect2.top + discardRect2.height / 2 : window.innerHeight / 2;

        let beeToX = window.innerWidth / 2;
        let beeToY = window.innerHeight / 2;
        if (resolvedTargetSet) {
          const beeTargetId = targetPlayer || playerID || '';
          const setPos = getGardenSetCenter(gardenRefs, gardenSetRefs, beeTargetId, resolvedTargetSet, arenaLayout, arenaRef, arenaZoom, arenaPan.x, arenaPan.y);
          if (setPos) {
            beeToX = setPos.x;
            beeToY = setPos.y;
          }
        }

        const discardFlowerCard = G.discardPile.find(c => c.id === discardChoice) as FlowerCard | undefined;
        const beeFlowerColor = discardFlowerCard?.color ?? 'red';

        const beeAnimId = `bee-${Date.now()}`;
        setBeeAnimations(prev => [...prev, {
          id: beeAnimId,
          phase: 'emerge' as const,
          fromX: beeFromX,
          fromY: beeFromY,
          toX: beeToX,
          toY: beeToY,
          flowerColor: beeFlowerColor,
          phaseStartTime: 0,
          startTime: Date.now(),
        }].slice(-20));

        runMoveWithAnim(() => m.playBee(c1, discardChoice, targetPlayer || playerID!, resolvedTargetSet, chosenColor || undefined), { name: 'bee', phase: 'cast', targetPlayerId: targetPlayer || playerID! });
        break;
      }
      case 'doubleHappinessTake': {
        const dhCard = pickedHandCards.find(card => isPower(card, 'double_happiness'));
        if (!dhCard) { setError('Select the Double Happiness card'); return; }
        runMoveWithAnim(() => m.doubleHappinessTake(dhCard.id, targetPlayer), { name: 'double_happiness', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      }
      case 'doubleHappinessGive': {
        const dhCard = pickedHandCards[0];
        const giveIds = pickedHandCards.slice(1).map(card => card.id);
        if (!dhCard || !isPower(dhCard, 'double_happiness') || giveIds.length !== 2) { setError('Select Double Happiness + 2 cards to give'); return; }
        runMoveWithAnim(() => m.doubleHappinessGive(dhCard.id, targetPlayer, giveIds[0], giveIds[1]), { name: 'double_happiness', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      }
      case 'tradePresent': {
        const tradeCard = selectedTradePresentCard;
        const offeredCard = selectedTradePresentOfferCard;
        if (!tradeCard || !offeredCard) { setError('Select Trade Present + 1 card to offer'); return; }
        runMoveWithAnim(() => m.tradePresent(tradeCard.id, targetPlayer, offeredCard.id), { name: 'trade_present', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      }
      case 'tradeFate':
        runMoveWithAnim(() => m.tradeFate(c1, targetPlayer), { name: 'trade_fate', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      case 'letGo':
        runMoveWithAnim(() => m.letGo(c1), { name: 'let_go', phase: 'cast' });
        break;
      case 'playSeason': {
        const firstCard = selectedCards[0];
        const seasonName = (firstCard && !isFlower(firstCard) && firstCard.kind === 'power') ? firstCard.name : 'spring';
        runMoveWithAnim(() => m.playSeason(c1), { name: seasonName as PowerCardName, phase: 'cast' });
        break;
      }
      case 'naturalDisaster': {
        // Create per-set natural disaster animation
        const ndTargetEl2 = gardenRefs.current[targetPlayer];
        let ndTargetX2 = window.innerWidth / 2;
        let ndTargetY2 = window.innerHeight / 2;
        if (ndTargetEl2 && targetSet) {
          const setEl = ndTargetEl2.querySelector(`[data-set-id="${targetSet}"]`) as HTMLElement | null;
          if (setEl) {
            const rect = setEl.getBoundingClientRect();
            ndTargetX2 = rect.left + rect.width / 2;
            ndTargetY2 = rect.top + rect.height / 2;
          }
        }
        const ndAnimId2 = `nd-${Date.now()}`;
        pendingNdRef.current.set(ndAnimId2, {
          targetPlayerId: targetPlayer,
          targetSetId: targetSet,
          createdAt: Date.now(),
          seenPending: false,
        });
        setNdAnimations(prev => [...prev, {
          id: ndAnimId2,
          phase: 'landing' as const,
          targetX: ndTargetX2,
          targetY: ndTargetY2,
          targetSetId: targetSet,
          targetPlayerId: targetPlayer,
          phaseStartTime: 0,
          startTime: Date.now(),
        }].slice(-20));
        runMoveWithAnim(() => m.naturalDisaster(c1, targetPlayer, targetSet), { name: 'natural_disaster', phase: 'cast', targetPlayerId: targetPlayer });
        break;
      }
      case 'playEclipse':
        runMoveWithAnim(() => m.playEclipse(c1), { name: 'eclipse', phase: 'cast' });
        break;
      case 'playGreatReset':
        runMoveWithAnim(() => m.playGreatReset(c1), { name: 'great_reset', phase: 'cast' });
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
        <p style={{ color: '#aaa', fontSize: 39, marginBottom: 6 }}>{prompt}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHOOSABLE_FLOWER_COLORS.map(col => (
            <button
              key={col}
              style={btn(chosenColor === col ? '#4ecca3' : '#333', chosenColor === col ? '#000' : '#fff')}
              onClick={() => setChosenColor(col)}
            >
              <span className="inline-card-label">
                {flowerArt(col)
                  ? <img src={flowerArt(col)} alt={col} className="inline-flower-icon" draggable={false} />
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

  function renderActionPanel() {
    if (isCounter && amTarget && inStage) {
      const pa = G.pendingAction;
      if (!pa) return null;
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
            <p style={{ color: '#ccc', fontSize: 39, marginBottom: 12 }}>
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
                  <div style={{ color: '#e6c84a', fontSize: 33, fontWeight: 800, marginBottom: 4 }}>
                    Offered card
                  </div>
                  <div style={{ color: '#f4f1ff', fontSize: 39 }}>
                    You will receive <InlineCardLabel card={offeredTradeCard} /> if you choose a card to trade.
                  </div>
                </div>
              </div>
            )}
            {pa.original.targetSetId && (
              <p style={{ color: '#ffcc80', fontSize: 36, marginBottom: 10 }}>
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
        <CounterWindow
          isVisible={true}
          pendingAction={pa}
          attackedGardenSet={attackedGardenSet}
          myHand={myHand}
          timeRemaining={counterTimeRemaining}
          timeLimit={30}
          onAllow={() => runMove(() => m.allowAction())}
          onCounterWind={(count) => defendWithWind(count)}
          onCounterDivine={(cardId) => runMove(() => m.counterDivine(cardId))}
        />
      );
    }

    if (isCounter) {
      const tname = nameOf(G.players.find(p => p.id === G.pendingAction?.targetPlayerId));
      return (
        <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 12, color: '#888' }}>
          ⏳ Waiting for <b style={{ color: '#fff' }}>{tname}</b> to respond to your play…
          {G.pendingAction?.original.targetSetId && (
            <div style={{ color: '#ffcc80', fontSize: 36, marginTop: 8 }}>
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
        // Coin is currently animating — don't render the tap UI underneath
        if (G.coinFlip) return null;
        // Pre-flip tap trigger is rendered outside the action sheet
        // (see JSX below) so it isn't clipped by the sheet's overflow.
        return null;
      }

      const bs = G.blessingState;
      return (
        <BlessingPanel
          blessingState={bs}
          picked={blessingPicked}
          arranged={blessingArranged}
          onSetPicked={setBlessingPicked}
          onSetArranged={setBlessingArranged}
          onReset={resetBlessing}
          runMove={runMove}
          pickLimit={((G.drawPhaseSeason ?? G.season) === 'summer' ? 3 : 2)}
          onBlessingCommit={(count) => {
            setDrawFlyAnim({ count, startIndex: myHand.length });
            window.setTimeout(() => setDrawFlyAnim(null), count * 300 + 1500);
          }}
          moves={m}
        />
      );
    }

    if (G.phase === 'draw') {
      return (
        <button style={{ ...btn('#4ecca3', '#1a1a2e'), marginTop: 12, fontSize: 45, padding: '12px 28px' }}
          onClick={() => runMove(() => m.pass())}>
          🃏 Draw Cards
        </button>
      );
    }

    if (G.phase !== 'action') return null;

    const endTurnBtn = (
      <button
        className="v2-end-turn-btn"
        onClick={() => { resetAll(); runMove(() => m.pass()); }}
        title="End your turn"
      >
        ⏭ End Turn
      </button>
    );

    if (actionFlow.mode === 'idle') {
      const hand = me?.hand ?? [];
      const has = (name: string) => hand.some(c => isPower(c, name));
      const hasFlower = hand.some(isFlower);
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: '#aaa', fontSize: 39, marginBottom: 6 }}>
            Moves left: <b style={{ color: '#4ecca3' }}>{G.movesRemaining}</b>
            {G.season && <span style={{ marginLeft: 12, color: '#ffcc80' }}>
              Season: {G.season}
            </span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
            {hasFlower && <button style={btn()} onClick={() => { setMoveType('plantOwn'); setActionFlow({ mode: 'picking-card' }); }}>🌱 Plant (own)</button>}
            {hasFlower && opponents.length > 0 && <button style={btn()} onClick={() => { setMoveType('plantOpponent'); setActionFlow({ mode: 'picking-card' }); }}>🌿 Plant (opponent)</button>}
            {has('wind') && <button style={btn()} onClick={() => { setMoveType('playWindSingle'); setActionFlow({ mode: 'picking-card' }); }}>💨 Wind ×1</button>}
            {has('bug') && <button style={btn()} onClick={() => { setMoveType('playBug'); setActionFlow({ mode: 'picking-card' }); }}>🐛 Bug</button>}
            {has('bee') && <button style={btn()} onClick={() => { setMoveType('playBee'); setActionFlow({ mode: 'picking-card' }); }}>🐝 Bee</button>}
            {has('double_happiness') && <button style={btn()} onClick={() => { setMoveType('doubleHappiness'); setActionFlow({ mode: 'picking-card' }); }}>🎉 Double Happiness</button>}
            {has('trade_present') && <button style={btn()} onClick={() => beginTradePresentFlow()}>🎁 Trade Present</button>}
            {has('trade_fate') && <button style={btn()} onClick={() => { setMoveType('tradeFate'); setActionFlow({ mode: 'picking-card' }); }}>🔀 Trade Fate</button>}
            {has('let_go') && <button style={btn()} onClick={() => playDirect('letGo')}>✋ Let Go</button>}
            {['spring','summer','autumn','winter'].some(s => has(s)) && (
              <button style={btn()} onClick={() => playDirect('playSeason')}>🌸 Season</button>
            )}
            {has('natural_disaster') && hasNaturalDisasterTarget && <button style={btn()} onClick={() => { setMoveType('naturalDisaster'); setActionFlow({ mode: 'picking-card' }); }}>🌪️ Nat. Disaster</button>}
            {has('eclipse') && <button style={btn()} onClick={() => playDirect('playEclipse')}>🌑 Eclipse</button>}
            {has('great_reset') && <button style={btn()} onClick={() => playDirect('playGreatReset')}>♻️ Great Reset</button>}
            {G.season === 'autumn' && hasFlower && (
              <button style={btn('#8b4513')} onClick={() => { setMoveType('discardFlower'); setActionFlow({ mode: 'picking-card' }); }}>🍂 Discard Flower</button>
            )}
            <button style={btn('#333')} onClick={() => runMove(() => m.pass())}>⏩ Pass Turn</button>
          </div>
        </div>
      );
    }

    if (actionFlow.mode === 'picking-card') {
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
            {endTurnBtn}
            <button style={btn('#333')} onClick={resetAll}>✕ Cancel</button>
          </div>
          <div style={{ background: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>What this move does</div>
            <p style={{ color: '#cbd5ff', fontSize: 39, margin: '0 0 8px 0' }}>{moveInfo.summary}</p>
            <div style={{ color: '#9fb0ff', fontSize: 36, marginBottom: 6 }}>What you still need to do</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#b8c1ec', fontSize: 36, lineHeight: 1.5 }}>
              {moveInfo.steps.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
          {moveType === 'tradePresent' && selectedTradePresentCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Trade setup</div>
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.6 }}>
                Target:{' '}
                <b style={{ color: '#fff' }}>
                  {selectedTargetPlayer ? nameOf(selectedTargetPlayer) : 'not chosen yet'}
                </b>
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.6 }}>
                Exchange card:{' '}
                <b style={{ color: '#fff' }}><InlineCardLabel card={selectedTradePresentCard} /></b>
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.6 }}>
                Your offer:{' '}
                <b style={{ color: '#fff' }}>
                  {selectedTradePresentOfferCard ? <InlineCardLabel card={selectedTradePresentOfferCard} /> : 'pick 1 card below'}
                </b>
              </div>
            </div>
          )}
          <p style={{ color: '#aaa', fontSize: 39, marginBottom: 10 }}>{helperText}</p>
          {(moveType === 'doubleHappiness' || moveType === 'doubleHappinessTake' || moveType === 'tradePresent') && (
            <p style={{ color: '#888', fontSize: 36, marginTop: -4, marginBottom: 10 }}>
              {moveType === 'tradePresent'
                ? 'After you confirm, the target player will choose their own card.'
                : 'If you use Take 2, the target player will choose which card(s) they give you after you confirm.'}
            </p>
          )}
          {moveType === 'tradePresent' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 8 }}>
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
                <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 8 }}>
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
            <p style={{ color: '#e94560', fontSize: 39 }}>No matching cards in hand.</p>
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
                  <div key={card.id} style={{ color: '#cbd5ff', fontSize: 39, lineHeight: 1.4 }}>
                    <b><InlineCardLabel card={card} /></b>
                    <div style={{ color: '#9fb0ff', fontSize: 36 }}>{cardDetail(card)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {moveType === 'playBee' && pickedCards.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ color: '#aaa', fontSize: 39, marginBottom: 6 }}>Choose a flower from the discard pile:</p>
              {beeDiscardFlowers.length === 0 ? (
                <p style={{ color: '#e94560', fontSize: 39 }}>No eligible flower cards in the discard pile.</p>
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
                  setActionFlow(prev => ({ ...prev, mode: 'confirming' }) as ActionFlow);
                  return;
                }
                needsTargetPlayer ? setActionFlow(prev => ({ ...prev, mode: 'picking-target' }) as ActionFlow) : setActionFlow(prev => ({ ...prev, mode: 'confirming' }) as ActionFlow);
              }}>
              {moveType === 'tradePresent' ? 'Review trade →' : 'Next →'}
            </button>
          )}
          {error && <p style={{ color: '#e94560', fontSize: 39, marginTop: 8 }}>{error}</p>}
        </div>
      );
    }

    if (actionFlow.mode === 'selecting-flowers') {
      return (
        <div style={{ padding: 16 }}>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8, fontSize: 42 }}>
            💨💨 Double Wind — Flower Selection
          </div>
          <p style={{ color: '#cbd5ff', fontSize: 39, margin: '0 0 12px 0' }}>
            Tap flowers in <b>{nameOf(G.players.find(p => p.id === actionFlow.targetPlayer))}</b>&apos;s garden to select up to 4 targets.
          </p>
          <div style={{ color: '#9fb0ff', fontSize: 36, marginBottom: 12 }}>
            Selected: <b style={{ color: '#fff' }}>{selectedFlowerIds.length}</b> / 4 flowers
          </div>
          {moveType === 'playWindSingle' && selectedPrimaryWindCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Wind strength</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  style={btn(!windAttackDoubleMode ? '#4ecca3' : '#333', !windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                  onClick={() => {
                    setWindAttackDoubleMode(false);
                    setActionFlow({ mode: 'picking-target', cardId: actionFlow.cardId, windExtraTargets: [] });
                    setSelectedFlowerIds([]);
                  }}
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
            </div>
          )}
          <button style={btn('#e94560', '#fff')} onClick={resetAll}>
            Cancel
          </button>
        </div>
      );
    }

    if (actionFlow.mode === 'picking-target') {
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
            {endTurnBtn}
            <button
              style={btn('#333')}
              onClick={() => moveType === 'tradePresent' ? resetAll() : setActionFlow(prev => ({ ...prev, mode: 'picking-card' }) as ActionFlow)}
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
                    <div style={{ color: '#4ecca3', fontWeight: 800, fontSize: 42 }}>Double Wind target picker</div>
                    <div style={{ color: '#e7ecff', fontSize: 36, marginTop: 3 }}>
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
                <div style={{ color: '#9fb0ff', fontSize: 36, marginBottom: 10, lineHeight: 1.5 }}>
                  Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                  {remainingDoubleWindFlowers > 0
                    ? ` Pick ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} from another set if available.`
                    : ' You have enough flowers selected.'}
                </div>
                <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>
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
                        <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>
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
                        onClick={() => canAdvanceFromTarget && setActionFlow(prev => ({ ...prev, mode: 'confirming' }) as ActionFlow)}
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
              <div style={{ marginBottom: 14, background: '#1a1a2e', borderRadius: 10, padding: 12, color: '#9fb0ff', fontSize: 36, lineHeight: 1.5 }}>
                Choose a target player first, and the Double Wind set picker will appear here at the top.
              </div>
            )
          )}
          <div style={{ background: '#0f3460', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}>{moveLabel(effectiveMoveType)}</div>
            <p style={{ color: '#cbd5ff', fontSize: 39, margin: '0 0 8px 0' }}>{moveInfo.summary}</p>
            <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5 }}>
              Selected card{selectedCards.length === 1 ? '' : 's'}:{' '}
              {selectedCards.map((card, index) => (
                <span key={card.id}>
                  {index > 0 ? ', ' : null}
                  <InlineCardLabel card={card} />
                </span>
              ))}
            </div>
            <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5, marginTop: 4 }}>
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
                  onClick={() => {
                    setWindAttackDoubleMode(false);
                  }}
                >
                  💨 Use 1 Wind card
                </button>
                {canUpgradeSingleWind && (
                  <button
                    style={btn(windAttackDoubleMode ? '#4ecca3' : '#333', windAttackDoubleMode ? '#1a1a2e' : '#fff')}
                    onClick={() => {
                      setWindAttackDoubleMode(true);
                      setActionFlow({ mode: 'selecting-flowers', cardId: actionFlow.cardId, targetPlayer });
                      setSelectedFlowerIds([]);
                      setTargetSet('');
                      setWindExtraTargetSets([]);
                    }}
                  >
                    💨💨 Use 2 Wind cards
                  </button>
                )}
              </div>
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5 }}>
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
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5 }}>
                {doubleHappinessMode === 'take'
                  ? 'The target will choose which 2 cards they give you after you confirm.'
                  : doubleHappinessMode === 'give'
                    ? 'Choose the 2 cards from your own hand that you want to send to the target.'
                    : 'Choose whether this Double Happiness will take cards from the target or give cards to them.'}
              </div>
              {doubleHappinessMode === 'give' && selectedDhCard && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ color: '#aaa', fontSize: 39, marginBottom: 8 }}>
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
                  <div style={{ color: '#9fb0ff', fontSize: 36, marginTop: 8 }}>
                    Selected to give: <b style={{ color: '#fff' }}>{doubleHappinessGiveCards.length}</b> / 2
                  </div>
                </div>
              )}
            </div>
          )}
          {!showDoubleWindPrompt && (
            <>
              <p style={{ color: '#aaa', fontSize: 39, marginBottom: 10 }}>
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
              <p style={{ color: '#aaa', fontSize: 39, marginBottom: 6 }}>
                {moveType === 'playBee'
                  ? 'Choose a set to add to, or start a new set:'
                  : effectiveMoveType === 'playWindDouble'
                    ? 'Choose which set(s) Double Wind should blow from:'
                    : 'Select their set:'}
              </p>
              {selectedTargetPlayer && (
                <div style={{ color: '#9fb0ff', fontSize: 36, marginBottom: 8 }}>
                  Targeting <b style={{ color: '#fff' }}>{nameOf(selectedTargetPlayer)}</b>
                  {selectedTargetSet && effectiveMoveType !== 'playWindDouble' && <span> · currently selected set has <b style={{ color: '#fff' }}>{selectedTargetSet.flowers.length}</b> flower(s)</span>}
                </div>
              )}
              {validSets.length === 0 && moveType !== 'playBee' ? (
                <p style={{ color: '#e94560', fontSize: 39 }}>No valid sets to target.</p>
              ) : (
                <>
                  {effectiveMoveType === 'playWindDouble' ? (
                    <>
                      <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>
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
                          <div style={{ color: '#9fb0ff', fontSize: 36, marginBottom: 8 }}>
                            Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                            {remainingDoubleWindFlowers > 0
                              ? ` Pick ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} from another set if available.`
                              : ' You have enough flowers selected.'}
                          </div>
                          {availableDoubleWindFollowUps.length > 0 && (
                            <>
                              <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>
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
              onClick={() => setActionFlow(prev => ({ ...prev, mode: moveType === 'tradePresent' ? 'picking-card' : 'confirming' }) as ActionFlow)}
            >
              {moveType === 'tradePresent' ? 'Choose offer →' : 'Next →'}
            </button>
          )}
          {error && <p style={{ color: '#e94560', fontSize: 39, marginTop: 8 }}>{error}</p>}
        </div>
      );
    }

    if (actionFlow.mode === 'confirming') {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            {endTurnBtn}
            <button style={btn('#333')} onClick={resetAll}>✕ Cancel</button>
            <button
              style={btn('#555')}
              onClick={() => {
                if (effectiveMoveType === 'playWindDouble') {
                  setActionFlow(prev => ({ ...prev, mode: 'selecting-flowers' }) as ActionFlow);
                } else if (moveNeedsTargetPlayer(moveType) || moveRequiresTargetSet(moveType)) {
                  setActionFlow(prev => ({ ...prev, mode: 'picking-target' }) as ActionFlow);
                } else {
                  setActionFlow(prev => ({ ...prev, mode: 'picking-card' }) as ActionFlow);
                }
              }}
            >
              ← Back
            </button>
          </div>
          {moveType === 'tradePresent' && selectedTradePresentOfferCard && (
            <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <p style={{ fontSize: 39, color: '#ccc', margin: '0 0 6px 0' }}>
                You are offering: <b><InlineCardLabel card={selectedTradePresentOfferCard} /></b>
              </p>
              <p style={{ fontSize: 36, color: '#9fb0ff', margin: 0 }}>
                {tname || 'The target player'} will see this card, then choose 1 card from their own hand to trade back.
              </p>
            </div>
          )}
          {moveType === 'playBee' && beeDiscardCard && (
            <p style={{ fontSize: 39, color: '#ccc', marginBottom: 4 }}>Discard flower: <b><InlineCardLabel card={beeDiscardCard} /></b></p>
          )}
          {(moveType === 'plantOwn' || moveType === 'plantOpponent') && selectedPrimaryFlower && (
            wildcardNeedsChosenColor(selectedPrimaryFlower) || selectedPrimaryFlower.color === 'triple_rainbow' ? (
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Plant destination</div>
                <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5, marginBottom: 10 }}>
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
                    style={{ ...btn(effectiveTargetSetId === '' ? '#4ecca3' : '#555', effectiveTargetSetId === '' ? '#1a1a2e' : '#fff'), fontSize: 33, padding: '3px 8px' }}
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
                  <p style={{ fontSize: 36, color: '#9fb0ff', margin: '8px 0 0 0' }}>
                    Triple Rainbow can stand alone as a new set, or you can give it a color so it works like a rainbow flower.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ background: '#1a1a2e', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: 8 }}>Plant destination</div>
                <p style={{ fontSize: 36, color: '#9fb0ff', margin: '0 0 6px 0' }}>
                  Regular flowers auto-match by color, so there is no manual set choice for this play.
                </p>
                <p style={{ fontSize: 39, color: '#ccc', margin: 0 }}>
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
              <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5, marginBottom: 10 }}>
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
                  style={{ ...btn(effectiveTargetSetId === '' ? '#4ecca3' : '#555', effectiveTargetSetId === '' ? '#1a1a2e' : '#fff'), fontSize: 33, padding: '3px 8px' }}
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
                <p style={{ fontSize: 39, color: '#e94560', margin: 0 }}>No valid sets are available right now.</p>
              ) : effectiveMoveType === 'playWindDouble' ? (
                <>
                  <div style={{ color: '#9fb0ff', fontSize: 36, lineHeight: 1.5, marginBottom: 10 }}>
                    Double Wind currently covers <b style={{ color: '#fff' }}>{selectedWindStealCount}</b> / 4 flower(s).
                    {remainingDoubleWindFlowers > 0
                      ? ` Choose ${remainingDoubleWindFlowers} more flower${remainingDoubleWindFlowers === 1 ? '' : 's'} worth of targets if another vulnerable set exists.`
                      : ' You have enough flowers selected.'}
                  </div>
                  <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>Primary target set</div>
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
                      <div style={{ color: '#f4f1ff', fontSize: 36, fontWeight: 700, marginBottom: 6 }}>Follow-up target sets</div>
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
                    <p style={{ fontSize: 39, color: '#ccc', margin: '4px 0 0 0' }}>
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
                    <p style={{ fontSize: 39, color: '#ccc', margin: '4px 0 0 0' }}>
                      Selected set: <b>{selectedTargetSet ? describeGardenSet(selectedTargetSet) : 'selected ✓'}</b>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {moveType !== 'plantOwn' && moveType !== 'plantOpponent' && moveType !== 'playBee' && effectiveTargetSetId && effectiveMoveType !== 'playWindDouble' && (
            <p style={{ fontSize: 39, color: '#ccc', marginBottom: 4 }}>
              Set: <b>{selectedTargetSet ? describeGardenSet(selectedTargetSet) : 'selected ✓'}</b>
            </p>
          )}
          {moveType === 'playBee' && !effectiveTargetSetId && <p style={{ fontSize: 39, color: '#ccc', marginBottom: 4 }}>Set: <b>start new set</b></p>}
          {chosenColor && <p style={{ fontSize: 39, color: '#ccc', marginBottom: 4 }}>Color: <b>{chosenColor}</b></p>}
          {error && <p style={{ color: '#e94560', fontSize: 39, marginBottom: 8 }}>⚠️ {error}</p>}
        </div>
      );
    }

    return null;
  }


  // ── Page layout ───────────────────────────────────────────────

  const roomOwnerName = nameOf(G.players.find(player => player.id === G.ownerPlayerId) ?? null) || 'Room owner';
  const handleDismissCoinFlip = useCallback(() => m.dismissCoinFlip?.(), [m.dismissCoinFlip]);
  const showActionOverlay =
    (myTurn && actionFlow.mode !== 'idle' && !isDragging && G.phase === 'action') ||
    (myTurn && G.phase === 'blessing' && G.blessingState && !G.coinFlip) ||
    (isCounter && amTarget && inStage && !G.coinFlip);
  const draggedHandCard = dragPreview ? myHand.find(card => card.id === dragPreview.cardId) ?? null : null;

  const shellClass = [
    'v2-shell page',
    theme.pageClass,
    chatOpen ? 'chat-open' : '',

    sceneFx !== 'none' ? `scene-${sceneFx}` : '',
    G.phase !== 'waiting' ? 'pixi-garden-active' : '',
  ].filter(Boolean).join(' ');
  const centerUiGif = CENTER_GIF;
  const cardPlayFxSrc = cardPlayFx === 'trade-fate'
    ? swapLifeGif
    : cardPlayFx === 'wind-blow'
      ? windBlowGif
      : null;

  if (G.phase === 'waiting') {
    return (
      <div className={shellClass} style={theme.pageStyle} onPointerMove={handleWaitingPointerMove}>
        <GrassField season={G.season ?? 'normal'} cursorPos={waitingCursorPos} />
        <WaitingRoom
          G={G}
          playerID={playerID ?? ''}
          theme={theme}
          matchCtx={matchCtx}
          nameOf={nameOf}
          isSubmitting={isSubmitting}
          onStart={handleStart}
          onReady={() => runMove(() => m.toggleReady())}
          onLeave={handleLeave}
          onKick={handleKick}
        />
        {/* Danmaku floating chat overlay */}
        <div className="danmaku-container" aria-hidden="true" style={{ zIndex: 1 }}>
          {danmakuComments.map(comment => (
            <div
              key={comment.id}
              className="danmaku-comment"
              style={{
                '--danmaku-lane': comment.lane,
                '--danmaku-duration': `${comment.duration}ms`,
                '--danmaku-color': comment.color,
                '--danmaku-top': `${DANMAKU_TOP_OFFSET + comment.lane * DANMAKU_LANE_HEIGHT}px`,
              } as React.CSSProperties}
            >
              {comment.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className={shellClass} style={theme.pageStyle} onPointerMove={e => setGameCursorPos({ x: e.clientX, y: e.clientY })}>
      {/* Global grass background — viewport-root so it cannot be clipped by arena containers */}
      <GrassField
        season={G.season ?? 'normal'}
        scrollX={-arenaPan.x}
        scrollY={-arenaPan.y}
        zoom={arenaZoom}
        playerPositions={arenaLayout.map(l => ({ x: l.clusterOffsetX, y: l.clusterOffsetY }))}
        flowerPositions={G.players.flatMap(p => {
          const layout = arenaLayout.find(l => l.player.id === p.id);
          if (!layout) return [];
          const sets = p.garden.sets.filter(s => !s.isToken);
          return sets.flatMap((s, si) => {
            const setAngle = (si / Math.max(1, sets.length)) * Math.PI * 2;
            const setOffsetX = Math.cos(setAngle) * 18;
            const setOffsetY = Math.sin(setAngle) * 14;
            return s.flowers.map((f, fi) => ({
              x: layout.clusterOffsetX + setOffsetX + (fi - s.flowers.length / 2) * 10,
              y: layout.clusterOffsetY + setOffsetY + (fi % 2) * 6,
            }));
          });
        })}
        dragPos={dragPreview ? { x: dragPreview.x + dragPreview.width / 2, y: dragPreview.y + dragPreview.height / 2 } : null}
        cursorPos={gameCursorPos}
        windGustInput={grassWindGust}
      />
      {matchCtx?.isSpectator && (
        <div className="spectator-banner">
          <span className="spectator-banner__eye">👁</span>
          <span className="spectator-banner__text">Spectator Mode</span>
          <button className="spectator-banner__leave" onClick={() => matchCtx?.onLeave?.()}>
            Leave
          </button>
        </div>
      )}
      {/* Pixi.js garden renderer */}
      <GameCanvas
          G={G}
          ctx={ctx}
          playerID={playerID ?? ''}
          panX={arenaPan.x}
          panY={arenaPan.y}
          zoom={arenaZoom}
          gardenPositions={arenaLayout.map((l) => ({ playerId: l.player.id, x: l.x, y: l.y }))}
          gardenSectors={arenaLayout.map((l) => ({
            playerId: l.player.id,
            centerAngle: l.sectorCenterAngle,
            halfAngle: (l.sectorEndAngle - l.sectorStartAngle) / 2,
            innerR: Math.round(Math.min(effectiveW, effectiveH) * 0.42 * 0.15),
            outerR: Math.round(Math.min(effectiveW, effectiveH) * 0.42),
          }))}
          hoveredPlayerId={activeGardenPlayerId}
          hoveredSetId={activeGardenSetId}
        />
      {divineTransition && (
        <DivineFavouriteTransition
          key={divineTransition.id}
          fromX={divineTransition.fromX}
          fromY={divineTransition.fromY}
          toX={divineTransition.toX}
          toY={divineTransition.toY}
          fromSize={divineTransition.fromSize}
          toSize={divineTransition.toSize}
          onComplete={handleTransitionComplete}
        />
      )}
      {G.coinFlip && (
        <CoinFlipOverlay
          coinFlip={G.coinFlip}
          onDismiss={handleDismissCoinFlip}
        />
      )}
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

      {/* Top bar: timer center, log right */}
      <div className={`turn-timer-bubble ${myTurn ? (turnRemainingSec > 0 && turnRemainingSec <= 10 ? 'is-urgent' : 'is-my-turn') : ''}`}>
        <span className="turn-timer-bubble__deck" aria-hidden="true">🎴</span>
        <span className="turn-timer-bubble__name">{timerLabel}</span>
        <span className="turn-timer-bubble__clock">{turnTimerLabel}</span>
      </div>

      {/* Log toggle — top right */}
      <button
        className={`game-log-toggle ${logOpen ? 'is-open' : ''}`}
        onClick={() => setLogOpen(v => !v)}
        aria-label="Toggle game log"
        type="button"
      >
        📜 Log
      </button>

      {/* Log panel */}
      {logOpen && (
        <div className="game-log-panel">
          <div className="game-log-panel__header">
            <span>Game Log</span>
            <button className="game-log-panel__close" onClick={() => setLogOpen(false)} aria-label="Close log">✕</button>
          </div>
          <div className="game-log-panel__list">
            {displayLogItems.length === 0 ? (
              <div className="game-log-panel__empty">No events yet.</div>
            ) : (
              displayLogItems.map(item => (
                <div key={item.key} className="game-log-panel__item">{item.text}</div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Player action bubble — Chat + Emoji + Pass */}
      <div className="player-action-bubble">
        <button
          className={`action-bubble-btn ${chatOpen ? 'is-open' : ''}`}
          style={{ color: theme.text, background: theme.panel }}
          onClick={() => {
            setChatOpen(open => !open);
            if (!chatOpen) setChatUnread(0);
          }}
          title={chatOpen ? 'Close chat' : 'Open chat'}
          aria-label="Toggle chat"
        >
          <span aria-hidden="true">💬</span>
          {chatUnread > 0 && !chatOpen && (
            <span className="action-bubble-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
          )}
        </button>
        <button
          className={`action-bubble-btn ${quickChatOpen ? 'is-open' : ''}`}
          style={{ color: theme.text, background: theme.panel }}
          onClick={() => setQuickChatOpen(open => !open)}
          title={quickChatOpen ? 'Close quick chat' : 'Open quick chat'}
          aria-label="Toggle quick chat"
        >
          <span aria-hidden="true">🙂</span>
        </button>
        {myTurn && G.phase === 'action' && (
          <button
            className="action-bubble-btn action-bubble-btn--pass"
            onClick={() => runMove(() => m.pass())}
            title="End your turn"
            aria-label="Pass turn"
          >
            <span aria-hidden="true">⏭</span>
          </button>
        )}
      </div>
      {quickChatOpen && (
        <div className="action-bubble-quick-chat" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          {QUICK_CHAT_OPTIONS.map(option => (
            <button
              key={option.text}
              className="action-bubble-quick-chat-option"
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
      {sceneFx !== 'none' && <div className={`scene-overlay scene-${sceneFx}`} aria-hidden="true" />}
      {cardPlayFxSrc && (
        <div className={`card-play-fx card-play-fx--${cardPlayFx}`} aria-hidden="true">
          <img src={cardPlayFxSrc} alt="" className="card-play-fx__image" draggable={false} />
        </div>
      )}
      {discardFlyCard && (
        <div className="discard-fly-overlay" aria-hidden="true">
          <div className="discard-fly-card"><CardChip card={discardFlyCard} /></div>
        </div>
      )}
      {drawFlyAnim && Array.from({ length: drawFlyAnim.count }, (_, i) => {
        const mid = (drawFlyAnim.count - 1) / 2;
        const flyOffsetX = (i - mid) * 80;
        return (
          <div key={`draw-fly-${i}`} className="draw-fly-overlay" aria-hidden="true">
            <img
              src="/back_art.png"
              className="draw-fly-card"
              alt=""
              draggable={false}
              style={{
                ['--fly-x' as string]: `${flyOffsetX}px`,
                animationDelay: `${i * 300}ms`,
              } as React.CSSProperties}
            />
          </div>
        );
      })}
      {dragPreview && draggedHandCard && (
        <DragCardOverlay
          x={dragPreview.x}
          y={dragPreview.y}
          width={dragPreview.width}
          height={dragPreview.height}
          isOverValidTarget={!!validDragTargetSetId}
          isSnappingBack={drag.isSnappingBack}
          card={draggedHandCard}
        />
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

      <GameMenu
        theme={theme}
        onResume={() => {}}
        onSettings={() => {}}
        onRules={() => {}}
        onBugReport={() => {}}
        onChangelog={() => {}}
        onQuit={() => matchCtx?.onLeave?.()}
      />

      {/* ── PLAYFIELD ── */}
      <div className="v2-playfield">
        <div className={`v2-drawer v2-chat-drawer ${chatOpen ? 'is-open' : ''}`}
          style={{ background: theme.panelSoft }}>
          <div className="v2-drawer-content">
            <div className="v2-chat-msgs" ref={chatMsgsRef}>
              {chatMessages.length === 0
                ? <div style={{ color: theme.muted, fontSize: 36, padding: 8 }}>No messages yet.</div>
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
            {chatError && <div style={{ color: '#e94560', fontSize: 33, padding: '2px 8px' }}>{chatError}</div>}
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

        {G.phase === 'game_over' && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent})`,
            color: theme.text, borderRadius: 12, padding: '10px 20px',
            fontSize: 54, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {resultWinnerLabel} wins!
          </div>
        )}

        {/* Arena */}
        <div
          ref={arenaRef}
          className="board-arena board-arena-radial"
          onWheel={event => {
            event.preventDefault();
            markManualInteraction();
            // Distinguish trackpad two-finger pan (small delta, no modifier)
            // from mouse-wheel zoom. Ctrl/Cmd + wheel always zooms.
            const absY = Math.abs(event.deltaY);
            const isTrackpadPan = !event.ctrlKey && !event.metaKey && absY < 40 && event.deltaMode === 0;
            if (isTrackpadPan) {
              setClampedArenaPan({
                x: arenaPanRef.current.x - event.deltaX,
                y: arenaPanRef.current.y - event.deltaY,
              });
            } else {
              // Mouse wheel zooms toward cursor (Ctrl no longer needed for wheel)
              const delta = event.deltaY < 0 ? 0.08 : -0.08;
              adjustArenaZoom(delta, { clientX: event.clientX, clientY: event.clientY });
            }
          }}
          onClick={() => {
            const now = Date.now();
            const lastTap = (arenaRef.current as any)?.__lastTap ?? 0;
            if (now - lastTap < 300) {
              // Double-tap: reset camera to auto-zoom
              isManualZoomRef.current = false;
              setClampedArenaPan({ x: 0, y: 0 });
              setArenaZoom(targetAutoZoomRef.current);
            }
            if (arenaRef.current) {
              (arenaRef.current as any).__lastTap = now;
            }
          }}
        >
          <div
            className="arena-pan-stage"
            style={{ ['--arena-pan-x' as string]: `${arenaPan.x}px`, ['--arena-pan-y' as string]: `${arenaPan.y}px` } as React.CSSProperties}
          >
            <div className="arena-zoom-stage" style={{ ['--arena-zoom' as string]: String(arenaZoom), ['--arena-diameter' as string]: `${arenaDiameter}px` } as React.CSSProperties}>
              <SectorClipPaths count={G.players.length} myPlayerIndex={Math.max(0, myPlayerIndex)} />
              <SectorBoundaries count={G.players.length} myPlayerIndex={Math.max(0, myPlayerIndex)} arenaDiameter={arenaDiameter} />
              {/* Center elements moved to UI overlay — see below */}

              {arenaLayout.map((layout) => {
                // Always use the LIVE player from G.players — arenaLayout caches the
                // player reference from when computeSectorLayout ran. If a garden's
                // sets mutate internally (flower added/removed) without changing
                // sets.length, the cached player object is stale.
                const player = G.players.find(p => p.id === layout.player.id) || layout.player;
                const isActive = G.turnOrder[G.currentPlayerIndex] === player.id;
                const isMe = player.id === playerID;
                const isGodsFav = G.godsFavouritePlayerId === player.id;
                const canDropTarget = myTurn && G.phase === 'action';
                // (diagnostics removed for performance)
                const gardenPanelClass = [
                  'player-garden',
                  isActive ? 'is-current-turn' : '',
                  isMe ? 'is-me' : '',
                  isGodsFav ? 'is-gods-fav' : '',
                  gardenDensityClass(player.garden.sets.length),
                  activeGardenPlayerId === player.id ? 'is-targeted' : '',
                  settlingGardens[player.id] ? 'is-settling' : '',
                ].filter(Boolean).join(' ');
                const isTargeted = activeGardenPlayerId === player.id || targetPlayer === player.id;
                const gardenFx = gardenVisualEffect?.playerId === player.id ? gardenVisualEffect : null;
                const gardenSettle = settlingGardens[player.id] ?? null;
                const totalPlayers = arenaLayout.length;
                const relativeIndex = (layout.sectorIndex - Math.max(0, myPlayerIndex) + totalPlayers) % totalPlayers;
                const pos = {
                  x: layout.clusterOffsetX,
                  y: layout.clusterOffsetY,
                  w: arenaDiameter * 0.5,
                  h: arenaDiameter * 0.5,
                };
                const gardenStyle = {
                  // No clipPath — useSectorFlowerLayout keeps flowers inside wedge
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  borderRadius: 0,
                  position: 'absolute',
                  overflow: 'visible',
                  pointerEvents: 'none', // Let clicks pass through to draw button / center UI
                  // Radial positioning via CSS vars
                  '--pg-x': `${pos.x}px`,
                  '--pg-y': `${pos.y}px`,
                  '--pg-w': `${pos.w}px`,
                  '--pg-h': `${pos.h}px`,
                } as React.CSSProperties;
                return (
                  <div
                    key={player.id}
                    className={gardenPanelClass}
                    style={gardenStyle}
                    ref={(node) => { gardenRefs.current[player.id] = node; }}
                    data-garden-id={player.id}
                  >
                    <div className={`garden-divine-particles ${visualGodsFavouritePlayerId === player.id ? 'is-visible' : ''}`} aria-hidden="true">
                      {Array.from({ length: 10 }, (_, i) => {
                        const orbitDur = 8 + (i % 5) * 2.2;
                        const orbitDelay = -(i * 1.4);
                        const radius = Math.round(arenaDiameter * (0.22 + (i % 5) * 0.06));
                        const sparkleDur = 0.9 + (i % 5) * 0.45;
                        const sparkleDelay = -(i * 0.45);
                        const size = 5 + (i % 5) * 1.8;
                        return (
                          <div
                            key={i}
                            className="garden-divine-particle"
                            style={{
                              ['--orbit-dur' as string]: `${orbitDur}s`,
                              ['--orbit-delay' as string]: `${orbitDelay}s`,
                              ['--orbit-r' as string]: `${radius}px`,
                              ['--sparkle-dur' as string]: `${sparkleDur}s`,
                              ['--sparkle-delay' as string]: `${sparkleDelay}s`,
                              ['--p-size' as string]: `${size}px`,
                            }}
                          >
                            <div className="garden-divine-particle__core" />
                          </div>
                        );
                      })}
                    </div>
                    {gardenFx?.type === 'natural-disaster' && (
                      <div key={gardenFx.key} className="garden-visual-fx garden-visual-fx--natural-disaster" aria-hidden="true">
                        <img src={naturalDisasterGif} alt="" className="garden-visual-fx__image" draggable={false} />
                      </div>
                    )}
                    {chatBubbles[player.id] && (
                      <div key={chatBubbles[player.id].key} className="garden-chat-bubble">
                        💬 {chatBubbles[player.id].text}
                      </div>
                    )}
                    {player.garden.sets.length === 0
                      ? <div className="garden-empty-slot"
                          data-garden-id={player.id}
                          onClick={canDropTarget && activeGardenCardId
                            ? () => stagePlayFromCard(activeGardenCardId, player.id, '')
                            : isMe && myTurn && G.phase === 'action'
                            ? () => { setMoveType('plantOwn'); setTargetSet(''); setActionFlow({ mode: 'picking-card' }); }
                            : undefined}>
                          Tap or drop a flower here
                        </div>
                      : <GardenFlowerField
                          sets={player.garden.sets}
                          playerId={player.id}
                          sectorGeometry={sectorGeometries[player.id]}
                          targetedSetId={targeting.hoveredTarget?.playerId === player.id ? targeting.hoveredTarget.setId || null : null}
                          invalidTargetSetId={invalidDragTargetSetId && targeting.hoveredTarget?.playerId === player.id ? invalidDragTargetSetId : null}
                          validTargetSetId={validDragTargetSetId && targeting.hoveredTarget?.playerId === player.id ? validDragTargetSetId : null}
                          onSetClick={(setId) => {
                            if (canDropTarget && activeGardenCardId) {
                              stagePlayFromCard(activeGardenCardId, player.id, setId);
                            } else if (isMe && myTurn && G.phase === 'action') {
                              if (suppressSetClickRef.current === setId) { suppressSetClickRef.current = null; return; }
                              setTargetPlayer(player.id);
                              setTargetSet(setId);
                              setMoveType('plantOwn');
                              setActionFlow(prev => ({ ...prev, mode: 'picking-card' }) as ActionFlow);
                            }
                          }}
                          highlightSetId={activeGardenSetId}
                          attackedSetId={
                            player.id === attackedGardenPlayerId
                              ? attackedGardenSetId
                              : windDeparting?.playerId === player.id
                                ? windDeparting.setId
                                : undefined
                          }
                          counterTargetSetId={player.id === attackedGardenPlayerId ? attackedGardenSetId : undefined}
                          changedSetIds={gardenSettle?.changedSetIds ?? []}
                          getSetRef={(setId) => (node) => { gardenSetRefs.current[gardenSetRefKey(player.id, setId)] = node; }}
                          selectionMode={actionFlow.mode === 'selecting-flowers' && actionFlow.targetPlayer === player.id}
                          eligibleFlowerIds={
                            actionFlow.mode === 'selecting-flowers' && actionFlow.targetPlayer === player.id
                              ? player.garden.sets
                                  .filter((s) => isValidTargetSetForMove('playWindDouble', s))
                                  .flatMap((s) => s.flowers.map((f) => f.id))
                              : EMPTY_ARRAY
                          }
                          selectedFlowerIds={selectedFlowerIds}
                          onFlowerSelect={handleFlowerSelect}
                          windLandedFlowerIds={windLandedFlowerIds[player.id] || EMPTY_SET}
                          onContentSizeChange={(width, height, minX, maxX, minY, maxY) => {
                            setGardenContentSizes(prev => {
                              const p = prev[player.id];
                              if (p && p.width === width && p.height === height && p.minX === minX && p.maxX === maxX && p.minY === minY && p.maxY === maxY) {
                                return prev;
                              }
                              return { ...prev, [player.id]: { width, height, minX, maxX, minY, maxY } };
                            });
                          }}
                        />
                    }
                    {actionFlow.mode === 'selecting-flowers' && actionFlow.targetPlayer === player.id && (
                      <button
                        type="button"
                        onClick={confirmFlowerSelection}
                        disabled={selectedFlowerIds.length === 0}
                        style={{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: 33,
                          fontWeight: 700,
                          border: 'none',
                          cursor: selectedFlowerIds.length > 0 ? 'pointer' : 'not-allowed',
                          background: selectedFlowerIds.length > 0 ? '#4ecca3' : '#333',
                          color: selectedFlowerIds.length > 0 ? '#1a1a2e' : '#888',
                          zIndex: 300,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                      >
                        Confirm ({selectedFlowerIds.length}/4)
                      </button>
                    )}
                    {actionFlow.mode === 'confirming' && targetPlayer === player.id && (
                      <div className="garden-quick-confirm" style={{
                        marginTop: 6, padding: '6px 8px', borderRadius: 10,
                        background: theme.panelSoft, border: `1px solid ${theme.accent}`,
                        display: 'flex', alignItems: 'center',
                        gap: 6, flexWrap: 'wrap',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 30, color: theme.muted, marginBottom: 1 }}>Ready here</div>
                          <div style={{ fontWeight: 800, color: theme.text, fontSize: 33 }}>{moveLabel(moveType)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>
        </div>

        {/* UI OVERLAY: screen-space, ignores zoom/pan */}
        <div className="arena-ui-overlay">
          {/* CENTER UI — pinned to screen center, screen-space size */}
          <img
            className="arena-core-ui"
            src={centerUiGif}
            alt=""
            draggable={false}
            onClick={() => setDiscardPopupOpen(true)}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80px',
              height: 'auto',
              cursor: G.discardPile.length > 0 ? 'pointer' : 'default',
            }}
          />

          {/* DRAW FAN — pinned to screen center, screen-space size */}
          {showCenterDraw && (
            <button
              type="button"
              className="arena-draw-indicator"
              onClick={handleDrawClick}
              title={`Draw ${drawCount} card${drawCount > 1 ? 's' : ''}`}
              style={{
                position: 'absolute',
                left: '50%',
                top: '45%',
                transform: 'translate(-50%, -50%)',
                background: 'transparent',
                border: 'none',
                padding: 0,
              }}
            >
              <div className="arena-draw-fan" data-draw-count={drawCount}>
                {Array.from({ length: drawCount }, (_, i) => {
                  const mid = (drawCount - 1) / 2;
                  const offsetX = (i - mid) * (drawCount >= 7 ? 30 : drawCount >= 5 ? 40 : 50);
                  const angle = (i - mid) * (drawCount >= 7 ? 4 : drawCount >= 5 ? 6 : 8);
                  const offsetY = Math.abs(i - mid) * 3;
                  return (
                    <img
                      key={i}
                      src="/back_art.png"
                      alt=""
                      className="arena-draw-card"
                      draggable={false}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: '60px',
                        height: 'auto',
                        transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${angle}deg)`,
                        zIndex: drawCount - Math.abs(i - mid),
                      }}
                    />
                  );
                })}
              </div>
              <span className="arena-draw-label">Draw {drawCount}</span>
            </button>
          )}

          {/* DISCARD PILE TARGET — pinned to screen center, hidden */}
          <div
            className="discard-pile"
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '60px',
              height: '60px',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              opacity: 0,
            }}
          />

          {/* Player badges */}
          {spreadBadgePositions.map(({ layout, screenX, screenY }) => {
            const player = layout.player;
            const isMe = player.id === playerID;
            return (
              <button
                key={`badge-${player.id}`}
                type="button"
                className={`garden-player-badge ${isMe ? 'is-me' : ''}`}
                style={{
                  left: `calc(50% + ${screenX}px)`,
                  top: `calc(50% + ${screenY}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => setPlayerInfoPlayerId(player.id)}
                title={`${nameOf(player)} — ${player.hand.length} cards`}
              >
                <span className="garden-player-badge__name">{nameOf(player)}</span>
                <span className="garden-player-badge__count">
                  <img src="/back_art.png" alt="" className="garden-player-badge__icon" draggable={false} />
                  {player.hand.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Blessing Phase tap-to-flip coin — rendered OUTSIDE action sheet
            so it isn't clipped by the sheet's overflow/backdrop-filter. */}
        {G.phase === 'blessing' && !G.blessingState && !G.coinFlip && myTurn && (
          <div className="coin-flip-trigger">
            <button
              className="coin-flip-tap-btn"
              onClick={() => runMove(() => m.blessingFlip())}
              aria-label="Flip Coin"
            >
              <img
                src="/coins/coin_head.png"
                alt=""
                className="coin-flip-tap-img"
                draggable={false}
              />
            </button>
            <p className="coin-flip-hint">Tap to Flip</p>
          </div>
        )}

        {/* Action overlay — wizard steps slide over playfield */}
        {showActionOverlay && (
          <div className={`v2-action-overlay ${G.phase === 'blessing' ? 'is-blessing' : ''}`} onClick={e => { if (e.target === e.currentTarget) resetAll(); }}>
            <div ref={actionSheetRef} className="v2-action-sheet" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
              {renderActionPanel()}
            </div>
          </div>
        )}

      </div>

      {/* ── ACTION ROW ── */}
      <div className="v2-action-row" style={{ background: theme.panel }}>
        {/* Hand only — move buttons removed; actions in floating bubble */}
        <div
          ref={handDockRef}
          className={`v2-hand-dock ${myTurn && G.phase === 'action' ? 'is-play-turn' : 'is-reorder-turn'}`}
        >

          <div ref={handRowRef} className="hs-hand-container">
            {myHand.length === 0 ? (
              <span style={{ color: theme.muted, fontSize: 36 }}>Empty</span>
            ) : myHand.map((c, i) => {
              const mid = (myHand.length - 1) / 2;
              const isDrawingIn = drawFlyAnim && i >= drawFlyAnim.startIndex && i < drawFlyAnim.startIndex + drawFlyAnim.count;
              const drawDelay = isDrawingIn ? (i - drawFlyAnim.startIndex) * 300 + 1000 : 0;
              return (
                <div
                  key={c.id}
                  ref={(node) => { handCardRefs.current[c.id] = node; }}
                  className={`hand-card-fan ${isDragging && drag.draggedCardId === c.id ? 'is-drag-origin' : ''} ${isDrawingIn ? 'is-drawing-in' : ''}`}
                  style={(() => {
                    const s: React.CSSProperties = {
                      transform: `translateY(${Math.abs(i - mid) * 2}px) rotate(${(i - mid) * 4}deg)`,
                    };
                    if (isDrawingIn) (s as Record<string, string>)['--draw-delay'] = `${drawDelay}ms`;
                    return s;
                  })()}
                >
                  <CardChip
                    card={c}
                    selected={activeCardId === c.id || pickedCards.includes(c.id) || counterPickedCards.includes(c.id)}
                    draggable
                    dragging={isDragging && drag.draggedCardId === c.id}
                    onClick={() => handleHandCardClick(c.id)}
                    onPointerDown={(event) => {
                      if (event.pointerType === 'mouse' && event.button !== 0) return;
                      const canPlay = myTurn && G.phase === 'action';
                      const canReorder = (me?.hand.length ?? 0) > 1;
                      if (!canPlay && !canReorder) return;
                      drag.onPointerDown(c.id, event, { canPlay, canReorder });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── ACTION ZONE ── */}
        <ActionZone
          visible={actionFlow.mode === 'confirming'}
          canDouble={effectiveMoveType === 'playWindSingle' || moveType === 'doubleHappiness'}
          doubleLabel={effectiveMoveType === 'playWindSingle' ? '×2' : moveType === 'doubleHappiness' ? '⇄' : '×2'}
          onCancel={resetAll}
          onConfirm={dispatch}
          onDouble={() => {
            if (effectiveMoveType === 'playWindSingle') {
              setWindAttackDoubleMode(true);
              const cardId = activeCardId || pickedCards[0] || '';
              setActionFlow({ mode: 'selecting-flowers', cardId, targetPlayer });
              setSelectedFlowerIds([]);
              setTargetSet('');
              setWindExtraTargetSets([]);
            } else if (moveType === 'doubleHappiness') {
              setDoubleHappinessMode(prev => prev === 'take' ? 'give' : 'take');
            }
          }}
        />

      </div>

      {/* ── ACTION ANIMATION OVERLAY ── */}
      <ActionAnimationOverlay
        active={activeAnimation}
        onComplete={() => setActiveAnimation(null)}
      />

      {/* ── MODALS ── */}
      <GameModals
        modalOpen={modalOpen}
        theme={theme}
        matchCtx={matchCtx}
        playerID={playerID ?? ''}
        G={G}
        matchResult={matchResult}
        totalTimerLabel={totalTimerLabel}
        onClose={() => setModalOpen(null)}
        onViewResults={() => setModalOpen('results')}
        onLeave={handleLeave}
      />
      <PlayerInfoModal
        playerId={playerInfoPlayerId}
        players={G.players}
        theme={theme}
        nameOf={nameOf}
        onClose={() => setPlayerInfoPlayerId(null)}
      />

      {/* ── DISCARD PILE POPUP ── */}
      {discardPopupOpen && (
        <div className="modal-overlay" onClick={() => setDiscardPopupOpen(false)}>
          <div className="modal-panel" style={{ maxWidth: 520, width: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 42, color: theme.text }}>🗑️ Discard Pile</h3>
              <button className="modal-close" onClick={() => setDiscardPopupOpen(false)} aria-label="Close">✕</button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '12px 4px' }}>
              {G.discardPile.length === 0 ? (
                <p style={{ color: theme.muted, textAlign: 'center', fontSize: 36 }}>No cards discarded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {[...G.discardPile].reverse().map((card, i) => (
                    <div key={`${card.id}-${i}`} style={{ width: 90, height: 135 }}>
                      <CardChip card={card} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', padding: '8px 0', color: theme.muted, fontSize: 30 }}>
              {G.discardPile.length} card{G.discardPile.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}
      <DisconnectOverlay
        show={showDisconnect}
        reason={disconnectReason}
        theme={theme}
        onDismiss={() => setDisconnectReason(null)}
      />
      <WindPathCanvas
        flights={windFlights}
        onComplete={(id) => {
          const flight = windFlights.find(f => f.id === id);
          if (flight) {
            const color = BURST_COLOR[flight.color] || '#5a8aff';
            setPlantBursts(prev => [...prev, { id: `wind-land-${id}`, x: flight.toX, y: flight.toY, color, count: 10, spread: 40 }]);
          }
          setWindFlights(prev => prev.filter(f => f.id !== id));
        }}
      />
      <BugAnimationOverlay
        animations={bugAnimations}
        onComplete={(id) => setBugAnimations(prev => prev.filter(a => a.id !== id))}
      />
      <BeeAnimationOverlay
        animations={beeAnimations}
        onComplete={(id) => setBeeAnimations(prev => prev.filter(a => a.id !== id))}
      />
      <NaturalDisasterOverlay
        animations={ndAnimations}
        onComplete={(id) => setNdAnimations(prev => prev.filter(a => a.id !== id))}
      />
      <ParticleBurstOverlay
        bursts={plantBursts}
        onComplete={(id) => setPlantBursts(prev => prev.filter(b => b.id !== id))}
      />
      {/* Danmaku floating chat overlay */}
      <div className="danmaku-container" aria-hidden="true">
        {danmakuComments.map(comment => (
          <div
            key={comment.id}
            className="danmaku-comment"
            style={{
              '--danmaku-lane': comment.lane,
              '--danmaku-duration': `${comment.duration}ms`,
              '--danmaku-color': comment.color,
              '--danmaku-top': `${DANMAKU_TOP_OFFSET + comment.lane * DANMAKU_LANE_HEIGHT}px`,
            } as React.CSSProperties}
          >
            {comment.text}
          </div>
        ))}
      </div>
    </div>
    </ErrorBoundary>
  );
}
