// ============================================================
// FLOWER GAME — CARD CHIP
// Restored from original backup (2026-05-11 04:40).
// Minimal changes: label hidden by CSS, emoji fallback behind art.
// GIFs are frozen to first frame so hand cards don't animate.
// ============================================================

import { useEffect, useRef, type PointerEventHandler } from 'react';
import type { Card } from '../types/gameTypes';
import { cardLabel, cardName } from './cardUtils';
import { cardArtKey, useCardArt } from './cardArt';

interface CardChipProps {
  card: Card | { id: string; kind: string };
  selected?: boolean;
  onClick?: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  draggable?: boolean;
  dragging?: boolean;
  dim?: boolean;
  small?: boolean;
  title?: string;
}

/** Detect whether a URL points to an animated GIF */
function isGif(url: string): boolean {
  return url.toLowerCase().endsWith('.gif');
}

/** Renders a GIF frozen at its first frame via offscreen canvas.
 *  This stops animation so hand cards stay static. */
function FrozenArt({ src, className }: { src: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.onerror = () => {
      // If canvas draw fails, leave canvas blank — parent will show emoji fallback
    };
    img.src = src;
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

export function CardChip({ card, selected, onClick, onPointerDown, draggable, dragging, dim, small, title }: CardChipProps) {
  const { getArt } = useCardArt();

  // Defensive: even 'hidden' cards render visibly (social game — no secrets)
  if (card.kind === 'hidden') {
    return (
      <div className="card-chip no-art">
        <span className="emoji">🃏</span>
      </div>
    );
  }

  const c = card as Card;
  const key = cardArtKey(c);
  const art = getArt(key);

  const className = [
    'card-chip',
    onClick ? 'selectable' : '',
    selected ? 'selected' : '',
    draggable ? 'draggable' : '',
    dragging ? 'dragging' : '',
    dim ? 'dim' : '',
    small ? 'small' : '',
    art ? '' : 'no-art',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-draggable={draggable ? 'true' : undefined}
      title={title}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {/* Art image — GIFs are frozen to first frame so they don't animate in hand */}
      {art && isGif(art) && <FrozenArt src={art} className="art" />}
      {art && !isGif(art) && <div className="art" style={{ backgroundImage: `url(${art})` }} />}
      {/* Emoji fallback — only when no art */}
      {!art && <span className="emoji">{cardLabel(c)}</span>}
    </div>
  );
}
