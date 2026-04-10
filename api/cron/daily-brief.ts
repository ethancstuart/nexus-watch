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

// === The NexusWatch Brief — AI Prompt ===
function getBriefSystemPrompt(now: Date): string {
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const isSunday = dayOfWeek === 0;

  const baseVoice = `You are the editorial voice of The NexusWatch Brief, a daily geopolitical intelligence newsletter read by traders, analysts, founders, and curious professionals over morning coffee.

VOICE — This is critical. Get this right:
- You are a smart, well-connected friend who happens to run a global intelligence platform
- Use "we" naturally: "We're watching Iran closely" / "We flagged this yesterday"
- Conversational but credible — like a Bloomberg reporter at a dinner party
- Occasionally show personality: "Okay, this one's worth your attention" / "This caught our eye" / "Big day."
- On big news days, be more urgent. On quiet days, be more reflective.
- NEVER say: "geopolitical landscape", "in the realm of", "it remains to be seen", "remains a concern", "amid growing tensions"
- NEVER sound like a government report or a college essay
- Every sentence must pass the "would I actually say this to a smart friend?" test
- Brevity is respect. Every sentence earns its place. Target ~800-1000 words total.

AUDIENCE: US-based but globally curious. Traders, analysts, founders, policy people, OSINT enthusiasts. Frame global events with a slight US-interest lens — not jingoistic, just practical: "here's why this matters if you're in the US."

ATTRIBUTION: You are NexusWatch — the platform IS the source. Don't attribute to "reports say" or "according to sources." When referencing a specific investigation or report (Bellingcat, Crisis Group), name it. Otherwise, state facts with authority.

CRITICAL RULES:
- NEVER fabricate events, names, or claims not in the data
- DO synthesize and connect dots — this is analysis, not aggregation
- Be specific: numbers, country names, magnitudes, percentages
- If data is thin on a topic, say less, not vaguer things
- Cross-domain correlations are gold — lead with them when present`;

  if (isSunday) {
    return `${baseVoice}

OUTPUT FORMAT: Clean markdown text. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook.

THIS IS THE SUNDAY WEEK IN REVIEW EDITION. Different format from daily briefs.

STRUCTURE:

## ☕ Good Morning
2-3 sentences. "Happy Sunday. Here's what mattered this week — and what we're watching heading into Monday." Warm, reflective tone.

## 📍 The Week That Was
5-7 of the biggest stories from the past 7 days. Each gets:
- A bold headline
- 2-3 sentences: what happened, how it developed over the week, where it stands now
- Focus on TRENDS and TRAJECTORIES, not just events

## 🇺🇸 US Impact This Week
3-4 sentences synthesizing the week's cumulative impact on US interests.

## ⛽ Energy & Commodities: Weekly Wrap
Price movements over the full week (not just today). What drove them. Where we think they're headed.

## 📊 Market Signal
Weekly market performance connected to geopolitical developments.

## 🔭 The Week Ahead
5-6 things to watch Monday through Friday. Specific events, thresholds, and dates.
This section should feel like a Monday morning prep sheet.`;
  }

  return `${baseVoice}

OUTPUT FORMAT: Clean markdown text. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook. NO HTML.

STRUCTURE (follow exactly):

## ☕ Good Morning
2-3 sentences max. Conversational hook that leads with the single most important thing today. "Good morning — oil crashed nearly 10% yesterday, but the real story is what Iran did NOT do. Here's your 3-minute scan." On big days: more urgent. Quiet days: more reflective.

## 📍 Today's Top Stories

3-5 numbered stories. Each story gets:
- A **bold headline**
- What happened (1-2 sentences, specific)
- **Why it matters** (1-2 sentences — this is the money line, the reason someone should care)
- Name sources when referencing specific investigations (Bellingcat, Crisis Group, etc.)

## 🇺🇸 US Impact
2-3 sentences. How today's events affect US security, economy, energy, or alliances. Practical, not theoretical. "This matters for the US because..."

## ⛽ Energy & Commodities
2-3 sentences. Oil, natural gas, energy sector. Price + what's driving it + what could reverse it. Reference specific chokepoints (Hormuz, Bab el-Mandeb, Suez) when relevant.

## 📊 Market Signal
2-3 sentences. S&P, gold, oil, nat gas, energy sector, USD, treasuries. Connect geopolitics to price moves. What's priced in vs. what's a surprise.

## 🔭 48-Hour Outlook
MANDATORY — DO NOT SKIP. This is the most valuable section.
3-4 bullet points. Each: **bold indicator name** → what to watch, the threshold that matters, and why. At least one energy, one geopolitical, one market. Should feel like a checklist you'd pin to your monitor.

## 🗺️ Map of the Day
1-2 sentences describing what the NexusWatch globe is showing today — tied to the top story. "Today's map shows [description]. [Why it's interesting.]" This will be paired with an auto-generated globe screenshot.`;
}

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

    // === Generate AI brief (outputs markdown text) ===
    let briefText: string;
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
            system: getBriefSystemPrompt(now),
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
          briefText = aiData.content?.[0]?.text || '';
          if (!briefText) {
            aiDebug = 'ai-empty-response';
            briefText = buildFallbackText(briefData);
            briefHtml = buildFallbackHtml(briefData);
          } else {
            aiDebug = 'ai-success';
            briefHtml = markdownToHtml(briefText);
          }
        } else {
          const errBody = await aiRes.text().catch(() => 'unknown');
          aiDebug = `ai-failed:${aiRes.status}:${errBody.slice(0, 300)}`;
          console.error(`AI brief failed: ${aiRes.status} — ${errBody.slice(0, 200)}`);
          briefText = buildFallbackText(briefData);
          briefHtml = buildFallbackHtml(briefData);
        }
      } catch (aiErr) {
        aiDebug = `ai-error:${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
        console.error('AI brief error:', aiErr instanceof Error ? aiErr.message : aiErr);
        briefText = buildFallbackText(briefData);
        briefHtml = buildFallbackHtml(briefData);
      }
    } else {
      aiDebug = 'no-api-key';
      briefText = buildFallbackText(briefData);
      briefHtml = buildFallbackHtml(briefData);
    }

    // Store both markdown and HTML versions
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify({ ...briefData, briefText })}, ${briefHtml})
    `;

    // === Publish to beehiiv ===
    const beehiivKey = process.env.BEEHIIV_API_KEY;
    const beehiivPubId = process.env.BEEHIIV_PUB_ID;
    if (beehiivKey && beehiivPubId) {
      try {
        // Extract Good Morning line for subtitle
        const subtitleMatch = briefText.match(/## ☕ Good Morning\n+([\s\S]*?)(?=\n##|\n\n##)/);
        const subtitle = subtitleMatch
          ? subtitleMatch[1].trim().slice(0, 200)
          : `Your daily geopolitical intelligence scan — ${today}`;

        await fetch(`https://api.beehiiv.com/v2/publications/${beehiivPubId}/posts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${beehiivKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `The NexusWatch Brief — ${today}`,
            subtitle,
            content_html: briefHtml,
            status: 'confirmed',
            send_to: 'all',
          }),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        /* beehiiv push failed — non-critical */
      }
    }

    // === Post to X via Buffer (GraphQL API) ===
    const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
    const bufferOrgId = process.env.BUFFER_PROFILE_ID;
    if (bufferToken && bufferOrgId) {
      try {
        // Step 1: Get X/Twitter channel ID
        const channelsRes = await fetch('https://api.buffer.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bufferToken}`,
          },
          body: JSON.stringify({
            query: `query GetChannels($orgId: ID!) {
              organization(id: $orgId) {
                channels { id name service }
              }
            }`,
            variables: { orgId: bufferOrgId },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!channelsRes.ok) throw new Error('Buffer channels fetch failed');
        const channelsData = (await channelsRes.json()) as {
          data?: { organization?: { channels?: Array<{ id: string; service: string }> } };
        };
        const xChannel = channelsData.data?.organization?.channels?.find(
          (c) => c.service === 'twitter' || c.service === 'x',
        );

        if (xChannel) {
          // Step 2: Build post content
          const gmMatch = briefText.match(/## ☕ Good Morning\n+([\s\S]*?)(?=\n##)/);
          const goodMorning = gmMatch ? gmMatch[1].trim() : '';

          const storiesMatch = briefText.match(/## 📍 Today's Top Stories\n+([\s\S]*?)(?=\n##)/);
          const topStory = storiesMatch
            ? storiesMatch[1]
                .trim()
                .split(/\n\d+\./)[1]
                ?.trim()
                .slice(0, 180) || ''
            : '';

          const postText = [
            `☕ ${goodMorning.slice(0, 220)}`,
            topStory ? `\n\n📍 ${topStory}` : '',
            `\n\nFull brief → brief.nexuswatch.dev`,
          ]
            .join('')
            .slice(0, 280);

          // Step 3: Create and queue the post
          await fetch('https://api.buffer.com', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bufferToken}`,
            },
            body: JSON.stringify({
              query: `mutation CreatePost($text: String!, $channelId: ID!) {
                createPost(input: {
                  text: $text,
                  channelId: $channelId,
                  schedulingType: automatic,
                  mode: addToQueue
                }) {
                  ... on PostActionSuccess { post { id } }
                  ... on MutationError { message }
                }
              }`,
              variables: {
                text: postText,
                channelId: xChannel.id,
              },
            }),
            signal: AbortSignal.timeout(10000),
          });
        }
      } catch {
        /* Buffer/X post failed — non-critical */
      }
    }

    // === Send transactional email via Resend (legacy subscribers only) ===
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

    // === Push to Notion (Substack-ready) ===
    const notionKey = process.env.NOTION_API_KEY;
    const notionBriefsPage = '33e45c2d-baf4-8104-b0e9-f6794c462363';
    if (notionKey) {
      try {
        // Use the markdown text directly — already clean and copy-paste ready
        const plainBrief = briefText;

        // Create a subpage for today's brief
        const pageRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            parent: { page_id: notionBriefsPage },
            icon: { type: 'emoji', emoji: '📋' },
            properties: {
              title: [{ type: 'text', text: { content: `Intelligence Brief — ${today}` } }],
            },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (pageRes.ok) {
          const page = (await pageRes.json()) as { id: string };

          // Split into chunks of ~2000 chars (Notion block limit)
          const chunks = splitTextToChunks(plainBrief, 1900);
          const blocks = chunks.map((chunk) => ({
            object: 'block' as const,
            type: 'paragraph' as const,
            paragraph: {
              rich_text: [{ type: 'text' as const, text: { content: chunk } }],
            },
          }));

          // Notion API accepts max 100 blocks per request
          for (let i = 0; i < blocks.length; i += 100) {
            const batch = blocks.slice(i, i + 100);
            await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${notionKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify({ children: batch }),
              signal: AbortSignal.timeout(10000),
            });
          }
        }
      } catch {
        /* Notion push failed — non-critical */
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

// === Markdown to HTML (for site archive + email fallback) ===
function markdownToHtml(md: string): string {
  let html = md;
  // Headers
  html = html.replace(
    /^## (.+)$/gm,
    '<h2 style="color:#ff6600;font-size:16px;font-weight:700;margin:24px 0 8px;border-bottom:1px solid #e5e5e5;padding-bottom:6px;">$1</h2>',
  );
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:16px 0 6px;">$1</h3>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<div style="margin:6px 0 6px 16px;">$1. $2</div>');
  // Bullet points
  html = html.replace(/^[•▸-] (.+)$/gm, '<div style="margin:4px 0 4px 16px;">▸ $1</div>');
  html = html.replace(/^\* (.+)$/gm, '<div style="margin:4px 0 4px 16px;">▸ $1</div>');
  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7;">');
  // Single newlines within sections
  html = html.replace(/\n/g, '<br>');
  // Wrap in container
  html = `<div style="font-family:Inter,-apple-system,sans-serif;font-size:15px;line-height:1.7;color:#1a1a1a;max-width:640px;"><p style="margin:8px 0;line-height:1.7;">${html}</p></div>`;
  return html;
}

// === Fallback brief in markdown (when AI fails) ===
function buildFallbackText(data: BriefData): string {
  const trendArrow = (c: CIIEntry) => {
    if (c.prevScore === null) return '';
    const d = c.score - c.prevScore;
    if (d >= 3) return ` ↑${d.toFixed(0)}`;
    if (d <= -3) return ` ↓${Math.abs(d).toFixed(0)}`;
    return ' →';
  };

  const topCountry = data.topRiskCountries[0];
  const eqTrend =
    data.yesterdayEqCount !== null
      ? data.earthquakeCount > data.yesterdayEqCount
        ? `, up from ${data.yesterdayEqCount} yesterday`
        : `, down from ${data.yesterdayEqCount} yesterday`
      : '';

  let text = `## ☕ Good Morning\n\n`;
  text += topCountry
    ? `We're tracking ${data.topRiskCountries.filter((c) => c.score >= 50).length} elevated-risk zones across ${data.totalCountries} countries this morning. ${topCountry.name} leads our Country Instability Index at ${topCountry.score}/100. ${data.earthquakeCount} seismic events globally${eqTrend}.\n\n`
    : `${data.earthquakeCount} seismic events globally${eqTrend}. Here's your scan.\n\n`;

  text += `## 📍 Today's Top Stories\n\n`;
  if (data.newsHeadlines.length > 0) {
    data.newsHeadlines.slice(0, 5).forEach((n, i) => {
      text += `${i + 1}. **${n.title}** (${n.source})\n\n`;
    });
  } else if (data.conflictHeadlines.length > 0) {
    data.conflictHeadlines.slice(0, 5).forEach((h, i) => {
      text += `${i + 1}. **${h}**\n\n`;
    });
  } else {
    text += `CII leaders: ${data.topRiskCountries
      .slice(0, 5)
      .map((c) => `${c.name} (${c.score}${trendArrow(c)})`)
      .join(', ')}\n\n`;
  }

  text += `## 🇺🇸 US Impact\n\n`;
  text += `${data.topRiskCountries.filter((c) => c.score >= 50).length} countries above CII 50 threshold — elevated global risk posture affecting energy supply chains and alliance commitments.\n\n`;

  text += `## ⛽ Energy & Commodities\n\n`;
  const oil = data.markets.find((m) => m.symbol === 'Crude Oil');
  const gas = data.markets.find((m) => m.symbol === 'Nat Gas');
  if (oil) text += `Crude Oil: ${oil.price} (${oil.change}). `;
  if (gas) text += `Natural Gas: ${gas.price} (${gas.change}). `;
  text += `\n\n`;

  text += `## 📊 Market Signal\n\n`;
  text += data.markets.map((m) => `${m.symbol}: ${m.price} (${m.change})`).join(' | ');
  text += `\n\n`;

  text += `## 🔭 48-Hour Outlook\n\n`;
  text += `- **CII Trajectory**: Watch ${topCountry?.name || 'top risk countries'} for continued instability\n`;
  text += `- **Seismic Activity**: ${data.earthquakeCount} events in 24h${data.significantQuakes.length > 0 ? ` including ${data.significantQuakes[0]}` : ''}\n`;
  if (oil) text += `- **Energy**: ${oil.symbol} at ${oil.price} — watch for reversal signals\n`;

  text += `\n## 🗺️ Map of the Day\n\n`;
  text += `Today's map highlights ${topCountry?.name || 'global instability'} and surrounding risk zones. Open the live map at nexuswatch.dev to explore.\n`;

  return text;
}

function splitTextToChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  return chunks;
}
