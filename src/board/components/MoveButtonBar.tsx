import React from 'react';
import type { GameState, Card } from '../../types/gameTypes';
import { isPower } from '../../cards/cardUtils';

interface MoveButtonBarProps {
  hand: Card[];
  opponents: string[];
  G: GameState;
  myTurn: boolean;
  hasNaturalDisasterTarget: boolean;
  drawPhaseSeason: string | null;
  handCount: number;
  isCounter: boolean;
  amTarget: boolean;
  inStage: boolean;
  nameOf: (player?: import('../../types/gameTypes').Player | null) => string;
  onPlantOwn: () => void;
  onPlantOpponent: () => void;
  onWind: () => void;
  onBug: () => void;
  onBee: () => void;
  onDoubleHappiness: () => void;
  onTradePresent: () => void;
  onTradeFate: () => void;
  onLetGo: () => void;
  onSeason: () => void;
  onNaturalDisaster: () => void;
  onEclipse: () => void;
  onGreatReset: () => void;
  onDiscardFlower: () => void;
  onPass: () => void;
  onDraw: () => void;
}

export const MoveButtonBar = React.memo(function MoveButtonBar({
  hand, opponents, G, myTurn, hasNaturalDisasterTarget, drawPhaseSeason,
  handCount, isCounter, amTarget, inStage, nameOf,
  onPlantOwn, onPlantOpponent, onWind, onBug, onBee,
  onDoubleHappiness, onTradePresent, onTradeFate, onLetGo,
  onSeason, onNaturalDisaster, onEclipse, onGreatReset,
  onDiscardFlower, onPass, onDraw,
}: MoveButtonBarProps) {
  const has = (name: string) => hand.some(c => isPower(c, name));
  const hasFlower = hand.some(c => c.kind === 'flower');

  if (myTurn && G.phase === 'action') {
    return (
      <>
        <div style={{ fontSize: 30, color: '#888', marginBottom: 4 }}>
          Moves: <b style={{ color: '#4ecca3' }}>{G.movesRemaining}</b>
        </div>
        <div className="v2-move-buttons">
          {hasFlower && <button className="v2-move-btn" title="Plant (own)" onClick={onPlantOwn}>🌱</button>}
          {hasFlower && opponents.length > 0 && <button className="v2-move-btn" title="Plant (opponent)" onClick={onPlantOpponent}>🌿</button>}
          {has('wind') && <button className="v2-move-btn" title="Wind ×1" onClick={onWind}>💨</button>}
          {has('bug') && <button className="v2-move-btn" title="Bug" onClick={onBug}>🐛</button>}
          {has('bee') && <button className="v2-move-btn" title="Bee" onClick={onBee}>🐝</button>}
          {has('double_happiness') && <button className="v2-move-btn" title="Double Happiness" onClick={onDoubleHappiness}>🎉</button>}
          {has('trade_present') && <button className="v2-move-btn" title="Trade Present" onClick={onTradePresent}>🎁</button>}
          {has('trade_fate') && <button className="v2-move-btn" title="Trade Fate" onClick={onTradeFate}>🔀</button>}
          {has('let_go') && <button className="v2-move-btn" title="Let Go" onClick={onLetGo}>✋</button>}
          {['spring','summer','autumn','winter'].some(s => has(s)) && <button className="v2-move-btn" title="Season" onClick={onSeason}>🌸</button>}
          {has('natural_disaster') && hasNaturalDisasterTarget && <button className="v2-move-btn" title="Natural Disaster" onClick={onNaturalDisaster}>🌪️</button>}
          {has('eclipse') && <button className="v2-move-btn" title="Eclipse" onClick={onEclipse}>🌑</button>}
          {has('great_reset') && <button className="v2-move-btn" title="Great Reset" onClick={onGreatReset}>♻️</button>}
          {G.season === 'autumn' && hasFlower && <button className="v2-move-btn" title="Discard Flower" onClick={onDiscardFlower}>🍂</button>}
          <button className="v2-move-btn v2-move-btn--pass" title="End turn" onClick={onPass}>⏭ End</button>
        </div>
      </>
    );
  }

  if (G.phase === 'draw' && myTurn) {
    if (drawPhaseSeason === 'winter' && handCount > 0) {
      return <div style={{ fontSize: 33, color: '#888' }}>❄️ No draw in winter…</div>;
    }
    // Draw button moved to center arena indicator
    return null;
  }

  if (G.phase === 'blessing' && myTurn) {
    return <div style={{ fontSize: 33, color: '#e6c84a' }}>👑 Blessing…</div>;
  }

  if (isCounter && amTarget && inStage) {
    return <div style={{ fontSize: 33, color: '#e94560' }}>⚡ Counter!</div>;
  }

  return (
    <div style={{ fontSize: 33, color: '#888' }}>
      {isCounter
        ? `⏳ ${nameOf(G.players.find(p => p.id === G.pendingAction?.targetPlayerId))}…`
        : `⏳ ${nameOf(G.players.find(p => p.id === G.turnOrder[G.currentPlayerIndex]))}`
      }
    </div>
  );
});
