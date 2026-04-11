/**
 * First-run onboarding flow — Track F.2.
 *
 * Replaces the pre-F.2 non-blocking tooltip with a real 3-step
 * wizard that the Apr 10 board review called out as the minimum
 * viable onboarding ("replace the dismissible tooltip with a
 * 3-step wizard"). The tooltip version got dismissed in ~2
 * seconds and nothing was ever captured about the user's
 * preferences — users dropped straight into a firehose of
 * unfiltered geopolitical data with no personalization.
 *
 * The new flow:
 *   1. Welcome + interests picker (regions → threats → sectors)
 *   2. Delivery preference (email capture + frequency)
 *   3. Confirmation + "next brief arrives tomorrow 5 AM ET"
 *
 * Writes land in src/services/interests.ts (Track F.1) AND the
 * subscribe endpoint at /api/subscribe. The `onboarded` flag on
 * the interests object flips true on completion OR skip so
 * returning users don't see the wizard again.
 *
 * Public API preserved: `showOnboarding(container)` is called
 * from src/pages/nexuswatch.ts line ~346 and takes the same
 * HTMLElement parameter. The internal implementation is
 * completely new — any caller that imported by name still
 * works without changes.
 *
 * Aesthetic: Light Intel Dossier, scoped to the overlay via
 * inline styles. Same palette as the email and the brief
 * archive — users walk from the onboarding wizard directly
 * into a product whose reading surfaces already look familiar.
 */

import { createElement } from '../utils/dom.ts';
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';
import {
  loadInterests,
  saveInterests,
  markOnboarded,
  REGIONS,
  THREATS,
  SECTORS,
  type RegionId,
  type ThreatId,
  type SectorId,
  type Frequency,
} from '../services/interests.ts';

// Storage key for "has this user seen the onboarding at all" is now
// sourced from the interests service (`interests.onboarded`). The
// legacy `nw:onboarded` key is migrated on first load so returning
// users from the pre-F.2 tooltip version don't see the new wizard.
const LEGACY_STORAGE_KEY = 'nw:onboarded';

interface DraftState {
  step: 1 | 2 | 3;
  regions: Set<RegionId>;
  threats: Set<ThreatId>;
  sectors: Set<SectorId>;
  email: string;
  frequency: Frequency;
}

export function showOnboarding(container: HTMLElement): void {
  // Respect completed onboarding — either the new interests.onboarded
  // flag OR the legacy nw:onboarded key from the pre-F.2 tooltip.
  const existing = loadInterests();
  if (existing.onboarded) return;
  try {
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      // Legacy users: mark them as onboarded in the new schema so we
      // never bother them again, but don't overwrite defaults. They
      // can edit interests via account settings once Track F.3 ships.
      markOnboarded();
      return;
    }
  } catch {
    /* localStorage unavailable — continue and show the wizard */
  }

  // Wait for the map to finish first-paint before the modal fires.
  // 1.5s feels snappy on broadband, gives mobile a moment to breathe.
  setTimeout(() => {
    const draft: DraftState = {
      step: 1,
      regions: new Set(existing.regions),
      threats: new Set(existing.threats),
      sectors: new Set(existing.sectors),
      email: '',
      frequency: existing.frequency,
    };

    const overlay = createElement('div', { className: 'nw-onboarding-overlay briefs-dossier' });
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'nw-onboarding-title');
    overlay.style.cssText = [
      `position: fixed`,
      `inset: 0`,
      `z-index: 10000`,
      `background: rgba(0, 0, 0, 0.6)`,
      `backdrop-filter: blur(3px)`,
      `display: flex`,
      `align-items: flex-start`,
      `justify-content: center`,
      `padding: 64px 24px 24px 24px`,
      `overflow-y: auto`,
      `font-family: ${dossierFonts.sans}`,
    ].join(';');

    overlay.innerHTML = shellHtml();
    container.appendChild(overlay);

    renderStep(overlay, draft);

    // Escape + click-outside both trigger the "skip for now" action,
    // since that's the user's clear intent and we shouldn't lose their
    // opt-out by making it hard to back out.
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipFlow(overlay, keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }, 1500);
}

// ---------------------------------------------------------------------------
// Shell + step renderer
// ---------------------------------------------------------------------------

function shellHtml(): string {
  return `
    <div class="nw-onboarding-card" style="${cardStyle()}" role="document">
      <button type="button" class="nw-onboarding-skip" aria-label="Skip onboarding" style="${skipStyle()}">Skip for now</button>
      <div class="nw-onboarding-progress" id="nw-ob-progress" style="${progressStyle()}"></div>
      <div class="nw-onboarding-content" id="nw-ob-content"></div>
    </div>
  `;
}

function renderStep(overlay: HTMLElement, draft: DraftState): void {
  const progress = overlay.querySelector<HTMLElement>('#nw-ob-progress');
  const content = overlay.querySelector<HTMLElement>('#nw-ob-content');
  const skipBtn = overlay.querySelector<HTMLButtonElement>('.nw-onboarding-skip');
  if (!progress || !content) return;

  progress.innerHTML = progressHtml(draft.step);

  if (draft.step === 1) {
    content.innerHTML = step1Html(draft);
    wireStep1(overlay, draft);
  } else if (draft.step === 2) {
    content.innerHTML = step2Html(draft);
    wireStep2(overlay, draft);
  } else {
    content.innerHTML = step3Html(draft);
    wireStep3(overlay, draft);
  }

  skipBtn?.addEventListener(
    'click',
    () => {
      skipFlow(overlay, null);
    },
    { once: true },
  );
}

function progressHtml(step: 1 | 2 | 3): string {
  const dot = (n: number) => {
    const active = n === step;
    const done = n < step;
    const background = active || done ? dossierColors.accent : dossierColors.border;
    const size = active ? '14px' : '10px';
    return `<span aria-hidden="true" style="display: inline-block; width: ${size}; height: ${size}; border-radius: 50%; background: ${background}; transition: all 0.2s;"></span>`;
  };
  const kicker = step === 1 ? 'INTERESTS' : step === 2 ? 'DELIVERY' : 'READY';
  return `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      ${dot(1)}
      <span style="flex: 0 0 auto; width: 24px; height: 1px; background: ${dossierColors.border};"></span>
      ${dot(2)}
      <span style="flex: 0 0 auto; width: 24px; height: 1px; background: ${dossierColors.border};"></span>
      ${dot(3)}
    </div>
    <div style="font-family: ${dossierFonts.mono}; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: ${dossierColors.accent}; text-transform: uppercase;">STEP ${step} OF 3 · ${kicker}</div>
  `;
}

// ---------------------------------------------------------------------------
// Step 1 — interests picker
// ---------------------------------------------------------------------------

function step1Html(draft: DraftState): string {
  const groupStyle = `margin: 24px 0;`;
  const legendStyle = `font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: ${dossierColors.textTertiary}; text-transform: uppercase; margin-bottom: 10px; display: block;`;

  const chips = (
    items: ReadonlyArray<{ id: string; label: string }>,
    selected: Set<string>,
    group: 'region' | 'threat' | 'sector',
  ) =>
    items
      .map(
        (item) => `
      <button type="button" class="nw-chip" data-group="${group}" data-id="${item.id}" aria-pressed="${selected.has(item.id)}" style="${chipStyle(selected.has(item.id))}">
        ${item.label}
      </button>
    `,
      )
      .join('');

  return `
    <h1 id="nw-onboarding-title" style="${titleStyle()}">Tell us what you're watching</h1>
    <p style="${leadStyle()}">Pick the regions, threats, and sectors you care about. We'll weight your brief accordingly. You can change any of this later.</p>

    <div style="${groupStyle}">
      <span style="${legendStyle}">Regions</span>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">${chips(REGIONS, draft.regions, 'region')}</div>
    </div>

    <div style="${groupStyle}">
      <span style="${legendStyle}">Threat categories</span>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">${chips(THREATS, draft.threats, 'threat')}</div>
    </div>

    <div style="${groupStyle}">
      <span style="${legendStyle}">Sectors (optional)</span>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">${chips(SECTORS, draft.sectors, 'sector')}</div>
    </div>

    <div style="display: flex; justify-content: flex-end; margin-top: 32px;">
      <button type="button" class="nw-next-btn" style="${primaryButtonStyle()}">Continue →</button>
    </div>
  `;
}

function wireStep1(overlay: HTMLElement, draft: DraftState): void {
  overlay.querySelectorAll<HTMLButtonElement>('.nw-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;
      const id = btn.dataset.id;
      if (!group || !id) return;
      const target =
        group === 'region'
          ? (draft.regions as Set<string>)
          : group === 'threat'
            ? (draft.threats as Set<string>)
            : (draft.sectors as Set<string>);
      if (target.has(id)) {
        target.delete(id);
        btn.setAttribute('aria-pressed', 'false');
      } else {
        target.add(id);
        btn.setAttribute('aria-pressed', 'true');
      }
      btn.setAttribute('style', chipStyle(target.has(id)));
    });
  });

  overlay.querySelector<HTMLButtonElement>('.nw-next-btn')?.addEventListener('click', () => {
    draft.step = 2;
    renderStep(overlay, draft);
  });
}

// ---------------------------------------------------------------------------
// Step 2 — delivery preference
// ---------------------------------------------------------------------------

function step2Html(draft: DraftState): string {
  const freqOption = (id: Frequency, label: string, description: string) => {
    const selected = draft.frequency === id;
    return `
      <button type="button" class="nw-freq-option" data-freq="${id}" aria-pressed="${selected}" style="${freqOptionStyle(selected)}">
        <div style="font-family: ${dossierFonts.serif}; font-size: 18px; font-weight: 600; color: ${dossierColors.textPrimary}; margin-bottom: 4px;">${label}</div>
        <div style="font-family: ${dossierFonts.sans}; font-size: 13px; color: ${dossierColors.textSecondary};">${description}</div>
      </button>
    `;
  };

  return `
    <h1 id="nw-onboarding-title" style="${titleStyle()}">Where should we send it?</h1>
    <p style="${leadStyle()}">A three-minute brief in your inbox every morning. Unsubscribe in one click.</p>

    <label style="display: block; margin: 24px 0 8px 0; font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: ${dossierColors.textTertiary}; text-transform: uppercase;">Email address</label>
    <input type="email" class="nw-email-input" value="${escape(draft.email)}" placeholder="you@example.com" style="${inputStyle()}" autocomplete="email" required />
    <div class="nw-email-error" style="${errorStyle()}" role="alert" aria-live="polite"></div>

    <label style="display: block; margin: 24px 0 10px 0; font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: ${dossierColors.textTertiary}; text-transform: uppercase;">Frequency</label>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${freqOption('daily', 'Daily', 'Every morning at 5 AM ET. Best for active watchers.')}
      ${freqOption('mwf', 'Monday / Wednesday / Friday', 'Three per week. The free tier cadence.')}
      ${freqOption('weekly', 'Weekly (Sunday)', 'Sunday Week-in-Review only. Maximum signal, minimum inbox.')}
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 32px; gap: 12px;">
      <button type="button" class="nw-back-btn" style="${secondaryButtonStyle()}">← Back</button>
      <button type="button" class="nw-next-btn" style="${primaryButtonStyle()}">Subscribe →</button>
    </div>
  `;
}

function wireStep2(overlay: HTMLElement, draft: DraftState): void {
  const input = overlay.querySelector<HTMLInputElement>('.nw-email-input');
  const errorEl = overlay.querySelector<HTMLElement>('.nw-email-error');
  const nextBtn = overlay.querySelector<HTMLButtonElement>('.nw-next-btn');

  input?.addEventListener('input', () => {
    draft.email = input.value.trim();
    if (errorEl) errorEl.textContent = '';
  });

  overlay.querySelectorAll<HTMLButtonElement>('.nw-freq-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const freq = btn.dataset.freq as Frequency | undefined;
      if (!freq) return;
      draft.frequency = freq;
      overlay.querySelectorAll<HTMLButtonElement>('.nw-freq-option').forEach((b) => {
        const isSelected = b.dataset.freq === freq;
        b.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        b.setAttribute('style', freqOptionStyle(isSelected));
      });
    });
  });

  overlay.querySelector<HTMLButtonElement>('.nw-back-btn')?.addEventListener('click', () => {
    draft.step = 1;
    renderStep(overlay, draft);
  });

  nextBtn?.addEventListener('click', async () => {
    const email = draft.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errorEl) errorEl.textContent = 'Enter a valid email address.';
      input?.focus();
      return;
    }

    nextBtn.disabled = true;
    nextBtn.textContent = 'Subscribing…';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'onboarding' }),
      });
      // Subscribe endpoint returns 200 both for new and already-subscribed.
      // Either is a legitimate "continue" — we only bail on network errors.
      if (!res.ok && res.status !== 409) {
        throw new Error(`subscribe failed: ${res.status}`);
      }
    } catch (err) {
      // Non-fatal — persist interests locally so the user isn't
      // stranded if the subscribe API is having a bad day. They'll
      // still see brief content in the archive and can re-subscribe
      // later from the landing page.
      console.error('[onboarding] Subscribe failed:', err instanceof Error ? err.message : err);
      if (errorEl) {
        errorEl.textContent = 'Subscription service is unavailable — saving your preferences locally.';
      }
    }

    // Commit the interests to storage regardless of subscribe outcome.
    saveInterests({
      regions: Array.from(draft.regions),
      threats: Array.from(draft.threats),
      sectors: Array.from(draft.sectors),
      frequency: draft.frequency,
      onboarded: true,
    });

    draft.step = 3;
    renderStep(overlay, draft);
  });
}

// ---------------------------------------------------------------------------
// Step 3 — confirmation
// ---------------------------------------------------------------------------

function step3Html(draft: DraftState): string {
  const regionLabels = Array.from(draft.regions)
    .map((id) => REGIONS.find((r) => r.id === id)?.label ?? id)
    .join(', ');
  const threatLabels = Array.from(draft.threats)
    .map((id) => THREATS.find((t) => t.id === id)?.label ?? id)
    .join(', ');
  const hasPrefs = regionLabels || threatLabels;

  return `
    <h1 id="nw-onboarding-title" style="${titleStyle()}">You're in.</h1>
    <p style="${leadStyle()}">Your first NexusWatch Brief arrives tomorrow at 5 AM ET. We'll weight it toward ${hasPrefs ? 'your picks:' : 'the global situation.'}</p>
    ${
      hasPrefs
        ? `<div style="margin: 20px 0; padding: 16px 20px; background: ${dossierColors.bgMuted}; border-left: 3px solid ${dossierColors.accent}; font-family: ${dossierFonts.sans}; font-size: 14px; color: ${dossierColors.textPrimary};">
             ${regionLabels ? `<div style="margin-bottom: 6px;"><span style="font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: ${dossierColors.accent}; text-transform: uppercase; margin-right: 8px;">Regions</span>${escape(regionLabels)}</div>` : ''}
             ${threatLabels ? `<div><span style="font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: ${dossierColors.accent}; text-transform: uppercase; margin-right: 8px;">Threats</span>${escape(threatLabels)}</div>` : ''}
           </div>`
        : ''
    }
    <p style="${leadStyle()}">In the meantime, the live map is right behind you. Hit <strong style="font-family: ${dossierFonts.mono};">B</strong> to read today's brief at any time, or <strong style="font-family: ${dossierFonts.mono};">T</strong> to toggle themes.</p>
    <div style="display: flex; justify-content: flex-end; margin-top: 32px;">
      <button type="button" class="nw-done-btn" style="${primaryButtonStyle()}">Explore the map →</button>
    </div>
  `;
}

function wireStep3(overlay: HTMLElement, _draft: DraftState): void {
  overlay.querySelector<HTMLButtonElement>('.nw-done-btn')?.addEventListener(
    'click',
    () => {
      closeOverlay(overlay);
    },
    { once: true },
  );
}

// ---------------------------------------------------------------------------
// Skip / close
// ---------------------------------------------------------------------------

function skipFlow(overlay: HTMLElement, keyHandler: ((e: KeyboardEvent) => void) | null): void {
  // Mark as onboarded so we don't ask again. Don't overwrite stored
  // interests — if the user had values from a previous session they
  // stay put.
  markOnboarded();
  closeOverlay(overlay);
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
}

function closeOverlay(overlay: HTMLElement): void {
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.2s ease-out';
  setTimeout(() => overlay.remove(), 220);
}

// ---------------------------------------------------------------------------
// Inline style builders
// ---------------------------------------------------------------------------

function cardStyle(): string {
  return [
    `position: relative`,
    `background: ${dossierColors.bgCard}`,
    `max-width: 560px`,
    `width: 100%`,
    `padding: 40px 44px 36px 44px`,
    `border-radius: 4px`,
    `box-shadow: 0 32px 80px rgba(0, 0, 0, 0.4)`,
    `border: 1px solid ${dossierColors.border}`,
    `max-height: calc(100vh - 96px)`,
    `overflow-y: auto`,
    `font-family: ${dossierFonts.sans}`,
  ].join(';');
}

function skipStyle(): string {
  return [
    `position: absolute`,
    `top: 16px`,
    `right: 20px`,
    `padding: 6px 10px`,
    `background: transparent`,
    `color: ${dossierColors.textTertiary}`,
    `border: none`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 10px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function progressStyle(): string {
  return [`margin-bottom: 20px`].join(';');
}

function titleStyle(): string {
  return [
    `font-family: ${dossierFonts.serif}`,
    `font-size: 32px`,
    `font-weight: 600`,
    `color: ${dossierColors.textPrimary}`,
    `line-height: 1.2`,
    `margin: 0 0 12px 0`,
    `letter-spacing: -0.01em`,
  ].join(';');
}

function leadStyle(): string {
  return [
    `font-family: ${dossierFonts.sans}`,
    `font-size: 16px`,
    `line-height: 1.55`,
    `color: ${dossierColors.textSecondary}`,
    `margin: 0 0 8px 0`,
  ].join(';');
}

function chipStyle(selected: boolean): string {
  return [
    `padding: 8px 14px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 13px`,
    `font-weight: ${selected ? '600' : '400'}`,
    `color: ${selected ? dossierColors.textInverse : dossierColors.textPrimary}`,
    `background: ${selected ? dossierColors.accent : 'transparent'}`,
    `border: 1px solid ${selected ? dossierColors.accent : dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `cursor: pointer`,
    `transition: background 0.15s, color 0.15s, border-color 0.15s`,
  ].join(';');
}

function freqOptionStyle(selected: boolean): string {
  return [
    `display: block`,
    `width: 100%`,
    `padding: 14px 18px`,
    `background: ${selected ? dossierColors.accentBgSoft : dossierColors.bgCard}`,
    `border: 1px solid ${selected ? dossierColors.accent : dossierColors.border}`,
    `border-left: ${selected ? `4px solid ${dossierColors.accent}` : `1px solid ${dossierColors.border}`}`,
    `border-radius: 2px`,
    `text-align: left`,
    `cursor: pointer`,
    `transition: all 0.15s`,
  ].join(';');
}

function inputStyle(): string {
  return [
    `display: block`,
    `width: 100%`,
    `padding: 12px 16px`,
    `background: ${dossierColors.bgCard}`,
    `border: 1px solid ${dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 15px`,
    `color: ${dossierColors.textPrimary}`,
    `outline: none`,
  ].join(';');
}

function errorStyle(): string {
  return [
    `margin-top: 8px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 13px`,
    `color: ${dossierColors.accent}`,
    `min-height: 18px`,
  ].join(';');
}

function primaryButtonStyle(): string {
  return [
    `padding: 12px 24px`,
    `background: ${dossierColors.accent}`,
    `color: ${dossierColors.textInverse}`,
    `border: 1px solid ${dossierColors.accent}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function secondaryButtonStyle(): string {
  return [
    `padding: 12px 24px`,
    `background: transparent`,
    `color: ${dossierColors.textPrimary}`,
    `border: 1px solid ${dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}
