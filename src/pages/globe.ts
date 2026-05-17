/**
 * /#/globe — Time-Machine WebGL Globe.
 *
 * three.js earth scene with atmospheric Fresnel glow, day/night terminator
 * (sun vector derived from timeCursor), cloud layer, pulsing crisis
 * markers, top-CII dots, and a draggable time scrubber.
 *
 * Lazy-loads three.js — keeps the main bundle clean.
 *
 * 2026-05 tier-up Phase 5.
 */

import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { getCachedCII, getMonitoredCountries } from '../services/countryInstabilityIndex.ts';
import { TimeScrubber } from '../globe/timeScrubber.ts';
import type { GlobeMarker } from '../globe/scene.ts';

export async function renderGlobePage(root: HTMLElement): Promise<void> {
  setPageSeo(PAGE_SEO.globe);
  root.innerHTML = '';
  root.className = 'nw-globe-page';
  injectStyles();

  // Mobile gate — globe perf is bad on cores < 4
  const tooWeak = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency < 4;
  if (tooWeak) {
    root.innerHTML = `
      <main class="nw-globe-fallback">
        <div class="nw-globe-eyebrow">Time-Machine Globe</div>
        <h1>Best on a real keyboard.</h1>
        <p>This view runs a custom WebGL scene with atmospheric scattering and
        live marker animations. Your device reports fewer than 4 logical cores —
        we'd rather send you somewhere that works well than ship you a slideshow.</p>
        <a class="nw-globe-btn" href="#/intel">↳ Open the Intel Map instead</a>
      </main>
    `;
    return;
  }

  const stage = createElement('div', { className: 'nw-globe-stage' });

  // Hero text overlay
  const hud = createElement('div', { className: 'nw-globe-hud' });
  hud.innerHTML = `
    <nav class="nw-globe-nav" aria-label="Primary">
      <a href="#/" class="nw-globe-brand">●&nbsp;NexusWatch</a>
      <div class="nw-globe-nav-links">
        <a href="#/intel">Intel</a>
        <a href="#/briefs">Briefs</a>
        <a href="#/what-if">What If</a>
        <a href="#/lab">Data Lab</a>
        <a href="#/audio">FM</a>
        <a href="#/mcp">MCP</a>
      </div>
    </nav>
    <header class="nw-globe-header">
      <div class="nw-globe-eyebrow">Time-Machine Globe</div>
      <h1 class="nw-globe-title">The world,<br/>scrubbable.</h1>
      <p class="nw-globe-blurb">
        WebGL Earth with atmospheric Fresnel glow, NASA cloud layer, day/night terminator
        driven by the time cursor. Drag to rotate. Wheel to zoom. Scrub the bar at the bottom
        to move through time.
      </p>
    </header>
  `;
  stage.appendChild(hud);

  // Canvas mount
  const canvasMount = createElement('div', { className: 'nw-globe-canvas' });
  stage.appendChild(canvasMount);

  // Scrubber
  const scrubberMount = createElement('div', { className: 'nw-globe-scrubber-wrap' });
  stage.appendChild(scrubberMount);

  root.appendChild(stage);

  // Build markers from cached CII + live crises
  const markers = await buildMarkers();

  // Lazy import three.js scene
  try {
    const { GlobeScene } = await import('../globe/scene.ts');
    const scene = new GlobeScene({ container: canvasMount, hoverHost: stage, markers });
    scene.start();
  } catch (e) {
    canvasMount.innerHTML = `<div class="nw-globe-error">Globe failed to load: ${e instanceof Error ? e.message : String(e)}</div>`;
  }

  // Mount scrubber (writes to timeCursor)
  new TimeScrubber(scrubberMount, { initialRange: '7d', syncUrl: true });
}

async function buildMarkers(): Promise<GlobeMarker[]> {
  const monitored = getMonitoredCountries();
  const coords = new Map(monitored.map((c) => [c.code, { lat: c.lat, lon: c.lon }]));

  // Start from top-25 CII
  const cii = getCachedCII().slice(0, 25);
  const markers: GlobeMarker[] = [];
  for (const s of cii) {
    const c = coords.get(s.countryCode);
    if (!c) continue;
    markers.push({
      lat: c.lat,
      lon: c.lon,
      intensity: Math.min(1, s.score / 100),
      label: `${s.countryName} · CII ${s.score}`,
      href: `/live-brief/${s.countryCode}`,
    });
  }

  // Overlay active crisis triggers as pulsing markers
  try {
    const res = await fetch('/api/crisis/active');
    if (res.ok) {
      const data = (await res.json()) as {
        triggers?: Array<{ country_code: string; cii_score: number; trigger_type: string; notes?: string | null }>;
      };
      for (const t of data.triggers ?? []) {
        const c = coords.get(t.country_code);
        if (!c) continue;
        const monitoredName = monitored.find((m) => m.code === t.country_code)?.name ?? t.country_code;
        markers.push({
          lat: c.lat,
          lon: c.lon,
          intensity: 1,
          pulse: true,
          label: `${monitoredName} · crisis trigger: ${t.trigger_type.replace(/_/g, ' ')}`,
          href: `/live-brief/${t.country_code}?council=1`,
        });
      }
    }
  } catch {
    /* fall through */
  }

  return markers;
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-globe-page {
      background: #050505;
      color: #f0f0f0;
      min-height: 100vh;
      overflow: hidden;
    }
    .nw-globe-stage {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    .nw-globe-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .nw-globe-canvas canvas { display: block; }

    .nw-globe-hud {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }
    .nw-globe-hud * { pointer-events: auto; }

    .nw-globe-nav {
      position: absolute;
      top: 1.5rem;
      left: 1.5rem;
      right: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
    }
    .nw-globe-brand { color: #ff6600; text-decoration: none; font-weight: 700; }
    .nw-globe-nav-links a {
      color: rgba(240, 240, 240, 0.7);
      text-decoration: none;
      margin-left: 1.25rem;
    }
    .nw-globe-nav-links a:hover { color: #ff6600; }

    .nw-globe-header {
      position: absolute;
      bottom: 8.5rem;
      left: 2rem;
      max-width: 480px;
    }
    .nw-globe-eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #ff6600;
      padding: 0.2rem 0.6rem;
      border: 1px solid rgba(255, 102, 0, 0.4);
      border-radius: 1px;
      background: rgba(255, 102, 0, 0.06);
      display: inline-block;
      margin-bottom: 1rem;
    }
    .nw-globe-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2.4rem, 6vw, 4.2rem);
      line-height: 0.95;
      letter-spacing: -0.02em;
      margin: 0 0 1rem;
      color: #f8f8f8;
    }
    .nw-globe-blurb {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1rem;
      line-height: 1.55;
      color: rgba(240, 240, 240, 0.78);
      margin: 0;
    }

    .nw-globe-scrubber-wrap {
      position: absolute;
      left: 50%;
      bottom: 1.5rem;
      transform: translateX(-50%);
      width: min(720px, calc(100% - 3rem));
      z-index: 3;
    }

    .nw-globe-error {
      position: absolute;
      inset: 0;
      display: grid; place-items: center;
      color: #dc2626;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Hover tooltip for markers (mounted into the stage by GlobeScene) */
    .nw-globe-tooltip {
      position: absolute;
      pointer-events: none;
      background: rgba(10, 10, 10, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 102, 0, 0.55);
      border-left-width: 2px;
      padding: 0.45rem 0.7rem;
      border-radius: 3px;
      max-width: 280px;
      z-index: 10;
      font-family: 'JetBrains Mono', monospace;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      animation: nw-tooltip-in 0.12s ease-out;
    }
    @keyframes nw-tooltip-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .nw-globe-tooltip-label {
      font-size: 0.78rem;
      color: #f4f4f4;
      letter-spacing: 0.01em;
    }
    .nw-globe-tooltip-hint {
      margin-top: 0.25rem;
      font-size: 0.65rem;
      color: #ff6600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .nw-globe-fallback {
      max-width: 640px;
      margin: 0 auto;
      padding: 6rem 1.5rem;
      text-align: center;
    }
    .nw-globe-fallback h1 {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 2rem;
      margin: 1rem 0;
      color: #f8f8f8;
    }
    .nw-globe-fallback p {
      color: rgba(240,240,240,0.75);
      line-height: 1.55;
    }
    .nw-globe-btn {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #ff6600;
      color: #050505;
      text-decoration: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      letter-spacing: 0.05em;
      border-radius: 2px;
      font-weight: 700;
    }

    /* TimeScrubber styles */
    .nw-scrub {
      background: rgba(10, 10, 10, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(42, 42, 42, 0.95);
      border-radius: 6px;
      padding: 0.8rem 1rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .nw-scrub-top {
      display: flex; align-items: center; gap: 0.75rem;
      font-size: 0.7rem;
      margin-bottom: 0.6rem;
    }
    .nw-scrub-eyebrow {
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #ff6600;
      font-weight: 600;
    }
    .nw-scrub-range-badge {
      padding: 0.1rem 0.4rem;
      background: rgba(255,102,0,0.12);
      border: 1px solid rgba(255,102,0,0.4);
      color: #ff6600;
      border-radius: 2px;
      font-size: 0.65rem;
    }
    .nw-scrub-label {
      margin-left: auto;
      color: #f6f6f6;
      font-variant-numeric: tabular-nums;
      font-size: 0.78rem;
    }
    .nw-scrub-live {
      background: rgba(255,102,0,0.15);
      border: 1px solid rgba(255,102,0,0.45);
      color: #ff6600;
      padding: 0.25rem 0.6rem;
      font-family: inherit;
      font-size: 0.65rem;
      letter-spacing: 0.08em;
      border-radius: 2px;
      cursor: pointer;
    }
    .nw-scrub-live[aria-pressed="true"] {
      background: #ff6600;
      color: #050505;
      font-weight: 700;
    }
    .nw-scrub-row {
      display: flex; align-items: center; gap: 0.5rem;
    }
    .nw-scrub-range {
      background: rgba(20,20,20,0.8);
      border: 1px solid rgba(42,42,42,0.95);
      color: rgba(240,240,240,0.6);
      padding: 0.3rem 0.55rem;
      font-family: inherit;
      font-size: 0.65rem;
      border-radius: 2px;
      cursor: pointer;
    }
    .nw-scrub-range[aria-pressed="true"] {
      background: #ff6600;
      color: #050505;
      border-color: #ff6600;
      font-weight: 700;
    }
    .nw-scrub-slider {
      flex: 1;
      accent-color: #ff6600;
      cursor: pointer;
    }

    @media (max-width: 720px) {
      .nw-globe-header { left: 1rem; right: 1rem; bottom: 11rem; }
      .nw-globe-title { font-size: 2rem; }
      .nw-globe-blurb { font-size: 0.9rem; }
      .nw-globe-nav-links a { margin-left: 0.85rem; }
      .nw-scrub-row { flex-wrap: wrap; }
      .nw-scrub-slider { flex-basis: 100%; order: 99; margin-top: 0.5rem; }
    }
  `;
  document.head.appendChild(style);
}
