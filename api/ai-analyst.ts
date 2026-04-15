import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * AI Analyst — Tool-using intelligence analyst endpoint.
 *
 * POST /api/ai-analyst
 * Body: { query: string, context?: string }
 *
 * Unlike the basic sitrep endpoint, this uses Claude with tool definitions
 * so the AI can query live data, cite sources, and tag confidence levels.
 * Every response includes source attribution and explicit uncertainty.
 *
 * System prompt mandates:
 * - Cite every source by name (ACLED, USGS, GDELT, etc.)
 * - Tag confidence: [HIGH CONFIDENCE], [MEDIUM CONFIDENCE], [LOW CONFIDENCE]
 * - Distinguish confirmed facts from analytical assessments
 * - Disclose data gaps: "We have limited data on X because Y"
 */

const SYSTEM_PROMPT = `You are the NexusWatch Intelligence Analyst — a tool-using AI analyst embedded in a geopolitical intelligence platform monitoring 86 countries across 35+ data layers.

CORE MANDATE: Every claim you make must be traceable to a data source. You are not a chatbot. You are an analyst who shows their work.

CITATION RULES (MANDATORY):
- Every factual claim must name its source: "Per ACLED data...", "USGS reports...", "GDELT sentiment analysis shows..."
- Tag EVERY SENTENCE with a confidence marker at the end:
  [H] — HIGH confidence: 3+ sources agree, data fresh (< 1 hour)
  [M] — MEDIUM confidence: 2 sources or partially stale data
  [L] — LOW confidence: single source, stale data, or analytical inference
  [A] — ASSESSMENT (analytical, not factual): your interpretation
- Example of proper tagging:
  "Sudan's CII is 87 [H]. Conflict intensity increased 23% week-over-week per ACLED [H]. The RSF-SAF dynamic resembles the 2023 Khartoum collapse pattern [A]. Reports of famine in Darfur are widespread but exact casualty numbers remain uncertain [M]."
- Distinguish facts from assessments: "CONFIRMED: X happened (ACLED + GDELT)" vs "ASSESSED: Y is likely (based on historical pattern)"
- When data is thin, say so: "Limited ACLED coverage in this region — conflict score relies on baseline estimates [L]"

VOICE: 40% analyst / 60% smart friend. Authoritative but accessible. Use "we" as the brand pronoun.

STRUCTURE: Lead with the bottom line, then evidence, then gaps. End with a confidence summary.

FORBIDDEN:
- Never fabricate data or events
- Never say "according to reports" without naming the report
- Never present single-source intelligence as confirmed
- Never hide uncertainty — disclose it prominently

You have access to tools that query live NexusWatch data. Use them to ground your responses in real, timestamped data.`;

interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

const TOOLS: Tool[] = [
  {
    name: 'get_country_cii',
    description:
      'Get the Country Instability Index score for a specific country. Returns the 0-100 CII score, 6-component breakdown (conflict, disasters, sentiment, infrastructure, governance, marketExposure), confidence level, contributing data sources, and data gaps.',
    input_schema: {
      type: 'object',
      properties: {
        country_code: {
          type: 'string',
          description: 'ISO 3166-1 alpha-2 country code (e.g., "UA" for Ukraine, "SD" for Sudan)',
        },
      },
      required: ['country_code'],
    },
  },
  {
    name: 'get_top_risk_countries',
    description:
      'Get the top N countries by CII score. Returns country name, code, score, tier, confidence, trend, and top signals for each.',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of top countries to return (default 10)' },
      },
    },
  },
  {
    name: 'get_verified_signals',
    description:
      'Get all currently active verified signals — events confirmed by 2+ independent sources. Each signal includes verification level (CONFIRMED/CORROBORATED), contributing sources, and location.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_layer_status',
    description:
      'Get the freshness and health status of all data layers. Shows which sources are live, recent, stale, or offline, with last fetch timestamps and data point counts.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_platform_health',
    description:
      'Get the aggregate platform data confidence score and breakdown. Shows what percentage of layers are fresh and what percentage of countries have high-confidence scores.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_events',
    description:
      'Search for specific events across all layers by country or region. Returns matching events with source attribution.',
    input_schema: {
      type: 'object',
      properties: {
        country_code: { type: 'string', description: 'ISO country code to filter by' },
        event_type: {
          type: 'string',
          enum: ['conflict', 'earthquake', 'fire', 'weather', 'cyber', 'all'],
          description: 'Type of events to search for',
        },
      },
    },
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { query, context } = req.body as { query?: string; context?: string };
  if (!query) return res.status(400).json({ error: 'query required' });

  const userMessage = context ? `${query}\n\nPlatform context:\n${context}` : query;

  try {
    // Initial request with tools
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`AI analyst API error: ${response.status} — ${errBody.slice(0, 200)}`);
      return res.status(502).json({ error: 'AI analyst unavailable' });
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
      stop_reason: string;
    };

    // If the model wants to use tools, execute them and continue
    if (data.stop_reason === 'tool_use') {
      const dbUrl = process.env.DATABASE_URL;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sql: any = dbUrl ? neon(dbUrl) : null;
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === 'tool_use' && block.name && block.id) {
          const result = await executeToolCall(sql, block.name, block.input || {}, context);
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Continue the conversation with tool results
      const followUp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!followUp.ok) {
        return res.status(502).json({ error: 'AI analyst follow-up failed' });
      }

      const followUpData = (await followUp.json()) as {
        content: Array<{ type: string; text?: string }>;
      };

      const text = followUpData.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      return res.json({
        text,
        toolsUsed: data.content.filter((b) => b.type === 'tool_use').map((b) => b.name),
      });
    }

    // No tool use — direct response
    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return res.json({ text, toolsUsed: [] });
  } catch (err) {
    console.error('AI analyst error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'AI analyst failed' });
  }
}

/**
 * Execute a tool call. Queries Neon when available; falls back to parsing
 * the client-provided context string for offline/dev runs.
 *
 * Always returns a plain object the model can serialize. Never throws —
 * errors are returned as `{ error: string }` so the model can hedge.
 */
async function executeToolCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  name: string,
  input: Record<string, unknown>,
  context?: string,
): Promise<Record<string, unknown>> {
  const ctx = context || '';

  try {
    switch (name) {
      case 'get_country_cii': {
        const code = String(input.country_code || '').toUpperCase();
        if (!code) return { error: 'country_code required' };
        if (sql) {
          const rows = (await sql`
            SELECT country_code, country_name, cii_score::float AS score,
                   confidence, component_conflict, component_disasters,
                   component_sentiment, component_infrastructure,
                   component_governance, component_market_exposure,
                   source_count, data_point_count, date
            FROM cii_daily_snapshots
            WHERE country_code = ${code}
              AND date = (SELECT MAX(date) FROM cii_daily_snapshots)
            LIMIT 1
          `) as unknown as Array<Record<string, unknown>>;
          if (rows.length > 0) {
            const r = rows[0];
            return {
              country: r.country_name,
              code: r.country_code,
              cii_score: r.score,
              confidence: r.confidence,
              components: {
                conflict: r.component_conflict,
                disasters: r.component_disasters,
                sentiment: r.component_sentiment,
                infrastructure: r.component_infrastructure,
                governance: r.component_governance,
                market_exposure: r.component_market_exposure,
              },
              source_count: r.source_count,
              data_point_count: r.data_point_count,
              snapshot_date: r.date,
              source: 'cii_daily_snapshots',
            };
          }
          return { error: `No CII snapshot for ${code}`, code };
        }
        // Context fallback.
        const regex = new RegExp(`([^\\n]+?)\\(${code}\\)[:\\s]+CII\\s+(\\d+)`, 'i');
        const match = ctx.match(regex);
        return match
          ? { country: match[1].trim(), code, cii_score: parseInt(match[2], 10), source: 'context' }
          : { error: `No data for ${code}`, code };
      }

      case 'get_top_risk_countries': {
        const count = Math.min(50, Math.max(1, Number(input.count) || 10));
        if (sql) {
          const rows = (await sql`
            SELECT country_code, country_name, cii_score::float AS score, confidence
            FROM cii_daily_snapshots
            WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)
            ORDER BY cii_score DESC
            LIMIT ${count}
          `) as unknown as Array<{ country_code: string; country_name: string; score: number; confidence: string }>;
          return {
            countries: rows.map((r) => ({
              country: r.country_name,
              code: r.country_code,
              cii_score: r.score,
              confidence: r.confidence,
            })),
            count: rows.length,
            source: 'cii_daily_snapshots (6-component CII)',
          };
        }
        const lines = ctx
          .split('\n')
          .filter((l) => /CII\s+\d+/.test(l))
          .slice(0, count);
        return { countries: lines.map((l) => l.trim()), source: 'context', count: lines.length };
      }

      case 'get_verified_signals': {
        if (sql) {
          const rows = (await sql`
            SELECT playbook_key, country_code, trigger_type, cii_score::float AS cii_score,
                   cii_delta::float AS cii_delta, magnitude::float AS magnitude,
                   notes, triggered_at
            FROM crisis_triggers
            WHERE resolved_at IS NULL
            ORDER BY triggered_at DESC
            LIMIT 20
          `.catch(() => [] as unknown)) as unknown as Array<Record<string, unknown>>;
          return {
            signals: Array.isArray(rows) ? rows : [],
            source: 'crisis_triggers (server-side detection cron)',
            note: 'Each signal represents a CII spike ≥15pt/24h, M7+ quake, or verified cross-source event.',
          };
        }
        return {
          signals: ctx.split('\n').filter((l) => /VERIFIED|CONFIRMED|CORROBORATED/.test(l)),
          source: 'context',
        };
      }

      case 'get_layer_status': {
        if (sql) {
          const rows = (await sql`
            SELECT layer_id, timestamp, feature_count
            FROM event_snapshots
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            ORDER BY timestamp DESC
            LIMIT 100
          `.catch(() => [] as unknown)) as unknown as Array<{
            layer_id: string;
            timestamp: string;
            feature_count: number;
          }>;
          if (Array.isArray(rows) && rows.length > 0) {
            // Collapse to one row per layer (most recent).
            const byLayer = new Map<string, { last_fetch: string; feature_count: number; freshness: string }>();
            for (const r of rows) {
              if (byLayer.has(r.layer_id)) continue;
              const ageMin = (Date.now() - Date.parse(r.timestamp)) / 60000;
              const freshness = ageMin < 60 ? 'live' : ageMin < 360 ? 'recent' : ageMin < 1440 ? 'stale' : 'offline';
              byLayer.set(r.layer_id, { last_fetch: r.timestamp, feature_count: r.feature_count, freshness });
            }
            return {
              layers: Object.fromEntries(byLayer),
              source: 'event_snapshots',
            };
          }
        }
        return {
          layers: ctx.split('\n').filter((l) => /live|recent|stale|offline/i.test(l)),
          source: 'context',
        };
      }

      case 'get_platform_health': {
        if (sql) {
          const snap = (await sql`
            SELECT COUNT(*) FILTER (WHERE confidence = 'high')::int   AS high_conf,
                   COUNT(*) FILTER (WHERE confidence = 'medium')::int AS med_conf,
                   COUNT(*) FILTER (WHERE confidence = 'low')::int    AS low_conf,
                   COUNT(*)::int AS total,
                   MAX(date)  AS snapshot_date
            FROM cii_daily_snapshots
            WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)
          `) as unknown as Array<{
            high_conf: number;
            med_conf: number;
            low_conf: number;
            total: number;
            snapshot_date: string;
          }>;
          const s = snap[0];
          if (s && s.total > 0) {
            const pctHigh = Math.round((s.high_conf / s.total) * 100);
            return {
              data_confidence_pct: pctHigh,
              high_confidence_countries: s.high_conf,
              medium_confidence_countries: s.med_conf,
              low_confidence_countries: s.low_conf,
              total_countries: s.total,
              snapshot_date: s.snapshot_date,
              source: 'cii_daily_snapshots',
            };
          }
        }
        return {
          health: ctx.split('\n').find((l) => /DATA CONFIDENCE/i.test(l)) || 'unavailable',
          source: 'context',
        };
      }

      case 'search_events': {
        const code = String(input.country_code || '').toUpperCase();
        const type = String(input.event_type || 'all');
        // No unified "events" table in Neon yet — use ACLED for conflict, fall back to context otherwise.
        if (sql && (type === 'all' || type === 'conflict')) {
          const rows = (await sql`
            SELECT country, location, event_type, fatalities, occurred_at, source_url
            FROM acled_events
            WHERE occurred_at > NOW() - INTERVAL '14 days'
              AND (${code || null}::text IS NULL OR country = ${code || null}::text)
            ORDER BY occurred_at DESC
            LIMIT 20
          `.catch(() => [] as unknown)) as unknown as Array<Record<string, unknown>>;
          if (Array.isArray(rows) && rows.length > 0) {
            return { events: rows, source: 'acled_events', query: { country_code: code, event_type: type } };
          }
        }
        const lines = ctx.split('\n').filter((l) => {
          if (code && !l.toUpperCase().includes(code)) return false;
          if (type !== 'all' && !l.toLowerCase().includes(type)) return false;
          return true;
        });
        return { events: lines.slice(0, 20), query: { country_code: code, event_type: type }, source: 'context' };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'tool_execution_failed' };
  }
}
