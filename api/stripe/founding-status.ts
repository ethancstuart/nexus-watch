import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!kvUrl || !kvToken) {
    return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
  }

  try {
    const headers = { Authorization: `Bearer ${kvToken}` };
    const [reservedRes, activeRes] = await Promise.all([
      fetch(`${kvUrl}/get/stripe-founding-reserved`, { headers }),
      fetch(`${kvUrl}/get/stripe-founding-active`, { headers }),
    ]);

    if (!reservedRes.ok) {
      return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
    }

    const reservedData = (await reservedRes.json()) as { result: string | null };
    const activeData = activeRes.ok ? ((await activeRes.json()) as { result: string | null }) : { result: null };

    const claimed = reservedData.result !== null ? Math.min(parseInt(reservedData.result, 10) || 0, 100) : 0;
    const active = activeData.result !== null ? Math.min(parseInt(activeData.result, 10) || 0, 100) : 0;
    const remaining = 100 - claimed;

    return res.status(200).json({ claimed, active, remaining, isFull: remaining <= 0 });
  } catch {
    return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
  }
}
