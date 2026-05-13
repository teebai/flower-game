import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Card, Season } from '../../types/gameTypes';
import { CardChip } from '../../cards/CardChip';

interface DiscardPileProps {
  topCard: Card | null;
  discardCount: number;
  season: Season;
  history?: Card[];
}

type AnimationPhase = 'idle' | 'flying' | 'exploding' | 'ghost' | 'settled';

const SEASON_GLOW: Record<string, string> = {
  spring: '0 0 20px rgba(255, 126, 182, 0.6), 0 0 40px rgba(255, 126, 182, 0.3)',
  summer: '0 0 20px rgba(255, 214, 0, 0.6), 0 0 40px rgba(255, 214, 0, 0.3)',
  autumn: '0 0 20px rgba(255, 140, 0, 0.6), 0 0 40px rgba(255, 140, 0, 0.3)',
  winter: '0 0 20px rgba(100, 181, 246, 0.6), 0 0 40px rgba(100, 181, 246, 0.3)',
};

export const DiscardPile = React.memo(function DiscardPile({
  topCard,
  discardCount,
  season,
  history = [],
}: DiscardPileProps) {
  const [phase, setPhase] = useState<AnimationPhase>('idle');
  const [showHistory, setShowHistory] = useState(false);
  const [particles, setParticles] = useState<number[]>([]);
  const prevTopCardRef = useRef<Card | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glow = SEASON_GLOW[season ?? ''] || '0 0 20px rgba(255, 255, 255, 0.2)';

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const prev = prevTopCardRef.current;
    const changed = topCard && (!prev || topCard.id !== prev.id);

    if (changed) {
      clearTimeouts();
      prevTopCardRef.current = topCard;
      setPhase('flying');
      setParticles(Array.from({ length: 14 }, (_, i) => i));

      // fly -> explode
      timeoutRef.current = setTimeout(() => {
        setPhase('exploding');
        // explode -> ghost
        timeoutRef.current = setTimeout(() => {
          setPhase('ghost');
          // ghost -> settled
          timeoutRef.current = setTimeout(() => {
            setPhase('settled');
            setParticles([]);
          }, 2000);
        }, 600);
      }, 500);
    }

    return clearTimeouts;
  }, [topCard, clearTimeouts]);

  const isAnimating = phase === 'flying' || phase === 'exploding' || phase === 'ghost';

  return (
    <>
      <div
        className="discard-pile"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 45,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
        onClick={() => setShowHistory(true)}
        role="button"
        aria-label={`Discard pile: ${discardCount} cards`}
      >
        {/* Animated flying card */}
        {isAnimating && topCard && (
          <div className={`discard-firework-card discard-firework-card--${phase}`}>
            <div style={{ width: 80, height: 120 }}>
              <CardChip card={topCard} small />
            </div>
          </div>
        )}

        {/* Particle burst */}
        {phase === 'exploding' && (
          <div className="discard-particles" aria-hidden="true">
            {particles.map(i => (
              <div
                key={i}
                className="discard-particle"
                style={{ '--particle-angle': `${(i * 25.7) % 360}deg` } as React.CSSProperties}
              />
            ))}
          </div>
        )}

        {/* Ghost glow */}
        {phase === 'ghost' && topCard && (
          <div className="discard-ghost" style={{ boxShadow: glow }}>
            <div style={{ width: 80, height: 120, filter: 'blur(2px) brightness(1.4)' }}>
              <CardChip card={topCard} small />
            </div>
          </div>
        )}

        {/* Static discard pile thumbnail */}
        <div
          className="discard-pile-thumb"
          style={{
            width: 80,
            height: 120,
            borderRadius: 8,
            border: '2px solid rgba(255,255,255,0.12)',
            background: 'rgba(22, 33, 62, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            boxShadow: glow,
            transition: 'opacity 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease',
            opacity: isAnimating ? 0.4 : 1,
            transform: isAnimating ? 'scale(0.9)' : 'scale(1)',
          }}
        >
          {topCard ? (
            <div style={{ width: 72, height: 108 }}>
              <CardChip card={topCard} small />
            </div>
          ) : (
            <span style={{ fontSize: 28, opacity: 0.35 }}>🗑️</span>
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-muted)',
              background: 'rgba(0,0,0,0.35)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            {discardCount}
          </span>
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div
          className="discard-history-modal"
          onClick={() => setShowHistory(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Discard pile history"
        >
          <div className="discard-history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="discard-history-header">
              <h3>Discard Pile</h3>
              <button
                className="discard-history-close"
                onClick={() => setShowHistory(false)}
                aria-label="Close"
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="discard-history-list">
              {history.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No cards discarded yet.</p>
              ) : (
                [...history].reverse().map((card, i) => (
                  <div key={`${card.id}-${i}`} className="discard-history-item">
                    <CardChip card={card} small />
                    <span className="discard-history-index">#{history.length - i}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
