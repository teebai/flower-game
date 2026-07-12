// ============================================================
// FLOWER GAME — BLESSING PANEL (v9 — bulletproof fly + transition entrance)
// ============================================================

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { GameState, Card } from '../../types/gameTypes';
import { CardChip } from '../../cards/CardChip';
import { cardLabel } from '../../cards/cardUtils';
import { cardArtKey, useCardArt } from '../../cards/cardArt';

interface BlessingPanelProps {
  blessingState: NonNullable<GameState['blessingState']>;
  picked: string[];
  arranged: string[];
  onSetPicked: React.Dispatch<React.SetStateAction<string[]>>;
  onSetArranged: React.Dispatch<React.SetStateAction<string[]>>;
  onReset: () => void;
  runMove: (fn: () => unknown) => void;
  /** Called right before the blessing move commits so parent can set up hand-draw animation */
  onBlessingCommit?: (pickedCount: number) => void;
  /** Number of cards the player must pick (2 normal, 3 summer) */
  pickLimit: number;
  moves: {
    blessingChoose?: (picked: string[], arranged: string[]) => void;
  };
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

export const BlessingPanel = React.memo(function BlessingPanel({
  blessingState: bs,
  picked,
  arranged,
  onSetPicked,
  onSetArranged,
  onReset,
  runMove,
  onBlessingCommit,
  pickLimit,
  moves: m,
}: BlessingPanelProps) {
  const cards = bs.revealedCards;
  const isEmptyHand = bs.emptyHandMode;
  const arrangeLimit = cards.length - pickLimit;
  const total = cards.length;
  const { getArt } = useCardArt();

  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // ═══════════════════════════════════════════════════════════
  // Empty hand mode — preserved exactly
  // ═══════════════════════════════════════════════════════════
  if (isEmptyHand) {
    const finalArranged = arranged.length === total ? arranged : cards.map(c => c.id);
    return (
      <div style={{ background: '#2d1b4e', borderRadius: 12, padding: 20, marginTop: 12, textAlign: 'center' }}>
        <h3 style={{ color: '#e6c84a', marginBottom: 8 }}>🪙 Heads! (Empty Hand Bonus)</h3>
        <p style={{ color: '#ccc', fontSize: 39, marginBottom: 14 }}>
          Arrange the 7 draw-pile cards in your preferred order.
        </p>
        <div className="blessing-fan" style={{ margin: '24px auto' }}>
          {finalArranged.map((id, i) => (
            <div
              key={id}
              className="blessing-fan-card"
              data-card-id={id}
              style={{ transform: fanTransform(i, total) }}
            >
              <img src="/back_art.png" alt="Card back" draggable={false} className="blessing-card-back" />
              <span className="blessing-rank">{RANK_LABELS[i]}</span>
            </div>
          ))}
        </div>
        <button
          style={{
            background: '#4ecca3', color: '#1a1a2e', border: 'none', borderRadius: 8,
            padding: '10px 24px', fontWeight: 700, fontSize: 45, cursor: 'pointer', marginTop: 16,
          }}
          onClick={() => {
            runMove(() => m.blessingChoose?.([], finalArranged));
            onReset();
          }}
        >
          ✔ Confirm Order
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Normal mode state
  // ═══════════════════════════════════════════════════════════
  const selectedSet = useMemo(() => new Set(picked), [picked]);
  const allSelected = picked.length === pickLimit;
  const arrangedSet = useMemo(() => new Set(arranged), [arranged]);
  const [isFlying, setIsFlying] = useState(false);

  // Stable display order for main row: picked first, then unselected in original order
  const displayOrder = useMemo(() => {
    const allIds = cards.map(c => c.id);
    const unselected = allIds.filter(id => !picked.includes(id));
    return [...picked, ...unselected];
  }, [cards, picked]);

  const displayCards = useMemo(
    () => displayOrder.map(id => cardMap.get(id)).filter(Boolean) as Card[],
    [displayOrder, cardMap]
  );

  // ── DOM refs ──
  const previewRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const refSetters = useRef(new Map<string, (node: HTMLDivElement | null) => void>());
  const flyerTimersRef = useRef<number[]>([]);

  const getCardRef = useCallback((id: string) => {
    if (!refSetters.current.has(id)) {
      refSetters.current.set(id, (node) => {
        if (node) cardRefs.current.set(id, node);
        else cardRefs.current.delete(id);
      });
    }
    return refSetters.current.get(id)!;
  }, []);

  // Cleanup leftover flyers on unmount
  useEffect(() => {
    return () => {
      flyerTimersRef.current.forEach(id => clearTimeout(id));
      flyerTimersRef.current = [];
      document.querySelectorAll('.blessing-arrange-flyer, .blessing-confirm-flyer').forEach(el => el.remove());
    };
  }, []);

  // Create a fixed portal that escapes all transform/filter ancestors
  useEffect(() => {
    let portal = document.getElementById('flyer-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'flyer-portal';
      portal.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 99999; perspective: 1200px;';
      document.body.appendChild(portal);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Animation helpers
  // ═══════════════════════════════════════════════════════════

  /** Spawn a 3D-flipping flyer clone that flies from card row to preview strip */
  const spawnArrangeFlyer = useCallback((
    sourceRect: DOMRect,
    card: Card,
    insertIndex: number
  ) => {
    const artUrl = getArt(cardArtKey(card));
    const portal = document.getElementById('flyer-portal');
    if (!portal) return;

    // 3D flip container
    const flyer = document.createElement('div');
    flyer.style.cssText = `
      position: absolute;
      left: ${sourceRect.left}px;
      top: ${sourceRect.top}px;
      width: ${sourceRect.width}px;
      height: ${sourceRect.height}px;
      z-index: 99999;
      pointer-events: none;
      transform-style: preserve-3d;
      transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
      transform: translate3d(0,0,0) scale(1) rotateY(0deg);
      opacity: 1;
      border-radius: 12px;
      background: #e2e2e2;
    `;

    // FRONT face (card art) — starts visible
    const front = document.createElement('div');
    front.style.cssText = `
      position: absolute; inset: 0; border-radius: 12px; overflow: hidden;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      background: ${artUrl ? `url(${artUrl})` : '#2d1b4e'};
      background-size: cover;
      background-position: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;
    if (!artUrl) {
      front.style.display = 'flex';
      front.style.alignItems = 'center';
      front.style.justifyContent = 'center';
      front.style.fontSize = '40px';
      front.style.color = 'white';
      front.textContent = cardLabel(card);
    }

    // BACK face (back_art.png) — starts hidden (rotated 180)
    const back = document.createElement('div');
    back.style.cssText = `
      position: absolute; inset: 0; border-radius: 12px; overflow: hidden;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      transform: rotateY(180deg);
      background: url('/back_art.png');
      background-size: cover;
      background-position: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    `;

    flyer.appendChild(front);
    flyer.appendChild(back);
    portal.appendChild(flyer);

    // Force reflow
    void flyer.offsetWidth;

    // Compute target position in preview strip
    const previewEl = previewRef.current;
    if (!previewEl) {
      flyer.remove();
      return;
    }

    const pRect = previewEl.getBoundingClientRect();
    const cardW = 80;   // matches .blessing-preview-card width
    const cardH = 112;  // matches .blessing-preview-card height
    const gap = 8;

    const totalCards = insertIndex + 1;
    const totalWidth = totalCards * cardW + (totalCards - 1) * gap;
    const stripStartX = pRect.left + (pRect.width - totalWidth) / 2;

    // Target the CENTER of the preview slot so scale-from-center keeps us aligned
    const slotCenterX = stripStartX + insertIndex * (cardW + gap) + cardW / 2;
    const slotCenterY = pRect.top + pRect.height / 2;

    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;

    // Scale so flyer dimensions exactly match the preview card
    const targetScale = cardW / sourceRect.width;

    // Animate: flip 180° while flying to target
    const moveT = window.setTimeout(() => {
      flyer.style.transform = `translate3d(${slotCenterX - sourceCenterX}px, ${slotCenterY - sourceCenterY}px, 0) scale(${targetScale}) rotateY(180deg)`;
    }, 50);

    // Fade out and remove after landing
    const removeT = window.setTimeout(() => {
      flyer.style.opacity = '0';
      const cleanupT = window.setTimeout(() => flyer.remove(), 300);
      flyerTimersRef.current.push(cleanupT);
    }, 1300);

    flyerTimersRef.current.push(moveT, removeT);
  }, [getArt]);

  /** Two-phase confirm animation: stack → fly to draw pile */
  const spawnConfirmFlyers = useCallback((arrangedIds: string[]) => {
    const portal = document.getElementById('flyer-portal');
    if (!portal) return;

    const previewEl = previewRef.current;
    if (!previewEl) return;

    const pRect = previewEl.getBoundingClientRect();
    const centerX = pRect.left + pRect.width / 2 - 40; // 40 = half of 80px card
    const centerY = pRect.top + pRect.height / 2 - 56; // 56 = half of 112px card

    const flyers: HTMLDivElement[] = [];

    arrangedIds.forEach((cardId, i) => {
      const previewCard = previewEl.querySelector(`[data-preview-id="${cardId}"]`) as HTMLElement;
      if (!previewCard) return;

      const rect = previewCard.getBoundingClientRect();

      const flyer = document.createElement('div');
      flyer.style.cssText = `
        position: absolute;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        z-index: ${100 + (arrangedIds.length - 1 - i)};
        pointer-events: none;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
        transform: translate3d(0,0,0) scale(1);
        opacity: 1;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;

      const img = document.createElement('img');
      img.src = '/back_art.png';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px;';
      flyer.appendChild(img);

      const rank = document.createElement('span');
      rank.textContent = String(i + 1);
      rank.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 32px; font-weight: 900;
        color: #ffffff; -webkit-text-stroke: 2px #ff00ff; text-shadow: 0 0 6px rgba(255,0,255,0.4), 0 1px 3px rgba(0,0,0,0.6);
        pointer-events: none;
      `;
      flyer.appendChild(rank);

      portal.appendChild(flyer);
      flyers.push(flyer);

      // Hide the original preview card immediately
      previewCard.style.opacity = '0';
    });

    void flyers[0]?.offsetWidth;

    // PHASE 1: Stack all cards to center (with slight stagger)
    const stackT = window.setTimeout(() => {
      flyers.forEach((flyer, i) => {
        flyer.style.transform = `translate3d(${centerX - parseFloat(flyer.style.left)}px, ${centerY - parseFloat(flyer.style.top)}px, 0) scale(1)`;
        flyer.style.zIndex = String(100 + (flyers.length - 1 - i));
      });
    }, 50);

    // PHASE 2: Fly stacked deck to draw pile (center top of screen)
    const drawPileX = window.innerWidth / 2 - 40;
    const drawPileY = 80;

    const flyT = window.setTimeout(() => {
      flyers.forEach((flyer, i) => {
        const staggerX = i * 2;
        const staggerY = i * 2;
        flyer.style.transition = 'transform 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease';
        flyer.style.transform = `translate3d(${drawPileX - parseFloat(flyer.style.left) + staggerX}px, ${drawPileY - parseFloat(flyer.style.top) + staggerY}px, 0) scale(0.6)`;
        flyer.style.opacity = '0';
      });
    }, 800);

    // Cleanup — don't restore preview card opacity, panel unmounts right after
    const removeT = window.setTimeout(() => {
      flyers.forEach(f => f.remove());
    }, 1700);

    flyerTimersRef.current.push(stackT, flyT, removeT);
  }, []);



  // ═══════════════════════════════════════════════════════════
  // Tap handler
  // ═══════════════════════════════════════════════════════════
  const handleTap = useCallback((cardId: string) => {
    if (isFlying) return;
    const isSelected = selectedSet.has(cardId);
    const inArranged = arrangedSet.has(cardId);

    if (picked.length < pickLimit) {
      // ── Selection mode ──
      if (isSelected) {
        onSetPicked(prev => prev.filter(id => id !== cardId));
      } else if (picked.length < pickLimit) {
        onSetPicked(prev => [...prev, cardId]);
      }
    } else {
      // ── Arrangement mode ──
      if (isSelected) {
        onSetPicked(prev => prev.filter(id => id !== cardId));
      } else if (inArranged) {
        onSetArranged(prev => prev.filter(id => id !== cardId));
      } else if (arranged.length < arrangeLimit) {
        // Add to arranged pile with fly animation
        const sourceEl = cardRefs.current.get(cardId);
        const card = cardMap.get(cardId);
        if (sourceEl && card) {
          // 1. Instantly hide original card — flyer clone is on top, user sees no cut
          sourceEl.style.visibility = 'hidden';
          sourceEl.style.pointerEvents = 'none';

          // 2. Spawn 3D flip flyer
          spawnArrangeFlyer(
            sourceEl.getBoundingClientRect(),
            card,
            arranged.length
          );

          // 3. Only add to arranged state AFTER flyer lands (1.2s)
          const addT = window.setTimeout(() => {
            onSetArranged(prev => [...prev, cardId]);
            // Wait for React re-render with .is-arranged BEFORE clearing inline styles
            const clearT = window.setTimeout(() => {
              sourceEl.style.visibility = '';
              sourceEl.style.pointerEvents = '';
            }, 80);
            flyerTimersRef.current.push(clearT);
          }, 1200);
          flyerTimersRef.current.push(addT);
        }
      }
    }
  }, [picked, selectedSet, arrangedSet, arranged.length, onSetPicked, onSetArranged, isFlying, cardMap, spawnArrangeFlyer, pickLimit, arrangeLimit]);

  // ═══════════════════════════════════════════════════════════
  // Confirm with staggered fly animation
  // ═══════════════════════════════════════════════════════════
  const handleConfirm = useCallback(() => {
    if (!allSelected || isFlying) return;

    const allIds = cards.map(c => c.id);
    const remaining = allIds.filter(id => !picked.includes(id) && !arranged.includes(id));
    const finalArranged = [...arranged, ...remaining];

    if (arranged.length === 0 && remaining.length === 0) {
      runMove(() => m.blessingChoose?.(picked, []));
      return;
    }

    setIsFlying(true);
    spawnConfirmFlyers(finalArranged);

    const commitT = window.setTimeout(() => {
      setIsFlying(false);
      onBlessingCommit?.(picked.length);
      runMove(() => m.blessingChoose?.(picked, finalArranged));
    }, 1800);
    flyerTimersRef.current.push(commitT);
  }, [allSelected, isFlying, arranged, cards, picked, runMove, m, spawnConfirmFlyers]);

  // ═══════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════
  const isArranging = allSelected;

  return (
    <div className="blessing-hand-panel">
      <h3 className="blessing-title">🪙 Heads! Blessing of the Gods</h3>
      <p className="blessing-instruction">
        {!allSelected
          ? `Tap ${pickLimit} cards to keep. The rest go back on top of the draw pile.`
          : 'Tap unselected cards to set draw order. 1st tap = drawn first.'}
      </p>
      <p className={`blessing-counter ${allSelected ? 'is-full' : ''}`}>
        Selected: {picked.length}/{pickLimit} {allSelected ? '✓' : ''}
      </p>

      {/* ── Main 7-card row ── */}
      <div className="blessing-unified-row">
        {displayCards.map((card, i) => {
          const isSelected = selectedSet.has(card.id);
          const isArranged = arrangedSet.has(card.id);
          const unselectedIndex = isSelected ? -1 : i - picked.length;
          const isLastSelected = isSelected && i === picked.length - 1;

          return (
            <React.Fragment key={card.id}>
              <div
                ref={getCardRef(card.id)}
                draggable={false}
                className={`blessing-unified-card ${isSelected ? 'is-selected' : 'is-unselected'} ${isArranged ? 'is-arranged' : ''}`}
                style={isSelected || isArranged ? undefined : {
                  transform: `translateY(${Math.abs(i - 3) * 2}px) rotate(${(i - 3) * 2}deg)`,
                }}
                onPointerDown={() => handleTap(card.id)}
              >
                {isArranging && !isSelected && !isArranged && unselectedIndex >= 0 && (
                  <span className="blessing-rank">
                    {RANK_LABELS[unselectedIndex]}
                  </span>
                )}
                <CardChip card={card} draggable={false} dragging={false} />
              </div>
              {isLastSelected && <div className="blessing-spacer" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Preview strip ── */}
      <div ref={previewRef} className="blessing-preview-strip">
        {arranged.map((cardId, i) => {
          const card = cardMap.get(cardId);
          if (!card) {
            return (
              <div key={cardId} className="blessing-preview-card" style={{ color: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                MISSING
              </div>
            );
          }
          const isNewest = i === arranged.length - 1;
          return (
            <div
              key={cardId}
              data-preview-id={cardId}
              className={`blessing-preview-card ${isNewest ? 'is-entering' : ''}`}
              ref={el => {
                if (el && isNewest) {
                  void el.offsetWidth;
                  requestAnimationFrame(() => el.classList.remove('is-entering'));
                }
              }}
              onPointerDown={() => onSetArranged(prev => prev.filter(id => id !== cardId))}
            >
              <img src="/back_art.png" alt="" draggable={false} />
              <span className="blessing-preview-rank">{i + 1}</span>
            </div>
          );
        })}
      </div>

      <button
        className="blessing-confirm-btn"
        disabled={picked.length !== pickLimit || isFlying}
        onClick={handleConfirm}
        style={{ position: 'relative', zIndex: 20 }}
      >
        {picked.length === pickLimit ? '✔ Confirm & Continue' : `Select ${pickLimit - picked.length} more`}
      </button>
    </div>
  );
});

/** Compute fanned-arc transform for empty-hand mode */
function fanTransform(i: number, total: number) {
  const mid = (total - 1) / 2;
  const angle = (i - mid) * (total >= 7 ? 28 : total >= 5 ? 24 : 32);
  const offsetX = (i - mid) * (total >= 7 ? 90 : total >= 5 ? 100 : 120);
  const offsetY = Math.abs(i - mid) * -30;
  return `translateX(${offsetX}px) rotate(${angle}deg) translateY(${offsetY}px)`;
}
