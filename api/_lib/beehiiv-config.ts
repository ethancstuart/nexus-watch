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
export function beehiivPublicationId(): string | undefined {
  return process.env.BEEHIIV_PUBLICATION_ID || process.env.BEEHIIV_PUB_ID || undefined;
}

/** beehiiv's own id shape. A malformed value earns an opaque 400. */
export const BEEHIIV_PUB_ID_RE = /^pub_[0-9a-fA-F-]+$/;
