import type { VercelRequest } from '@vercel/node';

/**
 * Shared admin resolution for `/api/admin/*` endpoints.
 *
 * Caller is admin iff their session (from `__Host-session` cookie) resolves
 * to a user record where any of the following is true:
 *   - `user.isAdmin === true`
 *   - `user.id` is in the comma-separated `ADMIN_IDS` env var
 *   - `user.email` is in the comma-separated `ADMIN_EMAILS` env var
 *
 * This is the only authorization check enforced server-side for admin routes
 * — the hash route `/#/admin` is cosmetic and cannot be trusted. Every admin
 * endpoint MUST call `resolveAdmin()` and return 403 on a null return value.
 *
 * Originally lived in api/admin/data-health.ts (Track D.1). Extracted 2026-04-11
 * during Track A.4 so the brief delivery-log admin endpoint can share the same
 * implementation.
 */

export interface AdminUser {
  id?: string;
  email?: string;
  isAdmin?: boolean;
}

export async function resolveAdmin(req: VercelRequest): Promise<AdminUser | null> {
  const cookieHeader = req.headers.cookie || '';
  const sessionCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__Host-session='));
  const sessionId = sessionCookie?.split('=')[1];
  if (!sessionId) return null;

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return null;

  try {
    const res = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return null;
    let user: unknown = JSON.parse(data.result);
    if (typeof user === 'string') user = JSON.parse(user);
    if (!user || typeof user !== 'object') return null;
    const u = user as AdminUser;

    const adminIds = (process.env.ADMIN_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const isAdmin =
      Boolean(u.isAdmin) ||
      (u.id != null && adminIds.includes(u.id)) ||
      (u.email != null && adminEmails.includes(u.email));

    return isAdmin ? u : null;
  } catch {
    return null;
  }
}
