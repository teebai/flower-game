/* ============================================================
   Shared danmaku chat store — used by Lobby and WaitingRoom
   ============================================================ */

export interface DanmakuComment {
  id: string;
  text: string;
  color: string;
  lane: number;
  duration: number; // ms
  createdAt: number;
}

export const WHIMSICAL_COLORS = [
  '#ff00ff', '#00ffff', '#39ff14', '#fff01f', '#ff5e00',
  '#bc13fe', '#ff3131', '#0ff0fc', '#ccff00', '#ff006e',
];

export function getWhimsicalColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return WHIMSICAL_COLORS[Math.abs(hash) % WHIMSICAL_COLORS.length];
}

export const DANMAKU_LANE_COUNT = 16;
export const DANMAKU_LANE_HEIGHT = 74;
export const DANMAKU_TOP_OFFSET = 40;
export const DANMAKU_MIN_DURATION = 7000;
export const DANMAKU_MAX_DURATION = 12000;
export const DANMAKU_MAX_COMMENTS = 40;
export const DANMAKU_SEND_COOLDOWN_MS = 300;

/* Module-level state — survives React Strict Mode remounts */
let danmakuComments: DanmakuComment[] = [];
let danmakuListeners: (() => void)[] = [];
let _lastDanmakuSendAt = 0;
export function getLastDanmakuSendAt(): number { return _lastDanmakuSendAt; }
export function setLastDanmakuSendAt(value: number) { _lastDanmakuSendAt = value; }

/* laneFreeAt[i] = timestamp when lane i becomes available */
const laneFreeAt: number[] = new Array(DANMAKU_LANE_COUNT).fill(0);

export function getDanmakuSnapshot(): DanmakuComment[] {
  return danmakuComments;
}

export function subscribeDanmaku(callback: () => void): () => void {
  danmakuListeners.push(callback);
  return () => {
    danmakuListeners = danmakuListeners.filter(cb => cb !== callback);
  };
}

function emitDanmaku() {
  danmakuListeners.forEach(cb => cb());
}

export function addDanmakuComment(comment: DanmakuComment) {
  danmakuComments = [...danmakuComments, comment];
  if (danmakuComments.length > DANMAKU_MAX_COMMENTS) {
    danmakuComments = danmakuComments.slice(-DANMAKU_MAX_COMMENTS);
  }
  emitDanmaku();
}

export function cleanupDanmakuComments() {
  const now = Date.now();
  const filtered = danmakuComments.filter(
    m => now - m.createdAt < m.duration + 1500,
  );
  if (filtered.length !== danmakuComments.length) {
    danmakuComments = filtered;
    emitDanmaku();
  }
}

export function assignDanmakuLane(now: number): number {
  for (let i = 0; i < DANMAKU_LANE_COUNT; i++) {
    if (now >= laneFreeAt[i]) return i;
  }
  // All occupied — pick the one that frees soonest
  let earliestLane = 0;
  let earliestTime = laneFreeAt[0];
  for (let i = 1; i < DANMAKU_LANE_COUNT; i++) {
    if (laneFreeAt[i] < earliestTime) {
      earliestTime = laneFreeAt[i];
      earliestLane = i;
    }
  }
  return earliestLane;
}

export function occupyLane(lane: number, now: number, duration: number) {
  /* Lane becomes available when comment is ~55% across */
  laneFreeAt[lane] = now + duration * 0.55;
}
