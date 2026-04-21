import { describe, it, expect } from 'vitest';
import { derivePostType } from './topicSelector.js';

describe('derivePostType', () => {
  it('signal + urgency high → alert', () => {
    expect(derivePostType({ pillar: 'signal', source_layer: 'acled', metadata: { urgency: 'high' } })).toBe('alert');
  });

  it('signal + no urgency → data_story', () => {
    expect(derivePostType({ pillar: 'signal', source_layer: 'acled', metadata: {} })).toBe('data_story');
  });

  it('pattern → data_story', () => {
    expect(derivePostType({ pillar: 'pattern', source_layer: 'cii', metadata: {} })).toBe('data_story');
  });

  it('product → cta', () => {
    expect(derivePostType({ pillar: 'product', source_layer: undefined, metadata: {} })).toBe('cta');
  });

  it('methodology → product_update', () => {
    expect(derivePostType({ pillar: 'methodology', source_layer: 'methodology', metadata: {} })).toBe('product_update');
  });

  it('product + release-notes source → product_update', () => {
    expect(derivePostType({ pillar: 'product', source_layer: 'release-notes', metadata: {} })).toBe('product_update');
  });

  it('context → data_story (default)', () => {
    expect(derivePostType({ pillar: 'context', source_layer: 'context-rotation', metadata: {} })).toBe('data_story');
  });
});
