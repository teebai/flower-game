// ============================================================
// FLOWER GAME v2 — TOAST NOTIFICATION STORE
// Lightweight toast queue without external state library.
// ============================================================

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

const listeners = new Set<Listener>();
let toasts: Toast[] = [];

function emit() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function addToast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  toasts = [...toasts, { id, message, type, duration }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, duration);
}

export function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn([...toasts]);
  return () => listeners.delete(fn);
}
