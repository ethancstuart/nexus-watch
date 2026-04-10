import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 300 };

interface CIIEntry {
  code: string;
  name: string;
  score: number;
  prevScore: number | null;
  components: Record<string, number>;
}

interface MarketQuote {
  symbol: string;
  price: string;
  change: string;
  direction: 'up' | 'down' | 'flat';
}

interface BriefData {
  date: string;
  utcTime: string;
  topRiskCountries: CIIEntry[];
  totalCountries: number;
  earthquakeCount: number;
  significantQuakes: string[];
  diseaseCount: number;
  recentOutbreaks: string[];
  conflictHeadlines: string[];
  markets: MarketQuote[];
  yesterdayEqCount: number | null;
  weeklyTrends: WeeklyTrend[];
  correlations: string[];
  newsHeadlines: NewsItem[];
}

interface WeeklyTrend {
  name: string;
  code: string;
  scores: { date: string; score: number }[];
  currentScore: number;
  weekAgoScore: number | null;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
}

interface NewsItem {
  title: string;
  source: string;
}

// Critical infrastructure for proximity correlation detection
const CRITICAL_INFRA: { name: string; type: string; lat: number; lon: number }[] = [
  { name: 'Zaporizhzhia NPP', type: 'nuclear', lat: 47.51, lon: 34.58 },
  { name: 'Bushehr NPP', type: 'nuclear', lat: 28.83, lon: 50.89 },
  { name: 'Fukushima Daiichi', type: 'nuclear', lat: 37.42, lon: 141.03 },
  { name: 'Strait of Hormuz', type: 'chokepoint', lat: 26.56, lon: 56.25 },
  { name: 'Bab el-Mandeb', type: 'chokepoint', lat: 12.58, lon: 43.33 },
  { name: 'Suez Canal', type: 'chokepoint', lat: 30.46, lon: 32.34 },
  { name: 'Malacca Strait', type: 'chokepoint', lat: 2.5, lon: 101.8 },
  { name: 'Taiwan Strait', type: 'chokepoint', lat: 24.0, lon: 119.0 },
  { name: 'Panama Canal', type: 'chokepoint', lat: 9.08, lon: -79.68 },
  { name: 'Port of Shanghai', type: 'port', lat: 31.35, lon: 121.6 },
  { name: 'Port of Rotterdam', type: 'port', lat: 51.95, lon: 4.13 },
  { name: 'Port of Singapore', type: 'port', lat: 1.26, lon: 103.84 },
  { name: 'Ras Tanura Terminal', type: 'energy', lat: 26.64, lon: 50.15 },
  { name: 'Druzhba Pipeline Hub', type: 'energy', lat: 52.1, lon: 23.7 },
  { name: 'Kharg Island Terminal', type: 'energy', lat: 29.23, lon: 50.31 },
];

// OSINT + world news RSS feeds for headline context
const BRIEF_RSS_FEEDS = [
  { url: 'https://www.bellingcat.com/feed/', source: 'Bellingcat' },
  { url: 'https://www.crisisgroup.org/rss.xml', source: 'Crisis Group' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { url: 'https://rss.dw.com/xml/rss-en-all', source: 'DW' },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const utcTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    await sql`DELETE FROM daily_briefs WHERE brief_date = ${today}`;

    // === Parallel data fetch ===
    const [
      ciiResult,
      prevCiiResult,
      earthquakeResult,
      diseaseResult,
      conflictResult,
      marketResult,
      yesterdaySnapResult,
      weeklyHistoryResult,
      newsResult,
    ] = await Promise.allSettled([
      // 1. Current CII scores
      sql`
        SELECT DISTINCT ON (country_code) country_code, country_name, score, components
        FROM country_cii_history ORDER BY country_code, timestamp DESC
      `,
      // 2. Yesterday's CII for trend arrows
      sql`
        SELECT DISTINCT ON (country_code) country_code, score
        FROM country_cii_history
        WHERE timestamp < NOW() - INTERVAL '20 hours'
        ORDER BY country_code, timestamp DESC
      `,
      // 3. Earthquakes
      fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      // 4. Disease outbreaks
      fetch('https://www.who.int/api/news/diseaseoutbreaknews?$top=10&$orderby=PublicationDate%20desc', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      // 5. Conflict headlines (GDELT — may be blocked)
      fetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=attack%20OR%20airstrike%20OR%20ceasefire%20OR%20war%20OR%20sanctions&mode=artlist&maxrecords=15&timespan=1440min&format=json&sort=DateDesc',
        { signal: AbortSignal.timeout(10000) },
      ).then(async (r) => {
        if (!r.ok) return null;
        const text = await r.text();
        if (text.startsWith('Please limit')) return null;
        return JSON.parse(text);
      }),
      // 6. Markets
      (async () => {
        const apiKey = process.env.TWELVEDATA_API_KEY;
        if (!apiKey) return null;
        const r = await fetch(`https://api.twelvedata.com/quote?symbol=SPY,GLD,USO,UNG,XLE,UUP,TLT&apikey=${apiKey}`, {
          signal: AbortSignal.timeout(8000),
        });
        return r.ok ? r.json() : null;
      })(),
      // 7. Yesterday's earthquake snapshot for comparison
      sql`
        SELECT feature_count FROM event_snapshots
        WHERE layer_id = 'earthquakes' AND timestamp > NOW() - INTERVAL '36 hours'
        ORDER BY timestamp ASC LIMIT 1
      `,
      // 8. 7-day CII history for trend analysis
      sql`
        SELECT country_code, country_name, score, timestamp::date as day
        FROM country_cii_history
        WHERE timestamp > NOW() - INTERVAL '7 days'
        ORDER BY country_code, timestamp DESC
      `,
      // 9. OSINT + world news headlines
      fetchNewsHeadlines(),
    ]);

    // === Process results ===
    const ciiRows = ciiResult.status === 'fulfilled' ? (ciiResult.value as Record<string, unknown>[]) : [];
    const prevCiiRows = prevCiiResult.status === 'fulfilled' ? (prevCiiResult.value as Record<string, unknown>[]) : [];
    const prevScoreMap = new Map(prevCiiRows.map((r) => [r.country_code as string, r.score as number]));

    const allCII: CIIEntry[] = ciiRows
      .map((r) => ({
        code: r.country_code as string,
        name: r.country_name as string,
        score: r.score as number,
        prevScore: prevScoreMap.get(r.country_code as string) ?? null,
        components: r.components as Record<string, number>,
      }))
      .sort((a, b) => b.score - a.score);
    const topCII = allCII.slice(0, 10);

    // Biggest movers (score change)
    const movers = allCII
      .filter((c) => c.prevScore !== null)
      .map((c) => ({ ...c, delta: c.score - (c.prevScore ?? c.score) }))
      .filter((c) => Math.abs(c.delta) >= 3)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

    // Earthquakes
    let earthquakeCount = 0;
    let significantQuakes: string[] = [];
    if (earthquakeResult.status === 'fulfilled' && earthquakeResult.value) {
      const qData = earthquakeResult.value as { features: Array<{ properties: { mag: number; place: string } }> };
      earthquakeCount = qData.features?.length || 0;
      significantQuakes = (qData.features || [])
        .filter((f) => f.properties.mag >= 4.5)
        .sort((a, b) => b.properties.mag - a.properties.mag)
        .slice(0, 5)
        .map((f) => `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`);
    }

    const yesterdayEqCount =
      yesterdaySnapResult.status === 'fulfilled' && (yesterdaySnapResult.value as Record<string, unknown>[]).length > 0
        ? ((yesterdaySnapResult.value as Record<string, unknown>[])[0].feature_count as number)
        : null;

    // Disease
    let diseaseCount = 0;
    let recentOutbreaks: string[] = [];
    if (diseaseResult.status === 'fulfilled' && diseaseResult.value) {
      const dData = diseaseResult.value as { value: Array<{ Title: string }> };
      diseaseCount = dData.value?.length || 0;
      recentOutbreaks = (dData.value || []).slice(0, 5).map((o) => o.Title);
    }

    // Conflict
    let conflictHeadlines: string[] = [];
    if (conflictResult.status === 'fulfilled' && conflictResult.value) {
      const cData = conflictResult.value as { articles?: Array<{ title: string; url: string }> };
      conflictHeadlines = (cData.articles || []).slice(0, 10).map((a) => a.title);
    }

    // Markets
    const markets: MarketQuote[] = [];
    if (marketResult.status === 'fulfilled' && marketResult.value) {
      const mData = marketResult.value as Record<string, { close?: string; percent_change?: string }>;
      const labels: Record<string, string> = {
        SPY: 'S&P 500',
        GLD: 'Gold',
        USO: 'Crude Oil',
        UNG: 'Nat Gas',
        XLE: 'Energy Sector',
        UUP: 'USD Index',
        TLT: 'Treasuries',
      };
      for (const [sym, q] of Object.entries(mData)) {
        if (q?.close) {
          const pct = parseFloat(q.percent_change || '0');
          markets.push({
            symbol: labels[sym] || sym,
            price: `$${parseFloat(q.close).toFixed(2)}`,
            change: `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
            direction: pct > 0.1 ? 'up' : pct < -0.1 ? 'down' : 'flat',
          });
        }
      }
    }

    // 7-day CII trends
    const weeklyTrends: WeeklyTrend[] = [];
    if (weeklyHistoryResult.status === 'fulfilled') {
      const histRows = weeklyHistoryResult.value as Record<string, unknown>[];
      const byCountry = new Map<string, { name: string; entries: { date: string; score: number }[] }>();
      for (const r of histRows) {
        const code = r.country_code as string;
        const entry = byCountry.get(code) || { name: r.country_name as string, entries: [] };
        entry.entries.push({ date: String(r.day), score: r.score as number });
        byCountry.set(code, entry);
      }
      // Build trends for top-risk countries
      for (const c of topCII) {
        const history = byCountry.get(c.code);
        if (!history || history.entries.length < 2) continue;
        // Deduplicate by date — keep FIRST entry per date (most recent, since query is DESC)
        const byDate = new Map<string, number>();
        for (const e of history.entries) {
          if (!byDate.has(e.date)) byDate.set(e.date, e.score);
        }
        const scores = Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, score]) => ({ date, score }));
        const weekAgo = scores.length >= 2 ? scores[0].score : null;
        // Use authoritative current score from allCII, not history query
        const current = c.score;
        // Detect volatility: if score swings >5 points in both directions
        let maxUp = 0,
          maxDown = 0;
        for (let i = 1; i < scores.length; i++) {
          const d = scores[i].score - scores[i - 1].score;
          if (d > maxUp) maxUp = d;
          if (d < maxDown) maxDown = d;
        }
        const direction: WeeklyTrend['direction'] =
          maxUp > 5 && Math.abs(maxDown) > 5
            ? 'volatile'
            : weekAgo !== null && current - weekAgo >= 3
              ? 'rising'
              : weekAgo !== null && current - weekAgo <= -3
                ? 'falling'
                : 'stable';
        weeklyTrends.push({
          name: c.name,
          code: c.code,
          scores,
          currentScore: current,
          weekAgoScore: weekAgo,
          direction,
        });
      }
    }

    // Server-side correlation detection (earthquakes near critical infrastructure)
    const correlations: string[] = [];
    if (earthquakeResult.status === 'fulfilled' && earthquakeResult.value) {
      const qData = earthquakeResult.value as {
        features: Array<{
          properties: { mag: number; place: string };
          geometry: { coordinates: [number, number, number] };
        }>;
      };
      for (const f of qData.features || []) {
        if (f.properties.mag < 4.5) continue;
        const [lon, lat] = f.geometry.coordinates;
        for (const infra of CRITICAL_INFRA) {
          const dist = haversineKm(lat, lon, infra.lat, infra.lon);
          if (dist < 200) {
            correlations.push(
              `PROXIMITY ALERT: M${f.properties.mag.toFixed(1)} earthquake ${Math.round(dist)}km from ${infra.name} (${infra.type}). ${f.properties.place}.`,
            );
          }
        }
      }
      // Seismic cluster detection
      const sigQuakes = (qData.features || []).filter((f) => f.properties.mag >= 4.0);
      const clusters = new Map<string, number>();
      for (const q of sigQuakes) {
        const key = `${Math.round(q.geometry.coordinates[1] / 3) * 3},${Math.round(q.geometry.coordinates[0] / 3) * 3}`;
        clusters.set(key, (clusters.get(key) || 0) + 1);
      }
      for (const [key, count] of clusters) {
        if (count >= 3) {
          const [lat, lon] = key.split(',').map(Number);
          const nearby = sigQuakes.find(
            (q) => Math.abs(q.geometry.coordinates[1] - lat) < 3 && Math.abs(q.geometry.coordinates[0] - lon) < 3,
          );
          correlations.push(
            `SEISMIC CLUSTER: ${count} M4.0+ earthquakes concentrated near ${nearby?.properties.place || `${lat}°N ${lon}°E`}. Elevated aftershock/escalation risk.`,
          );
        }
      }
    }
    // CII convergence: multiple high-CII countries in same region
    const highCII = allCII.filter((c) => c.score >= 50);
    if (highCII.length >= 5) {
      correlations.push(
        `MULTI-REGION INSTABILITY: ${highCII.length} countries above CII 50 threshold — elevated global risk posture. Top: ${highCII
          .slice(0, 3)
          .map((c) => `${c.name} (${c.score})`)
          .join(', ')}.`,
      );
    }

    // News headlines
    const newsHeadlines: NewsItem[] = newsResult.status === 'fulfilled' ? (newsResult.value as NewsItem[]) : [];

    const briefData: BriefData = {
      date: today,
      utcTime,
      topRiskCountries: topCII,
      totalCountries: ciiRows.length,
      earthquakeCount,
      significantQuakes,
      diseaseCount,
      recentOutbreaks,
      conflictHeadlines,
      markets,
      yesterdayEqCount,
      weeklyTrends,
      correlations,
      newsHeadlines,
    };

    // === Generate AI brief (outputs HTML directly) ===
    let briefHtml: string;
    let aiDebug: string | null = null;

    if (anthropicKey) {
      try {
        const trendArrow = (c: CIIEntry) => {
          if (c.prevScore === null) return '';
          const d = c.score - c.prevScore;
          if (d >= 3) return ` ↑${d.toFixed(0)}`;
          if (d <= -3) return ` ↓${Math.abs(d).toFixed(0)}`;
          return ' →';
        };

        const dataContext = `DATE: ${today} ${utcTime}
COUNTRIES MONITORED: ${ciiRows.length}

=== TOP RISK COUNTRIES (CII score / trend vs 24h ago) ===
${topCII.map((c) => `${c.name}: ${c.score}/100${trendArrow(c)} [conflict=${c.components.conflict}, disasters=${c.components.disasters}, governance=${c.components.governance}, market=${c.components.marketExposure}]`).join('\n')}

=== BIGGEST MOVERS (24h) ===
${movers.length > 0 ? movers.map((m) => `${m.name}: ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(0)} (${m.prevScore?.toFixed(0)} → ${m.score})`).join('\n') : 'No significant movements (±3 threshold)'}

=== 7-DAY CII TRAJECTORIES ===
${weeklyTrends.length > 0 ? weeklyTrends.map((t) => `${t.name} [${t.direction.toUpperCase()}]: ${t.weekAgoScore ?? '?'} → ${t.currentScore} over 7d | Daily: ${t.scores.map((s) => s.score).join(' → ')}`).join('\n') : 'Insufficient history for weekly trends'}

=== CROSS-DOMAIN CORRELATIONS (auto-detected) ===
${correlations.length > 0 ? correlations.join('\n') : 'No significant cross-domain correlations detected'}

=== SEISMIC ACTIVITY ===
${earthquakeCount} earthquakes in last 24h${yesterdayEqCount !== null ? ` (yesterday: ${yesterdayEqCount}, ${earthquakeCount > yesterdayEqCount ? 'INCREASING' : earthquakeCount < yesterdayEqCount ? 'decreasing' : 'stable'})` : ''}
Significant (M4.5+): ${significantQuakes.length > 0 ? significantQuakes.join('; ') : 'None'}

=== HEALTH SECURITY ===
${diseaseCount} active WHO outbreak notices
${recentOutbreaks.length > 0 ? recentOutbreaks.join('\n') : 'No recent outbreak reports'}

=== CONFLICT & SECURITY HEADLINES ===
${conflictHeadlines.length > 0 ? conflictHeadlines.map((h) => `- ${h}`).join('\n') : '(GDELT feed unavailable from this origin)'}

=== OSINT & WORLD NEWS (last 24h) ===
${newsHeadlines.length > 0 ? newsHeadlines.map((n) => `- [${n.source}] ${n.title}`).join('\n') : 'No headlines available'}

=== MARKET INDICATORS ===
${markets.length > 0 ? markets.map((m) => `${m.symbol}: ${m.price} (${m.change})`).join(' | ') : 'Market data unavailable'}

=== ENERGY CHOKEPOINT RISK CONTEXT ===
Strait of Hormuz: ~20% of global oil transits. Adjacent to Iran (CII: ${allCII.find((c) => c.code === 'IR')?.score ?? '?'}), Yemen (CII: ${allCII.find((c) => c.code === 'YE')?.score ?? '?'})
Bab el-Mandeb: Red Sea gateway. Adjacent to Yemen, Somalia (CII: ${allCII.find((c) => c.code === 'SO')?.score ?? '?'})
Suez Canal: ~12% of global trade. Adjacent to instability in Sudan (CII: ${allCII.find((c) => c.code === 'SD')?.score ?? '?'}), Libya (CII: ${allCII.find((c) => c.code === 'LY')?.score ?? '?'})
${(() => {
  const oilQuote = markets.find((m) => m.symbol === 'Crude Oil');
  const gasQuote = markets.find((m) => m.symbol === 'Nat Gas');
  const energyQuote = markets.find((m) => m.symbol === 'Energy Sector');
  return `Oil: ${oilQuote ? `${oilQuote.price} (${oilQuote.change})` : 'N/A'} | Nat Gas: ${gasQuote ? `${gasQuote.price} (${gasQuote.change})` : 'N/A'} | Energy Sector (XLE): ${energyQuote ? `${energyQuote.price} (${energyQuote.change})` : 'N/A'}`;
})()}`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 6000,
            system: `You are a senior intelligence analyst at NexusWatch, a geopolitical intelligence platform. Write a daily intelligence briefing that a national security advisor or hedge fund risk manager would find genuinely useful.

OUTPUT FORMAT: Return ONLY raw HTML fragments (no <html>, <head>, <body> tags). Use inline styles only. The email background is #0a0a0a with #e0e0e0 text. Accent color: #ff6600.

AUDIENCE: US-based decision-makers — national security professionals, hedge fund risk managers, energy traders, policy analysts. Frame global events through the lens of US interests, US energy markets, and US security posture. This doesn't mean ignore other regions — it means always connect back to "why does this matter for the US?"

CRITICAL RULES:
- NEVER fabricate events, names, or claims not present in the data
- DO synthesize, analyze, and draw connections between data points — this is what makes you an ANALYST not an aggregator
- When OSINT/news headlines are available, weave them into your analysis as supporting evidence
- Cross-domain correlations (earthquakes near infrastructure, multi-region instability) are HIGH-VALUE intel — lead with them if present
- Use 7-day trend trajectories to identify DEVELOPING SITUATIONS, not just snapshots
- If conflict headlines are unavailable, analyze instability through CII component breakdown and news headlines instead
- Be specific: numbers, country names, magnitudes, trend directions — not vague generalizations
- Write like you're briefing someone who will make decisions based on this. Every sentence should pass the "so what?" test.
- Energy markets (oil, natural gas, energy sector ETF) deserve dedicated analysis — they're the transmission mechanism between geopolitical risk and economic impact.

STRUCTURE (use these exact section headers as <h2> elements):

1. SITUATION SUMMARY — 3-4 sentences. Lead with the most consequential development or cross-domain correlation. What should a decision-maker know RIGHT NOW? Include the single most important number and the most important TREND. Frame for US impact.

2. THREAT MATRIX — Table with columns: Region | Threat Level (Critical/High/Elevated/Low) | Key Driver | 7-Day Trend. Cover 5-6 regions. Use colored dots: 🔴 Critical, 🟠 High, 🟡 Elevated, 🟢 Low. Use the 7-day trajectory data to characterize trends, not just 24h.

3. ENERGY & COMMODITIES — Dedicated analysis of oil, natural gas, and energy sector movements. Connect to: chokepoint disruptions (Hormuz, Bab el-Mandeb, Suez), OPEC+ dynamics, sanctions impact, pipeline security, LNG flows. Reference specific price data from market indicators. What's driving energy prices today and what could move them tomorrow?

4. CROSS-DOMAIN ALERTS — If correlations were auto-detected (earthquakes near infrastructure, seismic clusters, multi-region instability), analyze each one: what converged, why it matters, what to watch. If no correlations, omit this section entirely.

5. KEY DEVELOPMENTS — 5-7 bullet points synthesizing the most important headlines, CII movements, and events. Each one: what happened + why it matters (especially to US interests) + confidence level. Use news sources when available. Use "▸" prefix.

6. US IMPACT ASSESSMENT — 2-3 paragraphs. How do today's global developments affect: US homeland security, US economic interests, US energy independence, US alliance commitments, or US military posture? Be specific — name regions, trade routes, and economic channels.

7. INSTABILITY TRAJECTORIES — Focus on 7-day CII trends, not just today. Which countries are on a rising trajectory? Which are stabilizing? Connect trajectory to the component breakdown. Call out countries where instability could cascade into US-relevant consequences.

8. SEISMIC & ENVIRONMENTAL — Earthquake analysis with baseline comparison. Cluster detection. Disease alerts if relevant.

9. MARKET SIGNAL — How geopolitical risk maps to market moves. S&P, treasuries, energy sector, gold, USD. Connect specific events to specific price movements. What's priced in vs. what's a surprise?

10. 48-HOUR OUTLOOK — MANDATORY, DO NOT SKIP THIS SECTION. This is the most valuable section for subscribers. 4-6 specific, actionable indicators to watch over the next 48 hours. Each with: the specific indicator to monitor, the threshold/trigger that matters, and why it matters for US interests. At least one energy-specific, one geopolitical, one market. Format each as a bold indicator name followed by analysis. This section should feel like a checklist a trader or analyst pins to their monitor.

Style each <h2> with: color:#ff6600; font-size:14px; letter-spacing:2px; text-transform:uppercase; border-bottom:1px solid #333; padding-bottom:6px; margin-top:24px;
Style paragraphs with: color:#ccc; font-size:13px; line-height:1.7; margin:8px 0;
Style bullets (▸) with: color:#e0e0e0; font-size:13px; line-height:1.7; margin:4px 0; padding-left:12px;
For the threat table, use: border-collapse:collapse; width:100%; and cells with border-bottom:1px solid #1a1a1a; padding:8px 12px; font-size:12px;`,
            messages: [
              {
                role: 'user',
                content: `Generate today's intelligence briefing.\n\n${dataContext}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(240000),
        });

        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as { content: Array<{ text: string }> };
          briefHtml = aiData.content?.[0]?.text || buildFallbackHtml(briefData);
          aiDebug = briefHtml === buildFallbackHtml(briefData) ? 'ai-empty-response' : 'ai-success';
        } else {
          const errBody = await aiRes.text().catch(() => 'unknown');
          aiDebug = `ai-failed:${aiRes.status}:${errBody.slice(0, 300)}`;
          console.error(`AI brief failed: ${aiRes.status} — ${errBody.slice(0, 200)}`);
          briefHtml = buildFallbackHtml(briefData);
        }
      } catch (aiErr) {
        aiDebug = `ai-error:${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
        console.error('AI brief error:', aiErr instanceof Error ? aiErr.message : aiErr);
        briefHtml = buildFallbackHtml(briefData);
      }
    } else {
      aiDebug = 'no-api-key';
      briefHtml = buildFallbackHtml(briefData);
    }

    // Store (keep raw HTML as summary)
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify(briefData)}, ${briefHtml})
    `;

    // === Send email ===
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const subscribers = await sql`SELECT email FROM email_subscribers WHERE unsubscribed = FALSE`;
        const adminEmail = process.env.ADMIN_EMAILS;
        const allEmails = new Set<string>();
        if (adminEmail) adminEmail.split(',').forEach((e: string) => allEmails.add(e.trim()));
        subscribers.forEach((s) => allEmails.add(s.email as string));

        if (allEmails.size > 0) {
          const emailBatch = Array.from(allEmails).slice(0, 50);
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
            body: JSON.stringify({
              from: 'NexusWatch Intelligence <brief@nexuswatch.dev>',
              to: emailBatch,
              subject: `NexusWatch Intelligence Brief — ${today}`,
              html: wrapEmailTemplate(briefHtml, today, utcTime, markets),
            }),
          });
        }
      } catch {
        /* Email failed — brief still stored */
      }
    }

    return res.json({ success: true, date: today, briefLength: briefHtml.length, ai: aiDebug });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}

// === Email wrapper template ===
function wrapEmailTemplate(bodyHtml: string, date: string, time: string, markets: MarketQuote[]): string {
  const marketStrip =
    markets.length > 0
      ? markets
          .map((m) => {
            const color = m.direction === 'up' ? '#4ade80' : m.direction === 'down' ? '#f87171' : '#888';
            return `<span style="margin-right:16px;"><span style="color:#888;font-size:10px;">${m.symbol}</span> <span style="color:${color};font-size:12px;font-weight:bold;">${m.change}</span></span>`;
          })
          .join('')
      : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Courier New',Courier,monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;">
<tr><td align="center" style="padding:16px 8px;">
<table width="660" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;">

<!-- Header -->
<tr><td style="padding:20px 28px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td><span style="font-size:10px;letter-spacing:4px;color:#ff6600;font-weight:bold;text-transform:uppercase;">NexusWatch Intelligence</span></td>
    <td align="right"><span style="font-size:10px;color:#555;">${date} | ${time}</span></td>
  </tr>
  </table>
</td></tr>

<!-- Accent bar -->
<tr><td style="padding:0 28px;"><div style="height:1px;background:linear-gradient(to right,#ff6600,#ff660030,transparent);"></div></td></tr>

${
  marketStrip
    ? `<!-- Market strip -->
<tr><td style="padding:12px 28px 0;">
  <div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:3px;padding:8px 12px;font-family:'Courier New',monospace;">
    ${marketStrip}
  </div>
</td></tr>`
    : ''
}

<!-- Brief body -->
<tr><td style="padding:16px 28px 24px;color:#ccc;font-size:13px;line-height:1.7;">
${bodyHtml}
</td></tr>

<!-- CTA -->
<tr><td style="padding:0 28px 20px;">
  <a href="https://nexuswatch.dev/#/intel" style="display:inline-block;padding:10px 20px;background:#ff660018;border:1px solid #ff660040;color:#ff6600;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:3px;font-family:'Courier New',monospace;">Open Live Map →</a>
</td></tr>

<!-- Upgrade CTA -->
<tr><td style="padding:16px 28px 0;">
  <div style="background:#ff660008;border:1px solid #ff660020;border-radius:4px;padding:16px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="vertical-align:middle;">
        <span style="color:#ff6600;font-size:11px;font-weight:bold;letter-spacing:1px;">UPGRADE TO PRO</span>
        <p style="color:#888;font-size:11px;line-height:1.5;margin:4px 0 0;">Unlimited alerts, 90-day timeline, API access, personalized briefs, and no watermarks.</p>
      </td>
      <td style="vertical-align:middle;text-align:right;padding-left:16px;white-space:nowrap;">
        <a href="https://nexuswatch.dev/#/intel" style="display:inline-block;padding:8px 16px;background:#ff6600;color:#0a0a0a;text-decoration:none;font-size:10px;letter-spacing:1px;text-transform:uppercase;border-radius:3px;font-family:'Courier New',monospace;font-weight:bold;">$99/mo →</a>
      </td>
    </tr>
    </table>
  </div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:16px 28px;border-top:1px solid #141414;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td><span style="font-size:9px;color:#444;">NexusWatch Intelligence Platform</span></td>
    <td align="right"><span style="font-size:9px;color:#333;">Unsubscribe in account settings</span></td>
  </tr>
  </table>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// === Fallback brief (no AI) — still produces decent HTML ===
function buildFallbackHtml(data: BriefData): string {
  const trendArrow = (c: CIIEntry) => {
    if (c.prevScore === null) return '';
    const d = c.score - c.prevScore;
    if (d >= 3) return ` <span style="color:#f87171">↑${d.toFixed(0)}</span>`;
    if (d <= -3) return ` <span style="color:#4ade80">↓${Math.abs(d).toFixed(0)}</span>`;
    return ' <span style="color:#888">→</span>';
  };

  const h2 = (text: string) =>
    `<h2 style="color:#ff6600;font-size:14px;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:6px;margin-top:24px;font-weight:bold;">${text}</h2>`;

  const topCountry = data.topRiskCountries[0];
  const eqTrend =
    data.yesterdayEqCount !== null
      ? data.earthquakeCount > data.yesterdayEqCount
        ? `, up from ${data.yesterdayEqCount} yesterday`
        : data.earthquakeCount < data.yesterdayEqCount
          ? `, down from ${data.yesterdayEqCount} yesterday`
          : ', unchanged from yesterday'
      : '';

  let html = '';

  // Situation Summary
  html += h2('Situation Summary');
  html += `<p style="color:#ccc;font-size:13px;line-height:1.7;">`;
  html += topCountry
    ? `${topCountry.name} leads the Country Instability Index at <strong style="color:#ff6600">${topCountry.score}/100</strong>${topCountry.prevScore !== null ? ` (${topCountry.score > topCountry.prevScore ? 'up' : topCountry.score < topCountry.prevScore ? 'down' : 'unchanged'} from ${topCountry.prevScore})` : ''}, driven primarily by ${Object.entries(topCountry.components).sort(([, a], [, b]) => b - a)[0][0]} risk. `
    : '';
  html += `NexusWatch is monitoring <strong>${data.totalCountries} countries</strong> across ${data.topRiskCountries.filter((c) => c.score >= 50).length} elevated-risk zones. `;
  html += `${data.earthquakeCount} seismic events recorded globally${eqTrend}${data.significantQuakes.length > 0 ? `, including ${data.significantQuakes.length} events above M4.5` : ''}.`;
  html += `</p>`;

  // Threat Matrix
  html += h2('Threat Matrix');
  html += `<table style="border-collapse:collapse;width:100%;margin:8px 0;">`;
  html += `<tr style="border-bottom:1px solid #333;">
    <td style="padding:6px 12px;color:#888;font-size:10px;letter-spacing:1px;">COUNTRY</td>
    <td style="padding:6px 12px;color:#888;font-size:10px;letter-spacing:1px;">CII</td>
    <td style="padding:6px 12px;color:#888;font-size:10px;letter-spacing:1px;">24H</td>
    <td style="padding:6px 12px;color:#888;font-size:10px;letter-spacing:1px;">PRIMARY DRIVER</td>
  </tr>`;
  for (const c of data.topRiskCountries.slice(0, 8)) {
    const level = c.score >= 70 ? '🔴' : c.score >= 50 ? '🟠' : c.score >= 30 ? '🟡' : '🟢';
    const driver = Object.entries(c.components).sort(([, a], [, b]) => b - a)[0];
    html += `<tr style="border-bottom:1px solid #1a1a1a;">
      <td style="padding:8px 12px;color:#e0e0e0;font-size:12px;">${level} ${c.name}</td>
      <td style="padding:8px 12px;color:#e0e0e0;font-size:12px;font-weight:bold;">${c.score}</td>
      <td style="padding:8px 12px;font-size:12px;">${trendArrow(c)}</td>
      <td style="padding:8px 12px;color:#888;font-size:11px;">${driver[0]} (${driver[1]})</td>
    </tr>`;
  }
  html += `</table>`;

  // Key Developments
  if (data.conflictHeadlines.length > 0) {
    html += h2('Key Developments');
    for (const h of data.conflictHeadlines.slice(0, 6)) {
      html += `<p style="color:#e0e0e0;font-size:13px;line-height:1.7;margin:4px 0;padding-left:12px;">▸ ${h}</p>`;
    }
  }

  // Seismic & Environmental
  html += h2('Seismic &amp; Environmental');
  html += `<p style="color:#ccc;font-size:13px;line-height:1.7;">`;
  html += `<strong>${data.earthquakeCount}</strong> earthquakes in the last 24 hours${eqTrend}. `;
  if (data.significantQuakes.length > 0) {
    html += `Notable events: ${data.significantQuakes.join('; ')}. `;
  } else {
    html += `No events above M4.5. `;
  }
  if (data.diseaseCount > 0) {
    html += `WHO reports <strong>${data.diseaseCount}</strong> active outbreak notices.`;
  }
  html += `</p>`;
  if (data.recentOutbreaks.length > 0) {
    for (const o of data.recentOutbreaks.slice(0, 3)) {
      html += `<p style="color:#aaa;font-size:12px;line-height:1.5;margin:2px 0;padding-left:12px;">▸ ${o}</p>`;
    }
  }

  // Correlations
  if (data.correlations.length > 0) {
    html += h2('Cross-Domain Alerts');
    for (const c of data.correlations) {
      const isProximity = c.startsWith('PROXIMITY');
      const isCluster = c.startsWith('SEISMIC CLUSTER');
      const color = isProximity ? '#f87171' : isCluster ? '#fbbf24' : '#ff6600';
      html += `<p style="color:${color};font-size:12px;line-height:1.6;margin:6px 0;padding:8px 12px;background:#ffffff08;border-left:2px solid ${color};">⚠ ${c}</p>`;
    }
  }

  // Weekly trends
  if (data.weeklyTrends.length > 0) {
    html += h2('7-Day Trajectories');
    for (const t of data.weeklyTrends.slice(0, 5)) {
      const arrow =
        t.direction === 'rising'
          ? '<span style="color:#f87171">↗ RISING</span>'
          : t.direction === 'falling'
            ? '<span style="color:#4ade80">↘ FALLING</span>'
            : t.direction === 'volatile'
              ? '<span style="color:#fbbf24">↕ VOLATILE</span>'
              : '<span style="color:#888">→ STABLE</span>';
      html += `<p style="color:#ccc;font-size:12px;line-height:1.5;margin:4px 0;">▸ <strong>${t.name}</strong>: ${t.weekAgoScore ?? '?'} → ${t.currentScore} ${arrow}</p>`;
    }
  }

  // News headlines
  if (data.newsHeadlines.length > 0) {
    html += h2('Headlines');
    for (const n of data.newsHeadlines.slice(0, 6)) {
      html += `<p style="color:#aaa;font-size:12px;line-height:1.5;margin:3px 0;padding-left:12px;">▸ <span style="color:#888;">[${n.source}]</span> ${n.title}</p>`;
    }
  }

  // Markets
  if (data.markets.length > 0) {
    html += h2('Market Signal');
    html += `<p style="color:#ccc;font-size:13px;line-height:1.7;">`;
    html += data.markets
      .map((m) => {
        const color = m.direction === 'up' ? '#4ade80' : m.direction === 'down' ? '#f87171' : '#ccc';
        return `${m.symbol}: ${m.price} (<span style="color:${color}">${m.change}</span>)`;
      })
      .join(' &nbsp;|&nbsp; ');
    html += `</p>`;
  }

  return html;
}

// === RSS fetcher for news headlines ===
async function fetchNewsHeadlines(): Promise<NewsItem[]> {
  const headlines: NewsItem[] = [];
  const results = await Promise.allSettled(
    BRIEF_RSS_FEEDS.map(async (feed) => {
      const r = await fetch(feed.url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'NexusWatch/1.0 Intelligence Brief' },
      });
      if (!r.ok) return [];
      const xml = await r.text();
      return parseRssItems(xml, feed.source);
    }),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') headlines.push(...r.value);
  }
  // Sort by recency heuristic (position in feed) and deduplicate
  const seen = new Set<string>();
  return headlines
    .filter((h) => {
      const key = h.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function parseRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
    const item = match[1];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    if (title && title.length > 10) {
      items.push({ title, source });
    }
  }
  return items;
}

// === Haversine distance for correlation detection ===
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
