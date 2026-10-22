/**
 * Visibility-gated interval registry.
 *
 * 2026-05-02 perf pass: previously every UI surface ran its own
 * setInterval continuously (stock refresh 60s, crypto 120s, news 120s,
 * clock 1s) regardless of tab visibility — adding ~5-8 always-on
 * intervals draining battery and CPU on mobile.
 *
 * Use `gatedInterval()` for any periodic work that should pause when
 * the user isn't looking. Each gated interval:
 *   - runs `cb` immediately if `runOnStart`
 *   - re-fires every `intervalMs` while `document.visibilityState === 'visible'`
 *   - stops firing on visibility:hidden, fires once on resume to refresh stale data
 *   - automatically clears on pagehide (defensive against bf-cache restore)
 *
 * Returns a `clear()` function consumers MUST call on tear-down.
 */

interface GatedInterval {
  clear: () => void;
}

interface RegisteredInterval {
  cb: () => void;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
}

const registry = new Set<RegisteredInterval>();
let visibilityListenerInstalled = false;

function installVisibilityListener(): void {
  if (visibilityListenerInstalled || typeof document === 'undefined') return;
  visibilityListenerInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      for (const r of registry) {
        if (r.timer) continue;
        r.timer = setInterval(r.cb, r.intervalMs);
        // Re-fire once on resume so stale UIs catch up immediately
        try {
          r.cb();
        } catch {
          /* ignore */
        }
      }
    } else {
      for (const r of registry) {
        if (r.timer) {
          clearInterval(r.timer);
          r.timer = null;
        }
      }
    }
  });
  window.addEventListener('pagehide', () => {
    for (const r of registry) {
      if (r.timer) {
        clearInterval(r.timer);
        r.timer = null;
      }
    }
  });
}

export function gatedInterval(cb: () => void, intervalMs: number, opts?: { runOnStart?: boolean }): GatedInterval {
  installVisibilityListener();
  const r: RegisteredInterval = { cb, intervalMs, timer: null };
  registry.add(r);

  if (opts?.runOnStart) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }

  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    r.timer = setInterval(cb, intervalMs);
  }

  return {
    clear: () => {
      if (r.timer) {
        clearInterval(r.timer);
        r.timer = null;
      }
      registry.delete(r);
    },
  };
}

/** For tests and tear-down code — visible registry size for assertions. */
export function _gatedIntervalCountForTests(): number {
  return registry.size;
}
