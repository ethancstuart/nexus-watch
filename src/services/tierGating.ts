/**
 * Tier Gating — 4-Tier Model
 *
 * Explorer ($0):  Globe, CII, brief 3x/week, 3 AI queries/day, 1 alert, 48hr timeline
 * Insider ($19):  Daily brief, full evidence chains, 10 AI/day, 3 alerts, 7-day timeline, email alerts
 * Analyst ($29):  Unlimited AI, scenarios 1/day, 30-day timeline, 5 alerts, no watermark
 * Pro ($99):      Portfolio, API, 90-day timeline, unlimited alerts/scenarios, export, crisis playbooks
 *
 * Annual: $199/yr, $299/yr, $999/yr
 */

import { getUser } from './auth.ts';
import { trackEvent } from './analytics.ts';

export type Feature =
  | 'cinema-mode' // Free (watermarked)
  | 'cinema-no-watermark' // Analyst+
  | 'daily-brief-view' // Free (3x/week), Insider+ (daily)
  | 'daily-brief-daily' // Insider+
  | 'cii' // Free
  | 'pdf-export' // Free
  | 'evidence-chains-full' // Insider+
  | 'nl-alerts-1' // Free (1 alert)
  | 'nl-alerts-3' // Insider (3 alerts)
  | 'nl-alerts-5' // Analyst (5 alerts)
  | 'nl-alerts-unlimited' // Pro
  | 'timeline-48hr' // Free
  | 'timeline-7day' // Insider
  | 'timeline-30day' // Analyst
  | 'timeline-90day' // Pro
  | 'email-alerts' // Insider+
  | 'scenario-1-day' // Analyst
  | 'scenario-unlimited' // Pro
  | 'api-keys' // Pro
  | 'personalized-brief' // Pro
  | 'data-export' // Pro
  | 'portfolio-exposure' // Pro
  | 'crisis-playbooks' // Pro
  | 'team-sharing'; // Pro (future)

export type TierLevel = 'free' | 'insider' | 'analyst' | 'pro';

const TIER_ACCESS: Record<TierLevel, Feature[]> = {
  free: ['cinema-mode', 'daily-brief-view', 'cii', 'pdf-export', 'nl-alerts-1', 'timeline-48hr'],
  insider: [
    'cinema-mode',
    'daily-brief-view',
    'daily-brief-daily',
    'cii',
    'pdf-export',
    'evidence-chains-full',
    'nl-alerts-1',
    'nl-alerts-3',
    'timeline-48hr',
    'timeline-7day',
    'email-alerts',
  ],
  analyst: [
    'cinema-mode',
    'cinema-no-watermark',
    'daily-brief-view',
    'daily-brief-daily',
    'cii',
    'pdf-export',
    'evidence-chains-full',
    'nl-alerts-1',
    'nl-alerts-3',
    'nl-alerts-5',
    'timeline-48hr',
    'timeline-7day',
    'timeline-30day',
    'email-alerts',
    'scenario-1-day',
  ],
  pro: [
    'cinema-mode',
    'cinema-no-watermark',
    'daily-brief-view',
    'daily-brief-daily',
    'cii',
    'pdf-export',
    'evidence-chains-full',
    'nl-alerts-1',
    'nl-alerts-3',
    'nl-alerts-5',
    'nl-alerts-unlimited',
    'timeline-48hr',
    'timeline-7day',
    'timeline-30day',
    'timeline-90day',
    'email-alerts',
    'scenario-1-day',
    'scenario-unlimited',
    'api-keys',
    'personalized-brief',
    'data-export',
    'portfolio-exposure',
    'crisis-playbooks',
    'team-sharing',
  ],
};

/** Tier display info for UI */
export const TIER_INFO: Record<TierLevel, { name: string; monthlyPrice: number; annualPrice: number }> = {
  free: { name: 'Explorer', monthlyPrice: 0, annualPrice: 0 },
  insider: { name: 'Insider', monthlyPrice: 19, annualPrice: 199 },
  analyst: { name: 'Analyst', monthlyPrice: 29, annualPrice: 299 },
  pro: { name: 'Pro', monthlyPrice: 99, annualPrice: 999 },
};

function getUserTierLevel(): TierLevel {
  const user = getUser();
  if (!user) return 'free';
  if (user.isAdmin) return 'pro';

  // Stripe webhook sets paidTier on checkout completion.
  if (user.paidTier === 'pro') return 'pro';
  if (user.paidTier === 'analyst') return 'analyst';
  if (user.paidTier === 'insider' || user.paidTier === 'founding') return 'insider';

  // Backward compat: legacy sessions with tier: 'premium' → pro
  if (user.tier === 'premium') return 'pro';
  return 'free';
}

export function canAccess(feature: Feature): boolean {
  const tier = getUserTierLevel();
  return TIER_ACCESS[tier].includes(feature);
}

export function getCurrentTier(): TierLevel {
  return getUserTierLevel();
}

export function getTierName(): string {
  const tier = getUserTierLevel();
  return TIER_INFO[tier].name.toUpperCase();
}

/** Get the minimum tier required for a feature */
export function requiredTier(feature: Feature): TierLevel {
  if (TIER_ACCESS.free.includes(feature)) return 'free';
  if (TIER_ACCESS.insider.includes(feature)) return 'insider';
  if (TIER_ACCESS.analyst.includes(feature)) return 'analyst';
  return 'pro';
}

/** Feature descriptions for the upgrade modal. */
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  'Portfolio Exposure':
    "Map your holdings to geopolitical risk scores. See which countries drive your portfolio's exposure.",
  'Scenario Simulation': 'Run "what if" scenarios. What happens to CII scores if the Strait of Hormuz closes?',
  'Daily Brief': 'Get intelligence delivered every morning at 7am local time, filtered to your interests.',
  'Evidence Chains': 'Full evidence chain for every CII score — sources, confidence, rule versions, data gaps.',
  'Extended Timeline': 'See up to 90 days of CII history. Scrub through time to watch crises unfold.',
  'Data Export': 'Download CII data, evidence chains, and portfolio exposure as CSV or JSON.',
  'Crisis Playbooks':
    "Auto-triggered analysis when a country's CII spikes. Historical precedents and monitoring priorities.",
  'Advanced Alerts': 'More composite alert rules with email, Slack, Discord, and Telegram delivery.',
  'Cinema (No Watermark)': 'Full-screen auto-rotating globe without the NexusWatch watermark.',
  'AI Analyst': 'More AI-powered queries with full source citations from evidence chains.',
  'Personalized Brief': 'Daily brief tailored to your watchlist, interests, and sector focus.',
  'API Access': 'REST API for CII scores, signals, scenarios, and evidence chains.',
};

export function showUpgradePrompt(featureName: string, targetTier: 'insider' | 'analyst' | 'pro' = 'insider'): void {
  // Remove any existing modal
  const existing = document.querySelector('.nw-upgrade-overlay');
  if (existing) existing.remove();

  const info = TIER_INFO[targetTier];
  const price = `$${info.monthlyPrice}/mo`;
  const tierLabel = `${info.name} Feature`;
  const description = FEATURE_DESCRIPTIONS[featureName] || `This feature requires NexusWatch ${info.name}.`;

  const overlay = document.createElement('div');
  overlay.className = 'nw-upgrade-overlay';
  overlay.innerHTML = `
    <div class="nw-upgrade-modal" role="dialog" aria-modal="true" aria-label="Upgrade to unlock ${featureName}">
      <div class="nw-upgrade-modal-header">
        <span class="nw-upgrade-modal-tier">${tierLabel}</span>
        <button class="nw-upgrade-modal-close" aria-label="Close">\u2715</button>
      </div>
      <div class="nw-upgrade-modal-body">
        <div class="nw-upgrade-modal-feature">${featureName}</div>
        <p class="nw-upgrade-modal-desc">${description}</p>
        <p class="nw-upgrade-modal-price">Requires NexusWatch ${info.name} \u2014 ${price} or $${info.annualPrice}/yr</p>
        <p class="nw-upgrade-modal-trial">14-day free trial, cancel anytime.</p>
        <div class="nw-upgrade-modal-actions">
          <button class="nw-upgrade-modal-cta">UPGRADE</button>
          <button class="nw-upgrade-modal-dismiss">Not now</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  trackEvent('upgrade_modal_shown', { feature: featureName, tier: targetTier });

  const close = () => {
    overlay.remove();
    trackEvent('upgrade_modal_dismiss', { feature: featureName, tier: targetTier });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.nw-upgrade-modal-close')!.addEventListener('click', close);
  overlay.querySelector('.nw-upgrade-modal-dismiss')!.addEventListener('click', close);

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeydown);
    }
  };
  document.addEventListener('keydown', onKeydown);

  // UPGRADE button — Stripe checkout
  const ctaBtn = overlay.querySelector('.nw-upgrade-modal-cta') as HTMLButtonElement;
  ctaBtn.addEventListener('click', async () => {
    ctaBtn.disabled = true;
    ctaBtn.textContent = 'LOADING...';
    trackEvent('upgrade_modal_click', { feature: featureName, tier: targetTier });
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: targetTier }),
      });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        ctaBtn.textContent = 'ERROR \u2014 TRY AGAIN';
        ctaBtn.disabled = false;
      }
    } catch {
      ctaBtn.textContent = 'ERROR \u2014 TRY AGAIN';
      ctaBtn.disabled = false;
    }
  });

  const modal = overlay.querySelector('.nw-upgrade-modal') as HTMLElement;
  modal.focus();
}

/** Check alert count limit for current tier */
export function getAlertLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro') return Infinity;
  if (tier === 'analyst') return 5;
  if (tier === 'insider') return 3;
  return 1;
}

/** Check timeline limit in hours for current tier */
export function getTimelineHoursLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro') return 90 * 24;
  if (tier === 'analyst') return 30 * 24;
  if (tier === 'insider') return 7 * 24;
  return 48;
}

/** Check AI query limit for current tier */
export function getAiQueryLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro' || tier === 'analyst') return Infinity;
  if (tier === 'insider') return 10;
  return 3;
}

/** Check compare country limit for current tier */
export function getCompareLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro' || tier === 'analyst') return 6;
  if (tier === 'insider') return 4;
  return 2;
}

/** Check saved views limit for current tier */
export function getSavedViewsLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro' || tier === 'analyst') return 10;
  if (tier === 'insider') return 5;
  return 2;
}

/** Check if Cinema Mode should show watermark */
export function shouldWatermarkCinema(): boolean {
  return !canAccess('cinema-no-watermark');
}

/** Check if daily brief should be available today (free = Mon/Wed/Fri only) */
export function isBriefAvailableToday(): boolean {
  if (canAccess('daily-brief-daily')) return true;
  const day = new Date().getUTCDay();
  return day === 1 || day === 3 || day === 5;
}
