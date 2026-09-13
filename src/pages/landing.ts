/**
 * Landing — editorial rebuild (Track C).
 *
 * Surfaces the "Free." positioning. Hero is the live globe with kinetic
 * typographic overlay; below the fold are restrained editorial sections
 * (feature grid, layer breadth, Cinema preview, sample brief, why-free
 * teaser, newsletter, receipts, footer).
 *
 * Mobile-first. The globe is a decorative background — interactivity is
 * disabled on the landing surface and the desktop boots MapLibre lazily.
 * On mobile we paint a static dark globe (no MapLibre cost) so first paint
 * is measured in milliseconds, not megabytes.
 */

import '../styles/landing.css';
import { createElement } from '../utils/dom.ts';
import { trackEvent } from '../services/analytics.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { capture, installSurfaces } from '../ui/kit/index.ts';

const FALLBACK_BRIEF = {
  date: 'Sample',
  headline: 'A reading on the world, written each morning at 05:00 ET.',
  excerpt:
    'Three minutes. What resolved overnight, what is still open, and the signal of the day — each line traced back to the source that settles it, so you can audit anything that smells off. The full archive is open.',
};

interface BriefResponse {
  date?: string;
  headline?: string;
  summary?: string;
}

export function renderLanding(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.landing);
  root.textContent = '';

  // Reduced motion + viewport-based decisions.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNarrow = window.matchMedia('(max-width: 767px)').matches;

  // Top-level <main> opts into the marketing surface (Source Serif, generous
  // rhythm). Adding nw-landing-surface on top scopes our overrides.
  const main = createElement('main', { className: 'marketing-surface nw-landing-surface' });
  main.id = 'main-content';
  main.setAttribute('role', 'main');

  main.innerHTML = `
    <nav class="nw-nav" aria-label="Primary">
      <a href="#/" class="nw-nav-brand"><span class="nw-nav-mark">●</span>&nbsp;NexusWatch</a>
      <div class="nw-nav-links">
        <a href="#/ledger">The Ledger</a>
        <a href="#/briefs">Briefs</a>
        <a href="#/about">About</a>
      </div>
    </nav>

    <section class="nw-hero" aria-label="Hero">
      <div class="nw-hero-globe" id="nw-hero-globe" aria-hidden="true"></div>

      <div class="nw-hero-live" aria-hidden="true">
        <span class="nw-hero-live-dot"></span>
        <span>LIVE</span>
      </div>

      <div class="nw-hero-content" id="nw-hero-content">
        <span class="nw-eyebrow" id="nw-hero-eyebrow">The public forecasting ledger</span>
        <h1 class="nw-hero-headline word-stagger" aria-label="The world, graded.">
          <span>The</span> <span>world,</span> <span>graded<span class="nw-hero-period">.</span></span>
        </h1>
        <p class="nw-hero-sub">
          Every call we make is dated, falsifiable, and scored against someone else's data —
          published whether it flatters us or not.
        </p>
        <div id="nw-hero-capture"></div>
        <p class="nw-hero-fineprint">
          <a href="#/ledger">See every call we have open &rarr;</a> &middot; free, no account
        </p>
      </div>
    </section>

    <section class="nw-reveal" aria-label="How grading works">
      <span class="nw-section-eyebrow">How it works</span>
      <h2 class="nw-section-heading">A call, a criterion, a resolution date.</h2>
      <p class="nw-section-lede">
        Every morning we put dated probabilities on record — censorship events, currency moves — each with a
        threshold frozen at issue and an external resolver named in advance. OONI and the FX reference rates
        decide, not us. The score is published either way.
      </p>
      <div class="nw-features-grid">
        <article class="nw-feature">
          <span class="nw-feature-label">The Ledger</span>
          <h3 class="nw-feature-title">Scored in public.</h3>
          <p class="nw-feature-desc">Every call beside its country's own base rate, so you can see when we're actually saying something. Misses stay on the page — a record that only reports wins is not a record.</p>
        </article>
        <article class="nw-feature">
          <span class="nw-feature-label">Daily Brief</span>
          <h3 class="nw-feature-title">Three minutes. Every morning.</h3>
          <p class="nw-feature-desc">Opens with the ledger: what resolved, what's open, one dated call. Then the day's signal, vetted against sources you can read for yourself. Free in your inbox or via RSS.</p>
        </article>
        <article class="nw-feature">
          <span class="nw-feature-label">85 Countries</span>
          <h3 class="nw-feature-title">The evidence surface.</h3>
          <p class="nw-feature-desc">The Country Instability Index is where calls come from — a structural level and a daily deviation, published separately because adding them would invent movement. Click a number, see the data behind it.</p>
        </article>
        <article class="nw-feature">
          <span class="nw-feature-label">7 Sources</span>
          <h3 class="nw-feature-title">Few, and named.</h3>
          <p class="nw-feature-desc">OONI, daily FX reference rates, USGS, UCDP, OFAC and the UN list, World Bank governance, Wikipedia pageviews. Each resolves something specific, and the status page says when each was last read.</p>
        </article>
        <article class="nw-feature">
          <span class="nw-feature-label">Open API</span>
          <h3 class="nw-feature-title">Read the whole book.</h3>
          <p class="nw-feature-desc">The full ledger as JSON, every call with its evidence, and the brief archive. No key, no signup.</p>
        </article>
        <article class="nw-feature">
          <span class="nw-feature-label">Receipts</span>
          <h3 class="nw-feature-title">Goalposts held by GitHub.</h3>
          <p class="nw-feature-desc">MIT-licensed, open data. The call book is snapshotted daily to the public repo, so the thresholds carry GitHub's timestamps — verify us without trusting us.</p>
        </article>
      </div>
    </section>




    <section class="nw-reveal" aria-label="Today's brief">
      <span class="nw-section-eyebrow">Today's Brief</span>
      <h2 class="nw-section-heading">A reading on the world, every morning.</h2>
      <article class="nw-brief-card" id="nw-brief-card">
        <div class="nw-brief-meta">
          <span id="nw-brief-date">${FALLBACK_BRIEF.date}</span>
          <span>NexusWatch · Daily Intelligence</span>
        </div>
        <h3 class="nw-brief-headline" id="nw-brief-headline">${FALLBACK_BRIEF.headline}</h3>
        <p class="nw-brief-excerpt" id="nw-brief-excerpt">${FALLBACK_BRIEF.excerpt}</p>
        <a href="#/briefs" class="nw-brief-link">Read the full brief <span aria-hidden="true">→</span></a>
      </article>
    </section>

    <section class="nw-reveal nw-whyfree-teaser" aria-label="Why free">
      <p class="nw-whyfree-teaser-quote">
        "The existing platforms are paywalled and unreadable. Free, forever-ish, no tiers."
      </p>
      <p class="nw-whyfree-teaser-attribution">
        — Ethan, operator
        <a href="#/why-free">Read the full case →</a>
      </p>
    </section>

    <section class="nw-reveal" aria-label="Newsletter">
      <span class="nw-section-eyebrow">Subscribe</span>
      <h2 class="nw-section-heading">Get the daily brief in your inbox. Free.</h2>
      <div class="nw-signup">
        <form class="nw-signup-form" id="nw-subscribe-form" novalidate>
          <label for="nw-subscribe-email" class="sr-only">Email address</label>
          <input
            type="email"
            id="nw-subscribe-email"
            name="email"
            class="nw-signup-input"
            placeholder="you@somewhere.com"
            autocomplete="email"
            required
          />
          <button type="submit" class="nw-signup-button">Subscribe</button>
        </form>
        <p class="nw-signup-status" id="nw-subscribe-status" role="status" aria-live="polite"></p>
      </div>
    </section>

    <section class="nw-reveal" aria-label="Sources and receipts">
      <span class="nw-section-eyebrow">Sources / Receipts</span>
      <h2 class="nw-section-heading">Public data. Public method.</h2>
      <p class="nw-section-lede">
        Every call traces back to one of these. Open repo on GitHub; open API at <code>/api</code>.
      </p>
        <ul class="nw-trust-list">
          <li>OONI</li>
          <li>FX reference rates</li>
          <li>USGS</li>
          <li>UCDP</li>
          <li>OFAC &amp; UN sanctions</li>
          <li>World Bank governance</li>
          <li>Wikipedia pageviews</li>
        </ul>
    </section>

    <footer class="nw-footer">
      <div class="nw-footer-top">
        <div class="nw-footer-brand"><span>●</span> NexusWatch</div>
        <div class="nw-footer-links">
          <a href="#/ledger">The Ledger</a>
          <a href="#/briefs">Briefs</a>
          <a href="#/why-free">Why Free</a>
          <a href="#/about">About</a>
          <a href="#/api">API</a>
          <a href="https://github.com/ethancstuart/nexus-watch" target="_blank" rel="noopener">GitHub</a>
          <a href="/api/feed" rel="alternate" type="application/rss+xml">RSS</a>
        </div>
      </div>
      <div class="nw-footer-meta">
        © ${new Date().getFullYear()} NexusWatch · MIT License · Built in the open.
      </div>
    </footer>
  `;

  root.appendChild(main);

  // ── Hero capture — the single shared implementation ──
  // The primary action is SUBSCRIBE, not "open the dashboard". A stranger
  // dropped onto a 45-layer dark globe with no legend bounces and is never
  // seen again; a subscriber gets a chance every morning, and the brief is the
  // only surface here with demonstrated daily engagement. The old hero sent
  // everyone to the map and put the only email field seven sections below it.
  installSurfaces();
  const heroCapture = main.querySelector<HTMLElement>('#nw-hero-capture');
  if (heroCapture) {
    heroCapture.appendChild(capture({ source: 'landing-hero', cta: 'Get tomorrow’s brief' }));
  }

  // ── Live count from the ledger ──
  // Reads the real number rather than stating one. The eyebrow says something
  // deliberately unimpressive but true; the previous hero claimed "158
  // countries scored" against a real 85.
  const eyebrow = main.querySelector<HTMLElement>('#nw-hero-eyebrow');
  if (eyebrow) {
    void fetch('/api/calls/ledger')
      .then((r) => (r.ok ? (r.json() as Promise<{ counts?: { open?: number; resolved?: number } }>) : null))
      .then((d) => {
        const open = d?.counts?.open;
        const resolved = d?.counts?.resolved;
        if (typeof open !== 'number') return;
        eyebrow.textContent =
          typeof resolved === 'number' && resolved > 0
            ? `${open} calls open · ${resolved} resolved and scored`
            : `${open} calls open · the public forecasting ledger`;
      })
      .catch(() => {
        /* leave the static eyebrow — never invent a count */
      });
  }

  // ── Hero globe — lazy MapLibre on desktop, static fallback on mobile ──
  const heroGlobe = main.querySelector<HTMLElement>('#nw-hero-globe');
  if (heroGlobe) {
    if (isNarrow) {
      // Mobile: paint a stylized dark globe. Skip MapLibre entirely.
      heroGlobe.classList.add('nw-hero-globe-static');
    } else {
      // Desktop: dynamic-import MapLibre + boot a decorative globe in the
      // background. The headline paints first; the globe arrives 50–500ms later.
      // THE DECORATIVE GLOBE IS GONE. It lazy-loaded MapLibre — 1,047,879 bytes,
      // 78% of the built bundle — to spin a dark sphere behind the headline of a
      // product with no map, and pulled its stylesheet from
      // `unpkg.com/maplibre-gl@latest` (unpinned, third-party, executing on this
      // origin) plus tiles from CARTO on every homepage visit. Three findings in
      // one ornament: a supply-chain hole, the only CRITICAL in `npm audit`, and
      // three third-party recipients the privacy policy did not name. The static
      // CSS treatment below is what everyone saw first anyway.
      heroGlobe.classList.add('nw-hero-globe-static');
    }
  }

  // ── Hero headline dim after 2s so globe stays legible ──
  const heroContent = main.querySelector<HTMLElement>('#nw-hero-content');
  if (heroContent && !prefersReducedMotion) {
    setTimeout(() => heroContent.classList.add('is-dim'), 2400);
  }

  // ── Scroll-reveal sections ──
  const reveals = main.querySelectorAll<HTMLElement>('.nw-reveal');
  if (prefersReducedMotion) {
    reveals.forEach((el) => el.classList.add('is-revealed'));
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-revealed'));
  }

  // ── Newsletter form ──
  const form = main.querySelector<HTMLFormElement>('#nw-subscribe-form');
  const statusEl = main.querySelector<HTMLElement>('#nw-subscribe-status');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input[type=email]');
    const email = input?.value.trim() ?? '';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      if (statusEl) {
        statusEl.textContent = 'Enter a valid email.';
        statusEl.dataset.state = 'err';
      }
      return;
    }
    if (statusEl) {
      statusEl.textContent = 'Subscribing…';
      statusEl.dataset.state = '';
    }
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'landing-rebuild',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (statusEl) {
        if (data.success) {
          statusEl.textContent = "You're in. First brief tomorrow.";
          statusEl.dataset.state = 'ok';
          form.reset();
          trackEvent('brief_signup', { source: 'landing-rebuild' });
        } else {
          statusEl.textContent = data.error || "That didn't work — try again.";
          statusEl.dataset.state = 'err';
        }
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = 'Network error. Try again.';
        statusEl.dataset.state = 'err';
      }
    }
  });

  // ── Sample brief — pull today's brief if available ──
  const briefHeadline = main.querySelector<HTMLElement>('#nw-brief-headline');
  const briefExcerpt = main.querySelector<HTMLElement>('#nw-brief-excerpt');
  const briefDate = main.querySelector<HTMLElement>('#nw-brief-date');
  if (briefHeadline && briefExcerpt) {
    fetch('/api/v1/brief')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BriefResponse | null) => {
        if (!data) return;
        if (data.headline) briefHeadline.textContent = data.headline;
        if (data.summary) {
          // Strip markdown/HTML to plain text and trim to ~340 chars
          const text = stripToPlain(data.summary).slice(0, 340);
          briefExcerpt.textContent = text + (data.summary.length > 340 ? '…' : '');
        }
        if (data.date && briefDate) briefDate.textContent = formatBriefDate(data.date);
      })
      .catch(() => {
        // Fallback copy already present.
      });
  }

  // ── Referral capture (preserve from previous landing) ──
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if (refParam && /^[\w-]{1,128}$/.test(refParam)) {
    localStorage.setItem('nw-referral', refParam);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('ref');
    history.replaceState(null, '', cleanUrl.toString());
  }
}

// =============================================================================
// Helpers
// =============================================================================

function stripToPlain(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatBriefDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch {
    return iso;
  }
}
