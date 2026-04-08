import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const utcTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    // Delete existing brief to allow regeneration
    await sql`DELETE FROM daily_briefs WHERE brief_date = ${today}`;

    // === Fetch ALL data directly from upstream sources ===

    // 1. CII scores from Postgres
    const ciiRows = await sql`
      SELECT DISTINCT ON (country_code) country_code, country_name, score, components
      FROM country_cii_history ORDER BY country_code, timestamp DESC
    `;
    const allCII = ciiRows
      .map((r) => ({ code: r.country_code as string, name: r.country_name as string, score: r.score as number, components: r.components as Record<string, number> }))
      .sort((a, b) => b.score - a.score);
    const topCII = allCII.slice(0, 10);

    // 2. Earthquakes from USGS
    let earthquakeCount = 0;
    let significantQuakes: string[] = [];
    try {
      const qRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', { signal: AbortSignal.timeout(10000) });
      if (qRes.ok) {
        const qData = (await qRes.json()) as { features: Array<{ properties: { mag: number; place: string } }> };
        earthquakeCount = qData.features?.length || 0;
        significantQuakes = (qData.features || [])
          .filter((f) => f.properties.mag >= 4.5)
          .slice(0, 5)
          .map((f) => `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`);
      }
    } catch { /* */ }

    // 3. Disease outbreaks from WHO
    let diseaseCount = 0;
    let recentOutbreaks: string[] = [];
    try {
      const dRes = await fetch('https://www.who.int/api/news/diseaseoutbreaknews?$top=10&$orderby=PublicationDate%20desc', { signal: AbortSignal.timeout(10000) });
      if (dRes.ok) {
        const dData = (await dRes.json()) as { value: Array<{ Title: string }> };
        diseaseCount = dData.value?.length || 0;
        recentOutbreaks = (dData.value || []).slice(0, 5).map((o) => o.Title);
      }
    } catch { /* */ }

    // 4. Flights from adsb.lol
    let flightCount = 0;
    try {
      const fRes = await fetch('https://api.adsb.lol/v2/lat/40/lon/-74/dist/250', { signal: AbortSignal.timeout(8000) });
      if (fRes.ok) { const fData = (await fRes.json()) as { ac?: unknown[] }; flightCount = fData.ac?.length || 0; }
    } catch { /* */ }

    // 5. Conflict headlines from GDELT
    let conflictHeadlines: string[] = [];
    try {
      const cRes = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=attack%20OR%20airstrike%20OR%20ceasefire%20OR%20war&mode=artlist&maxrecords=10&timespan=1440min&format=json&sort=DateDesc', { signal: AbortSignal.timeout(10000) });
      if (cRes.ok) {
        const text = await cRes.text();
        if (!text.startsWith('Please limit')) {
          const cData = JSON.parse(text) as { articles?: Array<{ title: string }> };
          conflictHeadlines = (cData.articles || []).slice(0, 8).map((a) => a.title);
        }
      }
    } catch { /* */ }

    // 6. Market data from TwelveData
    let marketSummary = '';
    try {
      const apiKey = process.env.TWELVEDATA_API_KEY;
      if (apiKey) {
        const mRes = await fetch(`https://api.twelvedata.com/quote?symbol=SPY,GLD,USO,UUP&apikey=${apiKey}`, { signal: AbortSignal.timeout(8000) });
        if (mRes.ok) {
          const mData = (await mRes.json()) as Record<string, { close?: string; percent_change?: string; name?: string }>;
          const lines: string[] = [];
          for (const [sym, q] of Object.entries(mData)) {
            if (q?.close) lines.push(`${sym}: $${parseFloat(q.close).toFixed(2)} (${parseFloat(q.percent_change || '0') > 0 ? '+' : ''}${parseFloat(q.percent_change || '0').toFixed(2)}%)`);
          }
          marketSummary = lines.join(' | ');
        }
      }
    } catch { /* */ }

    // === Build intelligence-grade brief ===
    const briefData = {
      date: today,
      utcTime,
      topRiskCountries: topCII,
      earthquakeCount,
      significantQuakes,
      diseaseOutbreaks: diseaseCount,
      recentOutbreaks,
      flightsTracked: flightCount,
      totalCIICountries: ciiRows.length,
      conflictHeadlines,
      marketSummary,
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
            max_tokens: 2000,
            system: `You are a senior intelligence analyst writing a daily global intelligence briefing for NexusWatch, a geopolitical intelligence platform. Write in a professional, authoritative news-anchor tone. Use markdown formatting.

Structure your brief EXACTLY as follows:

# NEXUSWATCH GLOBAL SITUATION BRIEFING
**[DATE] | [TIME] UTC**

---

## BLUF (Bottom Line Up Front)
2-3 sentences summarizing the single most important development and its implications. Be specific with numbers and names.

---

## KEY DEVELOPMENTS
Use ▸ bullets. Each development should include:
- What happened (specific, factual)
- Confidence level in parentheses: (HIGH confidence), (MODERATE confidence), or (LOW confidence)
- Max 6-8 developments

---

## REGIONAL HIGHLIGHTS

### MIDDLE EAST
### EUROPE
### ASIA-PACIFIC
### AFRICA
### AMERICAS
2-3 sentences per region. Reference specific events, military movements, or political developments.

---

## MARKET IMPLICATIONS
Analyze how today's geopolitical events affect markets. Reference specific indices, commodities, currencies. Explain causation, not just correlation.

---

## INDICATORS TO WATCH (NEXT 24-48 HOURS)
3-5 specific things to monitor, each with context on why they matter. Use bold for the indicator name.

---

Be specific. Use real data from the context provided. Include CII scores. Reference actual headlines. Never fabricate events — only analyze what the data shows.`,
            messages: [{
              role: 'user',
              content: `Generate today's intelligence briefing (${today}, ${utcTime}).

DATA:
Top Risk Countries (CII):
${topCII.map((c) => `${c.name}: ${c.score}/100 (conflict: ${c.components.conflict}, disasters: ${c.components.disasters}, governance: ${c.components.governance}, market: ${c.components.marketExposure})`).join('\n')}

Earthquakes: ${earthquakeCount} total today
Significant: ${significantQuakes.join(', ') || 'None above M4.5'}

Disease Outbreaks: ${diseaseCount} active
Recent: ${recentOutbreaks.join('; ') || 'None'}

Conflict Headlines:
${conflictHeadlines.map((h) => `- ${h}`).join('\n') || '- No major conflict headlines available'}

Market Data: ${marketSummary || 'Unavailable'}

Flights tracked: ${flightCount}
Countries monitored: ${ciiRows.length}`,
            }],
          }),
          signal: AbortSignal.timeout(20000),
        });

        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as { content: Array<{ text: string }> };
          summary = aiData.content?.[0]?.text || buildFallbackBrief(briefData);
        } else {
          summary = buildFallbackBrief(briefData);
        }
      } catch {
        summary = buildFallbackBrief(briefData);
      }
    } else {
      summary = buildFallbackBrief(briefData);
    }

    // Store
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify(briefData)}, ${summary})
    `;

    // Email via Resend
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
            subject: `NexusWatch Intelligence Brief — ${today}`,
            html: `<div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; padding: 24px; max-width: 700px; margin: 0 auto;">
              <div style="border-bottom: 2px solid #ff6600; padding-bottom: 12px; margin-bottom: 16px;">
                <span style="font-size: 11px; letter-spacing: 3px; color: #ff6600; font-weight: bold;">NEXUSWATCH INTELLIGENCE BRIEF</span>
              </div>
              <div style="font-size: 13px; line-height: 1.8; white-space: pre-wrap;">${summary.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>').replace(/## /g, '<br><strong style="color:#ff6600">').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</div>
              <div style="margin-top: 24px;"><a href="https://dashpulse.app" style="display:inline-block;padding:8px 16px;background:#ff660020;border:1px solid #ff660050;color:#ff6600;text-decoration:none;font-size:11px;letter-spacing:1px;border-radius:3px;">Open NexusWatch →</a></div>
              <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #1a1a1a; font-size: 9px; color: #444;">NexusWatch Intelligence Platform · Unsubscribe in account settings</div>
            </div>`,
          }),
        });
      } catch { /* Email failed — brief still stored */ }
    }

    return res.json({ success: true, date: today, summary: summary.slice(0, 300) + '...' });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}

function buildFallbackBrief(data: {
  date: string; utcTime: string;
  topRiskCountries: Array<{ name: string; score: number }>;
  earthquakeCount: number; significantQuakes: string[];
  diseaseOutbreaks: number; conflictHeadlines: string[];
  marketSummary: string;
}): string {
  return `# NEXUSWATCH GLOBAL SITUATION BRIEFING
**${data.date} | ${data.utcTime}**

---

## BLUF
${data.topRiskCountries[0]?.name || 'Multiple regions'} leads the Country Instability Index at ${data.topRiskCountries[0]?.score || '?'}/100. ${data.earthquakeCount} earthquakes recorded globally with ${data.significantQuakes.length} significant events.

---

## KEY DEVELOPMENTS
${data.conflictHeadlines.slice(0, 5).map((h) => `▸ ${h} (MODERATE confidence)`).join('\n') || '▸ No major conflict developments detected'}

## TOP RISK COUNTRIES
${data.topRiskCountries.slice(0, 5).map((c) => `- **${c.name}**: CII ${c.score}/100`).join('\n')}

## KEY METRICS
- Earthquakes: ${data.earthquakeCount}${data.significantQuakes.length > 0 ? ` (${data.significantQuakes.join(', ')})` : ''}
- Disease outbreaks: ${data.diseaseOutbreaks}
- Markets: ${data.marketSummary || 'Data unavailable'}`;
}
