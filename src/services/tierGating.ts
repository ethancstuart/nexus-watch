/**
 * Tier Gating — 3-Tier Model
 *
 * Free ($0):     Cinema (watermarked), brief 3x/week, CII, 1 NL alert, 48hr timeline, PDF export
 * Analyst ($29): Daily brief, 5 NL alerts, 7-day timeline, email alerts
 * Pro ($99):     Unlimited alerts, 90-day timeline, API, personalized brief, no watermark
 */

import { getUser } from './auth.ts';
import { trackEvent } from './analytics.ts';

export type Feature =
  | 'cinema-mode' // Free (watermarked)
  | 'cinema-no-watermark' // Pro
  | 'daily-brief-view' // Free (3x/week), Analyst+ (daily)
  | 'daily-brief-daily' // Analyst+
  | 'cii' // Free
  | 'pdf-export' // Free
  | 'nl-alerts-1' // Free (1 alert)
  | 'nl-alerts-5' // Analyst (5 alerts)
  | 'nl-alerts-unlimited' // Pro
  | 'timeline-48hr' // Free
  | 'timeline-7day' // Analyst
  | 'timeline-90day' // Pro
  | 'email-alerts' // Analyst+
  | 'api-keys' // Pro
  | 'personalized-brief' // Pro
  | 'team-sharing'; // Pro (future)

type TierLevel = 'free' | 'analyst' | 'pro';

const TIER_ACCESS: Record<TierLevel, Feature[]> = {
  free: ['cinema-mode', 'daily-brief-view', 'cii', 'pdf-export', 'nl-alerts-1', 'timeline-48hr'],
  analyst: [
    'cinema-mode',
    'daily-brief-view',
    'daily-brief-daily',
    'cii',
    'pdf-export',
    'nl-alerts-1',
    'nl-alerts-5',
    'timeline-48hr',
    'timeline-7day',
    'email-alerts',
  ],
  pro: [
    'cinema-mode',
    'cinema-no-watermark',
    'daily-brief-view',
    'daily-brief-daily',
    'cii',
    'pdf-export',
    'nl-alerts-1',
    'nl-alerts-5',
    'nl-alerts-unlimited',
    'timeline-48hr',
    'timeline-7day',
    'timeline-90day',
    'email-alerts',
    'api-keys',
    'personalized-brief',
    'team-sharing',
  ],
};

function getUserTierLevel(): TierLevel {
  const user = getUser();
  if (!user) return 'free';
  if (user.isAdmin) return 'pro';

  // Prefer granular paidTier (set by Stripe webhook on successful checkout).
  // Founding tier is a discounted Analyst seat — grants the Analyst feature set
  // at a locked $19/mo price that never increases.
  if (user.paidTier === 'pro') return 'pro';
  if (user.paidTier === 'analyst' || user.paidTier === 'founding') return 'analyst';

  // Backward compat: legacy sessions that only have `tier: 'premium'` without
  // the new paidTier field are grandfathered as 'pro' (the pre-A.2 behavior).
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
  const user = getUser();
  // Founding members get a distinct display label even though they share the
  // Analyst access tier — they bought into the founding cohort.
  if (user?.paidTier === 'founding') return 'FOUNDING';
  const tier = getUserTierLevel();
  if (tier === 'pro') return 'PRO';
  if (tier === 'analyst') return 'ANALYST';
  return 'FREE';
}

/** Get the minimum tier required for a feature */
export function requiredTier(feature: Feature): TierLevel {
  if (TIER_ACCESS.free.includes(feature)) return 'free';
  if (TIER_ACCESS.analyst.includes(feature)) return 'analyst';
  return 'pro';
}

/** Feature descriptions for the upgrade modal. */
const FEATURE_DESCRIPTIONS: Record<string, string> = {
  'Portfolio Exposure':
    "Map your holdings to geopolitical risk scores. See which countries drive your portfolio's exposure.",
  'Scenario Simulation': 'Run "what if" scenarios. What happens to CII scores if the Strait of Hormuz closes?',
  'Daily Brief': 'Get intelligence delivered every morning at 7am local time, filtered to your interests.',
  'Extended Timeline': 'See 30\u201390 days of CII history. Scrub through time to watch crises unfold.',
  'Data Export': 'Download CII data, evidence chains, and portfolio exposure as CSV or JSON.',
  'Crisis Playbooks':
    "Auto-triggered analysis when a country's CII spikes. Historical precedents and monitoring priorities.",
  'Advanced Alerts': 'Up to unlimited composite alert rules with email, Slack, Discord, and Telegram delivery.',
  'Cinema (No Watermark)': 'Full-screen auto-rotating globe without the NexusWatch watermark.',
  'AI Analyst': 'Unlimited AI-powered queries with full source citations from evidence chains.',
  'Personalized Brief': 'Daily brief tailored to your watchlist, interests, and sector focus.',
  'API Access': 'REST API for CII scores, signals, scenarios, and evidence chains.',
};

export function showUpgradePrompt(featureName: string, targetTier: 'analyst' | 'pro' = 'analyst'): void {
  // Remove any existing modal
  const existing = document.querySelector('.nw-upgrade-overlay');
  if (existing) existing.remove();

  const price = targetTier === 'pro' ? '$99/mo' : '$29/mo';
  const tierLabel = targetTier === 'pro' ? 'Pro Feature' : 'Analyst Feature';
  const description =
    FEATURE_DESCRIPTIONS[featureName] ||
    `This feature requires NexusWatch ${targetTier === 'pro' ? 'Pro' : 'Analyst'}.`;

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
        <p class="nw-upgrade-modal-price">Requires NexusWatch ${targetTier === 'pro' ? 'Pro' : 'Analyst'} \u2014 ${price}</p>
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

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Close on X button
  overlay.querySelector('.nw-upgrade-modal-close')!.addEventListener('click', close);

  // Close on "Not now"
  overlay.querySelector('.nw-upgrade-modal-dismiss')!.addEventListener('click', close);

  // Close on Escape
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeydown);
    }
  };
  document.addEventListener('keydown', onKeydown);

  // UPGRADE button — proper Stripe checkout
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
        ctaBtn.textContent = 'ERROR — TRY AGAIN';
        ctaBtn.disabled = false;
      }
    } catch {
      ctaBtn.textContent = 'ERROR — TRY AGAIN';
      ctaBtn.disabled = false;
    }
  });

  // Focus trap — focus the modal on open
  const modal = overlay.querySelector('.nw-upgrade-modal') as HTMLElement;
  modal.focus();
}

/** Check alert count limit for current tier */
export function getAlertLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro') return Infinity;
  if (tier === 'analyst') return 5;
  return 1;
}

/** Check timeline limit in hours for current tier */
export function getTimelineHoursLimit(): number {
  const tier = getUserTierLevel();
  if (tier === 'pro') return 90 * 24; // 90 days
  if (tier === 'analyst') return 7 * 24; // 7 days
  return 48; // 48 hours
}

/** Check if Cinema Mode should show watermark */
export function shouldWatermarkCinema(): boolean {
  return !canAccess('cinema-no-watermark');
}

/** Check if daily brief should be available today (free = Mon/Wed/Fri only) */
export function isBriefAvailableToday(): boolean {
  if (canAccess('daily-brief-daily')) return true;
  const day = new Date().getUTCDay(); // 0=Sun, 1=Mon, ...
  return day === 1 || day === 3 || day === 5; // Mon, Wed, Fri
}
