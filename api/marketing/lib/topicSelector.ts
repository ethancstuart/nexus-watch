/**
 * topicSelector.ts — picks the next topic for a marketing-automation cron run.
 *
 * Pulls candidate topics from intelligence sources (CII movers, ACLED events,
 * GDELT signals, release notes, methodology rotation, context rotation),
 * tags each with a content pillar, applies dedup against marketing_topics_used
 * over the last 7 days, and returns the highest-scoring candidate or null.
 *
 * Returning null signals "skip this cron run" — better to post nothing than
 * to repeat ourselves.
 */

import type { Platform } from './flags';
import { getConfig, isEmbargoed, type Pillar as ConfigPillar } from './config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = any;

export type Pillar = ConfigPillar;

export interface Topic {
  pillar: Pillar;
  topic_key: string;
  entity_keys: string[];
  hook: string; // 1-line summary the engine will expand into a full draft
  source_layer?: string; // e.g. 'acled', 'cii', 'gdelt', 'release-notes'
  source_url?: string;
  metadata?: Record<string, unknown>;
  score: number; // higher = preferred
}

/**
 * v1 default — kept as a fallback if KV config is unavailable.
 * Live runtime reads getConfig().pillarMix instead (overridable via admin).
 */
const DEFAULT_PILLAR_TARGET_WEIGHTS: Record<Pillar, number> = {
  signal: 0.4,
  pattern: 0.2,
  methodology: 0.15,
  product: 0.15,
  context: 0.1,
};

// 12 rotating methodology topics. Engine picks the one not posted longest.
const METHODOLOGY_ROTATION: Array<{ key: string; hook: string }> = [
  { key: 'cii-components', hook: 'How our Country Instability Index is built — 6 components, why each one matters.' },
  { key: 'cii-conflict-weight', hook: 'Why we weight Conflict at 20% of CII and what we lose if we move it.' },
  {
    key: 'cii-market-exposure',
    hook: 'Market Exposure as a CII component — what it captures that conflict alone misses.',
  },
  {
    key: 'source-triangulation',
    hook: 'Why a single source is never enough, and how we triangulate ACLED, GDELT, and OSINT.',
  },
  { key: 'verification-engine', hook: 'How our verification engine separates "reported" from "confirmed."' },
  { key: 'tension-index', hook: 'The Tension Index — what it tracks, how it differs from CII.' },
  { key: 'evidence-chain', hook: 'Every CII score has an evidence chain. Here is how to read one.' },
  { key: 'confidence-scoring', hook: 'Confidence scoring on every claim — why hedged language is a feature.' },
  { key: 'cii-tier-system', hook: 'Core, Extended, Monitor — why we tier 86 nations into three groups.' },
  {
    key: 'correlations',
    hook: 'Geo-correlation engine — when two layers light up the same place, that means something.',
  },
  {
    key: 'rule-versioning',
    hook: 'CII rule version 2.1.0 — what changed from 2.0.0 and why we publish version notes.',
  },
  {
    key: 'publishing-corrections',
    hook: 'When we get a number wrong, we say so. The mechanics of our correction workflow.',
  },
];

// 24 rotating context topics — chokepoints, alliances, energy, etc.
const CONTEXT_ROTATION: Array<{ key: string; hook: string; entities: string[] }> = [
  {
    key: 'strait-hormuz',
    hook: 'The Strait of Hormuz — why 20% of global oil moves through it and what disruption looks like.',
    entities: ['Iran', 'Oman', 'UAE'],
  },
  {
    key: 'bab-el-mandeb',
    hook: 'Bab el-Mandeb — the southern Red Sea chokepoint we have not stopped watching since 2024.',
    entities: ['Yemen', 'Djibouti', 'Eritrea'],
  },
  {
    key: 'suez',
    hook: 'Suez Canal — capacity, traffic, and what a single grounding cost the world economy.',
    entities: ['Egypt'],
  },
  {
    key: 'panama-canal',
    hook: 'Panama Canal — drought, transit cuts, and the supply-chain ripple effect.',
    entities: ['Panama', 'United States'],
  },
  {
    key: 'malacca',
    hook: 'Strait of Malacca — the Indo-Pacific chokepoint Beijing thinks about every day.',
    entities: ['Malaysia', 'Singapore', 'Indonesia', 'China'],
  },
  {
    key: 'taiwan-strait',
    hook: 'Taiwan Strait — why the air-defense identification zone reads matter.',
    entities: ['Taiwan', 'China'],
  },
  {
    key: 'nato-eastern-flank',
    hook: 'NATO eastern flank — Poland, Romania, Baltics, and what the posture changes signal.',
    entities: ['Poland', 'Romania', 'Estonia', 'Latvia', 'Lithuania'],
  },
  {
    key: 'aukus',
    hook: 'AUKUS — what the submarine pact actually does and what timelines look like.',
    entities: ['Australia', 'United Kingdom', 'United States'],
  },
  {
    key: 'us-japan-skorea',
    hook: 'The US-Japan-South Korea trilateral — fragile, important, often misread.',
    entities: ['Japan', 'South Korea', 'United States'],
  },
  {
    key: 'undersea-cables',
    hook: '12 undersea cables we track — and why a Baltic Sea cut is not just an internet outage.',
    entities: [],
  },
  {
    key: 'lng-shipping',
    hook: 'LNG shipping routes — Qatar, US Gulf, Australia, and the European import shift.',
    entities: ['Qatar', 'United States', 'Australia'],
  },
  {
    key: 'opec-mechanics',
    hook: 'How OPEC+ decisions actually move the oil market — beyond the headline numbers.',
    entities: [],
  },
  {
    key: 'sahel-corridor',
    hook: 'The Sahel — why a wave of coups in 18 months matters far beyond West Africa.',
    entities: ['Mali', 'Burkina Faso', 'Niger'],
  },
  {
    key: 'horn-of-africa',
    hook: 'The Horn of Africa — Somalia, Ethiopia, Eritrea, and the Red Sea security stack.',
    entities: ['Somalia', 'Ethiopia', 'Eritrea'],
  },
  {
    key: 'caucasus',
    hook: 'The Caucasus — Armenia, Azerbaijan, Georgia, and the post-2023 realignment.',
    entities: ['Armenia', 'Azerbaijan', 'Georgia'],
  },
  {
    key: 'arctic',
    hook: 'Arctic posture — Russia, Canada, US, the Nordics, and a new strategic theater.',
    entities: ['Russia', 'Canada', 'United States', 'Norway', 'Finland'],
  },
  {
    key: 'south-china-sea',
    hook: 'South China Sea — the nine-dash line, fishing fleets, and the legal architecture.',
    entities: ['China', 'Philippines', 'Vietnam'],
  },
  {
    key: 'iran-proxy-network',
    hook: "Iran's proxy network — Hezbollah, Houthis, Iraqi militias, and the Quds Force coordination.",
    entities: ['Iran', 'Lebanon', 'Yemen', 'Iraq'],
  },
  {
    key: 'us-mexico-border',
    hook: 'The US-Mexico border as a security event surface — flows, cartels, and ground-truth signals.',
    entities: ['United States', 'Mexico'],
  },
  {
    key: 'kashmir',
    hook: 'Kashmir — the LoC, the events of August 2019, and the Indo-Pak deterrence stack.',
    entities: ['India', 'Pakistan'],
  },
  {
    key: 'venezuela-guyana',
    hook: 'Venezuela-Guyana — the Essequibo claim and what escalation paths look like.',
    entities: ['Venezuela', 'Guyana'],
  },
  {
    key: 'starlink-defense',
    hook: 'Starlink as defense infrastructure — why a commercial constellation became geopolitical.',
    entities: ['United States'],
  },
  {
    key: 'chip-export-controls',
    hook: 'US chip export controls — what they cover, what they miss, and how China is routing around.',
    entities: ['United States', 'China', 'Taiwan', 'Netherlands'],
  },
  {
    key: 'space-debris',
    hook: 'Space debris and ASAT tests — why a 2007 Chinese test still affects orbital traffic today.',
    entities: ['China', 'Russia', 'United States'],
  },
];

/**
 * Read which of the rotation topics has been posted least recently for
 * the given prefix and platform.
 */
async function pickLeastRecentRotation(
  sql: NeonSql,
  rotation: Array<{ key: string; hook: string; entities?: string[] }>,
  platform: Platform,
): Promise<{ key: string; hook: string; entities: string[] } | null> {
  const keys = rotation.map((r) => r.key);
  const used = (await sql`
    SELECT topic_key, MAX(posted_at) AS last
    FROM marketing_topics_used
    WHERE topic_key = ANY(${keys}) AND platform = ${platform}
    GROUP BY topic_key
  `) as unknown as Array<{ topic_key: string; last: string }>;
  const usedMap = new Map(used.map((u) => [u.topic_key, u.last]));
  const ranked = rotation
    .map((r) => ({
      ...r,
      entities: r.entities ?? [],
      last: usedMap.get(r.key) ?? null,
    }))
    .sort((a, b) => {
      if (!a.last && !b.last) return 0;
      if (!a.last) return -1;
      if (!b.last) return 1;
      return new Date(a.last).getTime() - new Date(b.last).getTime();
    });
  return ranked[0] ?? null;
}

/**
 * Compute current pillar distribution over the last 7 days for the given
 * platform. Returns the pillar with the largest gap vs target.
 */
async function pickPillarToWriteTo(sql: NeonSql, platform: Platform): Promise<Pillar> {
  const rows = (await sql`
    SELECT pillar, COUNT(*)::int AS c
    FROM marketing_posts
    WHERE platform = ${platform}
      AND posted_at > NOW() - INTERVAL '7 days'
      AND status = 'posted'
      AND pillar IS NOT NULL
    GROUP BY pillar
  `) as unknown as Array<{ pillar: string; c: number }>;
  const total = rows.reduce((s, r) => s + r.c, 0) || 1;
  const actual: Record<string, number> = {};
  for (const r of rows) actual[r.pillar] = r.c / total;
  // Read live pillar mix from KV-backed config (falls back to v1 defaults).
  const cfg = await getConfig().catch(() => null);
  const target = cfg?.pillarMix ?? DEFAULT_PILLAR_TARGET_WEIGHTS;
  const gaps: Array<[Pillar, number]> = (Object.keys(DEFAULT_PILLAR_TARGET_WEIGHTS) as Pillar[]).map((p) => [
    p,
    (target[p] ?? 0) - (actual[p] ?? 0),
  ]);
  gaps.sort((a, b) => b[1] - a[1]);
  return gaps[0]?.[0] ?? 'signal';
}

/**
 * Dedup check: has any topic with this key OR a 50%+ entity overlap been
 * posted in the last 7 days for ANY platform?
 */
async function isDedup(sql: NeonSql, topic_key: string, entity_keys: string[]): Promise<boolean> {
  const rows = (await sql`
    SELECT topic_key, entity_keys
    FROM marketing_topics_used
    WHERE posted_at > NOW() - INTERVAL '7 days'
      AND (topic_key = ${topic_key} OR ${entity_keys}::text[] && entity_keys)
    LIMIT 5
  `) as unknown as Array<{ topic_key: string; entity_keys: string[] }>;
  if (rows.length === 0) return false;
  if (rows.some((r) => r.topic_key === topic_key)) return true;
  // 50% entity overlap = dedup
  if (entity_keys.length === 0) return false;
  for (const r of rows) {
    const overlap = r.entity_keys.filter((e) => entity_keys.includes(e)).length;
    if (overlap / entity_keys.length >= 0.5) return true;
  }
  return false;
}

/**
 * Build a candidate topic for the requested pillar. Each pillar has its
 * own data source.
 */
async function buildCandidateForPillar(sql: NeonSql, pillar: Pillar, platform: Platform): Promise<Topic | null> {
  const today = new Date().toISOString().slice(0, 10);
  switch (pillar) {
    case 'signal': {
      // Pull highest-severity ACLED event from last 24h that we haven't
      // covered yet. Falls back to GDELT if ACLED table empty.
      const acled = (
        await sql`
        SELECT id, country, location, fatalities, event_type, source_url, occurred_at
        FROM acled_events
        WHERE occurred_at > NOW() - INTERVAL '24 hours'
          AND occurred_at < NOW() - INTERVAL '60 minutes'
        ORDER BY fatalities DESC NULLS LAST, occurred_at DESC
        LIMIT 5
      `
      ).catch(() => [] as unknown[]) as unknown as Array<{
        id: string;
        country: string;
        location: string;
        fatalities: number;
        event_type: string;
        source_url: string;
        occurred_at: string;
      }>;
      for (const e of acled) {
        const topic_key = `acled-${e.id}`;
        const entity_keys = [e.country];
        if (await isDedup(sql, topic_key, entity_keys)) continue;
        return {
          pillar,
          topic_key,
          entity_keys,
          hook: `${e.event_type} reported in ${e.location}, ${e.country} — ${e.fatalities} fatalities (via our ACLED layer).`,
          source_layer: 'acled',
          source_url: e.source_url,
          metadata: { occurred_at: e.occurred_at, fatalities: e.fatalities },
          score: 100 + (e.fatalities ?? 0),
        };
      }
      return null;
    }
    case 'pattern': {
      // Top CII mover this week.
      const movers = (
        await sql`
        SELECT country_code, country_name, score, score_delta_7d
        FROM country_instability_snapshots
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM country_instability_snapshots)
          AND ABS(score_delta_7d) > 5
        ORDER BY ABS(score_delta_7d) DESC
        LIMIT 3
      `
      ).catch(() => [] as unknown[]) as unknown as Array<{
        country_code: string;
        country_name: string;
        score: number;
        score_delta_7d: number;
      }>;
      for (const m of movers) {
        const topic_key = `cii-mover-${m.country_code}-${today}`;
        const entity_keys = [m.country_name];
        if (await isDedup(sql, topic_key, entity_keys)) continue;
        const direction = m.score_delta_7d > 0 ? 'up' : 'down';
        return {
          pillar,
          topic_key,
          entity_keys,
          hook: `${m.country_name} CII moved ${direction} ${Math.abs(m.score_delta_7d).toFixed(1)} points week-over-week to ${m.score.toFixed(1)}.`,
          source_layer: 'cii',
          metadata: { country_code: m.country_code, score: m.score, delta: m.score_delta_7d },
          score: 80 + Math.abs(m.score_delta_7d),
        };
      }
      return null;
    }
    case 'methodology': {
      const pick = await pickLeastRecentRotation(sql, METHODOLOGY_ROTATION, platform);
      if (!pick) return null;
      if (await isDedup(sql, pick.key, [])) return null;
      return {
        pillar,
        topic_key: pick.key,
        entity_keys: [],
        hook: pick.hook,
        source_layer: 'methodology',
        score: 60,
      };
    }
    case 'product': {
      // Pull latest unposted release-notes entry.
      const notes = (
        await sql`
        SELECT id, title, slug, body, published_at
        FROM release_notes
        WHERE published_at > NOW() - INTERVAL '14 days'
        ORDER BY published_at DESC
        LIMIT 3
      `
      ).catch(() => [] as unknown[]) as unknown as Array<{
        id: number;
        title: string;
        slug: string;
        body: string;
        published_at: string;
      }>;
      for (const n of notes) {
        const topic_key = `release-${n.slug}`;
        if (await isDedup(sql, topic_key, [])) continue;
        return {
          pillar,
          topic_key,
          entity_keys: [],
          hook: n.title,
          source_layer: 'release-notes',
          source_url: `https://nexuswatch.dev/whats-new#${n.slug}`,
          metadata: { body: n.body.slice(0, 500) },
          score: 70,
        };
      }
      return null;
    }
    case 'context': {
      const pick = await pickLeastRecentRotation(sql, CONTEXT_ROTATION, platform);
      if (!pick) return null;
      if (await isDedup(sql, pick.key, pick.entities)) return null;
      return {
        pillar,
        topic_key: pick.key,
        entity_keys: pick.entities,
        hook: pick.hook,
        source_layer: 'context-rotation',
        score: 50,
      };
    }
  }
}

/**
 * Main entry point. Picks the next topic for the requested platform.
 * Returns null if nothing eligible.
 *
 * Tries the most-needed pillar first; falls back through other pillars
 * if the primary has no eligible candidate.
 */
export async function selectTopic(sql: NeonSql, platform: Platform): Promise<Topic | null> {
  const primary = await pickPillarToWriteTo(sql, platform);
  const order: Pillar[] = [primary, 'signal', 'pattern', 'context', 'methodology', 'product'];
  const seen = new Set<Pillar>();
  // Pull embargo list once per call; embargoed topics/entities are silently skipped.
  const cfg = await getConfig().catch(() => null);
  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    const candidate = await buildCandidateForPillar(sql, p, platform);
    if (!candidate) continue;
    if (cfg && isEmbargoed(cfg, candidate.topic_key, candidate.entity_keys)) continue;
    return candidate;
  }
  return null;
}

/**
 * After successful posting, log the topic for dedup. Caller should
 * pass the post_id from marketing_posts insert.
 */
export async function recordTopicUsed(
  sql: NeonSql,
  topic_key: string,
  entity_keys: string[],
  platform: Platform,
  post_id: number,
): Promise<void> {
  await sql`
    INSERT INTO marketing_topics_used (topic_key, entity_keys, platform, post_id)
    VALUES (${topic_key}, ${entity_keys}, ${platform}, ${post_id})
  `;
}
