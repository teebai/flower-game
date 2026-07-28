import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveCharacterDNA,
  saveBodyScaleOverride,
  loadBodyScaleOverride,
  rollBodyScale,
  clampBodyScale,
  BODY_SCALE_MIN,
  BODY_SCALE_MAX,
} from './resolveDna';
import { generateCharacterDNA } from '../mmorpg/game/CharacterGenerator';
import { getOrCreateGuestId, getSessionCharacterSeed } from './identity';

beforeEach(() => {
  localStorage.clear();
});

describe('resolveCharacterDNA', () => {
  it('returns the deterministic base DNA when no override exists', () => {
    const resolved = resolveCharacterDNA('seed-alpha');
    expect(resolved).toEqual(generateCharacterDNA('seed-alpha'));
  });

  it('applies the persisted body-scale override and leaves every other field untouched', () => {
    saveBodyScaleOverride('seed-beta', 1.1);
    const base = generateCharacterDNA('seed-beta');
    const resolved = resolveCharacterDNA('seed-beta');
    expect(resolved.bodyScale).toBeCloseTo(1.1);
    const { bodyScale: _b, ...baseRest } = base;
    const { bodyScale: _r, ...resolvedRest } = resolved;
    expect(resolvedRest).toEqual(baseRest);
  });

  it('clamps out-of-range overrides into the allowed window', () => {
    localStorage.setItem('flower-game:body-scale:seed-gamma', '9.9');
    expect(resolveCharacterDNA('seed-gamma').bodyScale).toBe(BODY_SCALE_MAX);
    localStorage.setItem('flower-game:body-scale:seed-gamma', '0.01');
    expect(resolveCharacterDNA('seed-gamma').bodyScale).toBe(BODY_SCALE_MIN);
  });

  it('keeps overrides isolated per seed', () => {
    saveBodyScaleOverride('seed-a', 0.9);
    expect(loadBodyScaleOverride('seed-b')).toBeNull();
    expect(resolveCharacterDNA('seed-b')).toEqual(generateCharacterDNA('seed-b'));
  });
});

describe('rollBodyScale / clampBodyScale', () => {
  it('rolls stay within the allowed range', () => {
    for (let i = 0; i < 200; i += 1) {
      const v = rollBodyScale();
      expect(v).toBeGreaterThanOrEqual(BODY_SCALE_MIN);
      expect(v).toBeLessThanOrEqual(BODY_SCALE_MAX);
    }
  });

  it('clamp guards non-finite input', () => {
    expect(clampBodyScale(Number.NaN)).toBe(1);
    expect(clampBodyScale(Infinity)).toBe(1);
  });
});

describe('identity', () => {
  it('persists the guest id across calls', () => {
    const first = getOrCreateGuestId();
    const second = getOrCreateGuestId();
    expect(first).toBe(second);
    expect(first).toMatch(/^guest_/);
  });

  it('signed-in accounts seed from their account id', () => {
    expect(getSessionCharacterSeed({ id: 'user-123', isGuest: false })).toBe('user-123');
  });

  it('guest profiles keep the persistent guest id (preview == spawn)', () => {
    const guestId = getOrCreateGuestId();
    expect(getSessionCharacterSeed({ id: 'anon-xyz', isGuest: true })).toBe(guestId);
    expect(getSessionCharacterSeed(null)).toBe(guestId);
  });
});
