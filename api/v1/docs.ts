import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

/**
 * GET /api/v1/docs — what this API actually is.
 *
 * FOUR CLAIMS WERE REMOVED FROM HERE ON 2026-08-30 BECAUSE NONE OF THEM WAS
 * TRUE. Each was verified against the deployed API before deletion, not
 * inferred:
 *
 *   1. `pro: $99/month` and 2. `analyst: $249/month`. Stripe is in test mode
 *      ("no real revenue", api/cron/cost-summary.ts), the `api_keys` table is
 *      EMPTY, and api/v1/keys.ts hardcodes `tier: 'free'` on every key it
 *      issues. There was no path by which anyone could buy either tier.
 *
 *   3. `rateLimit: '10/min (free), 100/min (pro)'` on all twelve endpoints.
 *      NOT ONE `/api/v1/*` handler calls `rateLimit()` or any auth helper.
 *      Measured: 15 requests to /api/v1/cii in a few seconds returned 15x200
 *      and no 429.
 *
 *   4. `authentication: { type: 'Bearer token' }`. Nothing reads an
 *      Authorization header on any v1 route. A developer could have built
 *      against a scheme that does not exist.
 *
 * This is governance rule 6: when a claim can only be met by inventing
 * something, the honest output is the gap. An API with no tiers and no
 * enforced limit is a true statement; a priced one with neither is a false
 * one, and it was sitting on the most machine-readable surface we publish.
 *
 * Removing the paid tiers also matters for a reason beyond honesty: SEVEN
 * wired upstream sources carry non-commercial terms (OONI CC BY-NC-SA,
 * Cloudflare Radar, WHO, Open-Meteo, TwelveData, Polymarket, OpenSky).
 * Advertising a commercial tier over that data was the exposure; not
 * advertising one clears all seven at once.
 *
 * STILL OWED, deliberately not done here: upstream ATTRIBUTION. The repo
 * carries zero occurrences of "Creative Commons", "BY-NC-SA" or "CC BY". That
 * is a separate change and it needs the owner's voice sign-off.
 */

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  return res.json({
    name: 'NexusWatch API',
    version: '1.0.0',
    description:
      'The public register: dated forecasts, the evidence that settles them, and the daily brief. ' +
      'Two endpoints, both listed below and both real.',
    baseUrl: 'https://nexuswatch.dev/api/v1',
    access: {
      authentication: 'none',
      note:
        'This API is currently open and unauthenticated. No API key is required, ' +
        'and no per-key rate limit is enforced today. Please be reasonable — ' +
        'this runs on a hobby budget, and limits will be introduced before they are advertised.',
    },
    // ONLY WHAT EXISTS. This block used to advertise seven endpoints; five of
    // them — /tension, /events, /correlations, /timeline, /market — returned
    // 404 in production, because they were deleted with the map product and
    // nobody updated the document that promised them. An API document that
    // lists routes it does not serve is worse than no document. Verified
    // against production on 2026-09-12 before this edit, and every entry below
    // was verified to answer 200.
    endpoints: {
      'GET /api/v1/cii': {
        description: 'Country Instability Index — structural level and daily deviation, per country',
        params: { country: 'Optional 2-letter country code for a single country plus its history' },
      },
      'GET /api/v1/brief': {
        description: 'The daily brief',
        params: { date: 'Optional YYYY-MM-DD for a past brief' },
      },
    },
    // The register itself is not under /v1. These are the stable public reads.
    alsoPublic: {
      'GET /api/calls/ledger': 'Every call, open and resolved, with corrections attached',
      'GET /api/call?id=N': 'One call and its evidence',
      'GET /api/briefs': 'The brief archive',
    },
    // No tiers. There is one level of access and it is the one you are using.
    // Anything else here would be a price for something nobody can buy.
    tiers: null,
  });
}
