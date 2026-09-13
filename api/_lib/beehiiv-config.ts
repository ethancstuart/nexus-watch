/**
 * ONE name for the beehiiv publication id.
 *
 * The code read TWO different environment variables for the same value:
 * daily-brief.ts used BEEHIIV_PUB_ID to publish the brief, and subscribe.ts
 * used BEEHIIV_PUBLICATION_ID to sync a new subscriber. Setting one and not
 * the other silently half-worked — the publication would accept subscribers
 * and never receive an issue, or the reverse — and nothing said so. Found by
 * the 2026-09-12 audit while writing the owner's runbook.
 *
 * BEEHIIV_PUBLICATION_ID is canonical because it is the name .env.example
 * documents. BEEHIIV_PUB_ID is still read so an existing deployment does not
 * break the moment this ships.
 */
/** beehiiv's own documented id shape. A malformed value earns an opaque 400. */
export const BEEHIIV_PUB_ID_RE = /^pub_[0-9a-fA-F-]+$/;

/**
 * PREFER THE ONE THAT IS WELL FORMED, not the one with the nicer name.
 *
 * Naive precedence — canonical first, always — has a live footgun here: the
 * value in production today IS malformed, so an owner who fixes the OTHER
 * name would find the broken one still winning and the publish still failing,
 * with an error naming a variable they had just corrected. An independent
 * review caught it. Shape decides; name only breaks a tie.
 */
export function beehiivPublicationId(): string | undefined {
  const canonical = process.env.BEEHIIV_PUBLICATION_ID;
  const legacy = process.env.BEEHIIV_PUB_ID;
  if (canonical && BEEHIIV_PUB_ID_RE.test(canonical)) return canonical;
  if (legacy && BEEHIIV_PUB_ID_RE.test(legacy)) return legacy;
  // Neither is usable. Return the canonical one anyway so the caller's
  // malformed-value error names the variable we want set, and says what is
  // wrong with the value actually in play.
  return canonical || legacy || undefined;
}
