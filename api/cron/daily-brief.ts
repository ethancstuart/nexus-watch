import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://dashpulse.app';

  try {
    const sql = neon(dbUrl);

    // Check if brief already generated today
    const today = new Date().toISOString().split('T')[0];
    const existing = await sql`SELECT id FROM daily_briefs WHERE brief_date = ${today}`;
    if (existing.length > 0) {
      return res.json({ success: true, message: 'Brief already generated today', date: today });
    }

    // Fetch current data for brief generation
    interface ApiData { scores?: Array<{ countryName: string; score: number }>; count?: number }
    const [ciiRes, quakeRes, diseaseRes, outageRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/cii`).then((r) => r.json()) as Promise<ApiData>,
      fetch(`${baseUrl}/api/earthquakes`).then((r) => r.json()) as Promise<ApiData>,
      fetch(`${baseUrl}/api/disease-outbreaks`).then((r) => r.json()) as Promise<ApiData>,
      fetch(`${baseUrl}/api/internet-outages`).then((r) => r.json()) as Promise<ApiData>,
    ]);

    // Build context for AI brief generation
    const ciiData = ciiRes.status === 'fulfilled' ? ciiRes.value : { scores: [] };
    const topCII = (ciiData.scores || [])
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const quakeData = quakeRes.status === 'fulfilled' ? quakeRes.value : {};
    const diseaseData = diseaseRes.status === 'fulfilled' ? diseaseRes.value : {};
    const outageData = outageRes.status === 'fulfilled' ? outageRes.value : {};

    const briefContext = {
      date: today,
      topRiskCountries: topCII,
      earthquakeCount: quakeData.count || 0,
      diseaseOutbreaks: diseaseData.count || 0,
      internetOutages: outageData.count || 0,
    };

    let summary: string;

    if (anthropicKey) {
      // Generate AI brief
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: 'You are a senior intelligence analyst writing a daily global intelligence briefing for NexusWatch. Write in a professional, news-anchor tone. Be concise and actionable. Structure: 1) Executive Summary (2-3 sentences), 2) Top Risks (3-5 bullet points with country and CII score), 3) Key Events (2-3 bullets), 4) 24-Hour Outlook (1-2 sentences).',
          messages: [{
            role: 'user',
            content: `Generate today's intelligence briefing based on this data:\n${JSON.stringify(briefContext, null, 2)}`,
          }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json() as { content: Array<{ text: string }> };
        summary = aiData.content?.[0]?.text || 'Brief generation failed — see raw data.';
      } else {
        summary = `Daily Intelligence Brief — ${today}\n\nTop risk countries: ${topCII.map((c: { countryName: string; score: number }) => `${c.countryName} (${c.score})`).join(', ')}\nEarthquakes: ${briefContext.earthquakeCount}\nDisease outbreaks: ${briefContext.diseaseOutbreaks}\nInternet disruptions: ${briefContext.internetOutages}`;
      }
    } else {
      summary = `Daily Intelligence Brief — ${today}\n\nTop risk countries: ${topCII.map((c: { countryName: string; score: number }) => `${c.countryName} (${c.score})`).join(', ')}`;
    }

    // Store brief
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify(briefContext)}, ${summary})
    `;

    return res.json({ success: true, date: today, summary: summary.slice(0, 200) + '...' });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}
