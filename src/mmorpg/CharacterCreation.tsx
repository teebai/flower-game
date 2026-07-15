/**
 * CharacterCreation.tsx — Pre-world identity screen.
 *
 * This is the FIRST thing every player sees. They set their name and
 * choose between Login (persistent identity) or Guest (ephemeral).
 *
 * After name is set, the player is redirected to /world where their
 * character spawns with a nameplate above their head.
 *
 * The lobby NO LONGER handles name/auth — it only does matchmaking.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { generateCharacterDNA, generateGuestId, type CharacterDNA } from './game/CharacterGenerator';
import './character-creation.css';

const STORAGE_KEY = 'flower-game:player-name';

function loadSavedName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    // ignore
  }
}

interface CharacterCreationProps {
  /** Called when the player has chosen a name and wants to enter the world. */
  onEnterWorld: (name: string) => void;
}

/**
 * Simple inline SVG character preview — draws a miniature white flower-eyed
 * figure using the DNA parameters.  Lightweight, no Pixi dependency.
 */
function CharacterPreviewSVG({ dna, name }: { dna: CharacterDNA; name: string }) {
  const hs = dna.headScale * dna.bodyScale;
  const r = 18 * hs; // head radius scaled for preview
  const cy = 35;
  const petalCount = [6, 7, 8, 9, 10, 12][dna.eyeType] ?? 8;

  return (
    <svg viewBox="0 0 100 80" className="cc-char-svg" aria-label="Character preview">
      {/* Glow */}
      <circle cx="50" cy="40" r="30 * dna.bodyScale" fill={(() => {
        const c = dna.glowColor.toString(16).padStart(6, '0');
        return `#${c}`;
      })()} opacity={dna.glowIntensity * 0.3} />

      {/* Head */}
      <ellipse cx="50" cy={cy} rx={r} ry={r * 1.05} fill="#FFFFFF" stroke="#BBBBBB" strokeWidth={1.2} />

      {/* Left eye (daisy) */}
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 44 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`le-${i}`}
            cx={ex}
            cy={ey}
            rx={5}
            ry={2.5}
            fill={(() => {
              const c = dna.eyePetalColor.toString(16).padStart(6, '0');
              return `#${c}`;
            })()}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="44" cy={cy} r={4} fill="#333333" />
      <circle cx="42.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />

      {/* Right eye (daisy) */}
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 56 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`re-${i}`}
            cx={ex}
            cy={ey}
            rx={5}
            ry={2.5}
            fill={(() => {
              const c = dna.eyePetalColor.toString(16).padStart(6, '0');
              return `#${c}`;
            })()}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="56" cy={cy} r={4} fill="#333333" />
      <circle cx="54.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />

      {/* Mouth */}
      <path d={`M 46 ${cy + 8} Q 50 ${cy + 5.5} 54 ${cy + 8}`} fill="none" stroke="#777777" strokeWidth={1.4} strokeLinecap="round" />

      {/* Torso */}
      <path d={`M 42 ${cy + r * 0.8} Q 50 ${cy + r * 0.8 - 5} 58 ${cy + r * 0.8} L 56 ${cy + r * 0.8 + 18} Q 50 ${cy + r * 0.8 + 21} 44 ${cy + r * 0.8 + 18} Z`} fill="#FFFFFF" stroke="#BBBBBB" strokeWidth={1} />

      {/* Earlobes */}
      <ellipse cx={50 - r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#CCCCCC" strokeWidth={0.8} opacity={0.8} />
      <ellipse cx={50 + r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#CCCCCC" strokeWidth={0.8} opacity={0.8} />
    </svg>
  );
}

export function CharacterCreation({ onEnterWorld }: CharacterCreationProps) {
  const { profile, continueAsGuest, signInWithGoogle, loading: authLoading } = useAuth();
  const [name, setName] = useState(loadSavedName);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate a deterministic DNA from the name (same name = same look)
  const previewDNA = useCallback((): CharacterDNA => {
    const seed = name.trim() || 'Guest';
    return generateCharacterDNA(seed);
  }, [name]);

  const dna = previewDNA();

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (mode: 'guest' | 'login') => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name first');
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      saveName(trimmed);

      if (mode === 'guest') {
        // Guest: create local auth profile
        await continueAsGuest(trimmed);
      } else {
        // Login: start Google OAuth, save name for after redirect
        sessionStorage.setItem('flower-game:pending-name', trimmed);
        await signInWithGoogle();
        // OAuth will redirect — on return, the name will be picked up
        return;
      }

      onEnterWorld(trimmed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // If user already has a profile, show their name
  useEffect(() => {
    if (profile?.displayName && !name) {
      setName(profile.displayName);
    }
  }, [profile?.displayName]);

  // Check for pending name after OAuth redirect
  useEffect(() => {
    const pending = sessionStorage.getItem('flower-game:pending-name');
    if (pending && profile?.displayName) {
      sessionStorage.removeItem('flower-game:pending-name');
      saveName(pending);
      onEnterWorld(pending);
    }
  }, [profile?.displayName]);

  return (
    <div className="character-creation">
      <div className="cc-bg">
        <div className="cc-grass-blade" style={{ left: '10%', height: 40, animationDelay: '0s' }} />
        <div className="cc-grass-blade" style={{ left: '20%', height: 55, animationDelay: '0.5s' }} />
        <div className="cc-grass-blade" style={{ left: '35%', height: 35, animationDelay: '1.2s' }} />
        <div className="cc-grass-blade" style={{ left: '48%', height: 60, animationDelay: '0.3s' }} />
        <div className="cc-grass-blade" style={{ left: '62%', height: 45, animationDelay: '0.8s' }} />
        <div className="cc-grass-blade" style={{ left: '75%', height: 50, animationDelay: '1.5s' }} />
        <div className="cc-grass-blade" style={{ left: '88%', height: 38, animationDelay: '0.1s' }} />
        <div className="cc-grass-blade" style={{ left: '95%', height: 52, animationDelay: '1.0s' }} />
      </div>

      <div className="cc-card">
        {/* Character preview */}
        <div className="cc-preview">
          <CharacterPreviewSVG dna={dna} name={name} />
        </div>

        {/* Title */}
        <h1 className="cc-title">
          {name.trim() || '...'}
        </h1>
        <p className="cc-subtitle">Enter the world of flowers</p>

        {/* Name input */}
        <div className="cc-input-wrap">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') void handleSubmit('guest'); }}
            placeholder="Your name"
            className={`cc-input${error ? ' cc-input--error' : ''}`}
            maxLength={20}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {error && <span className="cc-error">{error}</span>}
        </div>

        {/* Buttons */}
        <div className="cc-buttons">
          <button
            type="button"
            className="cc-btn cc-btn--guest"
            onClick={() => void handleSubmit('guest')}
            disabled={submitting || authLoading}
          >
            {submitting ? '...' : 'Play as Guest'}
          </button>
          <button
            type="button"
            className="cc-btn cc-btn--login"
            onClick={() => void handleSubmit('login')}
            disabled={submitting || authLoading}
          >
            {submitting ? '...' : 'Log In with Google'}
          </button>
        </div>

        <p className="cc-hint">
          Guests play right away. Log in to save your unique character look,
          game progress, and unlock titles.
        </p>
      </div>
    </div>
  );
}
