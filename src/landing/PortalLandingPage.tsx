/**
 * PortalLandingPage.tsx — Spinning tunnel vortex landing page.
 *
 * Entry point for teebai.flowers. Features:
 * - Full-screen CSS 3D spinning tunnel/portal effect
 * - Character name input with random generation
 * - Social login buttons (Google, Apple, Facebook, Discord, GitHub)
 * - Guest play option
 * - Portal drop animation: character falls into the tunnel, then transitions to /world
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { generateCharacterDNA, type CharacterDNA } from '../mmorpg/game/CharacterGenerator';
import { generateRandomName, generateNameSuggestions } from './nameGenerator';
import './portal-landing.css';

const STORAGE_KEY = 'flower-game:player-name';
const PENDING_NAME_KEY = 'flower-game:pending-name';

function loadSavedName(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}
function saveName(name: string): void {
  try { localStorage.setItem(STORAGE_KEY, name.trim()); } catch { /* ignore */ }
}

/* ─── Social provider configs ─── */
interface SocialProvider {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: 'google',
    label: 'Google',
    color: '#DB4437',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    color: '#000000',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.97 1.08-3.11-1.05.05-2.31.71-3.06 1.55-.67.75-1.26 1.95-1.1 3.1 1.17.09 2.36-.53 3.08-1.54z"/></svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    ),
  },
  {
    id: 'discord',
    label: 'Discord',
    color: '#5865F2',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    color: '#24292e',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
    ),
  },
];

/* ─── Character Preview SVG (inline, no Pixi) ─── */
function CharacterPreviewSVG({ dna }: { dna: CharacterDNA }) {
  const hs = dna.headScale * dna.bodyScale;
  const r = 18 * hs;
  const cy = 35;
  const petalCount = [6, 7, 8, 9, 10, 12][dna.eyeType] ?? 8;

  return (
    <svg viewBox="0 0 100 80" className="pl-char-svg" aria-label="Character preview">
      <circle cx="50" cy="40" r={30 * dna.bodyScale} fill={`#${dna.glowColor.toString(16).padStart(6, '0')}`} opacity={dna.glowIntensity * 0.3} />
      <ellipse cx="50" cy={cy} rx={r} ry={r * 1.05} fill="#FFFFFF" stroke="#BBBBBB" strokeWidth={1.2} />
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 44 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`le-${i}`}
            cx={ex} cy={ey} rx={5} ry={2.5}
            fill={`#${dna.eyePetalColor.toString(16).padStart(6, '0')}`}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="44" cy={cy} r={4} fill="#333333" />
      <circle cx="42.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
        const ex = 56 + Math.cos(a) * 5;
        const ey = cy + Math.sin(a) * 5;
        return (
          <ellipse
            key={`re-${i}`}
            cx={ex} cy={ey} rx={5} ry={2.5}
            fill={`#${dna.eyePetalColor.toString(16).padStart(6, '0')}`}
            transform={`rotate(${(a * 180) / Math.PI}, ${ex}, ${ey})`}
            opacity={0.9}
          />
        );
      })}
      <circle cx="56" cy={cy} r={4} fill="#333333" />
      <circle cx="54.5" cy={cy - 1.5} r={1.5} fill="#FFFFFF" opacity={0.9} />
      <path d={`M 46 ${cy + 8} Q 50 ${cy + 5.5} 54 ${cy + 8}`} fill="none" stroke="#777777" strokeWidth={1.4} strokeLinecap="round" />
      <path d={`M 42 ${cy + r * 0.8} Q 50 ${cy + r * 0.8 - 5} 58 ${cy + r * 0.8} L 56 ${cy + r * 0.8 + 18} Q 50 ${cy + r * 0.8 + 21} 44 ${cy + r * 0.8 + 18} Z`} fill="#FFFFFF" stroke="#BBBBBB" strokeWidth={1} />
      <ellipse cx={50 - r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#CCCCCC" strokeWidth={0.8} opacity={0.8} />
      <ellipse cx={50 + r * 0.9} cy={cy - 2} rx={2.5 * dna.earScale} ry={8 * dna.earScale} fill="#FFFFFF" stroke="#CCCCCC" strokeWidth={0.8} opacity={0.8} />
    </svg>
  );
}

/* ─── Main component ─── */
interface PortalLandingPageProps {
  onEnterWorld: (name: string) => void;
}

type Phase = 'input' | 'dropping' | 'transitioning';

export function PortalLandingPage({ onEnterWorld }: PortalLandingPageProps) {
  const { profile, continueAsGuest, signInWithGoogle, signInWithApple, signInWithFacebook, signInWithDiscord, signInWithGitHub, loading: authLoading } = useAuth();
  const [name, setName] = useState(loadSavedName);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('input');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewDNA = useCallback((): CharacterDNA => {
    const seed = name.trim() || 'Guest';
    return generateCharacterDNA(seed);
  }, [name]);

  const dna = previewDNA();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Check for pending name after OAuth redirect
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_NAME_KEY);
    if (pending && profile?.displayName) {
      sessionStorage.removeItem(PENDING_NAME_KEY);
      saveName(pending);
      triggerPortalDrop(pending);
    }
  }, [profile?.displayName]);

  // If user already has a profile, pre-fill name
  useEffect(() => {
    if (profile?.displayName && !name) {
      setName(profile.displayName);
    }
  }, [profile?.displayName]);

  function triggerPortalDrop(playerName: string) {
    setPhase('dropping');
    // After drop animation completes (1.8s), transition
    setTimeout(() => {
      setPhase('transitioning');
      setTimeout(() => {
        onEnterWorld(playerName);
      }, 600);
    }, 1800);
  }

  async function handleSubmit(mode: 'guest' | 'login', provider?: string) {
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
        await continueAsGuest(trimmed);
        triggerPortalDrop(trimmed);
      } else if (provider) {
        sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
        if (provider === 'google') await signInWithGoogle();
        else if (provider === 'apple') await signInWithApple();
        // OAuth redirect — on return, the effect above will catch pending name
        return;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  function handleGenerateName() {
    const newName = generateRandomName();
    setName(newName);
    setError('');
    setShowSuggestions(false);
  }

  function handleShowSuggestions() {
    setSuggestions(generateNameSuggestions(5));
    setShowSuggestions(true);
  }

  function handlePickSuggestion(s: string) {
    setName(s);
    setShowSuggestions(false);
    setError('');
  }

  /* ─── Social login handler with generic provider support ─── */
  async function handleSocialLogin(providerId: string) {
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
    saveName(trimmed);

    if (providerId === 'google') {
      sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
      await signInWithGoogle();
      return;
    }
    if (providerId === 'apple') {
      sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
      await signInWithApple();
      return;
    }
    if (providerId === 'facebook') {
      sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
      await signInWithFacebook();
      return;
    }
    if (providerId === 'discord') {
      sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
      await signInWithDiscord();
      return;
    }
    if (providerId === 'github') {
      sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
      await signInWithGitHub();
      return;
    }

    setError(`${providerId} login is not supported.`);
    setSubmitting(false);
  }

  const isTransitioning = phase === 'dropping' || phase === 'transitioning';

  return (
    <div className={`portal-landing ${phase}`}>
      {/* ─── Tunnel Background ─── */}
      <div className="pl-tunnel-container">
        <div className="pl-tunnel">
          {/* Inner glow core */}
          <div className="pl-tunnel-core" />
          {/* Rotating rings */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="pl-tunnel-ring"
              style={{
                animationDelay: `${i * -0.4}s`,
              } as React.CSSProperties}
            />
          ))}
          {/* Floating particles */}
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={`p-${i}`}
              className="pl-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * -8}s`,
                animationDuration: `${4 + Math.random() * 6}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* ─── Content Card ─── */}
      <div className={`pl-content ${isTransitioning ? 'pl-content--hidden' : ''}`}>
        {/* Logo / Title */}
        <div className="pl-header">
          <h1 className="pl-title">teebai.flowers</h1>
          <p className="pl-subtitle">A world where flowers bloom and friendships grow</p>
        </div>

        {/* Character Preview */}
        <div className="pl-preview-wrap">
          <div className="pl-preview-glow" />
          <CharacterPreviewSVG dna={dna} />
        </div>

        {/* Name Input */}
        <div className="pl-input-group">
          <div className="pl-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleSubmit('guest'); }}
              placeholder="Enter your name..."
              className={`pl-input${error ? ' pl-input--error' : ''}`}
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={isTransitioning}
            />
            <button
              type="button"
              className="pl-dice-btn"
              onClick={handleGenerateName}
              title="Generate random name"
              disabled={isTransitioning}
            >
              🎲
            </button>
          </div>

          {/* Name suggestions */}
          <button
            type="button"
            className="pl-suggestion-toggle"
            onClick={showSuggestions ? () => setShowSuggestions(false) : handleShowSuggestions}
            disabled={isTransitioning}
          >
            {showSuggestions ? 'Hide suggestions' : 'Show name suggestions'}
          </button>

          {showSuggestions && (
            <div className="pl-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="pl-suggestion-chip"
                  onClick={() => handlePickSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && <span className="pl-error">{error}</span>}
        </div>

        {/* Enter as Guest */}
        <button
          type="button"
          className="pl-btn pl-btn--primary"
          onClick={() => void handleSubmit('guest')}
          disabled={submitting || authLoading || isTransitioning}
        >
          {submitting ? 'Entering...' : 'Enter World'}
        </button>

        {/* Divider */}
        <div className="pl-divider">
          <span>or sign in with</span>
        </div>

        {/* Social Login Buttons */}
        <div className="pl-social-grid">
          {SOCIAL_PROVIDERS.map(provider => (
            <button
              key={provider.id}
              type="button"
              className="pl-social-btn"
              onClick={() => void handleSocialLogin(provider.id)}
              disabled={submitting || authLoading || isTransitioning}
              title={`Sign in with ${provider.label}`}
              style={{ '--provider-color': provider.color } as React.CSSProperties}
            >
              <span className="pl-social-icon">{provider.icon}</span>
              <span className="pl-social-label">{provider.label}</span>
            </button>
          ))}
        </div>

        {/* Guest hint */}
        <p className="pl-hint">
          Guests can play immediately. Sign in to save progress, unlock titles, and keep your unique character look.
        </p>
      </div>

      {/* ─── Dropping Character (portal animation) ─── */}
      {phase === 'dropping' && (
        <div className="pl-drop-scene">
          <div className="pl-drop-character">
            <CharacterPreviewSVG dna={dna} />
          </div>
          <div className="pl-drop-name">{name}</div>
        </div>
      )}

      {/* ─── Transition flash ─── */}
      {phase === 'transitioning' && <div className="pl-flash" />}
    </div>
  );
}
