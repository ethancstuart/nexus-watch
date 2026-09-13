/**
 * Lightweight per-page SEO helper.
 *
 * Updates <title>, <meta name="description">, <link rel="canonical">,
 * Open Graph + Twitter Card meta tags on route changes. Runs entirely
 * client-side because NexusWatch is a hash-based SPA — search engines
 * see the index.html defaults; this exists for share-link unfurls in
 * apps that execute JS (Slack desktop, iMessage previews) and for the
 * local dev / human user.
 *
 * For SEO that matters to crawlers, the server-rendered shells under
 * /api/brief/og and /api/country/[code] already set proper meta tags
 * and JSON-LD via the Vercel rewrite. This helper is the SPA mirror.
 */

const BASE_URL = 'https://nexuswatch.dev';
const DEFAULT_OG = `${BASE_URL}/api/og?type=site`;

export interface PageSeo {
  /** Page name without site suffix. Final title becomes "X · NexusWatch". */
  title: string;
  /** 140-160 char description, ending with "Free." for marketing pages. */
  description: string;
  /** Path WITHOUT origin, e.g. "/about" or "/brief/2026-04-27". */
  canonicalPath: string;
  /** Full OG image URL (defaults to /api/og?type=site). */
  ogImage?: string;
  /** og:type, defaults to "website". Set "article" for briefs. */
  ogType?: 'website' | 'article';
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function setPageSeo(seo: PageSeo): void {
  const fullTitle = seo.title.endsWith('NexusWatch') ? seo.title : `${seo.title} · NexusWatch`;
  document.title = fullTitle;

  const canonical = seo.canonicalPath.startsWith('http')
    ? seo.canonicalPath
    : `${BASE_URL}${seo.canonicalPath.startsWith('/') ? '' : '/'}${seo.canonicalPath}`;
  const image = seo.ogImage || DEFAULT_OG;
  const ogType = seo.ogType || 'website';

  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setLink('canonical', canonical);

  // Open Graph
  setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  setMeta('meta[property="og:image"]', 'property', 'og:image', image);
  setMeta('meta[property="og:type"]', 'property', 'og:type', ogType);

  // Twitter
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
}

/**
 * Inject a JSON-LD structured-data block. Pass a unique id so re-renders
 * replace the previous block instead of accumulating.
 */
export function setJsonLd(id: string, data: Record<string, unknown>): void {
  const existing = document.head.querySelector<HTMLScriptElement>(
    `script[type="application/ld+json"][data-seo="${id}"]`,
  );
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-seo', id);
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export const PAGE_SEO = {
  landing: {
    title: 'The Register',
    description:
      'A public register of dated forecasts, each resolved by an outside source on a date fixed in advance. The record is published whether it flatters us or not. Open-source. Free.',
    canonicalPath: '/',
  },
  about: {
    title: 'About',
    description:
      'Who runs NexusWatch, what it forecasts, and why the whole record — including the wrong calls — is public. Open-source. Free.',
    canonicalPath: '/about',
  },
  whyFree: {
    title: 'Why Free',
    description:
      'Why NexusWatch is free: what it costs to run, what the open-source licence means, and why a register nobody pays for is easier to trust. Free.',
    canonicalPath: '/why-free',
  },
  briefs: {
    title: 'Daily Briefs',
    description:
      'A short brief every morning, written from the day\u2019s collected data and checked against it, with the ledger\u2019s standing on every issue. Free to read.',
    canonicalPath: '/briefs',
  },
  faq: {
    title: 'FAQ',
    description:
      'Common questions: what a call is, how it resolves, which sources the register reads, and why it is free.',
    canonicalPath: '/faq',
  },
  methodology: {
    title: 'Methodology',
    description:
      'How NexusWatch computes the Country Instability Index, weighting, evidence chains, confidence scoring, and source provenance. Free.',
    canonicalPath: '/methodology',
  },
  accuracy: {
    title: 'The Ledger',
    description:
      'Every call NexusWatch makes, resolved against an external source on a date fixed in advance — with the score published whether it flatters us or not.',
    canonicalPath: '/ledger',
  },
  ledger: {
    title: 'The Ledger',
    description:
      'Every call NexusWatch makes, resolved against an external source on a date fixed in advance — with the score published whether it flatters us or not.',
    canonicalPath: '/ledger',
  },
  roadmap: {
    title: 'Roadmap',
    description:
      'What NexusWatch is shipping next — data layers, AI features, and intelligence systems on the public roadmap. Free.',
    canonicalPath: '/roadmap',
  },
  terms: {
    title: 'Terms of Service',
    description:
      'Terms of Service for NexusWatch — usage policies, attribution requirements, and the open-source commitment. Free.',
    canonicalPath: '/terms',
  },
  privacy: {
    title: 'Privacy Policy',
    description:
      'How NexusWatch handles user data — local-first storage, optional cross-device sync, and what we never collect. Free.',
    canonicalPath: '/privacy',
  },
  apidocs: {
    title: 'Public API v2',
    description:
      'NexusWatch Intelligence API v2 — verified geopolitical data with source attribution, confidence scores, and methodology metadata. Free.',
    canonicalPath: '/api',
  },
  mcp: {
    title: 'MCP Server for AI Agents',
    description:
      'Connect Claude Code, Cursor, or any MCP client to NexusWatch. 9 geopolitical intelligence tools — country risk, scenarios, portfolio exposure. No auth. Free.',
    canonicalPath: '/mcp',
  },
  status: {
    title: 'Data Health',
    description:
      'Live health for every source the register reads: seven upstreams, circuit-breaker state and last-success time for each. Free.',
    canonicalPath: '/status',
  },
  // ---------------------------------------------------------------------------
  // Routes intentionally without entries:
  //
  //   /welcome          — legacy onboarding URL, redirects to /settings
  //   /settings         — account settings, requires login, noindex by intent
  //   /admin/*          — admin tooling (social-queue, marketing), private
  //   /entities/:id     — dynamic detail; uses entities entry as base then
  //                       overrides via setPageSeo() per entity at render time
  //   /audit/:country   — dynamic detail; uses audit entry as base
  //   /brief/:date      — dynamic brief detail; sets canonical per brief
  //
  // These either don't need SEO (private) or override the base entry at
  // render time with the dynamic resource's title/description.
  // ---------------------------------------------------------------------------
} as const satisfies Record<string, PageSeo>;
