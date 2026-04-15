import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

/**
 * Changelog RSS feed. Mirrors /#/whats-new content in RSS 2.0 form
 * so power users can subscribe to product updates in Feedly, NetNewsWire, etc.
 */

interface Entry {
  date: string;
  version: string;
  title: string;
  highlights: string[];
}

// Mirrors src/pages/releaseNotes.ts content. Keep in sync.
const ENTRIES: Entry[] = [
  {
    date: '2026-04-14',
    version: 'v2.1',
    title: 'User Experience + Delivery Layer',
    highlights: [
      'Command palette (Cmd+K) — universal search + jump',
      'Personalized watchlist with per-country alert thresholds',
      'Proactive intelligence feed (/#/feed)',
      'Embeddable CII widgets (iframe-ready)',
      'Email alert subscriptions (free tier)',
      'Global search engine across countries, entities, scenarios',
      'Country comparison page (/#/compare)',
      'Entity graph (/#/entities) — 29 geopolitical actors',
      'Printable country briefs (/#/brief-country/:code)',
      'Risk cascade + scenario visual overlays on globe',
      'Auth guards + mobile breakpoints',
      '38 new tests (164 total, was 126)',
    ],
  },
  {
    date: '2026-04-13',
    version: 'v2.0',
    title: 'Verified Intelligence Platform — Launch',
    highlights: [
      '86 countries with 6-component CII + evidence chains',
      'Multi-source verification engine (CONFIRMED/CORROBORATED)',
      '7 scenario simulations with cascade visualization',
      'AI analyst with per-sentence confidence tagging',
      'Portfolio geopolitical exposure (Pro tier)',
      'Time-travel scrubber (90-day history)',
      'Crisis playbooks (auto-triggered)',
      'Prediction ledger (public accuracy tracking)',
      'Intelligence API v2 + lineage/audit endpoints',
      '56 cross-border cascade rules',
      'Composite alert rules with CII thresholds',
      '10+ new data layers',
      'Light Intel Dossier email redesign',
    ],
  },
  {
    date: '2026-04-11',
    version: 'v1.5',
    title: 'Data Accuracy Autonomy',
    highlights: [
      'Self-healing data pipeline foundations',
      'Data health dashboard',
      'Social autonomy queue',
      'CII history + sparklines',
      'Timeline bar',
    ],
  },
  {
    date: '2026-04-08',
    version: 'v1.0',
    title: 'Intelligence Engine Complete',
    highlights: ['30 data layers', 'Personal watchlist system', 'AI terminal', 'Auto-threat detection', 'Cinema mode'],
  },
];

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    const map: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return map[c] || c;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch — Product Changelog</title>
    <link>https://nexuswatch.dev/#/whats-new</link>
    <atom:link href="https://nexuswatch.dev/api/rss/changelog" rel="self" type="application/rss+xml" />
    <description>What's new on NexusWatch — new features, data layers, pricing changes, methodology updates.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>3600</ttl>
    ${ENTRIES.map((entry) => {
      const body =
        `<p><strong>${escapeXml(entry.title)}</strong></p><ul>` +
        entry.highlights.map((h) => `<li>${escapeXml(h)}</li>`).join('') +
        '</ul>';
      return `
    <item>
      <title>${escapeXml(`${entry.version} — ${entry.title}`)}</title>
      <link>https://nexuswatch.dev/#/whats-new</link>
      <guid isPermaLink="false">nw-changelog-${entry.version}-${entry.date}</guid>
      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>
      <description>${escapeXml(body)}</description>
      <category>changelog</category>
    </item>`;
    }).join('')}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  return res.send(xml);
}
