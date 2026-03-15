import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset module state between tests
let authModule: typeof import('./auth.ts');

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  // Re-import to reset module-level state
  vi.resetModules();
  authModule = await import('./auth.ts');
});

describe('checkSession', () => {
  it('returns user from API response', async () => {
    const mockUser = {
      id: 'google:123',
      email: 'test@test.com',
      name: 'Test User',
      avatar: 'https://example.com/avatar.png',
      provider: 'google',
      tier: 'free' as const,
      createdAt: '2026-01-01',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ user: mockUser }),
    }));

    const result = await authModule.checkSession();
    expect(result).toEqual(mockUser);
    expect(localStorage.setItem).toHaveBeenCalledWith('dashview-user', JSON.stringify(mockUser));
  });

  it('returns null when API returns no user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ user: null }),
    }));
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const result = await authModule.checkSession();
    expect(result).toBeNull();
  });

  it('falls back to localStorage on fetch error', async () => {
    const storedUser = {
      id: 'github:456',
      email: 'cached@test.com',
      name: 'Cached',
      avatar: '',
      provider: 'github',
      tier: 'free',
      createdAt: '2026-01-01',
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(storedUser));

    const result = await authModule.checkSession();
    expect(result).toEqual(storedUser);
  });
});

describe('onAuthChange', () => {
  it('calls listener when session changes', async () => {
    const mockUser = {
      id: 'google:123',
      email: 'test@test.com',
      name: 'Test',
      avatar: '',
      provider: 'google',
      tier: 'free' as const,
      createdAt: '2026-01-01',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ user: mockUser }),
    }));

    const listener = vi.fn();
    authModule.onAuthChange(listener);

    await authModule.checkSession();
    expect(listener).toHaveBeenCalledWith(mockUser);
  });

  it('returns unsubscribe function that removes listener', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ user: null }),
    }));
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const listener = vi.fn();
    const unsubscribe = authModule.onAuthChange(listener);
    unsubscribe();

    await authModule.checkSession();
    expect(listener).not.toHaveBeenCalled();
  });
});
