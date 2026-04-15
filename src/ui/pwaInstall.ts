/**
 * PWA Install Prompt
 *
 * Captures the beforeinstallprompt event, shows a friendly install
 * banner, and lets the user install NexusWatch as a standalone app.
 *
 * Only shows when:
 * 1. Browser supports installation
 * 2. Not already installed (display-mode: standalone)
 * 3. User hasn't dismissed recently (7-day cooldown)
 */

const DISMISS_KEY = 'nw:pwa-install-dismissed';
const DISMISS_COOLDOWN_MS = 7 * 86400000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let bannerEl: HTMLElement | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* quota — non-fatal */
  }
}

function showBanner(): void {
  if (bannerEl) return;
  if (isStandalone() || wasRecentlyDismissed()) return;

  bannerEl = document.createElement('div');
  bannerEl.className = 'nw-pwa-banner';
  bannerEl.innerHTML = `
    <div class="nw-pwa-banner-content">
      <div class="nw-pwa-banner-icon">◆</div>
      <div class="nw-pwa-banner-text">
        <div class="nw-pwa-banner-title">Install NexusWatch</div>
        <div class="nw-pwa-banner-subtitle">Get faster access + offline brief archive.</div>
      </div>
      <div class="nw-pwa-banner-actions">
        <button class="nw-pwa-install">Install</button>
        <button class="nw-pwa-dismiss" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `;

  const installBtn = bannerEl.querySelector('.nw-pwa-install') as HTMLButtonElement;
  const dismissBtn = bannerEl.querySelector('.nw-pwa-dismiss') as HTMLButtonElement;

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        hideBanner();
      } else {
        markDismissed();
        hideBanner();
      }
      deferredPrompt = null;
    } catch {
      markDismissed();
      hideBanner();
    }
  });

  dismissBtn.addEventListener('click', () => {
    markDismissed();
    hideBanner();
  });

  document.body.appendChild(bannerEl);
}

function hideBanner(): void {
  bannerEl?.remove();
  bannerEl = null;
}

export function registerPwaInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    // Delay 15 seconds so we don't assault a brand-new visitor
    setTimeout(() => showBanner(), 15000);
  });

  window.addEventListener('appinstalled', () => {
    hideBanner();
    deferredPrompt = null;
  });
}
