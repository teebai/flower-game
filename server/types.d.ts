declare module 'boardgame.io/dist/cjs/server.js' {
  import type { Game } from 'boardgame.io';
  export const FlatFile: new (opts: { dir: string }) => {
    fetch: (matchID: string, opts: { state?: boolean; metadata?: boolean }) => Promise<{
      state?: unknown;
      metadata?: unknown;
    }>;
    setState: (matchID: string, state: unknown, deltalog: unknown[]) => Promise<void>;
    setMetadata: (matchID: string, metadata: unknown) => Promise<void>;
    listMatches: (opts: { gameName: string }) => Promise<string[]>;
    wipe: (matchID: string) => Promise<void>;
  };
  export const Server: (opts: {
    games: Game[];
    db?: unknown;
    origins?: string | string[];
    authenticateCredentials?: unknown;
    generateCredentials?: unknown;
  }) => {
    app: {
      use: (middleware: (ctx: unknown, next: () => Promise<void>) => Promise<void>) => void;
    };
    run: (port: number, callback: () => void) => void;
    transport: {
      pubSub: { publish: (channel: string, data: unknown) => void };
      getMatchQueue: (matchID: string) => { add: (fn: () => Promise<void>) => Promise<void> };
    };
    auth: unknown;
  };
}

declare module 'boardgame.io/dist/cjs/master.js' {
  export const Master: new (
    game: unknown,
    db: unknown,
    transport: unknown,
    auth: unknown
  ) => {
    onUpdate: (
      action: unknown,
      stateID: number,
      matchID: string,
      playerID: string
    ) => Promise<{ error?: string } | void>;
  };
}

declare module 'boardgame.io/dist/cjs/turn-order-4ab12333.js' {
  export const makeMove: (
    type: string,
    args?: unknown[],
    playerID?: string,
    credentials?: string
  ) => unknown;
}
