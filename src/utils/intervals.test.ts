import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { gatedInterval, _gatedIntervalCountForTests } from './intervals.ts';

describe('gatedInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback on the requested interval', () => {
    const cb = vi.fn();
    const gate = gatedInterval(cb, 1000);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(3);
    gate.clear();
  });

  it('runs immediately when runOnStart is true', () => {
    const cb = vi.fn();
    const gate = gatedInterval(cb, 1000, { runOnStart: true });
    expect(cb).toHaveBeenCalledTimes(1);
    gate.clear();
  });

  it('clear() stops further firings and removes from registry', () => {
    const before = _gatedIntervalCountForTests();
    const cb = vi.fn();
    const gate = gatedInterval(cb, 500);
    expect(_gatedIntervalCountForTests()).toBe(before + 1);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
    gate.clear();
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(_gatedIntervalCountForTests()).toBe(before);
  });
});
