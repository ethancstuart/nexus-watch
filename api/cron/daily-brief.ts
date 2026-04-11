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
  // UTC day index. 0=Sun, 1=Mon ... 5=Fri, 6=Sat. The cron runs at 10:00 UTC
  // (5:00 AM ET) so UTC day and US-East day match for the whole publication.
  const dayOfWeek = now.getUTCDay();
  const isSunday = dayOfWeek === 0;
  const isFriday = dayOfWeek === 5;

  // ---------------------------------------------------------------------------
  // Base voice — the 40/60 analyst/smart-friend rubric locked 2026-04-11.
  // Source of truth: docs/voice/nexuswatch-voice.md (Track C.0 Voice Model).
  // Changes here must stay in sync with the voice spec or the drafting engine
  // (Track C) and the newsletter will drift apart.
  // ---------------------------------------------------------------------------
  const baseVoice = `You are the editorial voice of The NexusWatch Brief, a daily geopolitical intelligence newsletter read by traders, analysts, founders, and curious professionals over morning coffee.

VOICE — 40% analyst / 60% smart friend. Get this right:
- You are a smart, well-connected friend who happens to run a global intelligence platform.
- Use "we" as the brand pronoun. "We're watching Iran closely" / "We flagged this yesterday." Never "I", never reference a specific founder or author.
- Conversational but credible — like a Bloomberg reporter at a dinner party, not a cable news anchor.
- Show personality on big days: "Okay, this one's worth your attention" / "This caught our eye" / "Big day."
- Every sentence must pass the "would I actually say this to a smart friend?" test.
- Brevity is respect. Every sentence earns its place. Target ~800-1000 words total.

FORBIDDEN PHRASES (auto-reject and rewrite if any appear):
- "geopolitical landscape"
- "in the realm of"
- "it remains to be seen"
- "remains a concern"
- "amid growing tensions"
- "tensions are rising"
- "experts say" / "analysts say" / "sources say"
- "a major development"
- "unprecedented"
- Any sentence that sounds like a government report, a college essay, or a LinkedIn post.

AUDIENCE: US-based but globally curious. Traders, analysts, founders, policy people, OSINT enthusiasts, defense-industry watchers. Frame global events with a clear US-interest lens — practical, analytical: "here's why this matters if you're in the US."

EDITORIAL STANCE:
- Pro-US: frame events through American security, economic, and strategic interests.
- Pro-Israel: when covering Middle East conflicts, frame from Israeli/US security perspective.
- This is analytical alignment, not propaganda. Present facts, let the framing and "so what" serve US/allied interests.
- Energy analysis emphasizes US energy independence and supply chain security.
- Don't editorialize — let the data and analysis speak, but the lens is clear.

ATTRIBUTION: You are NexusWatch — the platform IS the source. Don't attribute to "reports say" or "according to sources." When referencing a specific investigation or report (Bellingcat, Crisis Group, ISW), name it. Otherwise, state facts with authority.

CRITICAL RULES:
- NEVER fabricate events, names, or claims not in the data. If the data doesn't support it, don't write it.
- DO synthesize and connect dots — this is analysis, not aggregation. The cross-domain correlations section of the data context is gold; lead with it when present.
- Be specific: numbers, country names, magnitudes, percentages.
- If data is thin on a topic, say less, not vaguer things.
- "Your Watchlist" is NOT generated by you. Ignore any user-specific content in your output — the template layer appends a per-user Watchlist section after your output.`;

  // ---------------------------------------------------------------------------
  // Sunday variant — Week in Review. Reflective, trajectory-focused.
  // ---------------------------------------------------------------------------
  if (isSunday) {
    return `${baseVoice}

OUTPUT FORMAT: Clean markdown. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook.

THIS IS THE SUNDAY WEEK IN REVIEW EDITION. Different structure from daily briefs — reflective, trajectory-focused.

STRUCTURE:

## ☕ Good Morning
2-3 sentences. Warm, reflective. "Happy Sunday. Here's what mattered this week — and what we're watching heading into Monday."

## 📍 The Week That Was
5-7 of the biggest stories from the past 7 days. Each story gets:
- A **bold headline**
- 2-3 sentences: what happened, how it developed over the week, where it stands now
- Focus on TRENDS and TRAJECTORIES, not isolated events

## 🇺🇸 US Impact This Week
3-4 sentences synthesizing the week's cumulative impact on US security, economy, energy, or alliances.

## ⛽ Energy & Commodities: Weekly Wrap
Weekly price movements (not just today). What drove them. Where we think they're headed next week. Reference Hormuz, Bab el-Mandeb, or Suez if relevant.

## 📊 Market Signal
Weekly market performance connected to geopolitical developments. What was priced in vs. what surprised.

## 🔭 The Week Ahead
5-6 things to watch Monday through Friday. Specific events, thresholds, and dates. This section should feel like a Monday morning prep sheet.`;
  }

  // ---------------------------------------------------------------------------
  // Daily variant (Mon-Sat) — the locked 7-section structure from Apr 10
  // Decision 5, plus the Friday-only "Tool of the Week" eighth section from
  // the same decision. "Your Watchlist" is template-level (Track A.9), not
  // part of the Sonnet output. Space & Tech is deliberately omitted — it
  // wasn't in the Apr 10 Decision 5 locked structure.
  // ---------------------------------------------------------------------------
  const toolOfTheWeekSection = isFriday
    ? `

## 🛠️ Tool of the Week
2-3 sentences. Highlight one NexusWatch feature that helped analysts this week — a data layer, an intelligence system, a map preset, a recent upgrade. Give a concrete use case: "This week we leaned on [feature] to [concrete thing]." Make it feel like an editor's note about our own product, not a pitch. Friday-only.`
    : '';

  return `${baseVoice}

OUTPUT FORMAT: Clean markdown. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook. NO HTML.

STRUCTURE (follow exactly — do NOT add or reorder sections):

## ☕ Good Morning

2-3 sentences max. The tone VARIES with day intensity — assess from the data context and pick one:

- **Normal day** (CII stable, no major cross-domain correlations, no M5+ quakes near population centers, no >3% energy moves) → **Warm + focused.** Greeting a colleague at 6 AM. Example: "Morning. Yesterday was quiet — but the quiet is worth reading. Here's what we're watching." Reflective, acknowledges the calm, points to the interesting thing.

- **Big day** (any high CII mover ≥10 points, multiple correlations, significant quakes, dramatic energy or market moves, or breaking geopolitical event) → **Playful + urgent.** Friend texting "hey, you seeing this?". Example: "Okay. This one's worth your attention. Oil is down 9%, Iran went quiet, and the cables we flagged Tuesday are showing signs. Let's go." Direct, engaged, leads with the most surprising thing.

Don't announce the choice — just write in that register. Never cold, never flat.

## 📍 Today's Top Stories

3-5 numbered stories. Each story gets:
- A **bold headline**
- What happened (1-2 sentences, specific — names, numbers, places)
- **Why it matters** (1-2 sentences — this is the money line, the reason someone should care)
- Name sources when referencing specific investigations (Bellingcat, Crisis Group, ISW, etc.)

Cross-domain correlations from the data context should lead this section when present.

## 🇺🇸 US Impact

2-3 sentences. How today's events affect US security, economy, energy, alliances, or supply chains. Practical, not theoretical. Lead with "This matters for the US because..." or equivalent concrete framing.

## ⛽ Energy & Commodities

2-3 sentences. Required shape: **price + driver + reversal trigger.** What did oil / natural gas / the energy sector do, what's driving it, and what specific development would reverse the move? Reference chokepoints (Hormuz, Bab el-Mandeb, Suez) when relevant.

Example: "Crude crashed 9% to $68 on Iran de-escalation signals. The driver is the explicit no-strike message out of Tehran, which pulled the geopolitical premium out overnight. The reversal trigger is any Houthi attack on Red Sea shipping — Bab el-Mandeb is carrying 12% of global seaborne oil this month."

## 📊 Market Signal

2-3 sentences. S&P, gold, oil, nat gas, energy sector (XLE), USD, treasuries. Connect geopolitics to price moves. What's priced in vs. what's a surprise? Don't list all indices — pick the 2-3 that actually moved and explain why.

## 🔭 48-Hour Outlook

MANDATORY — DO NOT SKIP. This is the single most valuable section for the trader audience.
3-4 bullet points. Each: **bold indicator name** → what to watch, the threshold that matters, and why. At least one energy, one geopolitical, one market. Should feel like a checklist you'd pin to your monitor before the open.

## 🗺️ Map of the Day

1-2 sentences describing what the NexusWatch globe is showing today — tied to the top story. Example: "Today's map shows the Red Sea corridor with our dark-vessel flags overlaid on the Bab el-Mandeb chokepoint. Three vessels went dark in the last 18 hours." This will be paired with an auto-generated globe screenshot, so don't describe visuals that aren't in the data.${toolOfTheWeekSection}`;
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

    // Opaque but sortable run identifier shared by every channel's delivery-log
    // row for this cron invocation. See docs/migrations/2026-04-11-brief-delivery-log.sql
    // and Track A.4 in NEXUSWATCH-COMPLETION-PLAN.md.
    const runId = `${today}-${Date.now()}`;

    /**
     * Write one row to brief_delivery_log. Fire-and-forget from the caller's
     * perspective — logDelivery swallows its own errors so a logging failure
     * never breaks the cron. Keep `error` strings short; truncate to 500 chars
     * to avoid storing multi-KB API response bodies in Postgres.
     */
    async function logDelivery(params: {
      channel: 'archive' | 'beehiiv' | 'buffer' | 'resend' | 'notion';
      status: 'success' | 'failed' | 'partial';
      recipientCount?: number;
      failedCount?: number;
      error?: string;
      latencyMs: number;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      try {
        const errTruncated = params.error ? params.error.slice(0, 500) : null;
        const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;
        await sql`
          INSERT INTO brief_delivery_log
            (run_id, brief_date, channel, status, recipient_count, failed_count, error, latency_ms, metadata)
          VALUES
            (${runId}, ${today}, ${params.channel}, ${params.status},
             ${params.recipientCount ?? null}, ${params.failedCount ?? null},
             ${errTruncated}, ${params.latencyMs}, ${metaJson})
        `;
      } catch (logErr) {
        console.error(
          '[daily-brief] logDelivery insert failed (non-fatal):',
          logErr instanceof Error ? logErr.message : logErr,
        );
      }
    }

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
})()}

=== SPACE & TECHNOLOGY ===
NexusWatch tracks satellites, launches, GPS jamming zones, and internet outages globally.
${(() => {
  const parts: string[] = [];
  // Internet outages affect cyber/tech posture
  const highCIICountries = allCII.filter((c) => c.score >= 40);
  const infraRisk = highCIICountries.filter((c) => c.components.infrastructure > 5);
  if (infraRisk.length > 0) {
    parts.push(
      `Infrastructure disruption risk elevated in: ${infraRisk.map((c) => `${c.name} (infra: ${c.components.infrastructure})`).join(', ')}`,
    );
  }
  parts.push(`GPS jamming zones, satellite orbits, and launch schedules are tracked on the live platform.`);
  return parts.join('\n');
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

    // Store both markdown and HTML versions. Instrumented as the 'archive'
    // channel — this row failing means the entire run is broken, so the outer
    // try/catch converts it to a 500. The logDelivery call below only fires
    // on success.
    const archiveT0 = Date.now();
    await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, ${JSON.stringify({ ...briefData, briefText })}, ${briefHtml})
    `;
    await logDelivery({
      channel: 'archive',
      status: 'success',
      latencyMs: Date.now() - archiveT0,
      metadata: { brief_html_length: briefHtml.length, ai: aiDebug },
    });

    // === Render Light Intel Dossier email (Track A.6) ===
    // renderDossierEmail produces three outputs — a full standalone HTML
    // shell for Resend, an inner-modules-only HTML for beehiiv, and a
    // text/plain multipart fallback used by both channels for
    // deliverability. Computed ONCE per run so the two channels are
    // guaranteed to be rendering the same content.
    const dossier = renderDossierEmail({
      briefText,
      date: today,
      time: utcTime,
      markets,
    });

    // === Publish to beehiiv ===
    const beehiivKey = process.env.BEEHIIV_API_KEY;
    const beehiivPubId = process.env.BEEHIIV_PUB_ID;
    if (beehiivKey && beehiivPubId) {
      const beehiivT0 = Date.now();
      try {
        // Extract Good Morning line for subtitle
        const subtitleMatch = briefText.match(/## ☕ Good Morning\n+([\s\S]*?)(?=\n##|\n\n##)/);
        const subtitle = subtitleMatch
          ? subtitleMatch[1].trim().slice(0, 200)
          : `Your daily geopolitical intelligence scan — ${today}`;

        const beehiivRes = await fetch(`https://api.beehiiv.com/v2/publications/${beehiivPubId}/posts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${beehiivKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `The NexusWatch Brief — ${today}`,
            subtitle,
            // Light Intel Dossier inner modules. beehiiv wraps with its own
            // masthead/footer/unsubscribe chrome, so we ship just the content.
            content_html: dossier.beehiivHtml,
            status: 'confirmed',
            send_to: 'all',
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!beehiivRes.ok) {
          const body = await beehiivRes.text().catch(() => '');
          throw new Error(`beehiiv ${beehiivRes.status}: ${body.slice(0, 200)}`);
        }

        // Parse post ID for traceability — not fatal if the shape changes.
        let postId: string | undefined;
        try {
          const beehiivData = (await beehiivRes.json()) as { data?: { id?: string } };
          postId = beehiivData.data?.id;
        } catch {
          /* ignore parse errors */
        }

        await logDelivery({
          channel: 'beehiiv',
          status: 'success',
          latencyMs: Date.now() - beehiivT0,
          metadata: { post_id: postId, subtitle_length: subtitle.length },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[daily-brief] beehiiv publish failed:', msg);
        await logDelivery({
          channel: 'beehiiv',
          status: 'failed',
          error: msg,
          latencyMs: Date.now() - beehiivT0,
        });
      }
    }

    // === Post to X via Buffer (GraphQL API) ===
    const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
    // Hardcoded NexusWatchDev channel ID (stable, verified working)
    const bufferChannelId = '69d95485031bfa423cee6b71';
    if (bufferToken) {
      const bufferT0 = Date.now();
      try {
        // Build post content from brief
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

        // Create and queue the post on @NexusWatchDev
        const bufferRes = await fetch('https://api.buffer.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bufferToken}`,
          },
          body: JSON.stringify({
            query: `mutation CreatePost($text: String!, $channelId: ChannelId!) {
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
              channelId: bufferChannelId,
            },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!bufferRes.ok) {
          const body = await bufferRes.text().catch(() => '');
          throw new Error(`buffer ${bufferRes.status}: ${body.slice(0, 200)}`);
        }

        // Buffer returns 200 even on GraphQL-level errors — inspect the body.
        let bufferPostId: string | undefined;
        let bufferMutationError: string | undefined;
        try {
          const bufferData = (await bufferRes.json()) as {
            data?: { createPost?: { post?: { id?: string }; message?: string } };
            errors?: Array<{ message?: string }>;
          };
          bufferPostId = bufferData.data?.createPost?.post?.id;
          bufferMutationError = bufferData.data?.createPost?.message || bufferData.errors?.[0]?.message;
        } catch {
          /* non-JSON response — treat as soft success, Buffer's GraphQL is stable */
        }

        if (bufferMutationError) {
          throw new Error(`buffer mutation: ${bufferMutationError}`);
        }

        await logDelivery({
          channel: 'buffer',
          status: 'success',
          latencyMs: Date.now() - bufferT0,
          metadata: { post_id: bufferPostId, post_length: postText.length },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[daily-brief] Buffer/X post failed:', msg);
        await logDelivery({
          channel: 'buffer',
          status: 'failed',
          error: msg,
          latencyMs: Date.now() - bufferT0,
        });
      }
    }

    // === Send transactional email via Resend (per-recipient, batch API) ===
    // Fix 2026-04-11 (P0 privacy): previously used a single /emails POST with
    // `to: [allSubscribers]` which CC'd every subscriber to every other
    // subscriber — a GDPR/CAN-SPAM incident. Now uses /emails/batch with a
    // single-recipient payload per email object. Max 100 per batch request;
    // paced to stay under Resend's default 10 req/sec rate limit.
    //
    // Scale note: the sync loop is fine up to ~30K subscribers (~30s of work
    // inside the 300s Vercel function limit). Above that, migrate this block
    // to Vercel Workflow (WDK) for durable execution, pause/resume, and
    // crash-safe retries across multiple cron ticks. See Track D.1 for the
    // self-heal hooks that will trigger the migration signal.
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resendT0 = Date.now();
      let resendRecipientCount = 0;
      try {
        const subscribers = await sql`SELECT email FROM email_subscribers WHERE unsubscribed = FALSE`;
        const adminEmail = process.env.ADMIN_EMAILS;
        const allEmails = new Set<string>();
        if (adminEmail) adminEmail.split(',').forEach((e: string) => allEmails.add(e.trim()));
        subscribers.forEach((s) => allEmails.add(s.email as string));

        resendRecipientCount = allEmails.size;
        if (allEmails.size > 0) {
          const recipients = Array.from(allEmails);
          // Use the Light Intel Dossier standalone email shell rendered
          // above. Plain-text fallback attached per email for the ~15% of
          // intel readers on text-only clients + Resend deliverability.
          const html = dossier.emailHtml;
          const text = dossier.plainText;
          const subject = `NexusWatch Intelligence Brief — ${today}`;
          const from = 'NexusWatch Intelligence <brief@nexuswatch.dev>';
          const BATCH_SIZE = 100;

          let sent = 0;
          let failed = 0;
          const errors: string[] = [];

          for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const chunk = recipients.slice(i, i + BATCH_SIZE);
            // Per-recipient payload: each email object has its own single-item
            // `to` array, so no subscriber's address is ever exposed to another.
            const payload = chunk.map((email) => ({ from, to: [email], subject, html, text }));

            try {
              const resp = await fetch('https://api.resend.com/emails/batch', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${resendKey}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
              });

              if (!resp.ok) {
                const body = await resp.text().catch(() => '');
                failed += chunk.length;
                errors.push(`batch ${i}-${i + chunk.length - 1}: ${resp.status} ${body.slice(0, 200)}`);
              } else {
                sent += chunk.length;
              }
            } catch (err) {
              failed += chunk.length;
              errors.push(`batch ${i}-${i + chunk.length - 1}: ${err instanceof Error ? err.message : String(err)}`);
            }

            // Pace between batches to respect Resend's 10 req/sec default.
            if (i + BATCH_SIZE < recipients.length) {
              await new Promise((r) => setTimeout(r, 100));
            }
          }

          // Surface failures to logs AND log to brief_delivery_log so the
          // admin dashboard can see per-channel delivery state.
          if (failed > 0 && sent === 0) {
            console.error(
              `[daily-brief] Resend batch total failure: failed=${failed}/${recipients.length}. First errors: ${errors.slice(0, 3).join(' | ')}`,
            );
            await logDelivery({
              channel: 'resend',
              status: 'failed',
              recipientCount: recipients.length,
              failedCount: failed,
              error: errors.slice(0, 3).join(' | '),
              latencyMs: Date.now() - resendT0,
              metadata: { batches: Math.ceil(recipients.length / BATCH_SIZE) },
            });
          } else if (failed > 0) {
            console.error(
              `[daily-brief] Resend batch partial failure: sent=${sent}, failed=${failed}/${recipients.length}. First errors: ${errors.slice(0, 3).join(' | ')}`,
            );
            await logDelivery({
              channel: 'resend',
              status: 'partial',
              recipientCount: sent,
              failedCount: failed,
              error: errors.slice(0, 3).join(' | '),
              latencyMs: Date.now() - resendT0,
              metadata: { batches: Math.ceil(recipients.length / BATCH_SIZE) },
            });
          } else {
            console.log(`[daily-brief] Resend batch delivered to ${sent}/${recipients.length} recipients`);
            await logDelivery({
              channel: 'resend',
              status: 'success',
              recipientCount: sent,
              failedCount: 0,
              latencyMs: Date.now() - resendT0,
              metadata: { batches: Math.ceil(recipients.length / BATCH_SIZE) },
            });
          }
        } else {
          // Zero subscribers — not a failure, but log so the dashboard shows
          // "no recipients" rather than a missing row.
          await logDelivery({
            channel: 'resend',
            status: 'success',
            recipientCount: 0,
            failedCount: 0,
            latencyMs: Date.now() - resendT0,
            metadata: { note: 'no subscribers' },
          });
        }
      } catch (err) {
        // Top-level failure (e.g. DB query). Brief is still stored in
        // Postgres via the archive step above.
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[daily-brief] Resend email path failed:', msg);
        await logDelivery({
          channel: 'resend',
          status: 'failed',
          recipientCount: resendRecipientCount,
          error: msg,
          latencyMs: Date.now() - resendT0,
        });
      }
    }

    // === Push to Notion (Substack-ready) ===
    const notionKey = process.env.NOTION_API_KEY;
    const notionBriefsPage = '33e45c2d-baf4-8104-b0e9-f6794c462363';
    if (notionKey) {
      const notionT0 = Date.now();
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

        if (!pageRes.ok) {
          const body = await pageRes.text().catch(() => '');
          throw new Error(`notion page create ${pageRes.status}: ${body.slice(0, 200)}`);
        }

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
        let blocksWritten = 0;
        for (let i = 0; i < blocks.length; i += 100) {
          const batch = blocks.slice(i, i + 100);
          const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${notionKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({ children: batch }),
            signal: AbortSignal.timeout(10000),
          });
          if (!blockRes.ok) {
            const body = await blockRes.text().catch(() => '');
            throw new Error(`notion block patch ${blockRes.status} (batch ${i}): ${body.slice(0, 200)}`);
          }
          blocksWritten += batch.length;
        }

        await logDelivery({
          channel: 'notion',
          status: 'success',
          latencyMs: Date.now() - notionT0,
          metadata: { page_id: page.id, blocks: blocksWritten },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[daily-brief] Notion push failed:', msg);
        await logDelivery({
          channel: 'notion',
          status: 'failed',
          error: msg,
          latencyMs: Date.now() - notionT0,
        });
      }
    }

    return res.json({ success: true, date: today, briefLength: briefHtml.length, ai: aiDebug });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}

// ============================================================================
// Email rendering — Light Intel Dossier (Track A.6)
// ============================================================================
//
// Replaces the pre-2026-04-11 `wrapEmailTemplate` which produced a dark
// terminal-themed HTML wrapper around a Sonnet-generated body. The new
// renderer owns both the shell AND the section-level rendering, following
// the Apr 11 CEO lock "we own the HTML" (Decision 5).
//
// Design tokens live in src/styles/email-tokens.ts — the canonical source
// of truth for the Light Intel Dossier palette, typography, and spacing.
// All inline styles in this module flow from those tokens via `style()`
// and `typeStyle()` helpers. Do not introduce hardcoded hex colors or
// font stacks below — use the tokens, or add new ones there first.
//
// Three outputs per render:
//   1. emailHtml  — full standalone HTML for Resend transactional send
//                   (masthead + modules + CTA + footer + unsubscribe)
//   2. beehiivHtml — inner modules only, no shell chrome, since beehiiv
//                    adds its own masthead/footer when sending
//   3. plainText  — text/plain multipart fallback (15% of intel readers
//                   are on text-only clients + higher deliverability)
// ============================================================================

import { colors, fonts, type, space, layout, style, typeStyle } from '../../src/styles/email-tokens';

interface RenderedBrief {
  emailHtml: string;
  beehiivHtml: string;
  plainText: string;
}

interface RenderBriefOptions {
  briefText: string; // Markdown body (Sonnet output or buildFallbackText)
  date: string; // YYYY-MM-DD
  time: string; // "10:00 UTC"
  markets: MarketQuote[];
  /** URL of the corresponding /brief/:date permalink, for forward-to-colleague. */
  archiveUrl?: string;
}

/**
 * Parse Sonnet's markdown output into addressable sections. Each section
 * begins with `## <emoji> <title>` and runs until the next `##`.
 */
interface BriefSection {
  emoji: string;
  title: string;
  body: string;
}
function parseSections(markdown: string): BriefSection[] {
  const sections: BriefSection[] = [];
  // Split on '## ' at line starts, drop the leading empty fragment.
  const fragments = markdown.split(/\n?^## /m).filter(Boolean);
  for (const frag of fragments) {
    const firstNewline = frag.indexOf('\n');
    const headerLine = firstNewline === -1 ? frag : frag.slice(0, firstNewline);
    const body = firstNewline === -1 ? '' : frag.slice(firstNewline + 1).trim();

    // The header line is something like "☕ Good Morning" — split off the emoji.
    // Emojis can be 1-2 code points; we accept anything up to the first space.
    const firstSpace = headerLine.indexOf(' ');
    if (firstSpace === -1) {
      sections.push({ emoji: '', title: headerLine.trim(), body });
    } else {
      sections.push({
        emoji: headerLine.slice(0, firstSpace).trim(),
        title: headerLine.slice(firstSpace + 1).trim(),
        body,
      });
    }
  }
  return sections;
}

/**
 * Escape HTML-significant characters for safe inline rendering. We do NOT
 * escape inside raw HTML tags (that would break them) — only when inserting
 * user-generated or LLM-generated text into element bodies and attributes.
 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}

/**
 * Render a section body from Sonnet markdown into dossier-styled HTML.
 * Handles the subset of markdown the prompt actually emits:
 *   - **bold** → <strong>
 *   - numbered lists (`1. `) → numbered story cards
 *   - bullet lists (`- `) → bullet paragraphs
 *   - paragraphs separated by blank lines
 *   - inline "**Why it matters**" runs → oxblood callout blocks
 */
function renderSectionBody(body: string): string {
  if (!body.trim()) return '';
  const paragraphBase = typeStyle(type.body, { color: colors.textPrimary, margin: `0 0 ${space.md} 0` });
  const bulletBase = typeStyle(type.body, {
    color: colors.textPrimary,
    margin: `0 0 ${space.sm} 0`,
    paddingLeft: space.lg,
  });
  const whyItMattersLabel = typeStyle(type.sectionLabel, {
    color: colors.accent,
    textTransform: 'uppercase',
    margin: `0 0 ${space.xs} 0`,
    display: 'block',
  });
  const whyItMattersBody = typeStyle(type.body, { color: colors.textPrimary, margin: 0 });
  const calloutBlock = style({
    margin: `${space.md} 0 ${space.lg} 0`,
    padding: `${space.md} ${space.lg}`,
    background: colors.accentBgSoft,
    borderLeft: `3px solid ${colors.accent}`,
    borderRadius: layout.radiusCallout,
  });

  // Split body into blocks separated by blank lines, then render each block
  // as a paragraph, numbered story, or bullet list based on its leading token.
  const blocks = body.split(/\n\s*\n/);
  const rendered: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Numbered story (`1. **Headline**\n   Body text...`).
    const numberedMatch = block.match(/^(\d+)\.\s+(.*)$/s);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const rest = numberedMatch[2];
      rendered.push(
        `<div ${styleAttr(
          style({
            margin: `0 0 ${space.xl} 0`,
            paddingBottom: space.lg,
            borderBottom: `1px solid ${colors.border}`,
          }),
        )}>` +
          `<div ${styleAttr(
            typeStyle(type.kicker, {
              color: colors.textTertiary,
              margin: `0 0 ${space.xs} 0`,
            }),
          )}>STORY ${num}</div>` +
          `<div ${styleAttr(paragraphBase)}>${renderInline(rest)}</div>` +
          `</div>`,
      );
      continue;
    }

    // Bullet list (lines starting with `- ` or `* `).
    if (/^[-*]\s/.test(block)) {
      const items = block
        .split(/\n/)
        .filter((l) => /^[-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[-*]\s+/, ''));
      rendered.push(
        items
          .map(
            (item) =>
              `<div ${styleAttr(bulletBase)}>` +
              `<span ${styleAttr(style({ color: colors.accent, marginRight: space.sm }))}>▸</span>` +
              renderInline(item) +
              `</div>`,
          )
          .join(''),
      );
      continue;
    }

    // "Why it matters" callout — detect when the block leads with the phrase.
    const whyMatch = block.match(/^\*\*Why it matters[:\s*]+\*\*\s*(.*)$/is);
    if (whyMatch) {
      rendered.push(
        `<div ${styleAttr(calloutBlock)}>` +
          `<span ${styleAttr(whyItMattersLabel)}>Why it matters</span>` +
          `<p ${styleAttr(whyItMattersBody)}>${renderInline(whyMatch[1])}</p>` +
          `</div>`,
      );
      continue;
    }

    // Plain paragraph.
    rendered.push(`<p ${styleAttr(paragraphBase)}>${renderInline(block)}</p>`);
  }

  return rendered.join('\n');
}

/**
 * Render inline markdown — **bold**, *italic*, and standalone "Why it matters"
 * phrases that appear mid-paragraph. Keeps the output safe by escaping raw
 * text first and then reintroducing the markup.
 */
function renderInline(text: string): string {
  let out = escapeHtml(text);
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, `<strong ${styleAttr(style({ color: colors.textPrimary }))}>$1</strong>`);
  // *italic*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

/** Convenience: wrap an inline-style string in a `style="..."` HTML attribute. */
function styleAttr(inline: string): string {
  return `style="${inline}"`;
}

/**
 * Render the Market Pulse module — mono ticker strip with semantic
 * up/down/flat coloring. Emitted as its own dossier block so the parent
 * template can place it independently of the Sonnet "Market Signal"
 * narrative section.
 */
function renderMarketPulse(markets: MarketQuote[]): string {
  if (markets.length === 0) return '';
  const strip = markets
    .map((m) => {
      const color = m.direction === 'up' ? colors.up : m.direction === 'down' ? colors.down : colors.flat;
      const symbolStyle = styleAttr(typeStyle(type.data, { color: colors.textTertiary, marginRight: space.xs }));
      const changeStyle = styleAttr(typeStyle(type.dataStrong, { color }));
      return `<span ${styleAttr(style({ display: 'inline-block', marginRight: space.lg, marginBottom: space.xs }))}>
        <span ${symbolStyle}>${escapeHtml(m.symbol)}</span> <span ${changeStyle}>${escapeHtml(m.change)}</span>
      </span>`;
    })
    .join('');

  return (
    `<div ${styleAttr(
      style({
        margin: `0 0 ${space.xl} 0`,
        padding: `${space.md} ${space.lg}`,
        background: colors.bgMuted,
        borderTop: `2px solid ${colors.divider}`,
        borderBottom: `2px solid ${colors.divider}`,
      }),
    )}>` +
    `<div ${styleAttr(
      typeStyle(type.sectionLabel, {
        color: colors.textTertiary,
        marginBottom: space.sm,
        textTransform: 'uppercase',
      }),
    )}>Market Pulse</div>` +
    strip +
    `</div>`
  );
}

/**
 * Render a Sonnet-written section into a Light Intel Dossier module. Every
 * section gets the same shell: kicker + serif headline + body. The body
 * renderer handles per-paragraph, per-bullet, per-story-card treatments
 * inside the shell.
 */
function renderSection(section: BriefSection): string {
  const kickerStyle = styleAttr(
    typeStyle(type.kicker, {
      color: colors.accent,
      margin: `0 0 ${space.xs} 0`,
    }),
  );
  const headlineStyle = styleAttr(
    typeStyle(type.storyHeadline, {
      color: colors.textPrimary,
      margin: `0 0 ${space.md} 0`,
    }),
  );
  const emojiInline = section.emoji
    ? `<span ${styleAttr(style({ marginRight: space.sm }))}>${section.emoji}</span>`
    : '';

  return (
    `<div ${styleAttr(style({ margin: `0 0 ${space.xxl} 0` }))}>` +
    `<div ${kickerStyle}>${emojiInline}${escapeHtml(section.title.toUpperCase())}</div>` +
    `<h2 ${headlineStyle}>${escapeHtml(section.title)}</h2>` +
    renderSectionBody(section.body) +
    `</div>`
  );
}

/**
 * Masthead block. Rendered at the top of the email-only shell (not in
 * beehiivHtml — beehiiv writes its own). Shows the wordmark, date, and a
 * parchment-gold rule that anchors the dossier aesthetic.
 */
function renderMasthead(date: string, time: string): string {
  return (
    `<div ${styleAttr(style({ margin: `0 0 ${space.xl} 0`, textAlign: 'center' }))}>` +
    `<div ${styleAttr(
      typeStyle(type.masthead, {
        color: colors.textPrimary,
        margin: `0 0 ${space.xs} 0`,
        letterSpacing: '-0.01em',
      }),
    )}>NexusWatch</div>` +
    `<div ${styleAttr(
      typeStyle(type.kicker, {
        color: colors.accent,
        margin: `0 0 ${space.md} 0`,
      }),
    )}>SITUATION BRIEF</div>` +
    `<div ${styleAttr(
      style({
        height: '2px',
        background: `linear-gradient(to right, transparent, ${colors.divider}, transparent)`,
        margin: `0 0 ${space.md} 0`,
      }),
    )}></div>` +
    `<div ${styleAttr(
      typeStyle(type.issueMeta, {
        color: colors.textTertiary,
      }),
    )}>${escapeHtml(date)} · ${escapeHtml(time)}</div>` +
    `</div>`
  );
}

/**
 * CTA block — "Open Live Map" + "Upgrade to Analyst" pairing. Rendered in
 * the email shell only. Uses the founding tier in CTA copy when appropriate;
 * for v1 of A.6 we default to the Analyst upgrade messaging.
 */
function renderCTA(): string {
  const ctaButton = style({
    display: 'inline-block',
    padding: `${space.md} ${space.xl}`,
    background: colors.accent,
    color: colors.textInverse,
    textDecoration: 'none',
    borderRadius: layout.radiusCallout,
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  });
  const ctaSecondary = style({
    display: 'inline-block',
    padding: `${space.md} ${space.xl}`,
    background: 'transparent',
    color: colors.textPrimary,
    textDecoration: 'none',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: layout.radiusCallout,
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginRight: space.md,
  });

  return (
    `<div ${styleAttr(style({ margin: `${space.xl} 0`, textAlign: 'center' }))}>` +
    `<a href="https://nexuswatch.dev/#/intel" ${styleAttr(ctaSecondary)}>Open Live Map →</a>` +
    `<a href="https://nexuswatch.dev/#/pricing?tier=analyst" ${styleAttr(ctaButton)}>Upgrade to Analyst · $29/mo</a>` +
    `</div>`
  );
}

/**
 * Footer — unsubscribe, preferences, forward-to-colleague permalink, and
 * the brand signature. Forward-to-colleague is the growth loop: a clickable
 * permalink to the /brief/:date archive page, which subscribers can share
 * directly without exposing their email address.
 */
function renderFooter(date: string, archiveUrl: string): string {
  const footerText = typeStyle(type.caption, {
    color: colors.textTertiary,
    margin: `0 0 ${space.sm} 0`,
  });
  const footerLink = style({
    color: colors.accent,
    textDecoration: 'none',
  });
  return (
    `<div ${styleAttr(
      style({
        marginTop: space.xxl,
        paddingTop: space.xl,
        borderTop: `1px solid ${colors.border}`,
        textAlign: 'center',
      }),
    )}>` +
    `<p ${styleAttr(footerText)}>` +
    `Know someone who should read this? ` +
    `<a href="${escapeHtml(archiveUrl)}" ${styleAttr(footerLink)}>Forward today's brief →</a>` +
    `</p>` +
    `<p ${styleAttr(footerText)}>` +
    `<a href="https://nexuswatch.dev/#/preferences" ${styleAttr(footerLink)}>Preferences</a>` +
    ` · ` +
    `<a href="https://nexuswatch.dev/#/unsubscribe" ${styleAttr(footerLink)}>Unsubscribe</a>` +
    ` · ` +
    `<a href="mailto:hello@nexuswatch.dev" ${styleAttr(footerLink)}>hello@nexuswatch.dev</a>` +
    `</p>` +
    `<p ${styleAttr(
      typeStyle(type.caption, {
        color: colors.textTertiary,
        margin: `${space.md} 0 0 0`,
      }),
    )}>NexusWatch Intelligence · Issue ${escapeHtml(date)}</p>` +
    `</div>`
  );
}

/**
 * Render a text/plain multipart fallback from the markdown body. ~15% of
 * intel readers use text-only mail clients, and Resend + beehiiv both
 * treat a plain-text alternative as a deliverability signal. Preserves
 * section structure and reading order without trying to ASCII-art it.
 */
function renderPlainText(briefText: string, date: string, time: string, archiveUrl: string): string {
  // Strip bold/italic markers but keep the plain text. Section headers
  // already use `## ` and read fine as-is in a mono client.
  const stripped = briefText
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();

  return [
    `NEXUSWATCH SITUATION BRIEF`,
    `${date} · ${time}`,
    `──────────────────────────────────────────`,
    '',
    stripped,
    '',
    `──────────────────────────────────────────`,
    ``,
    `Open the live map: https://nexuswatch.dev/#/intel`,
    `Upgrade to Analyst ($29/mo): https://nexuswatch.dev/#/pricing?tier=analyst`,
    `Forward today's brief: ${archiveUrl}`,
    ``,
    `Preferences: https://nexuswatch.dev/#/preferences`,
    `Unsubscribe: https://nexuswatch.dev/#/unsubscribe`,
    `Contact: hello@nexuswatch.dev`,
    ``,
    `NexusWatch Intelligence`,
  ].join('\n');
}

/**
 * Compose the inner dossier content block (used by both the full email and
 * the beehiiv post body). Structure: Market Pulse → all Sonnet sections in
 * order. The Sonnet output controls the narrative sections; this function
 * just styles them and inserts the Market Pulse module after Good Morning.
 */
function renderDossierInner(briefText: string, markets: MarketQuote[]): string {
  const sections = parseSections(briefText);
  if (sections.length === 0) {
    // Fallback: wrap the whole body as a single paragraph block.
    return `<div ${styleAttr(typeStyle(type.body, { color: colors.textPrimary }))}>${renderInline(briefText)}</div>`;
  }

  const pieces: string[] = [];
  let marketPulseInserted = false;

  for (const section of sections) {
    pieces.push(renderSection(section));
    // Insert the Market Pulse module right after Good Morning, so the
    // reader gets price context before diving into the stories.
    if (!marketPulseInserted && /good morning/i.test(section.title)) {
      pieces.push(renderMarketPulse(markets));
      marketPulseInserted = true;
    }
  }

  // If there's no Good Morning section (shouldn't happen with Sonnet output,
  // but defensive against the fallback builder), prepend Market Pulse.
  if (!marketPulseInserted) {
    pieces.unshift(renderMarketPulse(markets));
  }

  return pieces.join('\n');
}

/**
 * The Apple Mail dark-mode override. Shipped inside a `<style>` block
 * scoped by `@media (prefers-color-scheme: dark)`. Gmail and most other
 * clients strip or ignore this, so light is canonical — dark is a bonus.
 */
function renderDarkModeStyleBlock(): string {
  return `
    <style>
      @media (prefers-color-scheme: dark) {
        body, table, td {
          background-color: #0E1116 !important;
          color: #E8E6DE !important;
        }
        .dossier-card {
          background-color: #161B22 !important;
          border-color: #2A2F38 !important;
        }
        .dossier-text-primary { color: #E8E6DE !important; }
        .dossier-text-secondary { color: #C2BCAB !important; }
        .dossier-text-tertiary { color: #8B8478 !important; }
        .dossier-accent { color: #D66A64 !important; }
        .dossier-border { border-color: #2A2F38 !important; }
      }
    </style>
  `;
}

/**
 * Main export — render a brief into all three delivery formats.
 *
 * This is the only function the rest of the handler should call. It
 * guarantees the three outputs stay synchronized: same content, three
 * different renderings (email shell, beehiiv content, plain-text).
 */
function renderDossierEmail(opts: RenderBriefOptions): RenderedBrief {
  const { briefText, date, time, markets } = opts;
  const archiveUrl = opts.archiveUrl ?? `https://nexuswatch.dev/#/brief/${date}`;
  const inner = renderDossierInner(briefText, markets);

  // Full standalone email shell for Resend transactional path.
  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>NexusWatch Situation Brief · ${escapeHtml(date)}</title>
  ${renderDarkModeStyleBlock()}
</head>
<body ${styleAttr(
    style({
      margin: 0,
      padding: 0,
      background: colors.bgPage,
      fontFamily: fonts.sans,
      color: colors.textPrimary,
      WebkitTextSizeAdjust: '100%',
      msTextSizeAdjust: '100%',
    }),
  )}>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${styleAttr(
    style({ background: colors.bgPage, padding: `${space.xl} ${space.md}` }),
  )}>
    <tr><td align="center">
      <table role="presentation" width="${layout.contentWidth}" cellpadding="0" cellspacing="0" border="0" class="dossier-card" ${styleAttr(
        style({
          maxWidth: layout.contentWidth,
          background: colors.bgCard,
          borderRadius: layout.radiusCard,
          border: `1px solid ${colors.border}`,
          padding: layout.gutter,
        }),
      )}>
        <tr><td>
          ${renderMasthead(date, time)}
          ${inner}
          ${renderCTA()}
          ${renderFooter(date, archiveUrl)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Inner modules only for the beehiiv post body. beehiiv adds its own
  // masthead, footer, and unsubscribe footer, so we ship just the content.
  const beehiivHtml = `<div ${styleAttr(
    style({
      fontFamily: fonts.sans,
      color: colors.textPrimary,
      background: colors.bgCard,
      padding: space.md,
      maxWidth: layout.contentWidth,
    }),
  )}>${inner}${renderCTA()}</div>`;

  const plainText = renderPlainText(briefText, date, time, archiveUrl);

  return { emailHtml, beehiivHtml, plainText };
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
// Matches the A.5 locked structure (Apr 10 Decision 5): 7 weekday sections
// + optional Friday Tool of the Week. No Space & Tech (deliberately dropped
// during A.5 — wasn't in the locked structure). Sunday falls back to the
// weekday shape rather than Week in Review, because the fallback only fires
// when Sonnet is fully unavailable and we want coverage parity over format.
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

  const isFriday = new Date().getUTCDay() === 5;

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

  // Energy section shape per Decision 14: price + driver + reversal trigger.
  // In the fallback we have prices from the data context but no Sonnet-level
  // driver analysis, so we state what we have and hint at the reversal lever
  // (chokepoint news) that readers should watch.
  text += `## ⛽ Energy & Commodities\n\n`;
  const oil = data.markets.find((m) => m.symbol === 'Crude Oil');
  const gas = data.markets.find((m) => m.symbol === 'Nat Gas');
  const xle = data.markets.find((m) => m.symbol === 'Energy Sector');
  if (oil) text += `Crude Oil: ${oil.price} (${oil.change}). `;
  if (gas) text += `Natural Gas: ${gas.price} (${gas.change}). `;
  if (xle) text += `Energy Sector (XLE): ${xle.price} (${xle.change}). `;
  text += `Reversal triggers to watch: any Houthi activity in Bab el-Mandeb, renewed Hormuz pressure, or Suez disruption — we flag these live on the map.\n\n`;

  text += `## 📊 Market Signal\n\n`;
  text += data.markets.map((m) => `${m.symbol}: ${m.price} (${m.change})`).join(' | ');
  text += `\n\n`;

  text += `## 🔭 48-Hour Outlook\n\n`;
  text += `- **CII Trajectory**: Watch ${topCountry?.name || 'top risk countries'} for continued instability\n`;
  text += `- **Seismic Activity**: ${data.earthquakeCount} events in 24h${data.significantQuakes.length > 0 ? ` including ${data.significantQuakes[0]}` : ''}\n`;
  if (oil) text += `- **Energy**: ${oil.symbol} at ${oil.price} — watch chokepoint headlines for reversal signals\n`;
  text += `\n`;

  text += `## 🗺️ Map of the Day\n\n`;
  text += `Today's map highlights ${topCountry?.name || 'global instability'} and surrounding risk zones. Open the live map at nexuswatch.dev to explore.\n\n`;

  // Friday-only: Tool of the Week. In the fallback we don't have editorial
  // narrative, so we surface a stable pointer to the CII methodology page
  // rather than fabricate a feature highlight. Sonnet writes the real version
  // on Fridays when it's available.
  if (isFriday) {
    text += `## 🛠️ Tool of the Week\n\n`;
    text += `This week we're leaning on the Country Instability Index methodology — 6-component scoring across conflict, disasters, sentiment, infrastructure, governance, and market exposure. See the full breakdown at nexuswatch.dev/#/methodology.\n`;
  }

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
