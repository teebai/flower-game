// ============================================================
// FLOWER GAME — CARD CHIP
// Restored from original backup (2026-05-11 04:40).
// Minimal changes: label hidden by CSS, emoji fallback behind art.
// ============================================================

import type { PointerEventHandler } from 'react';
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

export function CardChip({ card, selected, onClick, onPointerDown, draggable, dragging, dim, small, title }: CardChipProps) {
  const { getArt } = useCardArt();

  // Defensive: even 'hidden' cards render visibly (social game — no secrets)
  if (card.kind === 'hidden') {
    return (
      <div className="card-chip no-art" title="Card">
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
      title={title ?? cardName(c)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      {/* Art image (CSS background) */}
      {art && <div className="art" style={{ backgroundImage: `url(${art})` }} />}
      {/* Emoji fallback — only when no art */}
      {!art && <span className="emoji">{cardLabel(c)}</span>}
    </div>
  );
}
