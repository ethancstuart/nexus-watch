import { createElement } from '../utils/dom.ts';
import { identifyRegion, haversineKm } from '../utils/geo.ts';
import { getIntelItems } from '../services/geoIntelligence.ts';
import { getAutoAlerts } from '../services/aiMonitor.ts';
import { getTensionState, tensionLabel } from '../services/tensionIndex.ts';
import type { CinemaProfile } from './profiles.ts';

// Static reference facts for thin-data regions
const REGION_FACTS: Record<string, string> = {
  'MIDDLE EAST / PERSIAN GULF': 'The Persian Gulf handles approximately 21% of global oil transit daily.',
  'EASTERN EUROPE / UKRAINE THEATER': 'The Ukraine conflict zone spans over 1,000km of active frontlines.',
  'EASTERN MEDITERRANEAN': 'The Eastern Mediterranean is a nexus of energy disputes and maritime boundaries.',
  'HORN OF AFRICA': 'The Horn of Africa hosts critical Red Sea shipping lanes and displacement corridors.',
  'SAHEL REGION': 'The Sahel faces expanding insurgency across six countries with 4M+ displaced.',
  'SOUTH CHINA SEA': 'The South China Sea carries $3.4 trillion in trade annually.',
  'TAIWAN STRAIT': 'The Taiwan Strait is one of the world\'s most sensitive military flashpoints.',
  'KOREAN PENINSULA': 'The Korean DMZ is the most heavily fortified border in the world.',
  'SOUTHEAST ASIA': 'Southeast Asia hosts key manufacturing hubs and maritime chokepoints.',
  'WEST AFRICA': 'West Africa is experiencing rising maritime piracy and Sahel spillover.',
  'CENTRAL AFRICA / GREAT LAKES': 'The Great Lakes region hosts multiple overlapping displacement crises.',
  'CARIBBEAN / CENTRAL AMERICA': 'The Caribbean corridor is a major drug transit and migration route.',
};

const TYPEWRITER_SPEED = 20; // ms per character
const NARRATION_HOLD = 6000; // ms to show narration after typing completes
const AI_RATE_LIMIT = 30_000; // 30 seconds between AI calls

export class NarrationOverlay {
  private container: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private profile: CinemaProfile;
  private active = false;
  private typewriterInterval: ReturnType<typeof setInterval> | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private focusHandler: ((e: Event) => void) | null = null;
  private lastAiCall = 0;

  constructor(profile: CinemaProfile) {
    this.profile = profile;
  }

  start(): void {
    this.active = true;

    this.container = createElement('div', { className: 'cinema-narration' });
    this.headerEl = createElement('div', { className: 'cinema-narration-header', textContent: 'INTEL BRIEF' });
    this.bodyEl = createElement('div', { className: 'cinema-narration-body' });
    this.container.appendChild(this.headerEl);
    this.container.appendChild(this.bodyEl);
    document.body.appendChild(this.container);

    // Listen for camera focus changes
    this.focusHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) this.onFocusChange(detail);
    };
    document.addEventListener('cinema:focus-change', this.focusHandler);
  }

  stop(): void {
    this.active = false;
    this.clearTimers();
    if (this.focusHandler) {
      document.removeEventListener('cinema:focus-change', this.focusHandler);
      this.focusHandler = null;
    }
    this.container?.remove();
    this.container = null;
  }

  setProfile(profile: CinemaProfile): void {
    this.profile = profile;
  }

  private clearTimers(): void {
    if (this.typewriterInterval) clearInterval(this.typewriterInterval);
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.typewriterInterval = null;
    this.hideTimeout = null;
  }

  private onFocusChange(detail: { lat: number; lng: number; label: string; source: string; priority?: number }): void {
    if (!this.active) return;

    const narration = this.buildLocalNarration(detail);
    this.showNarration(detail.label, narration);

    // Try AI enhancement for critical events
    if (detail.priority === 0 && Date.now() - this.lastAiCall > AI_RATE_LIMIT) {
      this.enhanceWithAI(detail, narration);
    }
  }

  private buildLocalNarration(detail: { lat: number; lng: number; label: string }): string {
    const parts: string[] = [];

    // Region identification
    const region = identifyRegion(detail.lat, detail.lng);

    // Main event description
    parts.push(`Breaking: ${detail.label}.`);

    // Nearby events cross-reference
    const intelItems = getIntelItems();
    const autoAlerts = getAutoAlerts();

    const nearbyIntel = intelItems.filter(
      (item) => item.lat && item.lon && haversineKm(detail.lat, detail.lng, item.lat, item.lon) < 500,
    );
    const nearbyAlerts = autoAlerts.filter(
      (alert) =>
        'lat' in alert && 'lon' in alert && haversineKm(detail.lat, detail.lng, alert.lat as number, alert.lon as number) < 500,
    );

    const relatedCount = nearbyIntel.length + nearbyAlerts.length;
    if (relatedCount > 1) {
      parts.push(`NexusWatch is tracking ${relatedCount} related events within a 500km radius.`);
    }

    // Region reference fact (for thin data)
    if (region && REGION_FACTS[region] && relatedCount <= 1) {
      parts.push(REGION_FACTS[region]);
    } else if (region) {
      parts.push(`Monitoring the ${region} theater.`);
    }

    // Tension context
    const tension = getTensionState();
    if (tension.global >= 60) {
      parts.push(`Global tension is ${tensionLabel(tension.global).toLowerCase()} at ${tension.global}.`);
    }

    return parts.join(' ');
  }

  private showNarration(header: string, text: string): void {
    if (!this.container || !this.headerEl || !this.bodyEl) return;

    this.clearTimers();

    // Update header with location context
    const region = header.length > 40 ? header.slice(0, 40) + '...' : header;
    this.headerEl.textContent = `INTEL BRIEF — ${region}`;

    // Clear body and start typewriter
    this.bodyEl.textContent = '';
    this.container.classList.add('visible');

    let charIndex = 0;
    const cursor = createElement('span', { className: 'cinema-narration-cursor' });
    this.bodyEl.appendChild(cursor);

    this.typewriterInterval = setInterval(() => {
      if (!this.bodyEl || charIndex >= text.length) {
        if (this.typewriterInterval) clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
        cursor.remove();

        // Hide after hold duration
        this.hideTimeout = setTimeout(() => {
          this.container?.classList.remove('visible');
        }, NARRATION_HOLD);
        return;
      }

      cursor.before(document.createTextNode(text[charIndex]));
      charIndex++;
    }, TYPEWRITER_SPEED);
  }

  private async enhanceWithAI(
    detail: { lat: number; lng: number; label: string },
    localNarration: string,
  ): Promise<void> {
    this.lastAiCall = Date.now();
    const region = identifyRegion(detail.lat, detail.lng);

    try {
      const res = await fetch('/api/cinema-narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: region || 'Unknown region',
          eventLabel: detail.label,
          profileFocus: this.profile.narrationFocus,
          tensionIndex: getTensionState().global,
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as { narration?: string };
      if (data.narration && this.active) {
        // Replace with AI narration
        this.showNarration(detail.label, data.narration);
      }
    } catch {
      // Fallback: local narration already shown
      void localNarration;
    }
  }
}
