import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, getClientIp } from './_middleware';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

// Correlations are computed client-side and by the CII cron.
// This endpoint runs the correlation logic server-side by fetching layer data.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = getClientIp(req.headers); if (!rateLimit(res, ip)) return;

  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://dashpulse.app';

  try {
    // Fetch key layers for correlation
    const [quakes, acled, outages] = await Promise.allSettled([
      fetch(`${baseUrl}/api/earthquakes`).then((r) => r.json()) as Promise<Record<string, unknown>>,
      fetch(`${baseUrl}/api/acled`).then((r) => r.json()) as Promise<Record<string, unknown>>,
      fetch(`${baseUrl}/api/internet-outages`).then((r) => r.json()) as Promise<Record<string, unknown>>,
    ]);

    const correlations: Array<{ type: string; severity: string; title: string; description: string; lat: number; lon: number }> = [];

    // Earthquake near nuclear (simplified server-side check)
    const quakeData = quakes.status === 'fulfilled' ? (quakes.value.earthquakes || []) as Array<Record<string, unknown>> : [];
    for (const q of quakeData) {
      const mag = Number(q.magnitude);
      if (mag >= 5.0) {
        correlations.push({
          type: 'proximity',
          severity: mag >= 6.0 ? 'critical' : 'elevated',
          title: `M${mag.toFixed(1)} earthquake — potential infrastructure impact`,
          description: `Significant seismic event at ${q.place || 'unknown location'}. Monitoring for infrastructure proximity.`,
          lat: Number(q.lat) || 0,
          lon: Number(q.lon) || 0,
        });
      }
    }

    // Internet outage + conflict convergence
    const outageData = outages.status === 'fulfilled' ? (outages.value.outages || []) as Array<Record<string, unknown>> : [];
    const acledData = acled.status === 'fulfilled' ? (acled.value.events || []) as Array<Record<string, unknown>> : [];

    for (const outage of outageData) {
      if (outage.severity === 'critical' || outage.severity === 'high') {
        const hasConflict = acledData.some((e) => {
          const dist = Math.sqrt((Number(e.lat) - Number(outage.lat)) ** 2 + (Number(e.lon) - Number(outage.lon)) ** 2);
          return dist < 8;
        });
        if (hasConflict) {
          correlations.push({
            type: 'escalation',
            severity: 'critical',
            title: `Internet disruption + conflict convergence — ${outage.country}`,
            description: `${outage.severity} internet disruption in ${outage.country} coincides with active armed conflict.`,
            lat: Number(outage.lat) || 0,
            lon: Number(outage.lon) || 0,
          });
        }
      }
    }

    return res.setHeader('Cache-Control', 'public, max-age=60').json({
      correlations,
      count: correlations.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('API v1 correlations error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
