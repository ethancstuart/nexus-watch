/**
 * Tier Gating
 *
 * Controls which features are available based on user tier.
 * Free tier gets core features. Pro unlocks advanced.
 */

import { getUser } from './auth.ts';

export type Feature =
  | 'cinema-mode'
  | 'nl-alerts'
  | 'timeline'
  | 'pdf-export'
  | 'email-alerts'
  | 'api-keys'
  | 'unlimited-alerts'
  | 'daily-brief';

const FREE_FEATURES: Feature[] = [
  'cinema-mode',     // Cinema mode is free (it's the demo hook)
  'daily-brief',     // Daily brief viewable by all
];

/** All features available to Pro subscribers */
export const PRO_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  'nl-alerts',
  'timeline',
  'pdf-export',
  'email-alerts',
  'api-keys',
  'unlimited-alerts',
];

export function canAccess(feature: Feature): boolean {
  const user = getUser();
  if (!user) return FREE_FEATURES.includes(feature);
  if (user.isAdmin || user.tier === 'premium') return true;
  return FREE_FEATURES.includes(feature);
}

export function requiresPro(feature: Feature): boolean {
  return !FREE_FEATURES.includes(feature);
}

export function showUpgradePrompt(featureName: string): void {
  const existing = document.querySelector('.nw-upgrade-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'nw-upgrade-toast';
  toast.innerHTML = `
    <span class="nw-upgrade-toast-text">
      <strong>${featureName}</strong> requires NexusWatch Pro — $99/mo
    </span>
    <button class="nw-upgrade-toast-btn" onclick="fetch('/api/stripe/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json()).then(d=>{if(d.url)window.location.href=d.url})">
      UPGRADE
    </button>
    <button class="nw-upgrade-toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}
