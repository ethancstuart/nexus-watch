/**
 * Privacy Policy page (/#/privacy)
 */

import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';

export function renderPrivacyPage(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.privacy);
  root.innerHTML = '';
  root.className = 'nw-legal-page nw-page';

  const page = createElement('div', {});
  page.setAttribute('role', 'main');
  page.id = 'main-content';
  page.style.cssText =
    'max-width:700px;margin:0 auto;padding:48px 24px;font-family:var(--nw-font-body, Inter, sans-serif)';

  page.innerHTML = `
    <a href="#/" style="font-size:12px;color:var(--nw-text-muted);text-decoration:none">\u2190 Home</a>
    <h1 style="font-size:28px;font-weight:700;color:var(--nw-text);margin:16px 0 8px">Privacy Policy</h1>
    <p style="font-size:12px;color:var(--nw-text-muted);margin:0 0 32px">Last updated: April 19, 2026</p>

    <div style="font-size:14px;color:var(--nw-text-secondary);line-height:1.7">
      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">The Short Version</h2>
      <p>There are no accounts. If you subscribe to the brief we keep your email address, your timezone and
      where you signed up from. That is the whole of it. You can leave from a link in every email.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">1. What we collect</h2>
      <p><strong>If you subscribe:</strong> your email address, the timezone your browser reports (so the brief
      arrives in your morning rather than ours), and which page you subscribed from.</p>
      <p><strong>If you just read:</strong> nothing you give us. Our host records ordinary web-server logs, and
      page views are counted as described below.</p>
      <p><strong>There is no sign-in.</strong> This page previously described Google and GitHub login, a session
      cookie, portfolio holdings and a watchlist. None of those exist; they were removed with the earlier
      product in September 2026 and this policy was not updated until 2026-09-12. We are sorry — a privacy
      policy that describes the wrong product is worse than none.</p>
      <p><strong>No payments.</strong> NexusWatch is free. No card data ever reaches us.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">2. Who else sees it</h2>
      <p>We would rather name them than claim there are none.</p>
      <ul style="margin:8px 0 8px 18px">
        <li><strong>Neon</strong> — the database holding subscribers and the call ledger. United States.</li>
        <li><strong>Upstash</strong> — short-lived caching. United States.</li>
        <li><strong>Resend</strong> — delivers the brief; your address is sent to them for each send.</li>
        <li><strong>beehiiv</strong> — a mirror of the brief, when it is configured.</li>
        <li><strong>Vercel</strong> — hosting, server logs, and first-party page-view counts.</li>
        <li><strong>Sentry</strong> — browser error reports, when something breaks.</li>
        <li><strong>Anthropic</strong> — writes the brief from the day's collected data. No subscriber data is sent.</li>
        <li><strong>Google Fonts</strong> — serves two typefaces, so Google sees the request.</li>
      </ul>
      <p>We do not sell, rent or share your information with anyone else, and we run no advertising trackers.
      Until 2026-09-12 this section said "no third-party tracking" and named only two of the above.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">3. Cookies and local storage</h2>
      <p><strong>No cookies are set by this site.</strong> There is nothing to keep you logged in to.</p>
      <p><strong>localStorage</strong> holds display preferences in your browser. It is never sent to us.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">4. How we use it</h2>
      <p>Your email address is used to send the brief, and nothing else. We do not email you about anything we
      have not already said we would.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">5. Retention</h2>
      <p>Your subscription is kept until you unsubscribe. A record that a brief was delivered to you on a given
      date is kept as a delivery log.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">6. Your rights</h2>
      <p>Unsubscribe from the link in any brief — one click, no questions. To see what we hold about you, or to
      have it deleted outright, email the address below and it will be done by hand.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">7. Changes</h2>
      <p>We may update this policy. Material changes will be communicated via email to subscribers.</p>

      <h2 style="font-size:18px;color:var(--nw-text);margin:24px 0 8px">8. Contact</h2>
      <p>Privacy questions: <a href="mailto:hello@nexuswatch.dev" style="color:var(--nw-accent)">hello@nexuswatch.dev</a></p>
    </div>
  `;

  root.appendChild(page);
}
