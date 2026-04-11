/**
 * NexusWatch Voice — deterministic checker.
 *
 * Fast, regex-based checks that can run without a network call and without
 * any model. These checks catch hard voice violations (forbidden topics,
 * wrong pronouns, non-brand emoji, length, etc.) before the draft is sent
 * for the more expensive semantic Claude check.
 *
 * Canonical source of truth: this file. `api/voice/eval.ts` keeps a copy of
 * the same logic inline because the api/ tsconfig project cannot import from
 * src/. If you change the rules here, update the copy in the API handler too.
 */

export type Platform = 'x' | 'linkedin' | 'reddit' | 'dm';

export interface VoiceDraft {
  platform: Platform;
  content: string;
  /** Optional freeform context the analyst or engine attached to the draft. */
  context?: string;
}

export interface DeterministicResult {
  /** True iff the draft passed every deterministic check. */
  passed: boolean;
  /** Human-readable violation strings, one per failed check. */
  violations: string[];
  /** Stats used by downstream semantic checks (e.g., char counts, emoji counts). */
  stats: {
    charCount: number;
    wordCount: number;
    emojiCount: number;
    sentenceCount: number;
  };
}

/**
 * Per-platform hard length limits. A draft longer than these is auto-failed.
 */
export const LENGTH_LIMITS: Record<Platform, { maxChars: number; minChars: number }> = {
  x: { maxChars: 280, minChars: 1 },
  linkedin: { maxChars: 4000, minChars: 80 },
  reddit: { maxChars: 10000, minChars: 80 },
  dm: { maxChars: 1500, minChars: 1 },
};

/**
 * The only emoji allowed in NexusWatch social drafts. Every other emoji is a
 * violation.
 */
export const BRAND_EMOJI_SET = ['☕', '🌍', '🗺️', '📍', '🔭'] as const;

/**
 * Per-platform max emoji count. Reddit gets zero no matter what.
 */
export const EMOJI_LIMITS: Record<Platform, number> = {
  x: 1,
  linkedin: 2,
  reddit: 0,
  dm: 1,
};

/**
 * Forbidden phrases and topics, each with a reason. These are case-insensitive
 * substring or regex matches. Any match sets `passed: false`.
 */
const FORBIDDEN_PHRASES: { pattern: RegExp; reason: string }[] = [
  // Founder-as-face / first-person
  {
    pattern: /\bethan( stuart)?\b/i,
    reason: 'names the founder by name (brand is the protagonist, not the founder)',
  },
  {
    pattern: /\b(our|my) founder\b/i,
    reason: 'references a founder (brand is the protagonist, not the founder)',
  },
  {
    pattern: /\bi['\u2019 ]?m\s+(the\s+)?(founder|ceo|cto|creator|builder)\b/i,
    reason: 'identifies a named role behind the brand (use "we" voice)',
  },
  // LinkedIn clichés
  {
    pattern: /\bexcited to announce\b/i,
    reason: 'uses the LinkedIn cliché "excited to announce"',
  },
  {
    pattern: /\bhumbled (to|by)\b/i,
    reason: 'uses the LinkedIn cliché "humbled"',
  },
  // Chat filler
  {
    pattern: /\bngl\b/i,
    reason: 'uses chat filler "ngl"',
  },
  {
    pattern: /\blol\b/i,
    reason: 'uses chat filler "lol"',
  },
  // Conspiracy / wake up
  {
    pattern: /\bwake up\b/i,
    reason: 'uses conspiracy-adjacent phrasing "wake up"',
  },
  {
    pattern: /\bmainstream media (is|are) controlled\b/i,
    reason: 'conspiracy framing about mainstream media',
  },
  // Forbidden advice categories
  {
    pattern: /\b(you should|we recommend) (buy|sell|short|long) \w+/i,
    reason: 'financial advice (not allowed)',
  },
  {
    pattern: /\b(you should|we recommend) (take|use) \w+ (medication|vaccine|drug)/i,
    reason: 'medical advice (not allowed)',
  },
  // Speculative violence
  {
    pattern: /\b(will strike|will attack|will invade|will hit) .* (by|within|before) (next|the next)/i,
    reason: 'speculative violence framing (not allowed without a named source)',
  },
  // Partisan US politics — trigger phrases
  {
    pattern:
      /\b(biden|trump|harris|desantis|aoc|mcconnell|pelosi) (is|was) (wrong|right|completely|asleep|a disaster)\b/i,
    reason: 'partisan US politics about a named US politician',
  },
  {
    pattern: /\bunpopular opinion\b/i,
    reason: 'uses engagement-bait phrase "unpopular opinion"',
  },
  // Marketing / promo
  {
    pattern: /\bpromo code\b/i,
    reason: 'contains a promo code (marketing pitch, not on-brand)',
  },
  {
    pattern: /\b(follow us|dm me if you want to learn more)\b/i,
    reason: 'contains a growth-hacker CTA',
  },
  {
    pattern: /\b\d+%\s*off\b/i,
    reason: 'contains a discount offer (marketing pitch, not on-brand)',
  },
  // Overclaiming
  {
    pattern: /\b(94|95|96|97|98|99|100)%\s+(accuracy|accurate) .* (predict|forecast|event|strike|attack)/i,
    reason: 'overclaims predictive capability',
  },
  // LinkedIn slop
  {
    pattern: /\bleverag(e|ing) synergies\b/i,
    reason: 'corporate buzzword slop ("leverage synergies")',
  },
  {
    pattern: /\bbest[- ]in[- ]class\b/i,
    reason: 'corporate buzzword ("best-in-class")',
  },
  {
    pattern: /\bmission[- ]critical\b/i,
    reason: 'corporate buzzword ("mission-critical")',
  },
  {
    pattern: /\bactionable insights?\b/i,
    reason: 'corporate buzzword ("actionable insights")',
  },
  {
    pattern: /\btrusted partner\b/i,
    reason: 'corporate buzzword ("trusted partner")',
  },
];

/**
 * Regex to detect any emoji character in a string. Uses the Unicode emoji
 * property where supported; falls back to a broad range match.
 */
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

/**
 * Pronoun correctness: we require at least one instance of "we/our/us" in
 * drafts over a minimum length, and we forbid first-person singular entirely.
 */
const FIRST_PERSON_SINGULAR = /\b(i|i['\u2019]?m|i['\u2019]?ve|i['\u2019]?ll|i['\u2019]?d|me|my|mine|myself)\b/i;
const FIRST_PERSON_PLURAL = /\b(we|we['\u2019]?re|we['\u2019]?ve|we['\u2019]?ll|our|ours|us|ourselves)\b/i;

/**
 * Minimum draft length below which we don't require a "we" pronoun. Short DM
 * replies like "noted, thanks" don't need pronouns at all.
 */
const PRONOUN_MIN_LENGTH = 60;

export function countEmoji(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

export function extractEmoji(text: string): string[] {
  const matches = text.match(EMOJI_REGEX);
  return matches ? [...matches] : [];
}

export function isBrandEmoji(ch: string): boolean {
  return (BRAND_EMOJI_SET as readonly string[]).includes(ch);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : text.trim() ? 1 : 0;
}

/**
 * Run every deterministic check against a draft. Returns a result object with
 * every violation found (we don't early-exit — we want the reviewer to see all
 * failures at once).
 */
export function runDeterministicChecks(draft: VoiceDraft): DeterministicResult {
  const violations: string[] = [];
  const content = draft.content ?? '';
  const charCount = [...content].length;
  const wordCount = countWords(content);
  const emojiCount = countEmoji(content);
  const sentenceCount = countSentences(content);

  // --- Length checks ---
  const limits = LENGTH_LIMITS[draft.platform];
  if (!limits) {
    violations.push(`unknown platform: ${String(draft.platform)}`);
  } else {
    if (charCount > limits.maxChars) {
      violations.push(`exceeds ${draft.platform} max length: ${charCount}/${limits.maxChars} chars`);
    }
    if (charCount < limits.minChars) {
      violations.push(`below ${draft.platform} min length: ${charCount}/${limits.minChars} chars`);
    }
  }

  // --- Emoji checks ---
  const emojiList = extractEmoji(content);
  const emojiLimit = EMOJI_LIMITS[draft.platform] ?? 0;
  if (emojiList.length > emojiLimit) {
    violations.push(`exceeds ${draft.platform} emoji limit: ${emojiList.length}/${emojiLimit}`);
  }
  const nonBrandEmoji = emojiList.filter((e) => !isBrandEmoji(e));
  if (nonBrandEmoji.length > 0) {
    const unique = [...new Set(nonBrandEmoji)].join('');
    violations.push(`contains emoji outside the brand set (${unique}); allowed: ${BRAND_EMOJI_SET.join('')}`);
  }

  // --- Pronoun checks ---
  if (FIRST_PERSON_SINGULAR.test(content)) {
    violations.push('uses first-person singular ("I", "me", "my"); must use "we" voice');
  }
  if (charCount >= PRONOUN_MIN_LENGTH && !FIRST_PERSON_PLURAL.test(content)) {
    violations.push('missing "we/our/us" pronoun (must speak as the brand)');
  }

  // --- Forbidden phrases ---
  for (const { pattern, reason } of FORBIDDEN_PHRASES) {
    if (pattern.test(content)) {
      violations.push(reason);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    stats: {
      charCount,
      wordCount,
      emojiCount,
      sentenceCount,
    },
  };
}

/**
 * Convenience: describe a draft result in plain text for CLI output.
 */
export function formatResult(result: DeterministicResult): string {
  const lines: string[] = [];
  lines.push(`passed: ${result.passed}`);
  lines.push(
    `stats: ${result.stats.charCount} chars, ${result.stats.wordCount} words, ${result.stats.sentenceCount} sentences, ${result.stats.emojiCount} emoji`,
  );
  if (result.violations.length > 0) {
    lines.push('violations:');
    for (const v of result.violations) {
      lines.push(`  - ${v}`);
    }
  } else {
    lines.push('violations: none');
  }
  return lines.join('\n');
}
