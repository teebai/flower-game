// ============================================================
// FLOWER GAME — CARD CHIP
// Renders a single card, using uploaded art when available and
// falling back to the emoji representation.
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

  // Opponent face-down card
  if (card.kind === 'hidden') {
    const back = getArt('back');
    const className = [
      'card-chip',
      'hidden-back',
      small ? 'small' : '',
      back ? '' : 'no-art',
    ].filter(Boolean).join(' ');
    return (
      <div
        className={className}
        aria-label="face-down card"
        title="face-down card"
        draggable={false}
      >
        {back ? <div className="art" style={{ backgroundImage: `url(${back})` }} /> : <span className="emoji">🂠</span>}
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
      {art ? (
        <>
          <div className="art" style={{ backgroundImage: `url(${art})` }} />
          <div className="label">{cardName(c)}</div>
        </>
      ) : (
        <>
          <span className="emoji">{cardLabel(c)}</span>
          <span className="label">{cardName(c)}</span>
        </>
      )}
    </div>
  );
}
