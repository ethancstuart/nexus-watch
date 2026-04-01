export const config = { runtime: 'edge' };

const CORS_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://dashpulse.app' };

interface SitrepBody {
  region?: string;
  data: {
    earthquakes?: { magnitude: number; place: string; time: number }[];
    fires?: { count: number; regions: string[] };
    news?: { title: string; source: string; tone: number }[];
    weather?: { city: string; description: string }[];
    predictions?: { question: string; probability: number }[];
  };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 503, headers: CORS_HEADERS });
  }

  const body = (await req.json()) as SitrepBody;
  const region = body.region || 'Global';
  const data = body.data || {};

  // Build context from layer data
  const sections: string[] = [];

  if (data.earthquakes?.length) {
    sections.push(
      `SEISMIC ACTIVITY:\n${data.earthquakes
        .slice(0, 10)
        .map((e) => `- M${e.magnitude} — ${e.place} (${new Date(e.time).toISOString()})`)
        .join('\n')}`,
    );
  }

  if (data.fires?.count) {
    sections.push(
      `WILDFIRE ACTIVITY:\n- ${data.fires.count} active hotspots\n- Regions: ${data.fires.regions.join(', ')}`,
    );
  }

  if (data.news?.length) {
    sections.push(
      `NEWS FEED (${data.news.length} articles):\n${data.news
        .slice(0, 8)
        .map((n) => `- [${n.source}] ${n.title} (tone: ${n.tone > 0 ? '+' : ''}${n.tone.toFixed(1)})`)
        .join('\n')}`,
    );
  }

  if (data.weather?.length) {
    sections.push(`WEATHER ALERTS:\n${data.weather.map((w) => `- ${w.city}: ${w.description}`).join('\n')}`);
  }

  if (data.predictions?.length) {
    sections.push(
      `PREDICTION MARKETS:\n${data.predictions.map((p) => `- ${p.question}: ${p.probability}%`).join('\n')}`,
    );
  }

  const dataContext = sections.length > 0 ? sections.join('\n\n') : 'No current data available.';

  const systemPrompt = `You are a concise geopolitical intelligence analyst for DashPulse Intel. Generate a situation report based on the provided real-time data.

Rules:
- Write 2-3 focused paragraphs
- Lead with the most significant developments
- Note any correlations between data points (e.g., seismic activity + fire hotspots in same region)
- End with a single-sentence risk assessment
- Use precise, professional intelligence language
- Do NOT speculate beyond the data
- Format: plain text, no markdown headers`;

  const userPrompt = `Generate a situation report for: ${region}\n\nCurrent intelligence data:\n\n${dataContext}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `AI error: ${res.status}` }), { status: 502, headers: CORS_HEADERS });
    }

    const result = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = (result.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    return new Response(JSON.stringify({ sitrep: text, region, generatedAt: new Date().toISOString() }), {
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sitrep generation failed';
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: CORS_HEADERS });
  }
}
