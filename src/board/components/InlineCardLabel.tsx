import React from 'react';
import type { Card } from '../../types/gameTypes';
import { cardName, cardLabel } from '../../cards/cardUtils';
import { flowerArt } from '../../utils/flowerArt';

interface InlineCardLabelProps {
  card: Card;
}

export const InlineCardLabel = React.memo(function InlineCardLabel({ card }: InlineCardLabelProps) {
  if (card.kind === 'flower') {
    const art = flowerArt(card.color);
    return (
      <span className="inline-card-label">
        {art
          ? <img src={art} alt={card.color} className="inline-flower-icon" />
          : <span aria-hidden="true">{cardLabel(card)}</span>}
        <span>{cardName(card)}</span>
      </span>
    );
  }

  return (
    <span className="inline-card-label">
      <span aria-hidden="true">{cardLabel(card)}</span>
      <span>{cardName(card)}</span>
    </span>
  );
});
