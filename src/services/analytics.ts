/**
 * Lightweight conversion event tracking — localStorage only, no external deps.
 * 500 event cap, 30-day rolling window. Viewable on /admin/revenue page.
 */

interface ConversionEvent {
  event: string;
  properties: Record<string, string>;
  timestamp: number;
}

const STORAGE_KEY = 'nw:conversion-events';
const MAX_EVENTS = 500;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function trackEvent(event: string, properties: Record<string, string> = {}): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: ConversionEvent[] = raw ? (JSON.parse(raw) as ConversionEvent[]) : [];
    events.push({ event, properties, timestamp: Date.now() });

    // Trim to window + cap
    const cutoff = Date.now() - WINDOW_MS;
    const trimmed = events.filter((e) => e.timestamp > cutoff).slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function getEvents(eventFilter?: string): ConversionEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const events = JSON.parse(raw) as ConversionEvent[];
    const cutoff = Date.now() - WINDOW_MS;
    const valid = events.filter((e) => e.timestamp > cutoff);
    if (eventFilter) return valid.filter((e) => e.event === eventFilter);
    return valid;
  } catch {
    return [];
  }
}

export function getEventCounts(): Record<string, number> {
  const events = getEvents();
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event] = (counts[e.event] || 0) + 1;
  }
  return counts;
}
