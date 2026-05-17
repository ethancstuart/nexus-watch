/**
 * Global observable time cursor. Default = `now`.
 *
 * The WebGL globe's time scrubber writes to it. Future layers + cinema mode
 * can subscribe to render historical state at the cursor's date. Placing
 * this in P0 avoids later refactor.
 *
 * Usage:
 *   import { timeCursor } from '../state/timeCursor';
 *   const unsub = timeCursor.subscribe((date) => { ... });
 *   timeCursor.set(new Date('2026-04-15'));
 *   const d = timeCursor.get();
 *
 * 2026-05 tier-up Phase 0.
 */

export type TimeCursorListener = (date: Date) => void;

class TimeCursor {
  private current: Date = new Date();
  private listeners = new Set<TimeCursorListener>();
  private isLive = true;

  get(): Date {
    return this.current;
  }

  /** True when the cursor follows wall-clock time (default). */
  get live(): boolean {
    return this.isLive;
  }

  set(date: Date, opts: { live?: boolean } = {}): void {
    this.current = date;
    this.isLive = opts.live ?? false;
    for (const l of this.listeners) l(this.current);
  }

  /** Return to live mode — cursor follows wall clock. */
  reset(): void {
    this.set(new Date(), { live: true });
  }

  subscribe(listener: TimeCursorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const timeCursor = new TimeCursor();
