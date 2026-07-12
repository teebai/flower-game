import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const LOCAL_AUTH_STORAGE_KEY = 'flower-game:local-auth';
const DEFAULT_GUEST_NAME = 'Garden Guest';
const OAUTH_PENDING_STORAGE_KEY = 'flower-game:oauth-pending';
const IDENTITY_SERVER_URL = import.meta.env.VITE_IDENTITY_SERVER_URL?.trim() || '';
const AUTH_REDIRECT_URL = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || '';

type SocialProvider = 'google' | 'apple';

interface AuthNotice {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface PendingOAuthAction {
  provider: SocialProvider;
  mode: 'signin' | 'link';
  startedAt: number;
}

export interface AuthProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  displayNameConfirmed: boolean;
  displayNameLockedUntil: string | null;
  displayNameLastChangedAt: string | null;
  canChangeDisplayName: boolean;
  suggestedDisplayName: string | null;
  provider: string;
  isGuest: boolean;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  error: string;
  notice: AuthNotice | null;
  profile: AuthProfile | null;
  continueAsGuest: (suggestedName?: string) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (nextName: string) => Promise<void>;
  dismissNotice: () => void;
}

interface LocalAuthProfile extends AuthProfile {}

const AuthContext = createContext<AuthContextValue | null>(null);

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

function loadPendingOAuthAction(): PendingOAuthAction | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingOAuthAction;
  } catch {
    return null;
  }
}

function savePendingOAuthAction(action: PendingOAuthAction | null): void {
  try {
    if (!action) {
      sessionStorage.removeItem(OAUTH_PENDING_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, JSON.stringify(action));
  } catch {
    // ignore transient storage failures
  }
}

function providerLabel(provider: SocialProvider): string {
  return provider === 'google' ? 'Google' : 'Apple';
}

function readAuthErrorFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const extractMessage = (params: URLSearchParams) => params.get('error_description') || params.get('error') || '';
  const searchMessage = extractMessage(new URLSearchParams(window.location.search));
  if (searchMessage) return searchMessage;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  return extractMessage(new URLSearchParams(hash));
}

function clearAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const searchKeys = ['error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'expires_at', 'expires_in', 'provider_token', 'token_type', 'type', 'code'];
  for (const key of searchKeys) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  window.history.replaceState({}, document.title, url.toString());
}

function getOAuthRedirectUrl(): string {
  if (AUTH_REDIRECT_URL) {
    return AUTH_REDIRECT_URL;
  }
  if (typeof window === 'undefined') {
    return '';
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildGuestDisplayName(seed?: string): string {
  const source = seed?.trim() || randomId();
  const suffix = String((hashSeed(source) % 9000) + 1000);
  return `${DEFAULT_GUEST_NAME} ${suffix}`;
}

function isTimestampInFuture(value: string | null): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function normalizeAccountProfile(profile: AuthProfile): AuthProfile {
  return {
    ...profile,
    displayName: profile.displayName.trim(),
    suggestedDisplayName: profile.suggestedDisplayName?.trim() || null,
  };
}

function normalizeGuestProfile<T extends AuthProfile>(profile: T): T {
  const trimmedName = profile.displayName.trim();
  if (!profile.isGuest) return profile;
  if (trimmedName && trimmedName !== DEFAULT_GUEST_NAME) return profile;
  return {
    ...profile,
    displayName: buildGuestDisplayName(profile.id),
  };
}

function loadLocalAuth(): LocalAuthProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalAuthProfile;
    const normalized = normalizeGuestProfile(parsed);
    if (normalized.displayName !== parsed.displayName) {
      localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return null;
  }
}

function saveLocalAuth(profile: LocalAuthProfile | null): void {
  try {
    if (!profile) {
      localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore local persistence failures
  }
}

function extractDisplayName(user: User, fallbackName = DEFAULT_GUEST_NAME): string {
  const metadata = user.user_metadata ?? {};
  const candidates = [
    typeof metadata.display_name === 'string' ? metadata.display_name : '',
    typeof metadata.full_name === 'string' ? metadata.full_name : '',
    typeof metadata.name === 'string' ? metadata.name : '',
    typeof metadata.preferred_username === 'string' ? metadata.preferred_username : '',
    typeof user.email === 'string' ? user.email.split('@')[0] : '',
  ];
  const chosen = candidates.find(value => value.trim().length > 0)?.trim();
  return chosen || fallbackName;
}

function extractAvatarUrl(user: User): string | null {
  const metadata = user.user_metadata ?? {};
  const avatar = metadata.avatar_url;
  return typeof avatar === 'string' && avatar.trim() ? avatar : null;
}

function extractProvider(user: User): string {
  const appProvider = typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : '';
  if (appProvider) return appProvider;
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const provider = identities.find(identity => typeof identity.provider === 'string')?.provider;
  return provider || 'guest';
}

function createSignedInFallbackProfile(user: User): AuthProfile {
  const provider = extractProvider(user);
  const suggestedDisplayName = extractDisplayName(user, DEFAULT_GUEST_NAME);
  return normalizeAccountProfile({
    id: user.id,
    displayName: suggestedDisplayName,
    avatarUrl: extractAvatarUrl(user),
    email: user.email ?? null,
    displayNameConfirmed: true,
    displayNameLockedUntil: null,
    displayNameLastChangedAt: null,
    canChangeDisplayName: true,
    suggestedDisplayName,
    provider,
    isGuest: false,
  });
}

function buildProfileFromUser(user: User): AuthProfile {
  const provider = extractProvider(user);
  const isAnonymous = Boolean((user as User & { is_anonymous?: boolean }).is_anonymous) || provider === 'anonymous';
  return normalizeGuestProfile({
    id: user.id,
    displayName: extractDisplayName(user, isAnonymous ? buildGuestDisplayName(user.id) : DEFAULT_GUEST_NAME),
    avatarUrl: extractAvatarUrl(user),
    email: user.email ?? null,
    displayNameConfirmed: isAnonymous ? false : true,
    displayNameLockedUntil: null,
    displayNameLastChangedAt: null,
    canChangeDisplayName: true,
    suggestedDisplayName: extractDisplayName(user, DEFAULT_GUEST_NAME),
    provider: isAnonymous ? 'guest' : provider,
    isGuest: isAnonymous,
  });
}

function buildProfileFromAccountResponse(fallback: AuthProfile, account: {
  avatarUrl: string | null;
  canChangeDisplayName: boolean;
  displayName: string;
  displayNameConfirmed: boolean;
  displayNameLastChangedAt: string | null;
  displayNameLockedUntil: string | null;
  hasDisplayName?: boolean;
  id: string;
  provider: string;
  suggestedDisplayName: string | null;
}): AuthProfile {
  return normalizeAccountProfile({
    ...fallback,
    displayName: account.displayName || account.suggestedDisplayName || fallback.displayName || DEFAULT_GUEST_NAME,
    avatarUrl: account.avatarUrl ?? fallback.avatarUrl,
    displayNameConfirmed: Boolean(account.displayNameConfirmed ?? account.hasDisplayName),
    displayNameLockedUntil: account.displayNameLockedUntil,
    displayNameLastChangedAt: account.displayNameLastChangedAt,
    canChangeDisplayName: account.canChangeDisplayName,
    suggestedDisplayName: account.suggestedDisplayName ?? fallback.suggestedDisplayName,
    provider: account.provider || fallback.provider,
    isGuest: false,
  });
}

async function loadAccountProfileFromIdentityServer(user: User): Promise<AuthProfile> {
  const fallback = createSignedInFallbackProfile(user);
  if (!IDENTITY_SERVER_URL || !supabase) return fallback;

  const accessToken = await supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null);
  if (!accessToken) return fallback;

  try {
    const response = await fetch(`${IDENTITY_SERVER_URL}/api/me/account`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const payload = await response.json() as {
      account?: {
        avatarUrl: string | null;
        canChangeDisplayName: boolean;
        displayName: string;
        displayNameConfirmed: boolean;
        displayNameLastChangedAt: string | null;
        displayNameLockedUntil: string | null;
        hasDisplayName?: boolean;
        id: string;
        provider: string;
        suggestedDisplayName: string | null;
      };
      error?: string;
    };

    if (!response.ok || !payload.account) {
      throw new Error(payload.error || `Could not load account (${response.status})`);
    }

    return buildProfileFromAccountResponse(fallback, payload.account);
  } catch {
    return fallback;
  }
}

function createLocalGuestProfile(suggestedName?: string): LocalAuthProfile {
  const id = randomId();
  const trimmedName = suggestedName?.trim();
  return {
    id,
    displayName: trimmedName || buildGuestDisplayName(id),
    avatarUrl: null,
    email: null,
    displayNameConfirmed: false,
    displayNameLockedUntil: null,
    displayNameLastChangedAt: null,
    canChangeDisplayName: true,
    suggestedDisplayName: trimmedName || null,
    provider: 'guest',
    isGuest: true,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  useEffect(() => {
    let active = true;
    const oauthError = readAuthErrorFromUrl();
    if (oauthError) {
      setError(oauthError);
      setNotice({ tone: 'error', message: oauthError });
      savePendingOAuthAction(null);
      clearAuthParamsFromUrl();
    }

    if (!supabase) {
      setProfile(loadLocalAuth());
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const applyUser = async (user: User | null) => {
      if (!active) return;
      if (!user) {
        setProfile(null);
        return;
      }
      const syncedProfile = await loadAccountProfileFromIdentityServer(user);
      if (!active) return;
      setProfile(syncedProfile);

      const pendingOAuthAction = loadPendingOAuthAction();
      if (pendingOAuthAction) {
        const providerName = providerLabel(pendingOAuthAction.provider);
        setNotice({
          tone: 'success',
          message: pendingOAuthAction.mode === 'link'
            ? `${providerName} is now linked to this guest account.`
            : `Signed in with ${providerName}.`,
        });
        savePendingOAuthAction(null);
        clearAuthParamsFromUrl();
      }
    };

    void supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
      }
      await applyUser(data.session?.user ?? null);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function continueAsGuest(suggestedName?: string) {
    setError('');

    if (!supabase) {
      const nextProfile = profile ?? createLocalGuestProfile(suggestedName);
      const localProfile = {
        ...nextProfile,
        displayName: suggestedName?.trim() || nextProfile.displayName,
      };
      saveLocalAuth(localProfile);
      setProfile(localProfile);
      return;
    }

    if (profile?.isGuest) {
      if (suggestedName?.trim()) {
        await updateDisplayName(suggestedName);
      }
      return;
    }

    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }

    const nextProfile = data.user ? await loadAccountProfileFromIdentityServer(data.user) : null;
    setProfile(nextProfile);

    if (suggestedName?.trim()) {
      await updateDisplayName(suggestedName);
    }
  }

  async function signInWithOAuth(provider: SocialProvider) {
    setError('');
    setNotice(null);
    if (!supabase) {
      const message = 'Add Supabase credentials to enable social login.';
      setError(message);
      setNotice({ tone: 'info', message });
      return;
    }

    const oauthAction: PendingOAuthAction = {
      provider,
      mode: profile?.isGuest ? 'link' : 'signin',
      startedAt: Date.now(),
    };
    savePendingOAuthAction(oauthAction);

    const authCall = profile?.isGuest
      ? supabase.auth.linkIdentity({
          provider,
          options: {
            redirectTo: getOAuthRedirectUrl(),
          },
        })
      : supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: getOAuthRedirectUrl(),
          },
        });

    const { error: oauthError } = await authCall;

    if (oauthError) {
      savePendingOAuthAction(null);
      setError(oauthError.message);
      setNotice({ tone: 'error', message: oauthError.message });
      throw oauthError;
    }
  }

  async function signOut() {
    setError('');

    if (!supabase) {
      saveLocalAuth(null);
      setProfile(null);
      setNotice(null);
      return;
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }
    setProfile(null);
    setNotice(null);
  }

  async function updateDisplayName(nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName || !profile) return;

    setError('');

    if (!supabase) {
      const nextProfile = { ...profile, displayName: trimmedName };
      saveLocalAuth(nextProfile);
      setProfile(nextProfile);
      return;
    }

    if (!IDENTITY_SERVER_URL) {
      // No identity server configured: just save the display name locally.
      // Don't throw — guests should still be able to create/join matches.
      const nextProfile = { ...profile, displayName: trimmedName };
      saveLocalAuth(nextProfile);
      setProfile(nextProfile);
      return;
    }

    const previousProfile = profile;
    const optimisticProfile = { ...profile, displayName: trimmedName };
    setProfile(optimisticProfile);

    try {
      const accessToken = await supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null);
      if (!accessToken) throw new Error('Your sign-in session expired. Please sign in again.');

      const response = await fetch(`${IDENTITY_SERVER_URL}/api/me/account/display-name`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: trimmedName }),
      });
      const data = await response.json() as {
        account?: {
          avatarUrl: string | null;
          canChangeDisplayName: boolean;
          displayName: string;
          displayNameConfirmed: boolean;
          displayNameLastChangedAt: string | null;
          displayNameLockedUntil: string | null;
          id: string;
          provider: string;
          suggestedDisplayName: string | null;
        };
        error?: string;
      };

      if (!response.ok || !data.account) {
        throw new Error(data.error || `Could not save username (${response.status})`);
      }

      setProfile(buildProfileFromAccountResponse(previousProfile, data.account));
    } catch (updateError) {
      setProfile(previousProfile);
      const message = updateError instanceof Error ? updateError.message : 'Could not save display name.';
      setError(message);
      throw updateError;
    }
  }

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    loading,
    error,
    notice,
    profile,
    continueAsGuest,
    getAccessToken: async () => {
      if (!supabase || profile?.isGuest) return null;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
        return null;
      }
      return data.session?.access_token ?? null;
    },
    signInWithGoogle: () => signInWithOAuth('google'),
    signInWithApple: () => signInWithOAuth('apple'),
    signOut,
    updateDisplayName,
    dismissNotice: () => setNotice(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
