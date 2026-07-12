import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { getActionAnimation } from '../cards/actionAnimations';
import { GifPlayer } from './GifPlayer';
import type { PowerCardName } from '../types/gameTypes';

export interface ActionAnimationOverlayProps {
  active: { name: PowerCardName; phase: 'cast' | 'success' | 'win'; targetPlayerId?: string } | null;
  onComplete: () => void;
}

const SEASON_DISMISS_MS = 2200;
const DEFAULT_DISMISS_MS = 4000;

function getDismissMs(name: PowerCardName): number {
  if (['spring', 'summer', 'autumn', 'winter'].includes(name)) return SEASON_DISMISS_MS;
  return DEFAULT_DISMISS_MS;
}

export const ActionAnimationOverlay = memo(function ActionAnimationOverlay({ active, onComplete }: ActionAnimationOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const url = active ? getActionAnimation(active.name, active.phase) : null;
  const isSeason = active ? ['spring', 'summer', 'autumn', 'winter'].includes(active.name) : false;

  useEffect(() => {
    if (!active || !url) {
      setVisible(false);
      setImgLoaded(false);
      setImgError(false);
      return;
    }

    setImgLoaded(false);
    setImgError(false);
    const showTimer = setTimeout(() => setVisible(true), 50);
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      const clearTimer = setTimeout(onComplete, 300);
      return () => clearTimeout(clearTimer);
    }, getDismissMs(active.name));

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [active, url, onComplete]);

  // Handle cached images that fire onLoad before React attaches the listener
  useEffect(() => {
    if (isSeason || !imgRef.current || !url) return;
    if (imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setImgLoaded(true);
    }
  }, [url, isSeason]);

  useEffect(() => {
    if (imgError) {
      const t = setTimeout(onComplete, 50);
      return () => clearTimeout(t);
    }
  }, [imgError, onComplete]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onComplete, 300);
  }, [onComplete]);

  if (!active || !url) return null;

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
      {isSeason ? (
        <div
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          style={{
            pointerEvents: 'auto',
            cursor: 'pointer',
            transform: visible ? 'scale(1)' : 'scale(0.85)',
            transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.4))',
          }}
        >
          <GifPlayer
            src={url}
            width={1040}
            height={760}
            targetDuration={SEASON_DISMISS_MS}
            repeat={active.name === 'summer'}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <img
          ref={imgRef}
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
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        />
      )}
    </div>
  );
});
