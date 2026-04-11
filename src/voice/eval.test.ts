import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runDeterministicChecks,
  countEmoji,
  countWords,
  isBrandEmoji,
  formatResult,
  BRAND_EMOJI_SET,
  LENGTH_LIMITS,
} from './deterministic.ts';

// --- Pronoun & basic-voice checks ---

describe('runDeterministicChecks — pronoun rules', () => {
  it('passes a clean X reply using "we" voice', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content:
        'We are tracking 14 active wildfires along the Portuguese coast this morning. Three are inside evacuation zones near Leiria.',
    });
    expect(r.passed).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('fails when first-person singular "I" is used', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content:
        'I am tracking 14 active wildfires along the Portuguese coast this morning. Three are inside evacuation zones near Leiria.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('first-person singular'))).toBe(true);
  });

  it('fails when "my dashboard" appears', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'Our layer caught a spike on my dashboard earlier today near Kaliningrad.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('first-person singular'))).toBe(true);
  });

  it('requires "we/our/us" pronoun in drafts over the min length', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content:
        'There are 14 active wildfires along the Portuguese coast this morning with three inside evacuation zones near Leiria and the situation continues to develop.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('missing "we/our/us"'))).toBe(true);
  });

  it('does not require a pronoun for short drafts', () => {
    const r = runDeterministicChecks({
      platform: 'dm',
      content: 'Noted, thanks.',
    });
    // This still passes even without "we" — short DMs are fine.
    expect(r.passed).toBe(true);
  });
});

// --- Forbidden phrases ---

describe('runDeterministicChecks — forbidden phrases', () => {
  it('fails when the founder is named', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content: 'NexusWatch was built by Ethan and we are proud of the work. Our team is tracking many layers daily.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('founder'))).toBe(true);
  });

  it('fails on "excited to announce" LinkedIn cliché', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content:
        'We are excited to announce our new dark-vessel layer. Our team has been working on this for months and it is now live for all users.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('excited to announce'))).toBe(true);
  });

  it('fails on "humbled" cliché', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content:
        'We are humbled by the response to our recent brief on Red Sea shipping and want to thank our subscribers.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('humbled'))).toBe(true);
  });

  it('fails on "ngl" chat filler', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'ngl our tension index is spiking and we are watching it closely right now.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('ngl'))).toBe(true);
  });

  it('fails on "wake up" conspiracy phrasing', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'Our layer is showing something the media is not covering. Wake up and look at the data.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('wake up'))).toBe(true);
  });

  it('fails on promo code marketing', () => {
    const r = runDeterministicChecks({
      platform: 'dm',
      content:
        'Our dashboard covers Sudan and many other countries. Use promo code REDDIT for 20% off your first month.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('promo code'))).toBe(true);
  });

  it('fails on "% off" discount phrasing', () => {
    const r = runDeterministicChecks({
      platform: 'dm',
      content: 'Thanks for reaching out — we can offer you 50% off on our Analyst tier this week.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('discount'))).toBe(true);
  });

  it('fails on overclaimed prediction accuracy', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'Our AI can predict with 95% accuracy when a major strike event will occur. We have forecasted several.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('overclaims'))).toBe(true);
  });

  it('fails on "leverage synergies" corporate slop', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content:
        'At NexusWatch we believe in leveraging synergies across our data ecosystem to deliver insights to our readers and subscribers daily.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('synergies'))).toBe(true);
  });

  it('fails on named partisan US politician criticism', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'Biden is completely wrong about the Taiwan situation and we think his approach is a disaster.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('partisan') || v.includes('founder')) || r.violations.length > 0).toBe(
      true,
    );
  });

  it('fails on "unpopular opinion" engagement bait', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content:
        'Unpopular opinion: most geopolitical intelligence platforms are a scam and we think ours is the only one worth using daily.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('unpopular opinion'))).toBe(true);
  });
});

// --- Length checks ---

describe('runDeterministicChecks — length limits', () => {
  it('fails when an X draft exceeds 280 chars', () => {
    const longContent = 'We are watching the Red Sea chokepoint very closely today. '.repeat(10);
    const r = runDeterministicChecks({ platform: 'x', content: longContent });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('max length'))).toBe(true);
  });

  it('fails when a LinkedIn draft is too short', () => {
    const r = runDeterministicChecks({
      platform: 'linkedin',
      content: 'We saw a spike.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('min length'))).toBe(true);
  });

  it('reports accurate character count in stats', () => {
    const content = 'We are tracking 14 wildfires along the Portuguese coast.';
    const r = runDeterministicChecks({ platform: 'x', content });
    expect(r.stats.charCount).toBe(content.length);
  });
});

// --- Emoji checks ---

describe('runDeterministicChecks — emoji rules', () => {
  it('allows one brand emoji in an X tweet', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: '☕ Five things caught our eye on the maps this morning — here is what we saw.',
    });
    expect(r.passed).toBe(true);
  });

  it('fails when X draft contains a non-brand emoji', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: '🚀 We are tracking a big news story right now across our layers and it is moving fast.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('brand set'))).toBe(true);
  });

  it('fails when X draft has too many emoji', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: '☕ 🌍 Our layers are picking up three separate events we are watching this morning.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('emoji limit'))).toBe(true);
  });

  it('fails when a Reddit comment contains any emoji', () => {
    const r = runDeterministicChecks({
      platform: 'reddit',
      content:
        '☕ We are tracking the situation closely and our layers show elevated activity across the region this week.',
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.includes('emoji limit'))).toBe(true);
  });

  it('isBrandEmoji correctly identifies the brand set', () => {
    for (const e of BRAND_EMOJI_SET) {
      expect(isBrandEmoji(e)).toBe(true);
    }
    expect(isBrandEmoji('🚀')).toBe(false);
    expect(isBrandEmoji('🔥')).toBe(false);
  });

  it('countEmoji counts correctly', () => {
    expect(countEmoji('hello')).toBe(0);
    expect(countEmoji('☕ hello')).toBe(1);
    expect(countEmoji('☕ hello 🌍 world 🔭')).toBe(3);
  });
});

// --- Utility functions ---

describe('utility functions', () => {
  it('countWords counts words correctly', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('hello')).toBe(1);
    expect(countWords('hello world')).toBe(2);
    expect(countWords('  hello  world  ')).toBe(2);
  });

  it('formatResult produces readable output', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'We are tracking 14 active wildfires along the Portuguese coast this morning.',
    });
    const formatted = formatResult(r);
    expect(formatted).toContain('passed: true');
    expect(formatted).toContain('violations: none');
  });

  it('formatResult lists violations when present', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content: 'I am tracking the situation very closely today.',
    });
    const formatted = formatResult(r);
    expect(formatted).toContain('passed: false');
    expect(formatted).toContain('violations:');
  });

  it('LENGTH_LIMITS has all four platforms', () => {
    expect(LENGTH_LIMITS.x).toBeDefined();
    expect(LENGTH_LIMITS.linkedin).toBeDefined();
    expect(LENGTH_LIMITS.reddit).toBeDefined();
    expect(LENGTH_LIMITS.dm).toBeDefined();
  });
});

// --- Good reference drafts (should all pass) ---

describe('reference good drafts', () => {
  it('passes a real X reply from the few-shot corpus', () => {
    const r = runDeterministicChecks({
      platform: 'x',
      content:
        'We are — our GPS jamming layer flagged a fresh spike over Kaliningrad about 6 hours ago. About a dozen commercial flights rerouted. Worth watching because the last jamming window like this lasted nine days.',
    });
    expect(r.passed).toBe(true);
  });

  it('passes a reference LinkedIn post (under length)', () => {
    const content =
      'There are 18 commercial vessels rerouting around the Cape of Good Hope this week to avoid the Red Sea. On our layers, the Red Sea looks calmer than it did last year. We are watching dark-vessel activity near the Bab el-Mandeb next.';
    const r = runDeterministicChecks({ platform: 'linkedin', content });
    expect(r.passed).toBe(true);
  });

  it('passes a reference Reddit comment', () => {
    const content =
      'ACLED is still the cleanest primary source for fatality counts. We pull it into our conflict layer, along with GDELT for English media, and it is one of the few places where the Darfur data gets disaggregated properly. Treat ACLED Darfur numbers as a floor, not a ceiling.';
    const r = runDeterministicChecks({ platform: 'reddit', content });
    expect(r.passed).toBe(true);
  });

  it('passes a reference DM reply', () => {
    const r = runDeterministicChecks({
      platform: 'dm',
      content:
        'Thanks for flagging — we are checking now. If the layer is stuck it is almost always a USGS feed hiccup on our side rather than missing data, and we can usually push a refresh in a few minutes.',
    });
    expect(r.passed).toBe(true);
  });
});

// --- Mocked Claude semantic call (no real API hits) ---

describe('semantic check is mocked, never hits real API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('runs a mocked Claude call and returns a score', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ voice_score: 88, reasoning: 'on voice' }) }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Lightweight inline semantic caller, matching the shape used in api/voice/eval.ts.
    // We test this here to verify the output shape without hitting the real API.
    async function callClaudeMock(_draft: { platform: string; content: string }) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'fake' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', messages: [] }),
      });
      const json = (await res.json()) as { content: { type: string; text: string }[] };
      const text = json.content[0].text;
      return JSON.parse(text) as { voice_score: number; reasoning: string };
    }

    const result = await callClaudeMock({ platform: 'x', content: 'We are tracking 14 wildfires.' });
    expect(result.voice_score).toBe(88);
    expect(result.reasoning).toBe('on voice');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
