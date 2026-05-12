import React from 'react';
import type { GameState } from '../../types/gameTypes';
import { CardChip } from '../../cards/CardChip';

interface BlessingPanelProps {
  blessingState: NonNullable<GameState['blessingState']>;
  blessingStep: 'pick' | 'arrange';
  blessingArranged: string[];
  blessingPicked: string[];
  onSetStep: (step: 'pick' | 'arrange') => void;
  onSetArranged: (arr: string[]) => void;
  onSetPicked: (ids: string[]) => void;
  onMoveCard: (idx: number, dir: -1 | 1) => void;
  onReset: () => void;
  runMove: (fn: () => void) => void;
  moves: {
    blessingChoose: (picked: string[], arranged: string[]) => void;
  };
}

function btn(bg: string, color = '#fff') {
  return {
    background: bg, color, border: 'none',
    borderRadius: 8, padding: '8px 14px',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
  };
}

export const BlessingPanel = React.memo(function BlessingPanel({
  blessingState: bs,
  blessingStep,
  blessingArranged,
  blessingPicked,
  onSetStep,
  onSetArranged,
  onSetPicked,
  onMoveCard,
  onReset,
  runMove,
  moves: m,
}: BlessingPanelProps) {
  if (bs.coinResult === 'tails') {
    return (
      <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 20, marginTop: 12, color: '#888' }}>
        🪙 <b style={{ color: '#ccc' }}>Tails</b> — no bonus. Proceeding to draw…
      </div>
    );
  }

  const cards = bs.revealedCards;

  if (bs.emptyHandMode) {
    const arranged = blessingArranged.length === cards.length
      ? blessingArranged
      : cards.map(c => c.id);

    return (
      <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
        <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🪙 Heads! (Empty Hand Bonus)</h3>
        <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
          You already drew 7 cards. Arrange these 7 cards in the order you want them back on top of the draw pile (position 1 = next drawn):
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {arranged.map((id, idx) => {
            const card = cards.find(c => c.id === id)!;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#888', fontSize: 12, minWidth: 20 }}>#{idx + 1}</span>
                <CardChip card={card} />
                <button style={btn('#333')} onClick={() => onMoveCard(idx, -1)} disabled={idx === 0}>▲</button>
                <button style={btn('#333')} onClick={() => onMoveCard(idx, 1)} disabled={idx === arranged.length - 1}>▼</button>
              </div>
            );
          })}
        </div>
        <button style={{ ...btn('#4ecca3', '#1a1a2e'), fontSize: 15, padding: '10px 24px' }}
          onClick={() => {
            runMove(() => m.blessingChoose([], arranged.length === cards.length ? arranged : cards.map(c => c.id)));
            onReset();
          }}>
          ✔ Confirm Order
        </button>
      </div>
    );
  }

  if (blessingStep === 'pick') {
    return (
      <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
        <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🪙 Heads! Pick 2 Cards</h3>
        <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
          Choose <b>2 cards</b> to take into your hand. The remaining 5 will go back on top of the draw pile.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 14 }}>
          {cards.map(card => (
            <CardChip key={card.id} card={card}
              selected={blessingPicked.includes(card.id)}
              onClick={() => {
                onSetPicked(prev => {
                  if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
                  if (prev.length >= 2) return prev;
                  return [...prev, card.id];
                });
              }}
            />
          ))}
        </div>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Selected: {blessingPicked.length}/2
        </p>
        {blessingPicked.length === 2 && (
          <button style={{ ...btn('#e6c84a', '#1a1a2e'), fontSize: 14, padding: '10px 24px' }}
            onClick={() => {
              const remaining = cards.filter(c => !blessingPicked.includes(c.id)).map(c => c.id);
              onSetArranged(remaining);
              onSetStep('arrange');
            }}>
            Next: Arrange Remaining 5 →
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12 }}>
      <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>✨ Arrange Top 5 Cards</h3>
      <p style={{ color: '#ccc', fontSize: 13, marginBottom: 14 }}>
        Set the order these 5 cards go back on top of the draw pile. Position #1 will be drawn next.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {blessingArranged.map((id, idx) => {
          const card = cards.find(c => c.id === id)!;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#888', fontSize: 12, minWidth: 20 }}>#{idx + 1}</span>
              <CardChip card={card} />
              <button style={btn('#333')} onClick={() => onMoveCard(idx, -1)} disabled={idx === 0}>▲</button>
              <button style={btn('#333')} onClick={() => onMoveCard(idx, 1)} disabled={idx === blessingArranged.length - 1}>▼</button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button style={btn('#555')} onClick={() => onSetStep('pick')}>← Back</button>
        <button style={{ ...btn('#4ecca3', '#1a1a2e'), fontSize: 14, padding: '10px 24px' }}
          onClick={() => {
            runMove(() => m.blessingChoose(blessingPicked, blessingArranged));
            onReset();
          }}>
          ✔ Confirm & Continue
        </button>
      </div>
    </div>
  );
});
