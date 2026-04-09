/**
 * Tier Gating — 3-Tier Model
 *
 * Free ($0):     Cinema (watermarked), brief 3x/week, CII, 1 NL alert, 48hr timeline, PDF export
 * Analyst ($29): Daily brief, 5 NL alerts, 7-day timeline, email alerts
 * Pro ($99):     Unlimited alerts, 90-day timeline, API, personalized brief, no watermark
 */

import { getUser } from './auth.ts';

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
  // Map UserTier to our 3-tier model
  // 'premium' from Stripe = 'pro', 'analyst' tier needs to be added to Stripe
  if (user.tier === 'premium') return 'pro';
  // Check for analyst tier in user metadata (future: separate Stripe price)
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

export function showUpgradePrompt(featureName: string, targetTier: 'analyst' | 'pro' = 'analyst'): void {
  const existing = document.querySelector('.nw-upgrade-toast');
  if (existing) existing.remove();

  const price = targetTier === 'pro' ? '$99/mo' : '$29/mo';
  const tierName = targetTier === 'pro' ? 'Pro' : 'Analyst';

  const toast = document.createElement('div');
  toast.className = 'nw-upgrade-toast';
  toast.innerHTML = `
    <span class="nw-upgrade-toast-text">
      <strong>${featureName}</strong> requires NexusWatch ${tierName} — ${price}
    </span>
    <button class="nw-upgrade-toast-btn" onclick="fetch('/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json()).then(d=>{if(d.url)window.location.href=d.url})">
      UPGRADE
    </button>
    <button class="nw-upgrade-toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
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
