export interface MatchInfo {
  matchID: string;
  playerID: string;
  playerName: string;
  credentials: string;
}

const DEVICE_MATCH_STORAGE_KEY = 'flower-game:match';

function getUserMatchStorageKey(userId: string): string {
  return `${DEVICE_MATCH_STORAGE_KEY}:user:${userId}`;
}

function readMatch(key: string): MatchInfo | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as MatchInfo;
  } catch {
    return null;
  }
}

export function loadStoredMatch(userId?: string | null): MatchInfo | null {
  if (userId) {
    const userMatch = readMatch(getUserMatchStorageKey(userId));
    if (userMatch) return userMatch;
  }
  return readMatch(DEVICE_MATCH_STORAGE_KEY);
}

export function saveStoredMatch(match: MatchInfo, userId?: string | null): void {
  try {
    localStorage.setItem(DEVICE_MATCH_STORAGE_KEY, JSON.stringify(match));
    if (userId) {
      localStorage.setItem(getUserMatchStorageKey(userId), JSON.stringify(match));
    }
  } catch {
    // best-effort persistence only
  }
}

export function clearStoredMatch(userId?: string | null): void {
  try {
    localStorage.removeItem(DEVICE_MATCH_STORAGE_KEY);
    if (userId) {
      localStorage.removeItem(getUserMatchStorageKey(userId));
    }
  } catch {
    // ignore storage failures
  }
}
