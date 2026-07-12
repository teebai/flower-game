// ============================================================
// Haptic Feedback — Mobile vibration utilities
//
// Uses navigator.vibrate() when available. All calls are safe
// (no-op on unsupported devices / non-secure contexts).
// ============================================================

const SUPPORTED = typeof navigator !== 'undefined' && 'vibrate' in navigator;

function vibrate(pattern: number | number[]): void {
  if (!SUPPORTED) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore — some browsers throw on invalid patterns
  }
}

/** Short tick for valid target hover */
export function hapticValidTarget() {
  vibrate(12);
}

/** Slightly stronger tick for successful drop */
export function hapticDropSuccess() {
  vibrate([15, 30, 15]);
}

/** Error pattern for invalid target drop */
export function hapticInvalid() {
  vibrate([20, 20, 20]);
}

/** Light click for button presses */
export function hapticButton() {
  vibrate(8);
}

/** Medium pulse for important state changes */
export function hapticPulse() {
  vibrate([10, 40, 10]);
}
