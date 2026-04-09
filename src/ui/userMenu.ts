/**
 * User Menu — Auth status, login/logout, tier badge, settings access.
 * Shown in the topbar right zone.
 */

import { createElement } from '../utils/dom.ts';
import { getUser, login, logout, checkSession, onAuthChange } from '../services/auth.ts';
import type { User } from '../types/index.ts';

export function createUserMenu(container: HTMLElement): { refresh: () => void } {
  const wrapper = createElement('div', { className: 'nw-user-menu' });
  container.appendChild(wrapper);

  function render() {
    wrapper.textContent = '';
    const user = getUser();

    if (!user) {
      // Login buttons
      const loginBtn = createElement('button', {
        className: 'nw-sitrep-btn nw-login-btn',
        textContent: 'SIGN IN',
      });
      loginBtn.addEventListener('click', () => {
        showLoginModal(container);
      });
      wrapper.appendChild(loginBtn);
    } else {
      // User info + tier badge + menu
      const userBtn = createElement('button', { className: 'nw-user-btn' });

      const avatar = createElement('img', { className: 'nw-user-avatar' }) as HTMLImageElement;
      avatar.src = user.avatar || '';
      avatar.alt = user.name;
      avatar.width = 20;
      avatar.height = 20;

      const name = createElement('span', {
        className: 'nw-user-name',
        textContent: user.name.split(' ')[0],
      });

      const tier = createElement('span', {
        className: `nw-user-tier ${user.tier}`,
        textContent: user.tier === 'premium' ? 'PRO' : 'FREE',
      });

      userBtn.appendChild(avatar);
      userBtn.appendChild(name);
      userBtn.appendChild(tier);

      // Dropdown on click
      userBtn.addEventListener('click', () => {
        const existing = wrapper.querySelector('.nw-user-dropdown');
        if (existing) {
          existing.remove();
          return;
        }
        showDropdown(wrapper, user);
      });

      wrapper.appendChild(userBtn);
    }
  }

  // Initial render
  void checkSession().then(() => render());

  // Re-render on auth changes
  onAuthChange(() => render());

  return { refresh: render };
}

function showLoginModal(container: HTMLElement): void {
  const modal = createElement('div', { className: 'nw-login-modal-overlay' });
  modal.innerHTML = `
    <div class="nw-login-modal">
      <div class="nw-login-header">
        <span class="nw-login-title">SIGN IN TO NEXUSWATCH</span>
        <button class="nw-login-close">&times;</button>
      </div>
      <div class="nw-login-body">
        <p class="nw-login-hint">Sign in to save alerts, receive daily briefs, and unlock Pro features.</p>
        <button class="nw-login-provider google">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button class="nw-login-provider github">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          Continue with GitHub
        </button>
      </div>
    </div>
  `;

  container.appendChild(modal);

  modal.querySelector('.nw-login-close')?.addEventListener('click', () => modal.remove());
  modal.querySelector('.google')?.addEventListener('click', () => {
    login('google');
  });
  modal.querySelector('.github')?.addEventListener('click', () => {
    login('github');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function showDropdown(wrapper: HTMLElement, user: User): void {
  const dropdown = createElement('div', { className: 'nw-user-dropdown' });
  dropdown.innerHTML = `
    <div class="nw-dropdown-header">
      <div class="nw-dropdown-name">${user.name}</div>
      <div class="nw-dropdown-email">${user.email}</div>
    </div>
    <div class="nw-dropdown-divider"></div>
    ${user.tier !== 'premium' ? '<button class="nw-dropdown-item upgrade-analyst">Analyst — $29/mo</button><button class="nw-dropdown-item upgrade-pro">Pro — $99/mo</button>' : '<button class="nw-dropdown-item manage">Manage Billing</button>'}
    <button class="nw-dropdown-item api-keys">API Keys</button>
    <a class="nw-dropdown-item" href="/api/v1/docs" target="_blank" style="text-decoration:none">API Documentation</a>
    <div class="nw-dropdown-divider"></div>
    <button class="nw-dropdown-item logout">Sign Out</button>
  `;

  wrapper.appendChild(dropdown);

  dropdown.querySelector('.upgrade-analyst')?.addEventListener('click', async () => {
    const res = await fetch('/api/stripe/checkout?tier=analyst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  });

  dropdown.querySelector('.upgrade-pro')?.addEventListener('click', async () => {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  });

  dropdown.querySelector('.manage')?.addEventListener('click', async () => {
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  });

  dropdown.querySelector('.logout')?.addEventListener('click', () => logout());

  // Close on outside click
  const closeHandler = (e: Event) => {
    if (!dropdown.contains(e.target as Node) && !wrapper.contains(e.target as Node)) {
      dropdown.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}
