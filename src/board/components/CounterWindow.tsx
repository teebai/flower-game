import React, { useEffect, useRef, useState } from 'react';
import type { Card, GardenSet, PendingAction } from '../../types/gameTypes';
import { CardChip } from '../../cards/CardChip';
import { isPower, cardName } from '../../cards/cardUtils';

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

  // Auto-allow after 3 seconds if no input
  useEffect(() => {
    if (isVisible && !isClosing) {
      autoAllowRef.current = setTimeout(() => {
        if (isVisible) {
          handleAllow();
        }
      }, 3000);
    }
    return () => {
      if (autoAllowRef.current) {
        clearTimeout(autoAllowRef.current);
        autoAllowRef.current = null;
      }
    };
  }, [isVisible, isClosing]);

  const handleAllow = () => {
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
            {targetFlowers.map((flower, i) => (
              <div key={`${flower.id}-${i}`} className="counter-window-target-flower">
                <div style={{ width: 80, height: 80 }}>
                  <CardChip card={flower} small />
                </div>
              </div>
            ))}
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
            ✓
          </button>
        </div>
      </div>
    </div>
  );
});
