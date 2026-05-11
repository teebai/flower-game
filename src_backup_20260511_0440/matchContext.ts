import { createContext } from 'react';

export interface MatchSeatPresence {
  name: string;
  occupied: boolean;
}

export interface MatchCtx {
  matchID: string;
  playerID: string;
  playerName: string;
  credentials: string;
  server: string;
  seatPresence: Record<string, MatchSeatPresence>;
  onLeave: () => void;
}

export const MatchContext = createContext<MatchCtx | null>(null);
