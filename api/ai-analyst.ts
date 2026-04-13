import type { VercelRequest, VercelResponse } from '@vercel/node';

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
- Tag confidence on every assessment:
  [HIGH CONFIDENCE] — 3+ sources agree, data is fresh (< 1 hour old)
  [MEDIUM CONFIDENCE] — 2 sources or partially stale data
  [LOW CONFIDENCE] — single source, stale data, or analytical inference
- Distinguish facts from assessments: "CONFIRMED: X happened (ACLED + GDELT)" vs "ASSESSED: Y is likely (based on historical pattern)"
- When data is thin, say so: "Limited ACLED coverage in this region — conflict score relies on baseline estimates"

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
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === 'tool_use' && block.name && block.id) {
          const result = executeToolCall(block.name, block.input || {}, context);
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
 * Execute a tool call using the platform context string.
 * In production, these would query the actual database/APIs.
 * For now, they parse the context string that the client sends
 * (which contains the current CII scores, layer data, etc.).
 */
function executeToolCall(name: string, input: Record<string, unknown>, context?: string): Record<string, unknown> {
  // Parse context if available
  const ctx = context || '';

  switch (name) {
    case 'get_country_cii': {
      const code = String(input.country_code || '').toUpperCase();
      // Extract from context — format: "COUNTRY (CODE): CII XX ..."
      const regex = new RegExp(`([^\\n]+?)\\(${code}\\)[:\\s]+CII\\s+(\\d+)`, 'i');
      const match = ctx.match(regex);
      if (match) {
        return {
          country: match[1].trim(),
          code,
          cii_score: parseInt(match[2], 10),
          note: 'Score extracted from live platform context',
        };
      }
      return { error: `No CII data for country code ${code}`, code };
    }

    case 'get_top_risk_countries': {
      const count = Number(input.count) || 10;
      // Extract CII lines from context
      const lines = ctx
        .split('\n')
        .filter((l) => /CII\s+\d+/.test(l))
        .slice(0, count);
      return {
        countries: lines.map((l) => l.trim()),
        count: lines.length,
        source: 'NexusWatch CII (6-component model)',
      };
    }

    case 'get_verified_signals':
      return {
        note: 'Verified signals from cross-source verification engine',
        signals: ctx.includes('VERIFIED')
          ? ctx.split('\n').filter((l) => /VERIFIED|CONFIRMED|CORROBORATED/.test(l))
          : [],
      };

    case 'get_layer_status':
      return {
        note: 'Layer freshness from data provenance system',
        layers: ctx.includes('Layer Status') ? ctx.split('\n').filter((l) => /live|recent|stale|offline/i.test(l)) : [],
      };

    case 'get_platform_health':
      return {
        note: 'Aggregate platform data confidence',
        health: ctx.includes('DATA CONFIDENCE')
          ? ctx.split('\n').find((l) => /DATA CONFIDENCE/i.test(l)) || 'unavailable'
          : 'unavailable',
      };

    case 'search_events': {
      const code = String(input.country_code || '').toUpperCase();
      const type = String(input.event_type || 'all');
      const lines = ctx.split('\n').filter((l) => {
        if (code && !l.toUpperCase().includes(code)) return false;
        if (type !== 'all' && !l.toLowerCase().includes(type)) return false;
        return true;
      });
      return { events: lines.slice(0, 20), query: { country_code: code, event_type: type } };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
