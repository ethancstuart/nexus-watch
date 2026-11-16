import { describe, it, expect, vi } from 'vitest';
import { openServerLedger } from './serverLedger.ts';

describe('openServerLedger — the SPA hands /ledger to the server page', () => {
  it.each(['/', '/briefs', '/about'])('from a document served at %s, does a full load of /ledger', (servedAt) => {
    const replace = vi.fn();
    const fallback = vi.fn();
    openServerLedger(servedAt, replace, fallback);
    expect(replace).toHaveBeenCalledWith('/ledger');
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each(['/ledger', '/ledger/'])('from a document already served at %s, does not reload (no loop)', (servedAt) => {
    const replace = vi.fn();
    const fallback = vi.fn();
    openServerLedger(servedAt, replace, fallback);
    expect(replace).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });
});
