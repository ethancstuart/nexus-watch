// src/ui/welcomeModal.ts

interface FoundingStatus {
  claimed: number;
  active: number;
  remaining: number;
  isFull: boolean;
}

interface AuthMe {
  id: string;
  email: string;
  tier: string;
}

type WelcomeTier = 'insider' | 'analyst' | 'pro';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* no-op in private mode */ }
}

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
  if (lsGet('nw-onboarded')) return;

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
    typeof (statusResult.value as FoundingStatus).active === 'number'
  ) {
    const activeCount = (statusResult.value as FoundingStatus).active;
    if (activeCount > 0) memberNumber = ` #${activeCount}`;
  }

  const badgeText = tier === 'insider' ? `${content.badge}${memberNumber}` : content.badge;
  const referralUrl = userId ? `https://nexuswatch.dev/?ref=${encodeURIComponent(userId)}` : '';

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to NexusWatch');

  const modal = document.createElement('div');
  modal.style.cssText =
    'background:#0e0e0e;border:1px solid #2a2a2a;border-radius:8px;width:440px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow-y:auto;padding:28px 32px 32px;box-shadow:0 24px 64px rgba(0,0,0,0.8);font-family:"JetBrains Mono","Fira Code",monospace;';

  const badge = document.createElement('div');
  badge.style.cssText = `display:inline-flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${content.badgeColor};background:${content.badgeBg};border:1px solid ${content.badgeBorder};border-radius:3px;padding:3px 8px;margin-bottom:14px;`;
  badge.textContent = badgeText;
  modal.appendChild(badge);

  const headline = document.createElement('h2');
  headline.style.cssText = 'font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin:0 0 6px;';
  headline.textContent = content.headline;
  modal.appendChild(headline);

  const subheadline = document.createElement('p');
  subheadline.style.cssText = 'font-size:12px;color:#666;margin:0 0 24px;line-height:1.5;';
  subheadline.textContent = content.subheadline;
  modal.appendChild(subheadline);

  const stepsContainer = document.createElement('div');
  stepsContainer.id = 'nw-modal-steps';
  stepsContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:24px;';

  const stepDefs = [
    { step: 'watchlist', num: '1', title: 'Add your first country to watchlist', sub: 'Get alerts when CII moves or crises develop' },
    { step: 'schedule',  num: '2', title: 'Set your brief schedule', sub: 'Daily or Mon / Wed / Fri delivery' },
    { step: 'sitrep',   num: '3', title: 'Run your first sitrep', sub: 'Ask the AI analyst about any region right now' },
  ];

  for (const def of stepDefs) {
    const stepEl = document.createElement('div');
    stepEl.className = 'nw-modal-step';
    stepEl.dataset.step = def.step;
    stepEl.style.cssText =
      'display:flex;align-items:center;gap:12px;background:#141414;border:1px solid #222;border-radius:5px;padding:11px 14px;cursor:pointer;';

    const numEl = document.createElement('div');
    numEl.style.cssText =
      'width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    numEl.textContent = def.num;

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;';
    const strong = document.createElement('strong');
    strong.style.cssText = 'font-size:13px;color:#ccc;display:block;margin-bottom:2px;';
    strong.textContent = def.title;
    const span = document.createElement('span');
    span.style.cssText = 'font-size:11px;color:#555;';
    span.textContent = def.sub;
    textWrap.appendChild(strong);
    textWrap.appendChild(span);

    const arrow = document.createElement('span');
    arrow.style.cssText = 'color:#333;font-size:14px;';
    arrow.textContent = '›';

    stepEl.appendChild(numEl);
    stepEl.appendChild(textWrap);
    stepEl.appendChild(arrow);
    stepsContainer.appendChild(stepEl);
  }
  modal.appendChild(stepsContainer);

  const hr = document.createElement('hr');
  hr.style.cssText = 'border:none;border-top:1px solid #1a1a1a;margin:0 0 20px;';
  modal.appendChild(hr);

  let referralInputEl: HTMLInputElement | null = null;
  let copyBtnEl: HTMLButtonElement | null = null;

  if (referralUrl) {
    const referralBlock = document.createElement('div');
    referralBlock.style.cssText =
      'background:#0a0a0a;border:1px solid #1e1e1e;border-radius:5px;padding:12px 14px;margin-bottom:20px;';

    const referralLabel = document.createElement('div');
    referralLabel.style.cssText =
      'font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#444;margin-bottom:8px;';
    referralLabel.textContent = 'Your Founding Referral Link';

    const referralRow = document.createElement('div');
    referralRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

    referralInputEl = document.createElement('input');
    referralInputEl.type = 'text';
    referralInputEl.id = 'nw-referral-input';
    referralInputEl.readOnly = true;
    referralInputEl.value = referralUrl;
    referralInputEl.style.cssText =
      'flex:1;background:#111;border:1px solid #222;border-radius:3px;color:#22c55e;font-family:inherit;font-size:11px;padding:6px 10px;';

    copyBtnEl = document.createElement('button');
    copyBtnEl.id = 'nw-referral-copy';
    copyBtnEl.style.cssText =
      'background:#1a1a1a;border:1px solid #333;color:#888;font-family:inherit;font-size:11px;padding:6px 10px;border-radius:3px;cursor:pointer;white-space:nowrap;';
    copyBtnEl.textContent = 'Copy';

    referralRow.appendChild(referralInputEl);
    referralRow.appendChild(copyBtnEl);

    const referralNote = document.createElement('div');
    referralNote.style.cssText = 'font-size:10px;color:#444;margin-top:6px;';
    referralNote.textContent = 'Refer paying subscribers → earn free months (coming May 5)';

    referralBlock.appendChild(referralLabel);
    referralBlock.appendChild(referralRow);
    referralBlock.appendChild(referralNote);
    modal.appendChild(referralBlock);
  }

  const ctaBtn = document.createElement('button');
  ctaBtn.id = 'nw-modal-cta';
  ctaBtn.style.cssText =
    'width:100%;background:#22c55e;color:#000;border:none;border-radius:4px;padding:12px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;';
  ctaBtn.textContent = 'START EXPLORING →';
  modal.appendChild(ctaBtn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') dismiss();
  }

  function dismiss() {
    document.removeEventListener('keydown', onKeyDown);
    lsSet('nw-onboarded', '1');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    overlay.remove();
  }

  ctaBtn.addEventListener('click', dismiss);

  document.addEventListener('keydown', onKeyDown);

  stepsContainer.querySelectorAll<HTMLElement>('.nw-modal-step').forEach((step) => {
    step.addEventListener('mouseenter', () => { step.style.borderColor = '#333'; });
    step.addEventListener('mouseleave', () => { step.style.borderColor = '#222'; });

    step.addEventListener('click', () => {
      const action = step.dataset.step;
      if (action === 'watchlist') {
        dismiss();
        document.dispatchEvent(new CustomEvent('nw:open-watchlist'));
      } else if (action === 'schedule') {
        dismiss();
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

  if (copyBtnEl && referralInputEl) {
    const inputEl = referralInputEl;
    const btnEl = copyBtnEl;
    btnEl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(inputEl.value);
        btnEl.textContent = 'Copied ✓';
        setTimeout(() => { btnEl.textContent = 'Copy'; }, 2000);
      } catch {
        inputEl.select();
        document.execCommand('copy');
        btnEl.textContent = 'Copied ✓';
        setTimeout(() => { btnEl.textContent = 'Copy'; }, 2000);
      }
    });
  }
}
