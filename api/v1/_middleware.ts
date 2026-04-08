// Shared auth helper — inlined to avoid Vercel bundler import issues
// This file is NOT a route (starts with _) but IS importable by sibling routes

import type { VercelResponse } from '@vercel/node';

const rateCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(res: VercelResponse, ip: string, limit = 10): boolean {
  const now = Date.now();
  const entry = rateCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    rateCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= limit) {
    res.status(429).json({ error: 'Rate limit exceeded', limit, window: '1 minute' });
    return false;
  }
  entry.count++;
  return true;
}

export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return 'unknown';
}
