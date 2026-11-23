import { describe, it, expect } from 'vitest';
import { renderTermsPage } from './terms.ts';
import { renderSecurity } from './security.ts';
import { renderFaqPage } from './faq.ts';
import { renderAbout } from './about.ts';
import { renderSettings } from './settings.ts';
import { renderRoadmap } from './roadmap.ts';

/**
 * Pages that kept describing accounts, sign-in, watchlists and alerts after
 * those were deleted (the privacy policy already says "There are no accounts"
 * and "There is no sign-in"; /terms, /security, /faq and the rest said the
 * opposite). This pins the retired phrases out of the rendered text. It does
 * not prove the remaining copy is true; it stops these specific claims from
 * coming back unnoticed.
 */

function textOf(render: (root: HTMLElement) => void): string {
  const root = document.createElement('div');
  render(root);
  return (root.textContent ?? '').replace(/\s+/g, ' ');
}

const NO_ACCOUNT_CLAIMS = [
  /Google or GitHub/i,
  /OAuth/i,
  /sync watchlists/i,
  /If you sign in/i,
  /If you watchlist/i,
  /save alerts/i,
  /alert thresholds/i,
];

describe('no page describes accounts, sign-in, watchlists or alerts that do not exist', () => {
  const pages: Array<[string, () => string]> = [
    ['terms', () => textOf(renderTermsPage)],
    ['security', () => textOf(renderSecurity)],
    ['faq', () => textOf(renderFaqPage)],
    ['about', () => textOf(renderAbout)],
    ['settings', () => textOf(renderSettings)],
    ['roadmap', () => textOf(renderRoadmap)],
  ];
  for (const [name, get] of pages) {
    it(`${name}`, () => {
      const text = get();
      for (const re of NO_ACCOUNT_CLAIMS) expect(text, `${name} matches ${re}`).not.toMatch(re);
    });
  }

  it('terms: says there are no accounts, consistent with the privacy policy', () => {
    expect(textOf(renderTermsPage)).toMatch(/no accounts and no sign-in/i);
  });

  it('terms: does not offer scenario simulations or personal API keys', () => {
    const t = textOf(renderTermsPage);
    expect(t).not.toMatch(/scenario simulations/i);
    expect(t).not.toMatch(/API keys are personal/i);
  });

  it('faq: has no alerts question', () => {
    const t = textOf(renderFaqPage);
    expect(t).not.toMatch(/How do I get alerts/i);
    expect(t).not.toMatch(/Slack, Discord, or Telegram/i);
  });

  it('about: does not state a source count', () => {
    expect(textOf(renderAbout)).not.toMatch(/12\+/);
  });

  it('settings: does not promise a personalised brief or alerts, or that cadence takes effect', () => {
    const t = textOf(renderSettings);
    expect(t).not.toMatch(/personalized Watchlist/i);
    expect(t).not.toMatch(/filter which alerts/i);
    expect(t).not.toMatch(/Takes effect with the next brief cycle/i);
  });

  it('roadmap: no sign-in step, no Auth or Sign-In milestone, no Google Calendar', () => {
    const t = textOf(renderRoadmap);
    expect(t).not.toMatch(/Sign in to save/i);
    expect(t).not.toMatch(/Sign-In Value/i);
    expect(t).not.toMatch(/Google Calendar/i);
    expect(t).not.toMatch(/Notes & Alerts/i);
  });
});
