// ============================================================
// COIN FLIP OVERLAY — Post-flip 3D animation
// Spin → land → scale up big → hold 2s → fade out automatically
// No text, no buttons, no dark backdrop. Just the coin.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import type { CoinFlip } from '../../types/gameTypes';

interface CoinFlipOverlayProps {
  coinFlip: CoinFlip;
  onDismiss: () => void;
}

const SPIN_DURATION = 3500; // ms
const HOLD_DURATION = 2500; // ms
const FADE_DURATION = 500;  // ms
const TOTAL_DURATION = SPIN_DURATION + HOLD_DURATION + FADE_DURATION;

/** Lazily create/resume AudioContext */
function getAudioCtx(): AudioContext | null {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function playTick(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.03);
}

function playDing(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

function playThud(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

export const CoinFlipOverlay = React.memo(function CoinFlipOverlay({
  coinFlip,
  onDismiss,
}: CoinFlipOverlayProps) {
  const { result, revealedAt } = coinFlip;
  const isHeads = result === 'heads';

  // ── Reconnection sync ──
  const elapsed = Math.max(0, Date.now() - revealedAt);
  const hasAlreadyFinished = elapsed >= TOTAL_DURATION;
  const spinDelayMs = hasAlreadyFinished ? 0 : -Math.min(elapsed, SPIN_DURATION);
  const timeUntilLand = Math.max(0, SPIN_DURATION - elapsed);
  const timeUntilFade = Math.max(0, SPIN_DURATION + HOLD_DURATION - elapsed);
  const timeUntilDismiss = Math.max(0, TOTAL_DURATION - elapsed);

  const [landed, setLanded] = useState(timeUntilLand <= 0);
  const [fading, setFading] = useState(timeUntilFade <= 0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sound + ticks ──
  useEffect(() => {
    if (hasAlreadyFinished) return;
    audioCtxRef.current = getAudioCtx();
    const ctx = audioCtxRef.current;

    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);

    if (ctx && timeUntilLand > 0) {
      tickIntervalRef.current = setInterval(() => {
        playTick(ctx);
        if (navigator.vibrate) navigator.vibrate(20);
      }, 80);
    }

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [hasAlreadyFinished, timeUntilLand]);

  // ── Landed (scale up) ──
  useEffect(() => {
    if (timeUntilLand <= 0) {
      setLanded(true);
      return;
    }
    const timer = setTimeout(() => {
      setLanded(true);
      const ctx = audioCtxRef.current;
      if (ctx) {
        playDing(ctx);
        playThud(ctx);
      }
      if (navigator.vibrate) navigator.vibrate(100);
    }, timeUntilLand);
    return () => clearTimeout(timer);
  }, [timeUntilLand]);

  // ── Stop ticks on land ──
  useEffect(() => {
    if (landed && tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, [landed]);

  // ── Fade out ──
  useEffect(() => {
    if (timeUntilFade <= 0) {
      setFading(true);
      return;
    }
    const timer = setTimeout(() => setFading(true), timeUntilFade);
    return () => clearTimeout(timer);
  }, [timeUntilFade]);

  // ── Auto-dismiss ──
  useEffect(() => {
    if (timeUntilDismiss <= 0) {
      onDismiss();
      return;
    }
    const timer = setTimeout(onDismiss, timeUntilDismiss);
    return () => clearTimeout(timer);
  }, [timeUntilDismiss, onDismiss]);

  if (hasAlreadyFinished) return null;

  const animClass = isHeads ? 'coin-spin-heads' : 'coin-spin-tails';
  const staticClass = isHeads ? 'coin--heads' : 'coin--tails';

  return (
    <div className="coin-flip-overlay">
      <div
        className={[
          'coin-flip-coin-wrapper',
          landed ? 'coin-flip-coin-wrapper--landed' : '',
          fading ? 'coin-flip-coin-wrapper--fade' : '',
        ].join(' ')}
      >
        <div
          className="coin-container"
          style={{
            animation: `coin-toss-arc ${SPIN_DURATION}ms cubic-bezier(0.22, 0.6, 0.36, 1) forwards`,
            animationDelay: `${spinDelayMs}ms`,
          }}
        >
          <div
            className={[
              'coin',
              staticClass,
              hasAlreadyFinished ? 'coin--settled' : '',
            ].join(' ')}
            style={{
              animationName: animClass,
              animationDuration: `${SPIN_DURATION}ms`,
              animationDelay: `${spinDelayMs}ms`,
              animationFillMode: 'forwards',
              animationTimingFunction: 'cubic-bezier(0.22, 0.6, 0.36, 1)',
            }}
          >
            <div className="coin-face coin-face--head">
              <img src="/coins/coin_head.png" alt="Heads" draggable={false} />
            </div>
            <div className="coin-face coin-face--tail">
              <img src="/coins/coin_tail.png" alt="Tails" draggable={false} />
            </div>
          </div>
        </div>
        <div className={['coin-flip-result', landed ? 'coin-flip-result--show' : ''].join(' ')}>
          {isHeads ? 'HEADS!' : 'TAILS!'}
        </div>
      </div>
    </div>
  );
});
