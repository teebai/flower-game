// ============================================================
// FLOWER GAME — CARD UTILITIES
// Shared labels, emojis, and descriptions for cards.
// ============================================================

import type { Card, FlowerCard, PowerCard } from '../types/gameTypes';

export const FLOWER_EMOJI: Record<string, string> = {
  blue: '🔵', purple: '🟣', red: '🔴', orange: '🟠',
  yellow: '🟡', green: '🟢', black: '⚫',
  rainbow: '🌈', triple_rainbow: '✨', divine: '👑',
};

export const POWER_EMOJI: Record<string, string> = {
  wind: '💨', divine_protection: '🛡️', bug: '🐛', bee: '🐝',
  double_happiness: '🎉', trade_present: '🎁', trade_fate: '🔀',
  let_go: '✋', spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
  natural_disaster: '🌪️', eclipse: '🌑', great_reset: '♻️',
};

export const SEASON_COLOR: Record<string, string> = {
  spring: '#f8bbd0', summer: '#fff9c4', autumn: '#ffe0b2', winter: '#e3f2fd',
};

export function cardLabel(card: Card): string {
  if (card.kind === 'flower') return FLOWER_EMOJI[(card as FlowerCard).color] ?? '🌺';
  return POWER_EMOJI[(card as PowerCard).name] ?? '🃏';
}

export function cardName(card: Card): string {
  if (card.kind === 'flower') return (card as FlowerCard).color.replace(/_/g, ' ');
  return (card as PowerCard).name.replace(/_/g, ' ');
}

export function isFlower(c: Card): c is FlowerCard { return c.kind === 'flower'; }

export function isPower(c: Card, name: string): boolean {
  return c.kind === 'power' && (c as PowerCard).name === name;
}

export function cardDetail(card: Card): string {
  if (card.kind === 'flower') {
    if (card.color === 'divine') return 'Divine flower — creates a protected divine set.';
    if (card.color === 'triple_rainbow') return 'Triple rainbow — can stand alone as a complete set, or take a chosen color like a rainbow flower. Combined sets with it become solid.';
    if (card.color === 'rainbow') return 'Rainbow — wildcard flower; you choose its color when planting.';
    return 'Flower card for building sets in a garden. Any 7-flower set becomes Divine, and any 7 different normal flower colors anywhere in your garden consume one of each color to create a token while those flowers return to discard.';
  }

  switch (card.name) {
    case 'wind': return 'Wind card used for single or double Wind plays. Double Wind can keep blowing from extra target sets until it steals 4 flowers total.';
    case 'divine_protection': return 'Counter card — can defend against many blockable actions.';
    case 'bug': return 'Bug power card that targets a vulnerable garden set.';
    case 'bee': return 'Bee power card that plants a flower from the discard pile.';
    case 'double_happiness': return 'Double Happiness power card for take/give hand interactions.';
    case 'trade_present': return 'Trade Present starts a one-card exchange with another player.';
    case 'trade_fate': return 'Trade Fate swaps entire hands.';
    case 'let_go': return 'Let Go resolves a self-directed hand action.';
    case 'spring': return 'Spring changes the season and, if you leave Winter, draws cards immediately.';
    case 'summer': return 'Summer changes the season and, if you leave Winter, draws cards immediately.';
    case 'autumn': return 'Autumn changes the season and, if you leave Winter, draws cards immediately.';
    case 'winter': return 'Winter changes the season and reduces normal moves.';
    case 'natural_disaster': return 'Natural Disaster destroys a chosen vulnerable set.';
    case 'eclipse': return 'Eclipse reverses future turn direction.';
    case 'great_reset': return 'Great Reset refreshes everyone’s hands.';
    default: return 'Power card.';
  }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
