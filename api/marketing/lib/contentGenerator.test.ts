import { describe, it, expect } from 'vitest';
import { buildPostTypePrompt } from './contentGenerator.js';

describe('buildPostTypePrompt', () => {
  it('alert: returns alert instructions with 280 char limit', () => {
    const prompt = buildPostTypePrompt('alert', 'x');
    expect(prompt).toContain('POST TYPE: Alert');
    expect(prompt).toContain('≤280 characters');
    expect(prompt).toContain('nexuswatch.dev');
  });

  it('data_story x: returns X thread instructions', () => {
    const prompt = buildPostTypePrompt('data_story', 'x');
    expect(prompt).toContain('POST TYPE: Data Story');
    expect(prompt).toContain('3 tweets');
    expect(prompt).not.toContain('LinkedIn');
  });

  it('data_story linkedin: returns LinkedIn instructions with voice ratio', () => {
    const prompt = buildPostTypePrompt('data_story', 'linkedin');
    expect(prompt).toContain('POST TYPE: Data Story');
    expect(prompt).toContain('LinkedIn');
    expect(prompt).toContain('50/50 analyst/friend');
  });

  it('cta x: returns CTA X instructions', () => {
    const prompt = buildPostTypePrompt('cta', 'x');
    expect(prompt).toContain('POST TYPE: CTA');
    expect(prompt).toContain('≤280');
  });

  it('cta linkedin: returns CTA LinkedIn instructions with pricing link', () => {
    const prompt = buildPostTypePrompt('cta', 'linkedin');
    expect(prompt).toContain('POST TYPE: CTA');
    expect(prompt).toContain('nexuswatch.dev/pricing');
    expect(prompt).not.toContain('excited to share');
  });

  it('product_update x: returns product update X instructions', () => {
    const prompt = buildPostTypePrompt('product_update', 'x');
    expect(prompt).toContain('POST TYPE: Product Update');
    expect(prompt).toContain('1–2 tweets');
  });

  it('product_update linkedin: returns product update LinkedIn instructions', () => {
    const prompt = buildPostTypePrompt('product_update', 'linkedin');
    expect(prompt).toContain('POST TYPE: Product Update');
    expect(prompt).toContain('150–300 words');
  });
});
