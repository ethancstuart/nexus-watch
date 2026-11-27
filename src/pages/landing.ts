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
// Fixed words only; never the correction data, which must not enter the bundle.
import { correctionAdded, isIsoDate } from '../../api/_lib/correction-words.ts';
// Words only: every figure comes from /api/calls/ledger at load time.
import { frontDoorVerdict, figuresFromLedgerJson, type Verdict } from '../../api/_lib/verdict-words.ts';

/**
 * Whether /corrections is live, which it is while any correction note is
 * approved. This page cannot read the corrections data (it must not reach the
 * browser bundle), so it states the fact rather than checking it, and
 * api/ledger-verdict.test.ts fails if /corrections stops being live. If every
 * note is ever withdrawn, set this to false. /ledger checks for itself.
 */
const CORRECTIONS_PAGE_LIVE = true;

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
  /** Present only when an approved correction note sits beside this brief (api/v1/brief.ts). */
  correction?: { correctedOn?: unknown };
}

interface CalibrationBinJson {
  from: number;
  to: number;
  count: number;
  meanPredicted: number;
  observed: number;
}

/**
 * The CURRENCY calls' calibration table from /api/calls/ledger, or nothing.
 * Never the pooled `scoring.calibration`: it mixes currencies with censorship,
 * the pooling the ledger refuses for its scores. A bin with any field that is
 * not a finite number means the whole table is not drawn.
 */
function fxCalibration(d: unknown): CalibrationBinJson[] {
  const bins = (d as { by_kind?: { fx_devaluation?: { calibration?: unknown } } } | null)?.by_kind?.fx_devaluation
    ?.calibration;
  if (!Array.isArray(bins)) return [];
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const ok = bins.every(
    (b) =>
      b !== null &&
      typeof b === 'object' &&
      ['from', 'to', 'count', 'meanPredicted', 'observed'].every((k) => finite((b as Record<string, unknown>)[k])),
  );
  return ok ? (bins as CalibrationBinJson[]) : [];
}

/**
 * The verdict, drawn as text: the dateline in bold, then the body, then the
 * corrections sentence around its one link. Nothing here is parsed as HTML.
 */
function renderVerdict(root: HTMLElement, v: Verdict | null): void {
  const el = root.querySelector<HTMLElement>('#nw-hero-verdict');
  if (!el || !v) return;
  el.textContent = '';
  const dateline = document.createElement('strong');
  dateline.textContent = v.dateline;
  el.append(dateline, ` ${v.body}`);
  if (v.corrections) {
    const a = document.createElement('a');
    a.href = v.corrections.href;
    a.textContent = v.corrections.link;
    el.append(` ${v.corrections.before}`, a, v.corrections.after);
  }
  el.hidden = false;
}

/**
 * The calibration figure: what we said, against what happened.
 *
 * One row per probability band — the band, two bars on a shared 0–100% scale,
 * the mean probability we assigned, the share that actually happened, and the
 * sample size. Both bars are labelled with their own number, so no reader is
 * asked to judge a length against an unstated axis.
 *
 * It renders only from live data. If the fetch fails, or the ledger has no
 * calibration yet, the figure stays hidden rather than showing a placeholder.
 * An invented record is the one thing this page must never display.
 *
 * A thin band is marked thin. Eight calls that missed all eight is a true fact
 * about a tiny sample, and printing "12%" beside "n=8" without comment would
 * be the flattering kind of honesty.
 *
 * No colour carries meaning here: the two bars differ in fill, not hue, so the
 * figure reads identically in greyscale and to a dichromat.
 */
function renderCalibrationFigure(root: HTMLElement, bins: CalibrationBinJson[]): void {
  const fig = root.querySelector<HTMLElement>('#nw-hero-figure');
  const rows = root.querySelector<HTMLElement>('#nw-figure-rows');
  if (!fig || !rows || bins.length === 0) return;

  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  rows.textContent = '';
  for (const b of bins) {
    const thin = b.count < 20;
    const row = document.createElement('div');
    row.className = 'nw-figure-row';
    const band = document.createElement('span');
    band.className = 'nw-figure-band';
    band.textContent = `${pct(b.from)}\u2013${pct(b.to)}`;
    const bars = document.createElement('span');
    bars.className = 'nw-figure-bars';
    const said = document.createElement('span');
    said.className = 'nw-figure-bar nw-figure-bar--said';
    said.style.width = `${(b.meanPredicted * 100).toFixed(1)}%`;
    const happened = document.createElement('span');
    happened.className = 'nw-figure-bar nw-figure-bar--happened';
    happened.style.width = `${(b.observed * 100).toFixed(1)}%`;
    bars.append(said, happened);
    const saidLabel = document.createElement('span');
    saidLabel.className = 'nw-figure-said';
    saidLabel.textContent = `said ${pct(b.meanPredicted)}`;
    const happenedLabel = document.createElement('span');
    happenedLabel.className = 'nw-figure-happened';
    happenedLabel.textContent = `happened ${pct(b.observed)}`;
    const n = document.createElement('span');
    n.className = 'nw-figure-n';
    n.textContent = `n=${b.count}${thin ? ' \u00b7 thin' : ''}`;
    row.append(band, bars, saidLabel, happenedLabel, n);
    rows.appendChild(row);
  }
  fig.hidden = false;
}

export function renderLanding(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.landing);
  root.textContent = '';

  // Reduced motion + viewport-based decisions.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Top-level <main> opts into the marketing surface (Source Serif, generous
  // rhythm). Adding nw-landing-surface on top scopes our overrides.
  const main = createElement('main', { className: 'marketing-surface nw-landing-surface' });
  main.id = 'main-content';
  main.setAttribute('role', 'main');

  main.innerHTML = `
    <nav class="nw-nav" aria-label="Primary">
      <a href="#/" class="nw-nav-brand"><span class="nw-nav-mark">●</span>&nbsp;NexusWatch</a>
      <div class="nw-nav-links">
        <a href="/ledger">The Ledger</a>
        <a href="#/briefs">Briefs</a>
        <a href="#/about">About</a>
      </div>
    </nav>

    <section class="nw-hero" aria-label="Hero">
      <!-- THE VERDICT IS THE HERO (R1, "the open forecast record"). First a
           plain, dated statement of what the record shows, then the currency
           calls' said-against-happened table. The table used to come first,
           pooled across currencies and censorship, under "The world, graded."
           The pooling is what /ledger refuses for its scores, and the headline
           implied a record of world events in general. Both are drawn from
           /api/calls/ledger at load, or not at all: never from a placeholder.
           /ledger carries the same verdict in its server-rendered HTML. -->
      <div class="nw-hero-content" id="nw-hero-content">
        <span class="nw-eyebrow" id="nw-hero-eyebrow">The public forecasting ledger</span>
        <h1 class="nw-hero-headline word-stagger" aria-label="Our forecasts, graded.">
          <span>Our</span> <span>forecasts,</span> <span>graded<span class="nw-hero-period">.</span></span>
        </h1>
        <p class="nw-hero-sub" id="nw-hero-verdict" hidden></p>
        <figure class="nw-hero-figure" id="nw-hero-figure" hidden>
          <figcaption class="nw-figure-caption">
            <span class="nw-figure-title">Said, against happened</span>
            <span class="nw-figure-note">Currency forecasts only, grouped by the probability we gave them. Closer is better: a perfectly calibrated forecaster’s two numbers match.</span>
          </figcaption>
          <div class="nw-figure-rows" id="nw-figure-rows"></div>
        </figure>
        <p class="nw-hero-sub">
          Every call we make is dated, falsifiable, and scored against someone else's data —
          published whether it flatters us or not.
        </p>
        <div id="nw-hero-capture"></div>
        <p class="nw-hero-fineprint">
          <a href="/ledger">See every call we have open &rarr;</a> &middot; free, no account
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

    <section class="nw-reveal" aria-label="Newsletter" id="subscribe">
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
          <a href="/ledger">The Ledger</a>
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

  // ── The verdict and the currency table, from the ledger ──
  // Reads the real figures rather than stating any: the date, the counts and
  // the currency skill are the ledger's own (api/_lib/verdict-words.ts words
  // them, and api/ledger-verdict.test.ts proves the sentence is the one /ledger
  // prints for the same book). A failed or malformed read draws nothing. The
  // eyebrow used to carry the counts; the verdict carries them now.
  void fetch('/api/calls/ledger')
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
    .then((d) => {
      const figures = figuresFromLedgerJson(d, CORRECTIONS_PAGE_LIVE);
      renderVerdict(main, figures ? frontDoorVerdict(figures) : null);
      renderCalibrationFigure(main, fxCalibration(d));
    })
    .catch(() => {
      /* draw nothing — never invent a figure */
    });

  // The hero globe block lived here. It set a "static fallback" class on a
  // div that no longer exists; the figure above replaced it.

  // The hero used to dim itself to 55% after 2.4 s so a globe behind it stayed
  // legible. The globe is gone; the fade only took the sign-up button below
  // AA contrast. The hero now stays at full strength.

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

  // ── Arriving to subscribe ──
  // Every SUBSCRIBE link elsewhere on the site points here, at `/#subscribe`.
  // They used to point at our `brief.` subdomain, a CNAME to beehiiv that
  // answered HTTP 403 when checked on 2026-11-22: a refusal, not a sign-up
  // form. This page is drawn after load, so the browser's own jump to the
  // fragment finds nothing to jump to: make it here, once the section exists.
  if (window.location.hash === '#subscribe') {
    const signup = main.querySelector<HTMLElement>('#subscribe');
    signup?.classList.add('is-revealed');
    signup?.scrollIntoView({ block: 'start' });
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
        // The latest brief may carry an approved correction (22 Nov could).
        // Say so on its own line under the meta row, in that row's style; the
        // excerpt itself is the brief's text, unchanged.
        const correctedOn = data.correction?.correctedOn;
        const meta = main.querySelector<HTMLElement>('.nw-brief-meta');
        if (meta && isIsoDate(correctedOn)) {
          const mark = document.createElement('div');
          mark.className = 'nw-brief-meta nw-brief-corrected';
          mark.textContent = correctionAdded(correctedOn);
          meta.after(mark);
        }
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
