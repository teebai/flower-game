/**
 * PortalLandingPage.tsx — "Going into heaven" landing page.
 *
 * Bright white cloud tunnel (CloudTunnelCanvas) with soft pink/blue tints,
 * a large floating hero character at the centre (rendered through the
 * swappable CharacterAvatar renderer), manual name entry, and a minimal
 * login row (5 small social buttons + email/password).
 *
 * The character is locked to the player's identity (account id for
 * signed-in users, a persistent guest id otherwise) via
 * resolveCharacterDNA — the dice button re-rolls BODY SIZE ONLY.
 *
 * Enter World → hero flies into the tunnel centre → the tunnel blooms open
 * → onEnterWorld(name) hands off to the world, where the character drops
 * from the sky (see MmorpgApp, flag: sessionStorage 'flower-game:portal-entry').
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { CharacterAvatar } from '../character/CharacterAvatar';
import { getSessionCharacterSeed } from '../character/identity';
import { resolveCharacterDNA, rollBodyScale, saveBodyScaleOverride } from '../character/resolveDna';
import { CloudTunnelCanvas } from './CloudTunnelCanvas';
import './portal-landing.css';

const STORAGE_KEY = 'flower-game:player-name';
const PENDING_NAME_KEY = 'flower-game:pending-name';
const PORTAL_ENTRY_KEY = 'flower-game:portal-entry';

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
}

const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.97 1.08-3.11-1.05.05-2.31.71-3.06 1.55-.67.75-1.26 1.95-1.1 3.1 1.17.09 2.36-.53 3.08-1.54z"/></svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    ),
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
    ),
  },
];

/* ─── Main component ─── */
interface PortalLandingPageProps {
  onEnterWorld: (name: string) => void;
}

type Phase = 'input' | 'flying' | 'bloom';

const NOTICE_TONE_CLASS: Record<string, string> = {
  error: 'pl-notice--error',
  info: 'pl-notice--info',
  success: 'pl-notice--success',
};

export function PortalLandingPage({ onEnterWorld }: PortalLandingPageProps) {
  const {
    profile,
    notice,
    dismissNotice,
    continueAsGuest,
    signInWithGoogle,
    signInWithApple,
    signInWithFacebook,
    signInWithDiscord,
    signInWithGitHub,
    signInWithEmail,
    signUpWithEmail,
    loading: authLoading,
  } = useAuth();

  const [name, setName] = useState(loadSavedName);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('input');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<'login' | 'create'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [bodyVersion, setBodyVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const entryTimers = useRef<number[]>([]);

  // Character seed locked to identity: account id when signed in,
  // persistent guest id otherwise. Same value App.tsx hands to MmorpgApp,
  // so the preview IS the character that spawns in the world.
  const seed = getSessionCharacterSeed(profile);
  const dna = useMemo(
    () => resolveCharacterDNA(seed),
    // bodyVersion re-resolves after the body-size dice persists a new scale.
    [seed, bodyVersion],
  );

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      for (const t of entryTimers.current) window.clearTimeout(t);
    };
  }, []);

  // After OAuth / email sign-in: resume the pending entry with the saved name.
  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_NAME_KEY);
    if (pending && profile?.displayName) {
      sessionStorage.removeItem(PENDING_NAME_KEY);
      saveName(pending);
      setName(pending);
      triggerEntry(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

  // Pre-fill the name from a signed-in profile.
  useEffect(() => {
    if (profile?.displayName && !name) {
      setName(profile.displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.displayName]);

  function validateName(): string | null {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name first');
      inputRef.current?.focus();
      return null;
    }
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or less');
      return null;
    }
    return trimmed;
  }

  /** Enter transition: hero flies into the tunnel, tunnel blooms, hand off. */
  function triggerEntry(playerName: string) {
    setPhase('flying');
    entryTimers.current.push(window.setTimeout(() => setPhase('bloom'), 1300));
    entryTimers.current.push(window.setTimeout(() => {
      try { sessionStorage.setItem(PORTAL_ENTRY_KEY, '1'); } catch { /* ignore */ }
      onEnterWorld(playerName);
    }, 2100));
  }

  async function handleEnterWorld() {
    const trimmed = validateName();
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    try {
      saveName(trimmed);
      await continueAsGuest(trimmed);
      triggerEntry(trimmed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  async function handleSocialLogin(providerId: string) {
    const trimmed = validateName();
    if (!trimmed) return;

    setError('');
    setSubmitting(true);
    saveName(trimmed);
    sessionStorage.setItem(PENDING_NAME_KEY, trimmed);

    if (providerId === 'google') { await signInWithGoogle(); return; }
    if (providerId === 'apple') { await signInWithApple(); return; }
    if (providerId === 'facebook') { await signInWithFacebook(); return; }
    if (providerId === 'discord') { await signInWithDiscord(); return; }
    if (providerId === 'github') { await signInWithGitHub(); return; }

    sessionStorage.removeItem(PENDING_NAME_KEY);
    setError(`${providerId} login is not supported.`);
    setSubmitting(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }

    setError('');
    setEmailBusy(true);
    try {
      // With a valid name typed, resume straight into the world once the
      // profile hydrates (same PENDING_NAME_KEY mechanism as OAuth).
      const trimmed = name.trim();
      const canAutoEnter = trimmed.length > 0 && trimmed.length <= 20;

      if (emailMode === 'login') {
        if (canAutoEnter) sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
        await signInWithEmail(email.trim(), password);
      } else {
        const signedIn = await signUpWithEmail(email.trim(), password);
        // No session = email confirmation required; the auth notice tells
        // the user to check their inbox, so don't queue an auto-entry.
        if (signedIn && canAutoEnter) {
          sessionStorage.setItem(PENDING_NAME_KEY, trimmed);
        }
      }
    } catch {
      // Error already surfaced through the auth context notice/error state.
    } finally {
      setEmailBusy(false);
    }
  }

  /** The dice re-rolls BODY SIZE ONLY — colors/petals/features stay locked. */
  function handleBodyDice() {
    saveBodyScaleOverride(seed, rollBodyScale());
    setBodyVersion(v => v + 1);
  }

  const isTransitioning = phase !== 'input';
  const phaseClass =
    phase === 'flying' ? 'phase-flying' : phase === 'bloom' ? 'phase-bloom' : 'phase-input';

  return (
    <div className={`portal-landing ${phaseClass}`}>
      {/* ─── Infinite cloud tunnel background ─── */}
      <CloudTunnelCanvas accelerating={isTransitioning} className="pl-tunnel-canvas" />

      {/* ─── Content ─── */}
      <div className={`pl-content ${isTransitioning ? 'pl-content--hidden' : ''}`}>
        <header className="pl-header">
          <h1 className="pl-title">teebai.flowers</h1>
        </header>

        <main className="pl-main">
          {/* Hero character — identity-locked, floating centre-stage */}
          <div className="pl-hero">
            <CharacterAvatar dna={dna} size={210} floating />
            <button
              type="button"
              className="pl-body-dice"
              onClick={handleBodyDice}
              disabled={isTransitioning}
              title="Re-roll body size (only your size changes — your look is yours forever)"
            >
              🎲
              <span className="pl-body-dice-label">size</span>
            </button>
          </div>

          {/* Name input — manual typing only */}
          <div className="pl-input-group">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void handleEnterWorld(); }}
              placeholder="Enter your name..."
              className={`pl-input${error ? ' pl-input--error' : ''}`}
              maxLength={20}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={isTransitioning}
            />
            {error && <span className="pl-error">{error}</span>}
          </div>

          <button
            type="button"
            className="pl-btn pl-btn--primary"
            onClick={() => void handleEnterWorld()}
            disabled={submitting || authLoading || isTransitioning}
          >
            {submitting ? 'Entering...' : 'Enter World'}
          </button>
        </main>

        <footer className="pl-footer">
          {notice && (
            <button
              type="button"
              className={`pl-notice ${NOTICE_TONE_CLASS[notice.tone] ?? 'pl-notice--info'}`}
              onClick={dismissNotice}
            >
              {notice.message}
            </button>
          )}

          {/* Minimal login row: 5 small social buttons + email */}
          <div className="pl-login-row">
            {SOCIAL_PROVIDERS.map(provider => (
              <button
                key={provider.id}
                type="button"
                className="pl-login-btn"
                onClick={() => void handleSocialLogin(provider.id)}
                disabled={submitting || authLoading || isTransitioning}
                title={`Sign in with ${provider.label}`}
              >
                {provider.icon}
              </button>
            ))}
            <button
              type="button"
              className={`pl-login-btn${emailOpen ? ' pl-login-btn--active' : ''}`}
              onClick={() => setEmailOpen(v => !v)}
              disabled={submitting || authLoading || isTransitioning}
              title="Sign in with email"
            >
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z"/></svg>
            </button>
          </div>

          {/* Email + password form (Log in / Create account) */}
          {emailOpen && (
            <form className="pl-email-form" onSubmit={e => void handleEmailSubmit(e)}>
              <div className="pl-email-toggle" role="tablist">
                <button
                  type="button"
                  className={`pl-email-tab${emailMode === 'login' ? ' pl-email-tab--active' : ''}`}
                  onClick={() => setEmailMode('login')}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={`pl-email-tab${emailMode === 'create' ? ' pl-email-tab--active' : ''}`}
                  onClick={() => setEmailMode('create')}
                >
                  Create account
                </button>
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className="pl-input pl-input--small"
                autoComplete="email"
                required
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="pl-input pl-input--small"
                autoComplete={emailMode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
              <button
                type="submit"
                className="pl-btn pl-btn--secondary"
                disabled={emailBusy || submitting || authLoading}
              >
                {emailBusy
                  ? 'One moment...'
                  : emailMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          )}

          <p className="pl-hint">
            Guests can play immediately. Sign in to save progress and keep your unique character look.
          </p>
        </footer>
      </div>

      {/* ─── Fly-into-tunnel transition ─── */}
      {phase === 'flying' && (
        <div className="pl-fly-scene">
          <div className="pl-fly-character">
            <CharacterAvatar dna={dna} size={210} />
          </div>
        </div>
      )}

      {/* ─── Bloom: the tunnel centre opens into white-gold light ─── */}
      {phase === 'bloom' && <div className="pl-bloom" />}

      {/* ─── FUTURE CONTENT SLOT ────────────────────────────────
          Reserved for news updates / ongoing shows (requested by
          the site owner). Empty and invisible today — drop a panel
          component inside this <aside> when the content module is
          ready. Space is reserved on wide screens (see CSS). ─── */}
      <aside className="pl-news-slot" aria-hidden="true" />
    </div>
  );
}
