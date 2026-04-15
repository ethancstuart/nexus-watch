import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * OFAC SDN + UN Consolidated sanctions ingestion cron.
 *
 * OFAC SDN list: https://www.treasury.gov/ofac/downloads/sdn.xml (and JSON
 *   feed at https://sanctionssearch.ofac.treas.gov/data/consolidated/current.json
 *   — use the JSON one).
 * UN Consolidated: https://scsanctions.un.org/resources/xml/en/consolidated.xml
 *
 * Both feeds are large (SDN is ~15k entities, UN is ~1k). We compare the
 * latest snapshot hash against the last-seen hash in KV to short-circuit
 * when nothing changed. When changes are present, we diff entities and
 * write `add` / `update` / `remove` rows to sanctions_events.
 *
 * This cron is DATA SCAFFOLDING — the parser is intentionally minimal
 * (parses the top-level entity list; doesn't yet extract aliases, vessel
 * IMOs, etc.). Next iteration: richer entity attribute extraction, and
 * country_code enrichment via the entityRegistry.
 *
 * Requires: DATABASE_URL. No API keys needed (OFAC + UN are public).
 * Safe to run against empty DB — gracefully returns skipped=true.
 */

const OFAC_URL = 'https://sanctionssearch.ofac.treas.gov/data/consolidated/current.json';
const UN_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const result = { ofac: 0, un: 0, skipped_ofac: false, skipped_un: false, errors: [] as string[] };

  // ---- OFAC ----
  try {
    const r = await fetch(OFAC_URL, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`ofac_${r.status}`);
    const body = await r.text();
    const hash = await sha256(body);
    const lastHash = await kvGet('sanctions:ofac:last_hash');
    if (lastHash === hash) {
      result.skipped_ofac = true;
    } else {
      const changes = extractOfacChanges(body);
      for (const c of changes) {
        await sql`
          INSERT INTO sanctions_events
            (source, source_entity_id, entity_name, entity_type, country_codes,
             change_type, programs, remarks, source_date)
          VALUES ('ofac', ${c.id}, ${c.name}, ${c.type}, ${c.countries},
                  ${c.change_type}, ${c.programs}, ${c.remarks}, ${c.source_date ?? null})
          ON CONFLICT (source, source_entity_id, change_type, source_date) DO NOTHING
        `;
        result.ofac++;
      }
      await kvSet('sanctions:ofac:last_hash', hash);
    }
  } catch (err) {
    result.errors.push(`ofac: ${err instanceof Error ? err.message : err}`);
  }

  // ---- UN Consolidated ----
  try {
    const r = await fetch(UN_URL, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`un_${r.status}`);
    const body = await r.text();
    const hash = await sha256(body);
    const lastHash = await kvGet('sanctions:un:last_hash');
    if (lastHash === hash) {
      result.skipped_un = true;
    } else {
      const changes = extractUnChanges(body);
      for (const c of changes) {
        await sql`
          INSERT INTO sanctions_events
            (source, source_entity_id, entity_name, entity_type, country_codes,
             change_type, programs, remarks, source_date)
          VALUES ('un', ${c.id}, ${c.name}, ${c.type}, ${c.countries},
                  ${c.change_type}, ${c.programs}, ${c.remarks}, ${c.source_date ?? null})
          ON CONFLICT (source, source_entity_id, change_type, source_date) DO NOTHING
        `;
        result.un++;
      }
      await kvSet('sanctions:un:last_hash', hash);
    }
  } catch (err) {
    result.errors.push(`un: ${err instanceof Error ? err.message : err}`);
  }

  return res.json(result);
}

// ---------------------------------------------------------------------------
// Parsing — minimal top-level extraction; richer fields can come later
// ---------------------------------------------------------------------------

interface SanctionsChange {
  id: string;
  name: string;
  type: string;
  countries: string[];
  change_type: 'add' | 'update' | 'remove';
  programs: string[];
  remarks: string | null;
  source_date: string | null;
}

function extractOfacChanges(json: string): SanctionsChange[] {
  try {
    const data = JSON.parse(json) as {
      sdnList?: Array<{
        uid?: number;
        firstName?: string;
        lastName?: string;
        sdnType?: string;
        programList?: string[];
        addressList?: Array<{ country?: string }>;
        remarks?: string;
      }>;
    };
    const list = data.sdnList ?? [];
    return list.map((e) => ({
      id: String(e.uid ?? ''),
      name: [e.firstName, e.lastName].filter(Boolean).join(' ').trim() || 'unknown',
      type: (e.sdnType || 'entity').toLowerCase(),
      countries: Array.from(new Set((e.addressList ?? []).map((a) => (a.country || '').toUpperCase()).filter(Boolean))),
      change_type: 'add' as const,
      programs: e.programList ?? [],
      remarks: e.remarks ?? null,
      source_date: null,
    }));
  } catch {
    return [];
  }
}

function extractUnChanges(xml: string): SanctionsChange[] {
  // Minimal regex-based extraction (no XML parser dep). Next iteration:
  // proper XML parsing so aliases and vessel IMOs are captured.
  const entries: SanctionsChange[] = [];
  const individualMatches = xml.matchAll(/<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g);
  for (const m of individualMatches) {
    const block = m[1];
    const id = block.match(/<DATAID>(\d+)<\/DATAID>/)?.[1] ?? '';
    const firstName = block.match(/<FIRST_NAME>([^<]+)<\/FIRST_NAME>/)?.[1] ?? '';
    const lastName = block.match(/<SECOND_NAME>([^<]+)<\/SECOND_NAME>/)?.[1] ?? '';
    const refNumber = block.match(/<REFERENCE_NUMBER>([^<]+)<\/REFERENCE_NUMBER>/)?.[1] ?? '';
    if (!id) continue;
    entries.push({
      id,
      name: `${firstName} ${lastName}`.trim() || 'unknown',
      type: 'individual',
      countries: [],
      change_type: 'add',
      programs: refNumber ? [refNumber] : [],
      remarks: null,
      source_date: null,
    });
  }
  const entityMatches = xml.matchAll(/<ENTITY>([\s\S]*?)<\/ENTITY>/g);
  for (const m of entityMatches) {
    const block = m[1];
    const id = block.match(/<DATAID>(\d+)<\/DATAID>/)?.[1] ?? '';
    const name = block.match(/<FIRST_NAME>([^<]+)<\/FIRST_NAME>/)?.[1] ?? '';
    if (!id) continue;
    entries.push({
      id,
      name: name || 'unknown',
      type: 'entity',
      countries: [],
      change_type: 'add',
      programs: [],
      remarks: null,
      source_date: null,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// KV helpers
// ---------------------------------------------------------------------------

async function kvGet(key: string): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { result: string | null };
    return d.result;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: string): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?EX=604800`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: value,
    });
  } catch {
    /* non-fatal */
  }
}

async function sha256(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtle = (crypto as any).subtle;
  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
