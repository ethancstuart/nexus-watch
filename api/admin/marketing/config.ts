import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAdmin } from '../_auth';
import { getConfig, writeConfig, DEFAULT_CONFIG, type MarketingConfig } from '../../marketing/lib/config';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * /api/admin/marketing/config
 *
 * GET  — returns the live marketing config (cadence, pillarMix, voiceKnobs,
 *        embargo, version, updatedAt, updatedBy) + the v1 defaults so the
 *        admin UI can render reset buttons without a second round-trip.
 *
 * POST — accepts a partial `patch` body. Only recognized fields are applied.
 *        Pillar mix is auto-normalized to sum=1.0. Cadence clamped [0,10].
 *        Voice knobs clamped [0,100]. Embargo: supply the full array to
 *        replace — use GET first and splice in-memory.
 *
 * Body shape (all optional):
 *   {
 *     cadence?:    { x?: number, linkedin?: number, ... },
 *     pillarMix?:  { signal?: number, pattern?: number, ... },
 *     voiceKnobs?: { formality?: number, hedging?: number,
 *                    dataDensity?: number, emoji?: number },
 *     embargo?:    [{ key, kind: 'topic'|'entity', until: ISO, reason? }]
 *   }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const current = await getConfig();
    return res.json({ config: current, defaults: DEFAULT_CONFIG });
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = (req.body ?? {}) as Partial<MarketingConfig>;
    const patch: Partial<MarketingConfig> = {};
    if (body.cadence && typeof body.cadence === 'object') patch.cadence = body.cadence;
    if (body.pillarMix && typeof body.pillarMix === 'object') patch.pillarMix = body.pillarMix;
    if (body.voiceKnobs && typeof body.voiceKnobs === 'object') patch.voiceKnobs = body.voiceKnobs;
    if (Array.isArray(body.embargo)) patch.embargo = body.embargo;
    const updatedBy = user.id ?? user.email ?? 'admin';
    const updated = await writeConfig(patch, updatedBy);
    return res.json({ ok: true, config: updated });
  }
  return res.status(405).json({ error: 'method_not_allowed' });
}
