/**
 * Natural Language Alert Builder
 *
 * User types "Alert me when earthquake >6.0 near nuclear facility"
 * → Claude parses into structured rule
 * → Shows confirmation card
 * → User confirms → Rule activates
 */

import { createElement } from '../utils/dom.ts';
import { addRule, type AlertRule, type ParsedRule } from '../services/alertEngine.ts';

let overlay: HTMLElement | null = null;
let ruleCounter = 0;

export function openAlertBuilder(container: HTMLElement): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    return;
  }

  overlay = createElement('div', { className: 'nw-alert-builder-overlay' });
  overlay.innerHTML = `
    <div class="nw-alert-builder">
      <div class="nw-alert-builder-header">
        <span class="nw-alert-builder-title">CREATE ALERT</span>
        <button class="nw-alert-builder-close">&times;</button>
      </div>
      <div class="nw-alert-builder-body">
        <div class="nw-alert-templates">
          <div class="nw-alert-templates-label">QUICK TEMPLATES:</div>
          <button class="nw-alert-template" data-template="cii-spike">Any CII spike &gt; 5 points</button>
          <button class="nw-alert-template" data-template="cii-critical">Any country CII crosses 75 (critical)</button>
          <button class="nw-alert-template" data-template="watchlist-alert">My watchlist country CII above 70</button>
          <button class="nw-alert-template" data-template="chokepoint">Chokepoint status change</button>
          <button class="nw-alert-template" data-template="eq6">M6+ earthquake anywhere</button>
          <button class="nw-alert-template" data-template="eq-nuclear">Earthquake &gt;5.0 near nuclear facility</button>
          <button class="nw-alert-template" data-template="conflict-fatalities">ACLED event with 50+ fatalities</button>
          <button class="nw-alert-template" data-template="fire-cluster">50+ fire hotspots clustered</button>
          <button class="nw-alert-template" data-template="verified-escalation">Verified escalation in any region</button>
          <button class="nw-alert-template" data-template="multi-signal">Multi-signal convergence detected</button>
        </div>
        <p class="nw-alert-builder-hint">Or describe your alert in plain English:</p>
        <textarea class="nw-alert-builder-input" rows="3" placeholder="e.g., Alert me when earthquake above 6.0 occurs within 200km of any nuclear facility"></textarea>
        <button class="nw-alert-builder-submit">PARSE ALERT</button>
        <div class="nw-alert-builder-status"></div>
        <div class="nw-alert-builder-confirmation" style="display:none"></div>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  const closeBtn = overlay.querySelector('.nw-alert-builder-close') as HTMLElement;
  const submitBtn = overlay.querySelector('.nw-alert-builder-submit') as HTMLButtonElement;
  const input = overlay.querySelector('.nw-alert-builder-input') as HTMLTextAreaElement;
  const status = overlay.querySelector('.nw-alert-builder-status') as HTMLElement;
  const confirmation = overlay.querySelector('.nw-alert-builder-confirmation') as HTMLElement;

  closeBtn.addEventListener('click', () => {
    overlay?.remove();
    overlay = null;
  });

  const TEMPLATE_TEXT: Record<string, string> = {
    'cii-spike': 'Alert me when any country CII score changes by more than 5 points in a single cycle',
    'cii-critical': 'Alert me when any country CII score crosses above 75',
    'watchlist-alert': 'Alert me when any country in my watchlist has CII above 70',
    chokepoint: 'Alert me when any chokepoint status changes from normal',
    eq6: 'Alert me when any earthquake above magnitude 6.0 occurs anywhere',
    'eq-nuclear': 'Alert me when earthquake above 5.0 occurs within 200km of any nuclear facility',
    'conflict-fatalities': 'Alert me when any ACLED conflict event has 50 or more fatalities',
    'fire-cluster': 'Alert me when 50 or more fire hotspots cluster within 100km',
    'verified-escalation': 'Alert me on any verified escalation event in any region',
    'multi-signal': 'Alert me when 3 or more data sources converge on the same location within 6 hours',
  };

  overlay.querySelectorAll('.nw-alert-template').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = (btn as HTMLElement).dataset.template!;
      input.value = TEMPLATE_TEXT[t] || '';
      input.focus();
    });
  });

  submitBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'PARSING...';
    status.textContent = '';
    confirmation.style.display = 'none';

    try {
      const res = await fetch('/api/parse-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const err = await res.json();
        status.textContent = `Error: ${(err as Record<string, string>).error || 'Failed to parse'}`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'PARSE ALERT';
        return;
      }

      const data = (await res.json()) as { rule: ParsedRule };
      showConfirmation(confirmation, data.rule, text, status);
    } catch {
      status.textContent = 'Network error — try again';
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'PARSE ALERT';
  });

  // Submit on Cmd/Ctrl+Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      submitBtn.click();
    }
  });

  input.focus();
}

function showConfirmation(container: HTMLElement, rule: ParsedRule, originalText: string, status: HTMLElement): void {
  container.style.display = 'block';
  container.innerHTML = `
    <div class="nw-alert-confirm-card">
      <div class="nw-alert-confirm-header">PARSED RULE</div>
      <div class="nw-alert-confirm-body">
        <div class="nw-alert-confirm-readable">${escapeHtml(rule.humanReadable)}</div>
        <div class="nw-alert-confirm-details">
          <span class="nw-alert-confirm-tag">Layer: ${escapeHtml(rule.layer)}</span>
          <span class="nw-alert-confirm-tag">Condition: ${escapeHtml(rule.condition)}</span>
          ${rule.threshold !== null ? `<span class="nw-alert-confirm-tag">Threshold: ${rule.threshold}</span>` : ''}
          ${rule.location ? `<span class="nw-alert-confirm-tag">Location: ${escapeHtml(rule.location)}</span>` : ''}
          ${rule.radiusKm ? `<span class="nw-alert-confirm-tag">Radius: ${rule.radiusKm}km</span>` : ''}
          ${rule.comparisonLayer ? `<span class="nw-alert-confirm-tag">Near: ${escapeHtml(rule.comparisonLayer)}</span>` : ''}
        </div>
      </div>
      <div class="nw-alert-confirm-actions">
        <button class="nw-alert-confirm-btn confirm">ACTIVATE ALERT</button>
        <button class="nw-alert-confirm-btn cancel">CANCEL</button>
      </div>
    </div>
  `;

  const confirmBtn = container.querySelector('.confirm') as HTMLButtonElement;
  const cancelBtn = container.querySelector('.cancel') as HTMLButtonElement;

  confirmBtn.addEventListener('click', () => {
    ruleCounter++;
    const alertRule: AlertRule = {
      id: `nl-${Date.now()}-${ruleCounter}`,
      ruleText: originalText,
      parsed: rule,
      active: true,
    };
    addRule(alertRule);
    saveRuleToStorage(alertRule);

    status.textContent = 'Alert activated. Monitoring in progress.';
    status.style.color = '#22c55e';
    container.style.display = 'none';

    // Auto-close after 2 seconds
    setTimeout(() => {
      overlay?.remove();
      overlay = null;
    }, 2000);
  });

  cancelBtn.addEventListener('click', () => {
    container.style.display = 'none';
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Persist rules in localStorage (will migrate to Postgres in API layer phase)
function saveRuleToStorage(rule: AlertRule): void {
  try {
    const existing = JSON.parse(localStorage.getItem('nw:alert-rules') || '[]') as AlertRule[];
    existing.push(rule);
    localStorage.setItem('nw:alert-rules', JSON.stringify(existing));
  } catch {
    // storage full
  }
}

export function loadRulesFromStorage(): AlertRule[] {
  try {
    return JSON.parse(localStorage.getItem('nw:alert-rules') || '[]') as AlertRule[];
  } catch {
    return [];
  }
}
