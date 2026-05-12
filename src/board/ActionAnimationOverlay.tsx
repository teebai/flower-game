import { memo, useEffect, useState, useCallback } from 'react';
import { getActionAnimation } from '../cards/actionAnimations';
import type { PowerCardName } from '../types/gameTypes';

export interface ActionAnimationOverlayProps {
  active: { name: PowerCardName; phase: 'cast' | 'success' | 'win'; targetPlayerId?: string } | null;
  onComplete: () => void;
}

const AUTO_DISMISS_MS = 2500;

export const ActionAnimationOverlay = memo(function ActionAnimationOverlay({ active, onComplete }: ActionAnimationOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const url = active ? getActionAnimation(active.name, active.phase) : null;

  useEffect(() => {
    if (!active || !url) {
      setVisible(false);
      setImgLoaded(false);
      setImgError(false);
      return;
    }

    setImgLoaded(false);
    setImgError(false);
    // Small delay for fade-in
    const showTimer = setTimeout(() => setVisible(true), 50);
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      const clearTimer = setTimeout(onComplete, 300); // wait for fade-out
      return () => clearTimeout(clearTimer);
    }, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [active, url, onComplete]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onComplete, 300);
  }, [onComplete]);

  if (!active || !url) return null;

  // If image fails to load, skip animation
  if (imgError) {
    onComplete();
    return null;
  }

  return (
    <div
      className="action-animation-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: visible && imgLoaded ? 1 : 0,
        transition: 'opacity 300ms ease',
        background: 'rgba(0,0,0,0.15)',
      }}
      onClick={handleDismiss}
    >
      <img
        src={url}
        alt={`${active.name} animation`}
        draggable={false}
        style={{
          maxWidth: 'min(90vw, 520px)',
          maxHeight: 'min(80vh, 380px)',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.4))',
          pointerEvents: 'auto',
          cursor: 'pointer',
          transform: visible ? 'scale(1)' : 'scale(0.85)',
          transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
      />
    </div>
  );
});
