/**
 * Agent Trajectory — visible reasoning pane for tool-using AI runs.
 *
 * Streams SSE events from /api/ai-analyst?stream=1 and renders each step
 * as a card in a timeline: tool calls with input/output, status pulses,
 * and the final synthesized brief with confidence tags.
 *
 * Devin/Artifact-style: the model's "work" is the product, not a black box.
 */

const TOOL_LABEL: Record<string, string> = {
  get_country_cii: 'Pulling CII snapshot',
  get_top_risk_countries: 'Ranking risk by country',
  get_verified_signals: 'Checking verified signals',
  get_layer_status: 'Auditing layer freshness',
  get_platform_health: 'Reading platform health',
  search_events: 'Searching ACLED + event stream',
};

interface TrajectoryEvent {
  type: 'status' | 'tool_use' | 'tool_result' | 'token' | 'done' | 'error';
  data?: Record<string, unknown>;
}

export interface AgentTrajectoryOptions {
  /** SSE endpoint. Default '/api/ai-analyst?stream=1'. */
  endpoint?: string;
  /** Called once the SSE stream emits its `done` event. */
  onDone?: (toolsUsed: string[]) => void;
  /** Called if the stream errors out. */
  onError?: (message: string) => void;
}

export class AgentTrajectory {
  private root: HTMLElement;
  private timeline!: HTMLElement;
  private synthesis!: HTMLElement;
  private statusBadge!: HTMLElement;
  private pendingByTool = new Map<string, HTMLElement>();
  private toolsUsed: string[] = [];
  private synthesisBuffer = '';
  private opts: AgentTrajectoryOptions;

  constructor(root: HTMLElement, opts: AgentTrajectoryOptions = {}) {
    this.root = root;
    this.opts = opts;
    this.scaffold();
  }

  private scaffold(): void {
    this.root.classList.add('nw-trajectory');
    this.root.innerHTML = `
      <header class="nw-trajectory-header">
        <span class="nw-trajectory-pulse" aria-hidden="true"></span>
        <span class="nw-trajectory-title">LIVE AGENT RUN</span>
        <span class="nw-trajectory-status" data-status="initializing">initializing…</span>
      </header>
      <ol class="nw-trajectory-timeline" aria-live="polite"></ol>
      <section class="nw-trajectory-synthesis" hidden>
        <div class="nw-trajectory-synthesis-label">Synthesis</div>
        <div class="nw-trajectory-synthesis-body"></div>
      </section>
    `;
    this.timeline = this.root.querySelector('.nw-trajectory-timeline') as HTMLElement;
    this.synthesis = this.root.querySelector('.nw-trajectory-synthesis') as HTMLElement;
    this.statusBadge = this.root.querySelector('.nw-trajectory-status') as HTMLElement;
  }

  private setStatus(label: string, kind: 'initializing' | 'thinking' | 'tool' | 'writing' | 'done' | 'error'): void {
    this.statusBadge.textContent = label;
    this.statusBadge.dataset.status = kind;
  }

  private appendStep(label: string, kind: 'thinking' | 'tool' | 'result'): HTMLElement {
    const li = document.createElement('li');
    li.className = `nw-trajectory-step nw-trajectory-step-${kind}`;
    li.innerHTML = `
      <span class="nw-trajectory-dot" aria-hidden="true"></span>
      <div class="nw-trajectory-step-body">${label}</div>
    `;
    this.timeline.appendChild(li);
    return li;
  }

  /**
   * Run the agent. Streams events and renders incrementally. Resolves when
   * the SSE stream emits `done` (or rejects on transport error).
   */
  async run(query: string, context?: string): Promise<void> {
    this.setStatus('connecting…', 'initializing');
    this.appendStep(`Question received. Selecting tools…`, 'thinking');

    const endpoint = this.opts.endpoint ?? '/api/ai-analyst?stream=1';
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ query, context }),
      });
    } catch (err) {
      this.handleError(err instanceof Error ? err.message : 'network_error');
      return;
    }

    if (!response.ok || !response.body) {
      this.handleError(`agent_${response.status}`);
      return;
    }

    this.setStatus('thinking', 'thinking');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseFrame(frame);
        if (ev) this.handleEvent(ev);
      }
    }

    // In case the server didn't emit an explicit `done` (e.g. transport
    // closed early) finalize gracefully.
    if (this.statusBadge.dataset.status !== 'done' && this.statusBadge.dataset.status !== 'error') {
      this.setStatus('done', 'done');
    }
  }

  private handleEvent(ev: TrajectoryEvent): void {
    switch (ev.type) {
      case 'tool_use': {
        const name = String(ev.data?.name ?? 'unknown_tool');
        const input = ev.data?.input ? JSON.stringify(ev.data.input) : '';
        const label = `
          <div class="nw-trajectory-tool-name">
            <span class="nw-trajectory-tool-mark">▸</span>
            ${TOOL_LABEL[name] ?? name}
          </div>
          <code class="nw-trajectory-tool-meta">${escapeHtml(name)}${input ? ` · ${escapeHtml(input)}` : ''}</code>
          <span class="nw-trajectory-tool-pill" data-pill="running">running</span>
        `;
        const li = this.appendStep(label, 'tool');
        this.pendingByTool.set(name, li);
        this.toolsUsed.push(name);
        this.setStatus(`calling ${name}`, 'tool');
        break;
      }
      case 'tool_result': {
        const name = String(ev.data?.name ?? 'unknown_tool');
        const ok = ev.data?.ok !== false;
        const li = this.pendingByTool.get(name);
        if (li) {
          const pill = li.querySelector<HTMLElement>('.nw-trajectory-tool-pill');
          if (pill) {
            pill.dataset.pill = ok ? 'done' : 'error';
            pill.textContent = ok ? 'done' : 'error';
          }
          this.pendingByTool.delete(name);
        }
        break;
      }
      case 'token': {
        const text = String(ev.data?.text ?? '');
        if (!text) break;
        if (this.synthesisBuffer === '') {
          this.appendStep('Synthesizing brief…', 'thinking');
          this.synthesis.hidden = false;
          this.setStatus('writing', 'writing');
        }
        this.synthesisBuffer += text;
        const body = this.synthesis.querySelector('.nw-trajectory-synthesis-body') as HTMLElement;
        body.textContent = this.synthesisBuffer;
        break;
      }
      case 'done': {
        this.setStatus('done', 'done');
        this.opts.onDone?.(this.toolsUsed);
        break;
      }
      case 'error': {
        const msg = String(ev.data?.message ?? 'stream_error');
        this.handleError(msg);
        break;
      }
    }
  }

  private handleError(message: string): void {
    this.setStatus(`error: ${message}`, 'error');
    this.appendStep(`Agent error: <code>${escapeHtml(message)}</code>`, 'thinking');
    this.opts.onError?.(message);
  }
}

function parseFrame(frame: string): TrajectoryEvent | null {
  const lines = frame.split('\n');
  let eventType = 'message';
  let dataStr = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) eventType = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataStr += line.slice(6);
  }
  if (!dataStr) return null;
  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;
    return { type: eventType as TrajectoryEvent['type'], data };
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inject the trajectory stylesheet once per page. Called by pages that
 * mount AgentTrajectory so the component is fully self-contained.
 */
let stylesInjected = false;
export function injectAgentTrajectoryStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .nw-trajectory {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface-1, #0a0a0a);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      overflow: hidden;
    }

    .nw-trajectory-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1.1rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      background: var(--color-surface-2, #0f0f0f);
    }
    .nw-trajectory-pulse {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--color-accent, #ff6600);
      box-shadow: 0 0 0 0 currentColor;
      animation: nw-traj-pulse 1.6s infinite;
    }
    @keyframes nw-traj-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0.55); }
      70%  { box-shadow: 0 0 0 10px rgba(255, 102, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0); }
    }
    .nw-trajectory-title {
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      color: var(--color-accent, #ff6600);
      font-weight: 600;
    }
    .nw-trajectory-status {
      margin-left: auto;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: lowercase;
      color: var(--color-text-muted, #888);
    }
    .nw-trajectory-status[data-status="done"]  { color: #22c55e; }
    .nw-trajectory-status[data-status="error"] { color: #dc2626; }
    .nw-trajectory-status[data-status="tool"]  { color: var(--color-accent, #ff6600); }

    .nw-trajectory-timeline {
      list-style: none;
      margin: 0;
      padding: 0.4rem 0;
      max-height: 50vh;
      overflow-y: auto;
    }
    .nw-trajectory-step {
      position: relative;
      display: flex;
      gap: 0.85rem;
      padding: 0.65rem 1.1rem;
      border-left: 1px solid transparent;
    }
    .nw-trajectory-step + .nw-trajectory-step {
      border-top: 1px dashed var(--color-border, #2a2a2a);
    }
    .nw-trajectory-dot {
      flex: 0 0 8px;
      width: 8px;
      height: 8px;
      margin-top: 7px;
      border-radius: 50%;
      background: var(--color-text-muted, #555);
    }
    .nw-trajectory-step-thinking .nw-trajectory-dot { background: var(--color-text-muted, #666); }
    .nw-trajectory-step-tool .nw-trajectory-dot     { background: var(--color-accent, #ff6600); }
    .nw-trajectory-step-result .nw-trajectory-dot   { background: #22c55e; }

    .nw-trajectory-step-body {
      flex: 1;
      font-size: 0.82rem;
      line-height: 1.55;
      color: var(--color-text, #ddd);
      min-width: 0;
    }
    .nw-trajectory-tool-name {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text, #f0f0f0);
      margin-bottom: 0.2rem;
    }
    .nw-trajectory-tool-mark {
      color: var(--color-accent, #ff6600);
      margin-right: 0.3rem;
    }
    .nw-trajectory-tool-meta {
      display: block;
      font-size: 0.7rem;
      color: var(--color-text-muted, #888);
      word-break: break-all;
      margin-top: 0.1rem;
    }
    .nw-trajectory-tool-pill {
      display: inline-block;
      margin-top: 0.35rem;
      padding: 0.1rem 0.5rem;
      font-size: 0.65rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-radius: 2px;
      background: var(--color-surface-2, #1a1a1a);
      color: var(--color-text-muted, #888);
    }
    .nw-trajectory-tool-pill[data-pill="running"] {
      background: rgba(255, 102, 0, 0.12);
      color: var(--color-accent, #ff6600);
      animation: nw-traj-running 1.4s ease-in-out infinite;
    }
    .nw-trajectory-tool-pill[data-pill="done"]    { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
    .nw-trajectory-tool-pill[data-pill="error"]   { background: rgba(220, 38, 38, 0.15); color: #dc2626; }
    @keyframes nw-traj-running {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }

    .nw-trajectory-synthesis {
      border-top: 1px solid var(--color-border, #2a2a2a);
      background: var(--color-surface-2, #0f0f0f);
      padding: 1rem 1.1rem 1.2rem;
    }
    .nw-trajectory-synthesis-label {
      font-size: 0.7rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin-bottom: 0.45rem;
    }
    .nw-trajectory-synthesis-body {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1rem;
      line-height: 1.7;
      color: var(--color-text, #e8e8e8);
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    @media (max-width: 640px) {
      .nw-trajectory-header { padding: 0.7rem 0.85rem; }
      .nw-trajectory-step { padding: 0.55rem 0.85rem; }
      .nw-trajectory-synthesis { padding: 0.85rem; }
    }
  `;
  document.head.appendChild(style);
}
