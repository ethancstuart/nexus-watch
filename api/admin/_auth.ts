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
  // THE COOKIE IS A PATH, NOT A NAME, UNLESS WE MAKE IT ONE.
  //
  // This value went straight into `${kvUrl}/get/session:${sessionId}` below
  // with no encoding and no shape check, and '/' and '%' are legal RFC 6265
  // cookie octets. A cookie of `a/../../flushall` resolves — verified against
  // the real KV_REST_API_URL, whose path is bare '/' — to `/flushall`, sent
  // with KV_REST_API_TOKEN in the Authorization header. So an anonymous
  // request could run arbitrary Upstash REST commands: wipe the store, or
  // /set a session object of its own choosing and then read it back as an
  // admin, since `Boolean(u.isAdmin)` below is sufficient on its own.
  //
  // Every other KV caller in the repo already wraps its key in
  // encodeURIComponent (kvCache.ts, apiAuth.ts); this was the lone exception.
  // Both halves are applied here, because encoding alone would still let an
  // unbounded caller-chosen key be read out of the shared store.
  if (!sessionId || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) return null;

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return null;

  try {
    const res = await fetch(`${kvUrl}/get/${encodeURIComponent(`session:${sessionId}`)}`, {
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
