/**
 * /cinematic — Cinematic landing experience.
 *
 * Full-bleed animated canvas globe (wireframe orthographic projection,
 * pure 2D — no three.js, no shader dependency) with pulsing markers at
 * the lat/lon of the 3 most recent active crises. Scroll-driven story
 * panels animate in, each tied to one crisis.
 *
 * Designed as the shareable design-splash route — the URL you send when
 * you want someone to *feel* the product, not navigate it. The existing
 * `/#/` landing stays the marketing conversion surface.
 */

import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { getMonitoredCountries, getCachedCII } from '../services/countryInstabilityIndex.ts';

interface Crisis {
  country_code: string;
  country_name: string;
  lat: number;
  lon: number;
  trigger_type: string;
  cii_score: number;
  cii_delta: number;
  notes: string | null;
  triggered_at: string;
}

export function renderCinematicPage(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.cinematic);
  root.innerHTML = '';
  root.className = 'nw-cinematic-page';
  injectStyles();

  const stage = createElement('div', { className: 'nw-cin-stage' });

  // Hero
  const hero = createElement('section', { className: 'nw-cin-hero' });
  hero.innerHTML = `
    <canvas class="nw-cin-canvas" aria-hidden="true"></canvas>
    <div class="nw-cin-scanline" aria-hidden="true"></div>
    <header class="nw-cin-hero-nav">
      <a href="#/" class="nw-cin-back">NexusWatch</a>
      <div class="nw-cin-hero-nav-links">
        <a href="#/intel">Intel</a>
        <a href="#/briefs">Briefs</a>
        <a href="#/what-if">What If</a>
        <a href="#/mcp">MCP</a>
      </div>
    </header>
    <div class="nw-cin-hero-copy">
      <div class="nw-cin-eyebrow">Live · Active Crises</div>
      <h1 class="nw-cin-h1">The world,<br/>as it moves.</h1>
      <p class="nw-cin-lede">
        Right now: <span class="nw-cin-crisis-count" data-count>—</span> active
        crisis triggers across <span class="nw-cin-country-count">158</span> countries.
        Every score traceable. Every signal sourced.
      </p>
      <div class="nw-cin-hero-actions">
        <a href="#/intel" class="nw-cin-btn nw-cin-btn-primary">Enter the map</a>
        <a href="#crisis-story" class="nw-cin-btn">Scroll the story</a>
      </div>
    </div>
    <div class="nw-cin-scroll-hint" aria-hidden="true">▼</div>
  `;
  stage.appendChild(hero);

  // Story container — populated after crisis fetch
  const story = createElement('section', { className: 'nw-cin-story' });
  story.id = 'crisis-story';
  story.innerHTML = `
    <header class="nw-cin-story-header">
      <div class="nw-cin-eyebrow">Three things, right now</div>
      <h2 class="nw-cin-h2">What the data is saying tonight.</h2>
    </header>
    <div class="nw-cin-cards" data-cards>
      <div class="nw-cin-loading">Pulling active crisis triggers…</div>
    </div>
  `;
  stage.appendChild(story);

  // Outro
  const outro = createElement('section', { className: 'nw-cin-outro' });
  outro.innerHTML = `
    <div class="nw-cin-outro-inner">
      <div class="nw-cin-eyebrow">Free, forever</div>
      <h2 class="nw-cin-h2">Built in the open.<br/>Yours to use.</h2>
      <p class="nw-cin-lede">
        No login wall, no per-seat license, no $50,000 contract. The globe, the briefs,
        the agent — all free. The source is on GitHub. The methodology is documented.
        The accuracy ledger is public.
      </p>
      <div class="nw-cin-hero-actions">
        <a href="#/intel" class="nw-cin-btn nw-cin-btn-primary">Open the platform</a>
        <a href="#/accuracy" class="nw-cin-btn">See the receipts</a>
      </div>
      <div class="nw-cin-credit">
        nexuswatch.dev · Built by one operator. Open source · MIT.
      </div>
    </div>
  `;
  stage.appendChild(outro);

  root.appendChild(stage);

  // ---- Boot the canvas globe ----
  const canvas = hero.querySelector<HTMLCanvasElement>('.nw-cin-canvas');
  const cardsMount = stage.querySelector<HTMLElement>('[data-cards]');
  const countEl = stage.querySelector<HTMLElement>('[data-count]');

  if (canvas) bootGlobe(canvas, []);

  // ---- Load crises and re-render dependent UI ----
  void loadCrises().then((crises) => {
    if (countEl) countEl.textContent = String(crises.length);
    if (canvas) bootGlobe(canvas, crises); // restart with crisis markers
    if (cardsMount) renderCards(cardsMount, crises);
  });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadCrises(): Promise<Crisis[]> {
  const monitored = getMonitoredCountries();
  const cii = getCachedCII();
  const coords = new Map(monitored.map((c) => [c.code, { lat: c.lat, lon: c.lon, name: c.name }]));

  try {
    const res = await fetch('/api/crisis/active');
    if (res.ok) {
      const data = (await res.json()) as {
        triggers?: Array<{
          country_code: string;
          trigger_type: string;
          cii_score: number;
          cii_delta: number;
          notes: string | null;
          triggered_at: string;
        }>;
      };
      const triggers = Array.isArray(data.triggers) ? data.triggers : [];
      const enriched = triggers
        .map((t): Crisis | null => {
          const meta = coords.get(t.country_code);
          if (!meta) return null;
          return {
            country_code: t.country_code,
            country_name: meta.name,
            lat: meta.lat,
            lon: meta.lon,
            trigger_type: t.trigger_type,
            cii_score: t.cii_score,
            cii_delta: t.cii_delta,
            notes: t.notes,
            triggered_at: t.triggered_at,
          };
        })
        .filter((c): c is Crisis => c !== null)
        .slice(0, 3);
      if (enriched.length > 0) return enriched;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: top 3 CII countries from the cached snapshot
  return cii
    .slice(0, 3)
    .map((s): Crisis | null => {
      const meta = coords.get(s.countryCode);
      if (!meta) return null;
      return {
        country_code: s.countryCode,
        country_name: s.countryName,
        lat: meta.lat,
        lon: meta.lon,
        trigger_type: 'high_cii',
        cii_score: s.score,
        cii_delta: 0,
        notes: s.topSignals?.[0] ?? 'Top CII country in the current snapshot.',
        triggered_at: new Date().toISOString(),
      };
    })
    .filter((c): c is Crisis => c !== null);
}

// ---------------------------------------------------------------------------
// Story cards
// ---------------------------------------------------------------------------

function renderCards(mount: HTMLElement, crises: Crisis[]): void {
  if (crises.length === 0) {
    mount.innerHTML = `<div class="nw-cin-loading">No active crisis triggers — that's the rarest signal of all.</div>`;
    return;
  }
  mount.innerHTML = crises
    .map(
      (c, i) => `
        <article class="nw-cin-card" style="--i:${i}">
          <div class="nw-cin-card-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="nw-cin-card-body">
            <div class="nw-cin-card-meta">
              <span class="nw-cin-card-code">${c.country_code}</span>
              <span class="nw-cin-card-trigger">${c.trigger_type.replace(/_/g, ' ')}</span>
            </div>
            <h3 class="nw-cin-card-name">${escapeHtml(c.country_name)}</h3>
            <div class="nw-cin-card-stats">
              <div><span class="nw-cin-card-stat-val">${c.cii_score.toFixed(1)}</span><span class="nw-cin-card-stat-label">CII</span></div>
              ${
                c.cii_delta
                  ? `<div><span class="nw-cin-card-stat-val ${c.cii_delta >= 0 ? 'pos' : 'neg'}">${c.cii_delta >= 0 ? '+' : ''}${c.cii_delta.toFixed(1)}</span><span class="nw-cin-card-stat-label">7d Δ</span></div>`
                  : ''
              }
              <div><span class="nw-cin-card-stat-val">${relativeTime(c.triggered_at)}</span><span class="nw-cin-card-stat-label">triggered</span></div>
            </div>
            ${c.notes ? `<p class="nw-cin-card-notes">${escapeHtml(c.notes)}</p>` : ''}
            <div class="nw-cin-card-actions">
              <a href="#/live-brief/${c.country_code}" class="nw-cin-card-link">▸ Live agent brief</a>
              <a href="#/brief-country/${c.country_code}" class="nw-cin-card-link">Static brief</a>
            </div>
          </div>
        </article>
      `,
    )
    .join('');

  // Reveal-on-scroll animation
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).classList.add('is-visible');
          observer.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 },
  );
  mount.querySelectorAll('.nw-cin-card').forEach((c) => observer.observe(c));
}

// ---------------------------------------------------------------------------
// Canvas globe — orthographic 2D wireframe with crisis markers
// ---------------------------------------------------------------------------

interface GlobeMarker {
  lat: number;
  lon: number;
  intensity: number;
}

function bootGlobe(canvas: HTMLCanvasElement, crises: Crisis[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const markers: GlobeMarker[] = crises.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    intensity: Math.min(1, Math.max(0.4, c.cii_score / 100)),
  }));

  // Stop any prior animation loop on this element
  const prior = (canvas as unknown as { __nwStop?: () => void }).__nwStop;
  if (prior) prior();

  let rafId = 0;
  let rotation = 0;
  let lastT = performance.now();
  let phase = 0;

  function size(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener('resize', size);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw(t: number): void {
    if (!ctx) return;
    const dt = (t - lastT) / 1000;
    lastT = t;
    if (!reduceMotion) rotation += dt * 0.08; // radians/sec — gentle
    phase += dt;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2 + Math.min(w, h) * 0.02;
    const r = Math.min(w, h) * 0.38;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, Math.max(w, h));
    bg.addColorStop(0, 'rgba(255, 102, 0, 0.05)');
    bg.addColorStop(0.4, 'rgba(20, 10, 0, 0.5)');
    bg.addColorStop(1, '#050505');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Latitude lines
    ctx.lineWidth = 1;
    for (let lat = -75; lat <= 75; lat += 15) {
      ctx.strokeStyle = `rgba(255, 102, 0, ${lat === 0 ? 0.25 : 0.08})`;
      drawLatCircle(ctx, cx, cy, r, lat);
    }
    // Longitude lines
    for (let lon = 0; lon < 360; lon += 15) {
      ctx.strokeStyle = `rgba(255, 102, 0, ${lon % 90 === 0 ? 0.22 : 0.07})`;
      drawLonCircle(ctx, cx, cy, r, lon, rotation);
    }

    // Globe outline
    ctx.strokeStyle = 'rgba(255, 102, 0, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Markers
    for (const m of markers) {
      const p = project(m.lat, m.lon, rotation, cx, cy, r);
      if (!p.visible) continue;
      const pulse = 0.65 + 0.35 * Math.sin(phase * 3 + m.lon * 0.05);
      const alpha = m.intensity * pulse;

      // Halo
      ctx.fillStyle = `rgba(255, 102, 0, ${alpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 + 4 * pulse, 0, Math.PI * 2);
      ctx.fill();
      // Core
      ctx.fillStyle = `rgba(255, 102, 0, ${Math.min(1, alpha + 0.3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reduceMotion) rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  (canvas as unknown as { __nwStop?: () => void }).__nwStop = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', size);
  };
}

function project(
  lat: number,
  lon: number,
  rotation: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number; visible: boolean } {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180 + rotation;
  const x = cx + r * Math.cos(phi) * Math.sin(lambda);
  const y = cy - r * Math.sin(phi);
  const z = Math.cos(phi) * Math.cos(lambda);
  return { x, y, visible: z > -0.05 };
}

function drawLatCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lat: number): void {
  const phi = (lat * Math.PI) / 180;
  const ry = Math.abs(r * Math.sin(Math.PI / 2 - phi));
  const offsetY = -r * Math.sin(phi);
  ctx.beginPath();
  ctx.ellipse(cx, cy + offsetY, r * Math.cos(phi), Math.max(0.5, ry * 0.04), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLonCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  lon: number,
  rotation: number,
): void {
  const lambda = (lon * Math.PI) / 180 + rotation;
  const widthScale = Math.abs(Math.sin(lambda));
  if (widthScale < 0.05) return;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * widthScale, r, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-cinematic-page {
      background: #050505;
      color: #f0f0f0;
      min-height: 100vh;
      overflow-x: hidden;
    }
    .nw-cin-stage { position: relative; }

    /* ---- Hero ---- */
    .nw-cin-hero {
      position: relative;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 1.5rem 6vw 4rem;
      isolation: isolate;
      overflow: hidden;
    }
    .nw-cin-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    .nw-cin-scanline {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        180deg,
        transparent 0,
        transparent 2px,
        rgba(255, 102, 0, 0.03) 3px,
        transparent 4px
      );
      z-index: 1;
      pointer-events: none;
      mix-blend-mode: screen;
    }

    .nw-cin-hero-nav {
      position: absolute;
      top: 1.5rem;
      left: 6vw;
      right: 6vw;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 3;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      letter-spacing: 0.1em;
    }
    .nw-cin-back {
      color: #ff6600;
      text-decoration: none;
      font-weight: 600;
    }
    .nw-cin-back::before { content: '● '; }
    .nw-cin-hero-nav-links a {
      color: rgba(240, 240, 240, 0.7);
      text-decoration: none;
      margin-left: 1.5rem;
    }
    .nw-cin-hero-nav-links a:hover { color: #ff6600; }

    .nw-cin-hero-copy {
      position: relative;
      z-index: 2;
      max-width: 720px;
      margin-top: 4rem;
    }
    .nw-cin-eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #ff6600;
      margin-bottom: 1.25rem;
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border: 1px solid rgba(255, 102, 0, 0.4);
      border-radius: 1px;
      background: rgba(255, 102, 0, 0.05);
    }
    .nw-cin-h1 {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(3rem, 10vw, 7.5rem);
      line-height: 0.92;
      letter-spacing: -0.025em;
      margin: 0 0 1.5rem;
      color: #f6f6f6;
    }
    .nw-cin-lede {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(1.1rem, 2vw, 1.4rem);
      line-height: 1.55;
      max-width: 56ch;
      color: rgba(240, 240, 240, 0.78);
      margin: 0 0 2rem;
    }
    .nw-cin-crisis-count, .nw-cin-country-count {
      font-family: 'JetBrains Mono', monospace;
      color: #ff6600;
      font-weight: 700;
    }

    .nw-cin-hero-actions {
      display: flex;
      gap: 0.85rem;
      flex-wrap: wrap;
    }
    .nw-cin-btn {
      display: inline-block;
      padding: 0.85rem 1.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: none;
      color: #f0f0f0;
      border: 1px solid rgba(255, 102, 0, 0.4);
      border-radius: 1px;
      transition: all 0.18s;
      background: rgba(255, 102, 0, 0.04);
    }
    .nw-cin-btn:hover {
      border-color: #ff6600;
      background: rgba(255, 102, 0, 0.12);
    }
    .nw-cin-btn-primary {
      background: #ff6600;
      color: #050505;
      border-color: #ff6600;
      font-weight: 700;
    }
    .nw-cin-btn-primary:hover {
      background: #ff7d22;
      border-color: #ff7d22;
    }

    .nw-cin-scroll-hint {
      position: absolute;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 102, 0, 0.5);
      font-size: 0.9rem;
      z-index: 3;
      animation: nw-cin-bounce 2s ease-in-out infinite;
    }
    @keyframes nw-cin-bounce {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50%      { transform: translateX(-50%) translateY(8px); }
    }

    /* ---- Story ---- */
    .nw-cin-story {
      padding: 8rem 6vw 6rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .nw-cin-story-header {
      margin-bottom: 4rem;
      text-align: center;
    }
    .nw-cin-h2 {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2rem, 5vw, 3.5rem);
      line-height: 1;
      letter-spacing: -0.02em;
      margin: 1rem 0 0;
      color: #f6f6f6;
    }

    .nw-cin-cards {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
    @media (min-width: 900px) {
      .nw-cin-cards { grid-template-columns: repeat(3, 1fr); }
    }
    .nw-cin-card {
      background: rgba(15, 15, 15, 0.85);
      border: 1px solid rgba(42, 42, 42, 0.95);
      border-left: 2px solid #ff6600;
      padding: 1.6rem;
      transform: translateY(40px);
      opacity: 0;
      transition: transform 0.7s cubic-bezier(.16,.84,.44,1), opacity 0.7s;
      transition-delay: calc(var(--i, 0) * 0.12s);
    }
    .nw-cin-card.is-visible {
      transform: translateY(0);
      opacity: 1;
    }
    .nw-cin-card-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      color: rgba(255, 102, 0, 0.7);
      margin-bottom: 0.85rem;
    }
    .nw-cin-card-meta {
      display: flex;
      gap: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(240, 240, 240, 0.55);
      margin-bottom: 0.5rem;
    }
    .nw-cin-card-code {
      color: #ff6600;
    }
    .nw-cin-card-name {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.7rem;
      letter-spacing: -0.01em;
      margin: 0 0 1rem;
      color: #f6f6f6;
    }
    .nw-cin-card-stats {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(42, 42, 42, 0.9);
    }
    .nw-cin-card-stats > div { display: flex; flex-direction: column; }
    .nw-cin-card-stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.4rem;
      font-weight: 700;
      color: #f6f6f6;
      line-height: 1;
    }
    .nw-cin-card-stat-val.pos { color: #dc2626; }
    .nw-cin-card-stat-val.neg { color: #22c55e; }
    .nw-cin-card-stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(240, 240, 240, 0.4);
      margin-top: 0.25rem;
    }
    .nw-cin-card-notes {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 0.95rem;
      line-height: 1.55;
      color: rgba(240, 240, 240, 0.7);
      margin: 0 0 1rem;
    }
    .nw-cin-card-actions {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .nw-cin-card-link {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      color: #ff6600;
      text-decoration: none;
    }
    .nw-cin-card-link:hover { text-decoration: underline; }

    .nw-cin-loading {
      grid-column: 1 / -1;
      padding: 3rem;
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      color: rgba(240, 240, 240, 0.5);
    }

    /* ---- Outro ---- */
    .nw-cin-outro {
      padding: 8rem 6vw 5rem;
      border-top: 1px solid rgba(42, 42, 42, 0.6);
      background:
        radial-gradient(ellipse at center top, rgba(255, 102, 0, 0.06), transparent 60%),
        #050505;
    }
    .nw-cin-outro-inner {
      max-width: 720px;
      margin: 0 auto;
      text-align: center;
    }
    .nw-cin-outro .nw-cin-h2 { margin-bottom: 1.5rem; }
    .nw-cin-outro .nw-cin-hero-actions { justify-content: center; margin-top: 2rem; }
    .nw-cin-credit {
      margin-top: 3rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      color: rgba(240, 240, 240, 0.35);
    }

    @media (max-width: 720px) {
      .nw-cin-hero { padding: 1rem 4vw 3rem; }
      .nw-cin-hero-copy { margin-top: 6rem; }
      .nw-cin-story, .nw-cin-outro { padding: 4rem 5vw; }
      .nw-cin-card-stats { gap: 1rem; }
    }
  `;
  document.head.appendChild(style);
}
