import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth.ts', () => ({
  getUser: vi.fn(),
}));

import { getCurrentTier, hasAccess, isAdmin, getAlertLimit } from './tier.ts';
import { getUser } from './auth.ts';

beforeEach(() => {
  vi.mocked(getUser).mockReset();
});

describe('getCurrentTier', () => {
  it('returns free when no user', () => {
    vi.mocked(getUser).mockReturnValue(null);
    expect(getCurrentTier()).toBe('free');
  });

  it('returns user tier', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'premium',
      createdAt: '',
    });
    expect(getCurrentTier()).toBe('premium');
  });

  it('defaults to free when user has no tier', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: undefined as unknown as 'free',
      createdAt: '',
    });
    expect(getCurrentTier()).toBe('free');
  });
});

describe('hasAccess', () => {
  it('returns true for free tier requesting free', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free',
      createdAt: '',
    });
    expect(hasAccess('free')).toBe(true);
  });

  it('returns false for free tier requesting premium', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free',
      createdAt: '',
    });
    expect(hasAccess('premium')).toBe(false);
  });

  it('returns true for premium tier requesting premium', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'premium',
      createdAt: '',
    });
    expect(hasAccess('premium')).toBe(true);
  });

  it('returns true for admin regardless of tier', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free',
      isAdmin: true,
      createdAt: '',
    });
    expect(hasAccess('premium')).toBe(true);
  });
});

describe('isAdmin', () => {
  it('returns false when no user', () => {
    vi.mocked(getUser).mockReturnValue(null);
    expect(isAdmin()).toBe(false);
  });

  it('returns false for non-admin user', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free',
      createdAt: '',
    });
    expect(isAdmin()).toBe(false);
  });

  it('returns true for admin user', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'premium',
      isAdmin: true,
      createdAt: '',
    });
    expect(isAdmin()).toBe(true);
  });
});

describe('getAlertLimit', () => {
  it('returns 5 for free tier', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free',
      createdAt: '',
    });
    expect(getAlertLimit()).toBe(5);
  });

  it('returns Infinity for premium tier', () => {
    vi.mocked(getUser).mockReturnValue({
      id: 'u1',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'premium',
      createdAt: '',
    });
    expect(getAlertLimit()).toBe(Infinity);
  });
});
