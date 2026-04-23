// src/ui/welcomeModal.ts

interface FoundingStatus {
  claimed: number;
  remaining: number;
  isFull: boolean;
}

interface AuthMe {
  id: string;
  email: string;
  tier: string;
}

type WelcomeTier = 'insider' | 'analyst' | 'pro';

interface TierContent {
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  badge: string;
  headline: string;
  subheadline: string;
}

const TIER_CONTENT: Record<WelcomeTier, TierContent> = {
  insider: {
    badgeColor: '#22c55e',
    badgeBg: 'rgba(34,197,94,0.1)',
    badgeBorder: 'rgba(34,197,94,0.2)',
    badge: '● Founding Member',
    headline: "You're in. The map is yours.",
    subheadline: 'Lifetime rate locked. Founding cohort closes at 100.',
  },
  analyst: {
    badgeColor: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.1)',
    badgeBorder: 'rgba(59,130,246,0.2)',
    badge: '● Analyst Access Unlocked',
    headline: 'Intelligence, fully unlocked.',
    subheadline: 'Daily briefs, full AI analyst, watchlist alerts.',
  },
  pro: {
    badgeColor: '#a855f7',
    badgeBg: 'rgba(168,85,247,0.1)',
    badgeBorder: 'rgba(168,85,247,0.2)',
    badge: '● Pro Access Unlocked',
    headline: 'You have the full picture.',
    subheadline: 'API access, scenario simulation, unlimited everything.',
  },
};

export async function maybeShowWelcomeModal(tier: WelcomeTier): Promise<void> {
  if (localStorage.getItem('nw-onboarded')) return;

  const content = TIER_CONTENT[tier];
  if (!content) return;

  let userId = '';
  let memberNumber = '';

  const [meResult, statusResult] = await Promise.allSettled([
    fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json() as Promise<AuthMe>),
    tier === 'insider'
      ? fetch('/api/stripe/founding-status').then((r) => r.json() as Promise<FoundingStatus>)
      : Promise.resolve(null),
  ]);

  if (meResult.status === 'fulfilled' && meResult.value?.id) {
    userId = meResult.value.id;
  }

  if (
    tier === 'insider' &&
    statusResult.status === 'fulfilled' &&
    statusResult.value !== null &&
    (statusResult.value as FoundingStatus).claimed
  ) {
    memberNumber = ` #${(statusResult.value as FoundingStatus).claimed}`;
  }

  const badgeText = tier === 'insider' ? `${content.badge}${memberNumber}` : content.badge;
  const referralUrl = userId ? `nexuswatch.dev/?ref=${userId}` : '';

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to NexusWatch');

  overlay.innerHTML = `
    <div style="
      background:#0e0e0e;
      border:1px solid #2a2a2a;
      border-radius:8px;
      width:440px;
      max-width:calc(100vw - 32px);
      max-height:calc(100vh - 32px);
      overflow-y:auto;
      padding:28px 32px 32px;
      box-shadow:0 24px 64px rgba(0,0,0,0.8);
      font-family:'JetBrains Mono','Fira Code',monospace;
    ">
      <div style="
        display:inline-flex;align-items:center;gap:6px;
        font-size:10px;text-transform:uppercase;letter-spacing:2px;
        color:${content.badgeColor};
        background:${content.badgeBg};
        border:1px solid ${content.badgeBorder};
        border-radius:3px;padding:3px 8px;margin-bottom:14px;
      ">${badgeText}</div>

      <h2 style="font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin:0 0 6px;">${content.headline}</h2>
      <p style="font-size:12px;color:#666;margin:0 0 24px;line-height:1.5;">${content.subheadline}</p>

      <div id="nw-modal-steps" style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
        <div class="nw-modal-step" data-step="watchlist" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Add your first country to watchlist</strong>
            <span style="font-size:11px;color:#555;">Get alerts when CII moves or crises develop</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
        <div class="nw-modal-step" data-step="schedule" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Set your brief schedule</strong>
            <span style="font-size:11px;color:#555;">Daily or Mon / Wed / Fri delivery</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
        <div class="nw-modal-step" data-step="sitrep" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Run your first sitrep</strong>
            <span style="font-size:11px;color:#555;">Ask the AI analyst about any region right now</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #1a1a1a;margin:0 0 20px;">

      ${
        referralUrl
          ? `<div style="
          background:#0a0a0a;border:1px solid #1e1e1e;border-radius:5px;
          padding:12px 14px;margin-bottom:20px;
        ">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#444;margin-bottom:8px;">
            Your Founding Referral Link
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" id="nw-referral-input" readonly value="${referralUrl}" style="
              flex:1;background:#111;border:1px solid #222;border-radius:3px;
              color:#22c55e;font-family:inherit;font-size:11px;padding:6px 10px;
            ">
            <button id="nw-referral-copy" style="
              background:#1a1a1a;border:1px solid #333;color:#888;
              font-family:inherit;font-size:11px;padding:6px 10px;
              border-radius:3px;cursor:pointer;white-space:nowrap;
            ">Copy</button>
          </div>
          <div style="font-size:10px;color:#444;margin-top:6px;">
            Refer paying subscribers → earn free months (coming May 5)
          </div>
        </div>`
          : ''
      }

      <button id="nw-modal-cta" style="
        width:100%;background:#22c55e;color:#000;border:none;border-radius:4px;
        padding:12px;font-family:inherit;font-size:13px;font-weight:700;
        letter-spacing:1px;cursor:pointer;
      ">START EXPLORING →</button>
    </div>
  `;

  document.body.appendChild(overlay);

  function dismiss() {
    localStorage.setItem('nw-onboarded', '1');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    overlay.remove();
  }

  overlay.querySelector('#nw-modal-cta')?.addEventListener('click', dismiss);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dismiss();
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  overlay.querySelectorAll<HTMLElement>('.nw-modal-step').forEach((step) => {
    step.addEventListener('mouseenter', () => {
      step.style.borderColor = '#333';
    });
    step.addEventListener('mouseleave', () => {
      step.style.borderColor = '#222';
    });

    step.addEventListener('click', () => {
      const action = step.dataset.step;
      if (action === 'watchlist') {
        document.dispatchEvent(new CustomEvent('nw:open-watchlist'));
      } else if (action === 'schedule') {
        document.dispatchEvent(new CustomEvent('nw:open-preferences', { detail: { section: 'briefs' } }));
      } else if (action === 'sitrep') {
        dismiss();
        document.dispatchEvent(
          new CustomEvent('nw:open-ai-terminal', {
            detail: { prompt: 'Give me a sitrep on the region with the highest CII score right now' },
          }),
        );
      }
    });
  });

  const copyBtn = overlay.querySelector<HTMLButtonElement>('#nw-referral-copy');
  const referralInput = overlay.querySelector<HTMLInputElement>('#nw-referral-input');
  if (copyBtn && referralInput) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(referralInput.value);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      } catch {
        referralInput.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      }
    });
  }
}
