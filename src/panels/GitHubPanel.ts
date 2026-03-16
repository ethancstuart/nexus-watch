import { Panel } from './Panel.ts';
import { createElement } from '../utils/dom.ts';
import { fetchGitHubActivity } from '../services/github.ts';
import type { GitHubData, GitHubEvent, WidgetSize } from '../types/index.ts';

const USER_KEY = 'dashview-github-user';

const EVENT_ICONS: Record<string, string> = {
  PushEvent: '\u2191',
  PullRequestEvent: '\u21CC',
  IssuesEvent: '\u25C9',
  CreateEvent: '+',
  WatchEvent: '\u2605',
  ForkEvent: '\u2442',
  IssueCommentEvent: '\u25B8',
};

function getEventIcon(type: string): string {
  return EVENT_ICONS[type] || '\u2022';
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export class GitHubPanel extends Panel {
  private data: GitHubData | null = null;

  constructor() {
    super({
      id: 'github',
      title: 'GitHub',
      enabled: true,
      refreshInterval: 300000,
      priority: 2,
      category: 'dev',
    });
  }

  getLastData(): GitHubData | null {
    return this.data;
  }

  renderAtSize(size: WidgetSize): void {
    if (size === 'compact' && this.data?.events?.length) {
      this.contentEl.textContent = '';
      const top = this.data.events[0];
      const wrap = createElement('div', {});
      wrap.style.cssText = 'text-align:center;padding:8px 0';
      const line = createElement('div', {});
      line.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      line.textContent = `${getEventIcon(top.type)} ${top.repo.split('/')[1]} \u00B7 ${top.action}`;
      wrap.appendChild(line);
      this.contentEl.appendChild(wrap);
      return;
    }
    if (this.data) this.render(this.data);
  }

  async fetchData(): Promise<void> {
    const username = localStorage.getItem(USER_KEY);
    if (!username) {
      this.renderSetup();
      return;
    }
    this.data = await fetchGitHubActivity(username);
    this.render(this.data);
  }

  render(_data: unknown): void {
    this.contentEl.textContent = '';

    const username = localStorage.getItem(USER_KEY);
    if (!username) {
      this.renderSetup();
      return;
    }

    if (!this.data || this.data.events.length === 0) {
      const empty = createElement('div', {
        className: 'panel-empty-state',
        textContent: 'No recent GitHub activity.',
      });
      this.contentEl.appendChild(empty);
      return;
    }

    const list = createElement('div', { className: 'gh-list' });
    for (const event of this.data.events) {
      list.appendChild(this.createEventRow(event));
    }
    this.contentEl.appendChild(list);
  }

  private renderSetup(): void {
    this.contentEl.textContent = '';
    const wrap = createElement('div', { className: 'gh-setup' });

    const label = createElement('div', {});
    label.style.cssText = 'font-size:12px;color:var(--color-text-muted);margin-bottom:8px';
    label.textContent = 'Enter your GitHub username to see activity:';
    wrap.appendChild(label);

    const input = createElement('input', { className: 'gh-setup-input' }) as HTMLInputElement;
    input.type = 'text';
    input.placeholder = 'username';
    input.style.cssText =
      'width:100%;padding:6px 8px;background:var(--color-bg-secondary);border:1px solid var(--color-border);color:var(--color-text);font-family:inherit;font-size:13px;border-radius:4px;margin-bottom:8px;box-sizing:border-box';
    wrap.appendChild(input);

    const btn = createElement('button', { className: 'gh-setup-btn', textContent: 'Save' });
    btn.style.cssText =
      'width:100%;padding:6px 8px;background:var(--color-accent);color:var(--color-bg);border:none;font-family:inherit;font-size:12px;font-weight:600;border-radius:4px;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px';
    btn.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) return;
      localStorage.setItem(USER_KEY, val);
      void this.refresh();
    });
    wrap.appendChild(btn);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });

    this.contentEl.appendChild(wrap);
  }

  private createEventRow(event: GitHubEvent): HTMLElement {
    const row = createElement('div', { className: 'gh-event' });
    row.style.cssText =
      'display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border)';

    const icon = createElement('span', {
      className: 'gh-event-icon',
      textContent: getEventIcon(event.type),
    });
    icon.style.cssText = 'flex-shrink:0;width:16px;text-align:center;font-size:13px;line-height:18px';
    row.appendChild(icon);

    const body = createElement('div', {});
    body.style.cssText = 'flex:1;min-width:0';

    const repo = createElement('div', {
      className: 'gh-event-repo',
      textContent: event.repo,
    });
    repo.style.cssText = 'font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    body.appendChild(repo);

    const action = createElement('div', {
      className: 'gh-event-action',
      textContent: event.action,
    });
    action.style.cssText =
      'font-size:11px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    body.appendChild(action);

    row.appendChild(body);

    const time = createElement('span', {
      className: 'gh-event-time',
      textContent: formatTimeAgo(event.createdAt),
    });
    time.style.cssText = 'flex-shrink:0;font-size:10px;color:var(--color-text-muted);white-space:nowrap';
    row.appendChild(time);

    return row;
  }
}
