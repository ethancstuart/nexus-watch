/**
 * Pre-Checkout Login Modal.
 *
 * Shows a branded modal explaining why the user needs to sign in
 * before starting a trial. Replaces the jarring raw redirect to
 * Google OAuth that gave no context.
 *
 * Usage: showLoginModal('analyst', '/api/auth/google?return=...')
 */

import { createElement } from '../utils/dom.ts';

export function showLoginModal(tier: string, returnUrl: string): void {
  // Remove any existing modal
  document.querySelector('.nw-login-modal-overlay')?.remove();

  const overlay = createElement('div', { className: 'nw-login-modal-overlay' });
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;animation:nw-fade-in 0.2s ease;';

  const tierLabel =
    tier === 'founding' ? 'Founding Member ($19/mo lifetime)' : tier === 'pro' ? 'Pro ($99/mo)' : 'Analyst ($29/mo)';

  const modal = createElement('div', { className: 'nw-login-modal' });
  modal.style.cssText =
    'background:var(--nw-surface,#111);border:1px solid var(--nw-border,#222);border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center;';

  modal.innerHTML = `
    <h2 style="font-family:var(--nw-font-display,Inter,sans-serif);font-size:20px;font-weight:700;color:var(--nw-text,#ededed);margin:0 0 8px;">Sign in to start your trial</h2>
    <p style="font-family:var(--nw-font-body,Inter,sans-serif);font-size:14px;color:var(--nw-text-secondary,#999);margin:0 0 24px;line-height:1.5;">
      <strong style="color:var(--nw-accent,#ff6600);">${tierLabel}</strong><br>
      No credit card required. 14-day full refund if not useful.
    </p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
      <button class="nw-login-google" style="padding:12px;background:var(--nw-accent,#ff6600);color:#000;border:none;border-radius:8px;font-family:var(--nw-font-body,Inter,sans-serif);font-size:14px;font-weight:700;cursor:pointer;">Sign in with Google</button>
      <button class="nw-login-github" style="padding:12px;background:transparent;color:var(--nw-text-secondary,#999);border:1px solid var(--nw-border,#222);border-radius:8px;font-family:var(--nw-font-body,Inter,sans-serif);font-size:14px;font-weight:500;cursor:pointer;">Sign in with GitHub</button>
    </div>
    <button class="nw-login-cancel" style="background:none;border:none;color:var(--nw-text-muted,#666);font-family:var(--nw-font-body,Inter,sans-serif);font-size:13px;cursor:pointer;">Back to pricing</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Wire buttons
  modal.querySelector('.nw-login-google')?.addEventListener('click', () => {
    overlay.remove();
    window.location.href = `/api/auth/google?return=${encodeURIComponent(returnUrl)}`;
  });

  modal.querySelector('.nw-login-github')?.addEventListener('click', () => {
    overlay.remove();
    window.location.href = `/api/auth/github?return=${encodeURIComponent(returnUrl)}`;
  });

  modal.querySelector('.nw-login-cancel')?.addEventListener('click', () => {
    overlay.remove();
  });

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onEscape);
    }
  };
  document.addEventListener('keydown', onEscape);
}
