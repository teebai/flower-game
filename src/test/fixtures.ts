import type { AuthProfile } from '../auth/AuthProvider';
import type { MatchInfo } from '../auth/storage';

// Reconstruct RoomSummary locally to avoid deep lobby imports
interface LobbyPlayer {
  id: string | number;
  isReady?: boolean;
  name?: string;
  isConnected?: boolean;
}

interface RoomSummary {
  matchID: string;
  createdAt: number | null;
  gameover?: { winner?: string | number } | null;
  joinedCount: number;
  maxPlayers: number;
  minPlayers: number;
  openSeatCount: number;
  ownerPlayerId: string | null;
  players: LobbyPlayer[];
  readyPlayerIds: string[];
  roomName: string;
  started: boolean;
  updatedAt: number | null;
  winner?: string | null;
}

export function mockProfile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: 'mock-user-id',
    displayName: 'TestPlayer',
    avatarUrl: null,
    email: null,
    displayNameConfirmed: true,
    canChangeDisplayName: true,
    displayNameLockedUntil: null,
    displayNameLastChangedAt: null,
    suggestedDisplayName: null,
    provider: 'google',
    isGuest: false,
    ...overrides,
  };
}

export function mockGuestProfile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: 'guest-mock-id',
    displayName: 'GuestPlayer',
    avatarUrl: null,
    email: null,
    displayNameConfirmed: false,
    canChangeDisplayName: true,
    displayNameLockedUntil: null,
    displayNameLastChangedAt: null,
    suggestedDisplayName: 'Garden Guest',
    provider: 'guest',
    isGuest: true,
    ...overrides,
  };
}

export function mockRoom(overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    matchID: `mock-room-${Date.now()}`,
    roomName: 'Test Garden',
    gameover: null,
    joinedCount: 1,
    maxPlayers: 6,
    minPlayers: 2,
    openSeatCount: 5,
    ownerPlayerId: '0',
    players: [
      { id: '0', name: 'Alice', isConnected: true },
      { id: '1', name: undefined, isConnected: false },
    ],
    readyPlayerIds: [],
    started: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

export function mockMatchInfo(overrides: Partial<MatchInfo> = {}): MatchInfo {
  return {
    matchID: `mock-match-${Date.now()}`,
    playerID: '0',
    playerName: 'TestPlayer',
    credentials: 'mock-creds',
    ...overrides,
  };
}
