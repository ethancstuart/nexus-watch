import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!kvUrl || !kvToken) {
    return res.status(200).json({ claimed: 0, remaining: 100, isFull: false });
  }

  try {
    const kvRes = await fetch(`${kvUrl}/get/stripe-founding-reserved`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await kvRes.json()) as { result: string | null };
    const claimed = data.result !== null ? Math.min(parseInt(data.result, 10) || 0, 100) : 0;
    const remaining = 100 - claimed;
    return res.status(200).json({ claimed, remaining, isFull: remaining <= 0 });
  } catch {
    return res.status(200).json({ claimed: 0, remaining: 100, isFull: false });
  }
}
