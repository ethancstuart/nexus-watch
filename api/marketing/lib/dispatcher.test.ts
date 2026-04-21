import { describe, it, expect } from 'vitest';
import { buildImageUrl, isPostTypeEnabled } from './dispatcher.js';
import type { Topic } from './topicSelector.js';

const baseTopic: Topic = {
  pillar: 'signal',
  topic_key: 'acled-123',
  entity_keys: ['Ukraine'],
  hook: 'Conflict reported in eastern Ukraine — ACLED flagging new frontline activity.',
  source_layer: 'acled',
  metadata: { urgency: 'high', cii_score: 84 },
  score: 110,
  post_type: 'alert',
};

describe('buildImageUrl', () => {
  it('alert: returns alert URL with country, metric, layer', () => {
    const url = buildImageUrl('alert', baseTopic);
    expect(url).toContain('/api/og/social?type=alert');
    expect(url).toContain('country=Ukraine');
    expect(url).toContain('metric=CII+84');
    expect(url).toContain('layer=ACLED');
  });

  it('data_story: returns data_story URL', () => {
    const topic = { ...baseTopic, post_type: 'data_story' as const };
    const url = buildImageUrl('data_story', topic);
    expect(url).toContain('type=data_story');
  });

  it('cta: returns cta URL', () => {
    const topic = { ...baseTopic, post_type: 'cta' as const };
    const url = buildImageUrl('cta', topic);
    expect(url).toContain('type=cta');
  });

  it('product_update: returns product_update URL', () => {
    const topic = { ...baseTopic, post_type: 'product_update' as const };
    const url = buildImageUrl('product_update', topic);
    expect(url).toContain('type=product_update');
  });

  it('alert: no country param when entity_keys is empty', () => {
    const topic = { ...baseTopic, entity_keys: [] };
    const url = buildImageUrl('alert', topic);
    expect(url).not.toContain('country=');
  });

  it('alert: no metric param when cii_score is absent', () => {
    const topic = { ...baseTopic, metadata: { urgency: 'high' } };
    const url = buildImageUrl('alert', topic);
    expect(url).not.toContain('metric=');
  });

  it('cta: always uses hardcoded title regardless of topic hook', () => {
    const topic = { ...baseTopic, hook: 'This hook should be ignored for CTA', post_type: 'cta' as const };
    const url = buildImageUrl('cta', topic);
    expect(url).toContain('158%20countries');
  });

  it('alert: metric uses + encoding not %20', () => {
    const url = buildImageUrl('alert', baseTopic);
    // Should have CII+84 not CII%2084 or CII 84
    expect(url).toMatch(/metric=CII[+]84/);
  });
});

describe('isPostTypeEnabled', () => {
  it('returns true when killSwitches is undefined', () => {
    expect(isPostTypeEnabled(undefined, 'x', 'alert')).toBe(true);
  });

  it('returns true when kill switch is absent', () => {
    expect(isPostTypeEnabled({}, 'x', 'alert')).toBe(true);
  });

  it('returns false when kill switch is explicitly false', () => {
    expect(isPostTypeEnabled({ 'x:alert': false }, 'x', 'alert')).toBe(false);
  });

  it('returns true when kill switch is explicitly true', () => {
    expect(isPostTypeEnabled({ 'x:alert': true }, 'x', 'alert')).toBe(true);
  });

  it('does not affect other platforms', () => {
    expect(isPostTypeEnabled({ 'x:alert': false }, 'linkedin', 'alert')).toBe(true);
  });
});

describe('alert platform gate logic', () => {
  it('isPostTypeEnabled allows alert on x', () => {
    expect(isPostTypeEnabled({}, 'x', 'alert')).toBe(true);
  });

  it('isPostTypeEnabled allows alert on linkedin when no kill switch', () => {
    // The platform gate is an explicit code check (post_type === alert && linkedin),
    // separate from kill switches. Kill switch allows by default.
    expect(isPostTypeEnabled({}, 'linkedin', 'alert')).toBe(true);
  });

  it('kill switch can disable alerts on linkedin independently', () => {
    expect(isPostTypeEnabled({ 'linkedin:alert': false }, 'linkedin', 'alert')).toBe(false);
  });
});

describe('CTA headline override pattern', () => {
  it('spread-assign preserves all Topic fields while replacing hook', () => {
    const originalTopic: Topic = {
      pillar: 'product',
      topic_key: 'cta-test',
      entity_keys: [],
      hook: 'original hook',
      score: 70,
      post_type: 'cta',
    };
    const overrideHeadline = '158 countries. Real-time intelligence.';
    const overriddenTopic = { ...originalTopic, hook: overrideHeadline };

    expect(overriddenTopic.hook).toBe(overrideHeadline);
    expect(overriddenTopic.post_type).toBe('cta');
    expect(overriddenTopic.pillar).toBe('product');
    expect(overriddenTopic.topic_key).toBe('cta-test');
  });
});
