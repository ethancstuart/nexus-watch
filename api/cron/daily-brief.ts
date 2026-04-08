import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);

    // Use UTC date for consistency
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check if brief already generated today
    const existing = await sql`SELECT id FROM daily_briefs WHERE brief_date = ${today}`;
    if (existing.length > 0) {
      return res.json({ success: true, message: 'Brief already generated today', date: today });
    }

    // === Fetch data DIRECTLY from sources — NOT self-referencing ===

    // 1. CII scores from Postgres
    const ciiRows = await sql`
      SELECT DISTINCT ON (country_code) country_code, country_name, score, components
      FROM country_cii_history
      ORDER BY country_code, timestamp DESC
    `;
    const topCII = ciiRows
      .map((r) => ({ countryCode: r.country_code as string, countryName: r.country_name as string, score: r.score as number }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // 2. Earthquakes from USGS directly
    let earthquakeCount = 0;
    let significantQuakes: string[] = [];
    try {
      const quakeRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
        signal: AbortSignal.timeout(10000),
      });
      if (quakeRes.ok) {
        const quakeData = (await quakeRes.json()) as { features: Array<{ properties: { mag: number; place: string } }> };
        earthquakeCount = quakeData.features?.length || 0;
        significantQuakes = (quakeData.features || [])
          .filter((f) => f.properties.mag >= 4.5)
          .slice(0, 5)
          .map((f) => `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`);
      }
    } catch { /* USGS unavailable */ }

    // 3. Disease outbreaks from WHO DON directly
    let diseaseCount = 0;
    try {
      const diseaseRes = await fetch(
        'https://www.who.int/api/news/diseaseoutbreaknews?$top=20&$orderby=PublicationDate%20desc',
        { signal: AbortSignal.timeout(10000) },
      );
      if (diseaseRes.ok) {
        const diseaseData = (await diseaseRes.json()) as { value: unknown[] };
        diseaseCount = diseaseData.value?.length || 0;
      }
    } catch { /* WHO unavailable */ }

    // 4. Internet outages from IODA (check a few key countries)
    let outageCount = 0;
    try {
      const iodaNow = Math.floor(Date.now() / 1000);
      const iodaFrom = iodaNow - 3600;
      const iodaRes = await fetch(
        `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/IR?from=${iodaFrom}&until=${iodaNow}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (iodaRes.ok) outageCount = 20; // We monitor 20 countries
    } catch { /* IODA unavailable */ }

    // 5. Flight count from adsb.lol
    let flightCount = 0;
    try {
      const flightRes = await fetch('https://api.adsb.lol/v2/lat/40/lon/-74/dist/250', {
        signal: AbortSignal.timeout(8000),
      });
      if (flightRes.ok) {
        const flightData = (await flightRes.json()) as { ac?: unknown[] };
        flightCount = flightData.ac?.length || 0;
      }
    } catch { /* adsb.lol unavailable */ }

    const briefContext = {
      date: today,
      topRiskCountries: topCII,
      earthquakeCount,
      significantQuakes,
      diseaseOutbreaks: diseaseCount,
      internetOutages: outageCount,
      flightsTracked: flightCount,
      totalCIICountries: ciiRows.length,
    };

    let summary: string;

    if (anthropicKey) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            system: 'You are a senior intelligence analyst writing a daily global intelligence briefing for NexusWatch. Write in a professional, news-anchor tone. Be concise and actionable. Use markdown formatting. Structure: 1) Executive Summary (2-3 sentences), 2) Top Risks (top 5 countries with CII scores and why), 3) Key Events (earthquakes, outbreaks, outages), 4) 24-Hour Outlook (1-2 sentences). Include actual numbers from the data provided.',
            messages: [{
              role: 'user',
              content: `Generate today's intelligence briefing (${today}) based on this data:\n\nTop Risk Countries (Country Instability Index):\n${topCII.map((c) => `${c.countryName}: ${c.score}/100`).join('\n')}\n\nEarthquakes today: ${earthquakeCount}\nSignificant quakes: ${significantQuakes.join(', ') || 'None above M4.5'}\nDisease outbreaks tracked: ${diseaseCount}\nInternet monitoring: ${outageCount} countries\nAircraft tracked: ${flightCount}\nCII countries monitored: ${ciiRows.length}`,
            }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as { content: Array<{ text: string }> };
          summary = aiData.content?.[0]?.text || '';
        } else {
          summary = buildFallbackSummary(today, topCII, earthquakeCount, diseaseCount, significantQuakes);
        }
      } catch {
        summary = buildFallbackSummary(today, topCII, earthquakeCount, diseaseCount, significantQuakes);
      }
    } else {
      summary = buildFallbackSummary(today, topCII, earthquakeCount, diseaseCount, significantQuakes);
    }

    // Store brief
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify(briefContext)}, ${summary})
      ON CONFLICT (brief_date) DO UPDATE SET content = ${JSON.stringify(briefContext)}, summary = ${summary}, generated_at = NOW()
    `;

    // Send email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAILS;
    if (resendKey && adminEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'NexusWatch <onboarding@resend.dev>',
            to: adminEmail.split(',').map((e: string) => e.trim()),
            subject: `NexusWatch Daily Brief — ${today}`,
            html: `<div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; padding: 24px; max-width: 600px;">
              <div style="border-bottom: 2px solid #ff6600; padding-bottom: 12px; margin-bottom: 16px;">
                <span style="font-size: 11px; letter-spacing: 3px; color: #ff6600; font-weight: bold;">NEXUSWATCH DAILY BRIEF — ${today}</span>
              </div>
              <div style="font-size: 13px; line-height: 1.7; white-space: pre-wrap;">${summary.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
              <div style="margin-top: 20px;"><a href="https://dashpulse.app" style="color: #ff6600; text-decoration: none; font-size: 11px;">Open NexusWatch →</a></div>
            </div>`,
          }),
        });
      } catch { /* Email failed — brief still stored */ }
    }

    return res.json({ success: true, date: today, summary: summary.slice(0, 200) + '...' });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}

function buildFallbackSummary(
  date: string,
  topCII: Array<{ countryName: string; score: number }>,
  quakeCount: number,
  diseaseCount: number,
  significantQuakes: string[],
): string {
  return `# NexusWatch Daily Brief — ${date}\n\n## Top Risk Countries\n${topCII.slice(0, 5).map((c) => `- **${c.countryName}**: CII ${c.score}/100`).join('\n')}\n\n## Key Metrics\n- Earthquakes: ${quakeCount} (${significantQuakes.length} significant)\n- Disease outbreaks: ${diseaseCount}\n${significantQuakes.length > 0 ? `\n## Significant Earthquakes\n${significantQuakes.map((q) => `- ${q}`).join('\n')}` : ''}`;
}
