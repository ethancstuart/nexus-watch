import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

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
        const r = await fetch(`https://api.twelvedata.com/quote?symbol=SPY,GLD,USO,UUP&apikey=${apiKey}`, {
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
      const labels: Record<string, string> = { SPY: 'S&P 500', GLD: 'Gold', USO: 'Oil', UUP: 'USD Index' };
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
    };

    // === Generate AI brief (outputs HTML directly) ===
    let briefHtml: string;

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

TOP RISK COUNTRIES (CII score / trend vs 24h ago):
${topCII.map((c) => `${c.name}: ${c.score}/100${trendArrow(c)} [conflict=${c.components.conflict}, disasters=${c.components.disasters}, governance=${c.components.governance}, market=${c.components.marketExposure}]`).join('\n')}

BIGGEST MOVERS (24h):
${movers.length > 0 ? movers.map((m) => `${m.name}: ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(0)} (${m.prevScore?.toFixed(0)} → ${m.score})`).join('\n') : 'No significant movements (±3 threshold)'}

SEISMIC ACTIVITY:
${earthquakeCount} earthquakes in last 24h${yesterdayEqCount !== null ? ` (yesterday: ${yesterdayEqCount})` : ''}
Significant (M4.5+): ${significantQuakes.length > 0 ? significantQuakes.join('; ') : 'None'}

HEALTH SECURITY:
${diseaseCount} active WHO outbreak notices
${recentOutbreaks.length > 0 ? recentOutbreaks.join('\n') : 'No recent outbreak reports'}

CONFLICT & SECURITY HEADLINES:
${conflictHeadlines.length > 0 ? conflictHeadlines.map((h) => `- ${h}`).join('\n') : '- GDELT feed unavailable — conflict data limited to CII components'}

MARKET INDICATORS:
${markets.length > 0 ? markets.map((m) => `${m.symbol}: ${m.price} (${m.change})`).join(' | ') : 'Market data unavailable'}`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            system: `You are a senior intelligence analyst at NexusWatch, a geopolitical intelligence platform. Write a daily intelligence briefing that a national security advisor or hedge fund risk manager would find genuinely useful.

OUTPUT FORMAT: Return ONLY raw HTML fragments (no <html>, <head>, <body> tags). Use inline styles only. The email background is #0a0a0a with #e0e0e0 text. Accent color: #ff6600.

CRITICAL RULES:
- NEVER fabricate events, names, or claims not present in the data
- DO synthesize, analyze, and draw connections between data points
- If conflict headlines are unavailable, analyze instability through CII component breakdown instead
- Use trend data (↑↓) to explain what's CHANGING, not just what IS
- Be specific: numbers, country names, magnitudes — not vague generalizations
- Write like a professional analyst, not a news aggregator

STRUCTURE (use these exact section headers as <h2> elements):

1. SITUATION SUMMARY — 3-4 sentences. Lead with the most consequential development. What should a decision-maker know RIGHT NOW? Include the single most important number.

2. THREAT MATRIX — Table with columns: Region | Threat Level (Critical/High/Elevated/Low) | Key Driver | 24h Trend. Cover 5-6 regions. Use colored dots: 🔴 Critical, 🟠 High, 🟡 Elevated, 🟢 Low.

3. KEY DEVELOPMENTS — 4-6 bullet points. Each one: what happened + why it matters + confidence level. Not just headlines — analysis. Use "▸" prefix.

4. INSTABILITY WATCH — Focus on the biggest CII movers. Why did scores change? What's driving instability up or down? Connect to real events from the data.

5. SEISMIC & ENVIRONMENTAL — Earthquake analysis (significant events, clusters, comparison to baseline). Disease alerts if relevant.

6. MARKET SIGNAL — How geopolitical risk maps to market moves today. Connect specific events to specific price movements. If market data is limited, analyze what SHOULD be watched.

7. 48-HOUR OUTLOOK — 3-4 specific indicators to watch. Each with: what to monitor, threshold that matters, and why. Be predictive but grounded.

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
          signal: AbortSignal.timeout(45000),
        });

        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as { content: Array<{ text: string }> };
          briefHtml = aiData.content?.[0]?.text || buildFallbackHtml(briefData);
        } else {
          briefHtml = buildFallbackHtml(briefData);
        }
      } catch {
        briefHtml = buildFallbackHtml(briefData);
      }
    } else {
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
              from: 'NexusWatch <onboarding@resend.dev>',
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

    return res.json({ success: true, date: today, briefLength: briefHtml.length });
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
  <a href="https://dashpulse.app/#/intel" style="display:inline-block;padding:10px 20px;background:#ff660018;border:1px solid #ff660040;color:#ff6600;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;border-radius:3px;font-family:'Courier New',monospace;">Open Live Map →</a>
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
