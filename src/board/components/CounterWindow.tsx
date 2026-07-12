import React, { useEffect, useRef, useState } from 'react';
import type { Card, GardenSet, PendingAction } from '../../types/gameTypes';
import { CardChip } from '../../cards/CardChip';
import { isPower, cardName } from '../../cards/cardUtils';
import { hapticButton } from '../../utils/haptics';
import type { FlowerCard } from '../../types/gameTypes';

function resolveSetColor(set: GardenSet): string | null {
  if (set.flowers.length === 0) return null;
  const nonWild = set.flowers.filter(f => !f.isWildcard && f.color !== 'rainbow' && f.color !== 'triple_rainbow' && f.color !== 'divine');
  if (nonWild.length > 0) return nonWild[0].color;
  const nonTriple = set.flowers.filter(f => f.color !== 'triple_rainbow');
  if (nonTriple.length > 0) return nonTriple[0].color;
  return set.flowers[0]?.color ?? null;
}

function getFlowerEffectiveColor(f: FlowerCard): string | null {
  if (f.kind !== 'flower') return null;
  if (f.color === 'divine') return 'divine';
  if (f.color === 'rainbow' || f.color === 'triple_rainbow') return null;
  if (f.isWildcard) return f.representedColor ?? null;
  return f.color;
}

/** Compute which flowers will be removed if wind is allowed */
function computeDoomedFlowerIds(set: GardenSet, windCount: number): string[] {
  const stealCount = windCount >= 2 ? 4 : 1;
  const sourceColor = resolveSetColor(set);
  const preferred = set.flowers.filter(
    f => f.color !== 'triple_rainbow' && sourceColor !== null && getFlowerEffectiveColor(f) === sourceColor,
  );
  const otherNonTR = set.flowers.filter(
    f => f.color !== 'triple_rainbow' && !(sourceColor !== null && getFlowerEffectiveColor(f) === sourceColor),
  );
  const tr = set.flowers.filter(f => f.color === 'triple_rainbow');
  // Removal pops from end of each group
  const ordered = [
    ...preferred.reverse(),
    ...otherNonTR.reverse(),
    ...tr.reverse(),
  ];
  return ordered.slice(0, stealCount).map(f => f.id);
}

interface CounterWindowProps {
  isVisible: boolean;
  pendingAction: PendingAction | null;
  attackedGardenSet: GardenSet | null;
  myHand: Card[];
  timeRemaining: number;
  timeLimit: number;
  onAllow: () => void;
  onCounterWind: (count: number) => void;
  onCounterDivine: (cardId: string) => void;
  onClose?: () => void;
}

export const CounterWindow = React.memo(function CounterWindow({
  isVisible,
  pendingAction,
  attackedGardenSet,
  myHand,
  timeRemaining,
  timeLimit,
  onAllow,
  onCounterWind,
  onCounterDivine,
  onClose,
}: CounterWindowProps) {
  const [isClosing, setIsClosing] = useState(false);
  const autoAllowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-allow after 8 seconds if no input
  const [autoAllowCountdown, setAutoAllowCountdown] = useState(8);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    if (isVisible && !isClosing) {
      setAutoAllowCountdown(8);
      autoAllowRef.current = setTimeout(() => {
        // Use ref to avoid stale closure — always check latest isVisible value
        if (isVisibleRef.current) {
          handleAllow();
        }
      }, 8000);
      countdownIntervalRef.current = setInterval(() => {
        setAutoAllowCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (autoAllowRef.current) {
        clearTimeout(autoAllowRef.current);
        autoAllowRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isVisible, isClosing]);

  const handleAllow = () => {
    hapticButton();
    if (autoAllowRef.current) {
      clearTimeout(autoAllowRef.current);
      autoAllowRef.current = null;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onAllow();
    }, 250);
  };

  const handleCancel = () => {
    if (autoAllowRef.current) {
      clearTimeout(autoAllowRef.current);
      autoAllowRef.current = null;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 250);
  };

  const handleCounterWind = (count: number) => {
    hapticButton();
    if (autoAllowRef.current) {
      clearTimeout(autoAllowRef.current);
      autoAllowRef.current = null;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onCounterWind(count);
    }, 250);
  };

  const handleCounterDivine = (cardId: string) => {
    hapticButton();
    if (autoAllowRef.current) {
      clearTimeout(autoAllowRef.current);
      autoAllowRef.current = null;
    }
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onCounterDivine(cardId);
    }, 250);
  };

  if (!isVisible || !pendingAction) return null;

  const castCard = pendingAction.playedCards?.[0] ?? null;
  const isWindAttack = pendingAction.original.type === 'play_wind_single' || pendingAction.original.type === 'play_wind_double';
  const windCount = pendingAction.windCount ?? 1;

  const myWind = myHand.filter(c => isPower(c, 'wind'));
  const myDP = myHand.filter(c => isPower(c, 'divine_protection'));

  const timerPercent = timeLimit > 0 ? Math.max(0, Math.min(100, (timeRemaining / timeLimit) * 100)) : 0;
  const timerUrgent = timeRemaining <= 10;

  const targetFlowers = attackedGardenSet?.flowers ?? [];
  const doomedFlowerIds = isWindAttack && attackedGardenSet
    ? new Set(computeDoomedFlowerIds(attackedGardenSet, windCount))
    : new Set<string>();

  const animationClass = isClosing ? 'counter-window--exit' : 'counter-window--enter';

  return (
    <div className={`counter-window-overlay ${animationClass}`}>
      <div className="counter-window-panel">
        {/* Cast card (center, large) */}
        {castCard && (
          <div className="counter-window-cast">
            <div style={{ width: 120, height: 180 }}>
              <CardChip card={castCard} />
            </div>
            <span className="counter-window-cast-label">
              {cardName(castCard)}
              {isWindAttack && windCount > 1 && ` ×${windCount}`}
            </span>
          </div>
        )}

        {/* Target flowers */}
        {targetFlowers.length > 0 && (
          <div className="counter-window-targets">
            {targetFlowers.map((flower, i) => {
              const isDoomed = doomedFlowerIds.has(flower.id);
              return (
                <div
                  key={`${flower.id}-${i}`}
                  className={`counter-window-target-flower ${isDoomed ? 'is-doomed' : ''}`}
                  style={isDoomed ? {
                    opacity: 0.4,
                    transform: 'scale(0.85)',
                    filter: 'grayscale(0.7) brightness(0.6)',
                    transition: 'all 0.25s ease',
                  } : {
                    transition: 'all 0.25s ease',
                  }}
                >
                  <div style={{ width: 80, height: 80, position: 'relative' }}>
                    <CardChip card={flower} small />
                    {isDoomed && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 32,
                        fontWeight: 800,
                        color: '#e94560',
                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                        pointerEvents: 'none',
                      }}>
                        ✕
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Timer bar */}
        <div className="counter-window-timer">
          <div
            className="counter-window-timer-fill"
            style={{
              width: `${timerPercent}%`,
              background: timerUrgent ? 'var(--danger)' : 'var(--accent)',
            }}
          />
          <span className="counter-window-timer-text" style={{ color: timerUrgent ? 'var(--danger)' : 'var(--text-muted)' }}>
            {Math.ceil(timeRemaining)}s
          </span>
        </div>

        {/* Available counters */}
        {(myWind.length > 0 || myDP.length > 0) && (
          <div className="counter-window-counters">
            <span className="counter-window-counters-label">Counter with:</span>
            <div className="counter-window-counters-row">
              {myWind.length > 0 && (
                <>
                  <button
                    className="counter-window-counter-btn"
                    onClick={() => handleCounterWind(1)}
                    type="button"
                  >
                    <span className="counter-window-counter-icon">💨</span>
                    <span>Wind</span>
                    <span className="counter-window-counter-count">1</span>
                  </button>
                  {myWind.length >= 2 && (
                    <button
                      className="counter-window-counter-btn"
                      onClick={() => handleCounterWind(2)}
                      type="button"
                    >
                      <span className="counter-window-counter-icon">💨💨</span>
                      <span>Wind</span>
                      <span className="counter-window-counter-count">2</span>
                    </button>
                  )}
                </>
              )}
              {myDP.map(dp => (
                <button
                  key={dp.id}
                  className="counter-window-counter-btn"
                  onClick={() => handleCounterDivine(dp.id)}
                  type="button"
                >
                  <span className="counter-window-counter-icon">🛡️</span>
                  <span>Divine</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="counter-window-actions">
          <button
            className="counter-window-btn counter-window-btn--cancel"
            onClick={handleCancel}
            type="button"
            aria-label="Cancel"
          >
            ✗
          </button>
          <button
            className="counter-window-btn counter-window-btn--confirm"
            onClick={handleAllow}
            type="button"
            aria-label="Allow"
          >
            ✓ Allow{autoAllowCountdown > 0 && autoAllowCountdown < 8 ? ` (${autoAllowCountdown}s)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
});
