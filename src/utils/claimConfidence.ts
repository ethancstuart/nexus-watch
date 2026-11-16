/**
 * Parses AI analyst responses for per-sentence confidence tags.
 *
 * Every sentence in AI output ends with [H] / [M] / [L] / [A].
 * This module extracts those tags, renders inline badges, and
 * produces structured ClaimConfidence records for audit logging.
 */

import type { ClaimConfidence } from '../types/lineage.ts';

/** Regex to match trailing confidence tags. */
const TAG_PATTERN = /\s*\[(H|M|L|A)\]/g;

/**
 * Parse an AI response into sentence-level claims.
 * Each sentence → ClaimConfidence with tag and original text.
 */
export function parseClaims(text: string): ClaimConfidence[] {
  // Split by sentence boundaries (period/exclamation/question followed by space + capital).
  // Conservative split that handles common abbreviations.
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const claims: ClaimConfidence[] = [];
  for (const s of sentences) {
    const tags = [...s.matchAll(TAG_PATTERN)].map((m) => m[1]);
    const lastTag = tags[tags.length - 1] || '';
    let confidence: ClaimConfidence['confidence'] = 'medium';
    if (lastTag === 'H') confidence = 'high';
    else if (lastTag === 'L') confidence = 'low';
    else if (lastTag === 'A')
      confidence = 'low'; // assessments default to low
    else if (lastTag === 'M') confidence = 'medium';
    // Strip tags from display text
    const cleanText = s.replace(TAG_PATTERN, '').trim();
    if (cleanText.length > 0) {
      claims.push({
        sentence: cleanText,
        confidence,
        sourceIds: [],
      });
    }
  }
  return claims;
}

/**
 * Render parsed claims as HTML with inline confidence badges.
 * Used in the terminal + news view.
 */
export function renderClaimsHtml(claims: ClaimConfidence[]): string {
  return claims
    .map((c) => {
      const colorClass = `nw-claim-${c.confidence}`;
      const label = c.confidence === 'high' ? 'H' : c.confidence === 'medium' ? 'M' : 'L';
      return `<span class="nw-claim">${escapeHtml(c.sentence)} <span class="nw-claim-badge ${colorClass}">${label}</span></span>`;
    })
    .join(' ');
}

/**
 * Aggregate confidence across all claims.
 * Majority high → high, majority low → low, else medium.
 */
export function overallConfidence(claims: ClaimConfidence[]): 'high' | 'medium' | 'low' {
  if (claims.length === 0) return 'medium';
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of claims) counts[c.confidence]++;
  if (counts.high > counts.low && counts.high > counts.medium) return 'high';
  if (counts.low > counts.high && counts.low > counts.medium) return 'low';
  return 'medium';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}
