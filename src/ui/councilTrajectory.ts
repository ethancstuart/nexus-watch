/**
 * Council Trajectory — multi-column SSE renderer for /api/v2/council.
 *
 * Renders 5 persona columns + 1 synthesizer pane. Each column animates
 * from "waiting" → "running" → "done" with the full persona transcript
 * arriving as one block. The synthesizer pane streams token-by-token.
 *
 * Designed to feel like a courtroom: five experts, one verdict.
 *
 * 2026-05 tier-up Phase 2.
 */

export interface CouncilTrajectoryOptions {
  endpoint?: string;
  onDone?: (result: { run_id: number | null; total_spend_usd: number; bottom_line: string }) => void;
  onError?: (msg: string) => void;
}

interface CouncilRunPayload {
  question: string;
  context?: string;
  country_code?: string;
}

interface PersonaCol {
  id: string;
  label: string;
  oneLine: string;
  body: HTMLElement;
  status: HTMLElement;
  text: HTMLElement;
}

const PERSONA_ORDER = ['analyst', 'contrarian', 'historian', 'quant', 'on_the_ground'];

const PLACEHOLDER_PERSONAS: Record<string, { label: string; oneLine: string; initial: string; hue: number }> = {
  analyst: { label: 'Analyst', oneLine: 'Default read of the data.', initial: 'A', hue: 28 },
  contrarian: { label: 'Contrarian', oneLine: 'Argues the opposite is defensible.', initial: 'C', hue: 348 },
  historian: { label: 'Historian', oneLine: 'Anchors in pre-2020 precedent.', initial: 'H', hue: 200 },
  quant: { label: 'Quant', oneLine: 'Numeric bounds + probabilities.', initial: 'Q', hue: 138 },
  on_the_ground: { label: 'On-the-Ground', oneLine: 'Only events in the last 30 days.', initial: 'G', hue: 48 },
};

export class CouncilTrajectory {
  private root: HTMLElement;
  private opts: CouncilTrajectoryOptions;
  private statusBadge!: HTMLElement;
  private personaCols = new Map<string, PersonaCol>();
  private synthPane!: HTMLElement;
  private synthBody!: HTMLElement;
  private bottomLineEl!: HTMLElement;
  private synthBuffer = '';

  constructor(root: HTMLElement, opts: CouncilTrajectoryOptions = {}) {
    this.root = root;
    this.opts = opts;
    this.scaffold();
  }

  private scaffold(): void {
    this.root.classList.add('nw-council');
    this.root.innerHTML = `
      <header class="nw-council-header">
        <span class="nw-council-pulse" aria-hidden="true"></span>
        <span class="nw-council-title">THE COUNCIL · 5 voices, 1 verdict</span>
        <span class="nw-council-status" data-status>initializing…</span>
      </header>
      <div class="nw-council-grid"></div>
      <section class="nw-council-synth" hidden>
        <div class="nw-council-synth-header">Synthesizer</div>
        <div class="nw-council-synth-body"></div>
        <div class="nw-council-bottom-line" hidden></div>
      </section>
    `;
    this.statusBadge = this.root.querySelector('[data-status]')!;
    this.synthPane = this.root.querySelector('.nw-council-synth')!;
    this.synthBody = this.root.querySelector('.nw-council-synth-body')!;
    this.bottomLineEl = this.root.querySelector('.nw-council-bottom-line')!;

    const grid = this.root.querySelector('.nw-council-grid')!;
    PERSONA_ORDER.forEach((id, i) => {
      const meta = PLACEHOLDER_PERSONAS[id]!;
      const col = document.createElement('article');
      col.className = 'nw-council-col';
      col.dataset.persona = id;
      col.style.setProperty('--col-i', String(i));
      col.style.setProperty('--col-hue', String(meta.hue));
      col.innerHTML = `
        <header class="nw-council-col-header">
          <span class="nw-council-col-avatar" aria-hidden="true">${meta.initial}</span>
          <div class="nw-council-col-meta">
            <div class="nw-council-col-label">${meta.label}</div>
            <div class="nw-council-col-one-line">${meta.oneLine}</div>
          </div>
          <span class="nw-council-col-status" data-col-status>waiting</span>
        </header>
        <div class="nw-council-col-body" data-col-body></div>
      `;
      grid.appendChild(col);
      this.personaCols.set(id, {
        id,
        label: meta.label,
        oneLine: meta.oneLine,
        body: col,
        status: col.querySelector('[data-col-status]')!,
        text: col.querySelector('[data-col-body]')!,
      });
    });
  }

  async run(payload: CouncilRunPayload): Promise<void> {
    this.setStatus('connecting…', 'connecting');
    const endpoint = this.opts.endpoint ?? '/api/v2/council';
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      this.error(e instanceof Error ? e.message : 'network_error');
      return;
    }
    if (!response.ok || !response.body) {
      this.error(`council_${response.status}`);
      return;
    }
    this.setStatus('running', 'running');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        this.handleFrame(frame);
      }
    }
  }

  private handleFrame(frame: string): void {
    const lines = frame.split('\n');
    let event = 'message';
    let dataStr = '';
    for (const l of lines) {
      if (l.startsWith('event: ')) event = l.slice(7).trim();
      else if (l.startsWith('data: ')) dataStr += l.slice(6);
    }
    if (!dataStr) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return;
    }

    switch (event) {
      case 'run_started':
        this.setStatus('gathering data…', 'gathering');
        break;
      case 'appendix_ready':
        this.setStatus(`appendix ${Number(data.chars).toLocaleString()} chars · calling personas`, 'calling');
        for (const col of this.personaCols.values()) {
          col.status.textContent = 'queued';
          col.status.dataset.col = 'queued';
        }
        break;
      case 'persona_start': {
        const id = String(data.persona);
        const col = this.personaCols.get(id);
        if (col) {
          col.status.textContent = 'thinking';
          col.status.dataset.col = 'running';
          col.text.textContent = '';
        }
        break;
      }
      case 'persona_done': {
        const id = String(data.persona);
        const ok = data.ok !== false;
        const col = this.personaCols.get(id);
        if (col) {
          col.status.textContent = ok ? 'done' : 'error';
          col.status.dataset.col = ok ? 'done' : 'error';
          col.text.textContent = ok ? String(data.text ?? '') : `error: ${String(data.error ?? 'unknown')}`;
        }
        break;
      }
      case 'synthesizer_start':
        this.synthPane.hidden = false;
        this.synthBody.textContent = '';
        this.setStatus('synthesizing verdict…', 'synthesizing');
        break;
      case 'synthesizer_token': {
        const t = String(data.text ?? '');
        if (!t) break;
        this.synthBuffer += t;
        this.synthBody.textContent = this.synthBuffer;
        break;
      }
      case 'synthesizer_done':
        this.setStatus('verdict written', 'verdict');
        break;
      case 'done': {
        this.setStatus('done', 'done');
        const bl = String(data.bottom_line ?? '').trim();
        if (bl) {
          this.bottomLineEl.hidden = false;
          this.bottomLineEl.innerHTML = `<span class="nw-council-bl-label">Bottom line</span><span class="nw-council-bl-text">${escapeHtml(bl)}</span>`;
        }
        this.opts.onDone?.({
          run_id: (data.run_id as number | null) ?? null,
          total_spend_usd: Number(data.total_spend_usd ?? 0),
          bottom_line: bl,
        });
        break;
      }
      case 'error':
        this.error(`${String(data.stage ?? 'council')}: ${String(data.message ?? 'unknown')}`);
        break;
    }
  }

  private setStatus(label: string, kind: string): void {
    this.statusBadge.textContent = label;
    this.statusBadge.dataset.status = kind;
  }

  private error(msg: string): void {
    this.setStatus(`error: ${msg}`, 'error');
    this.opts.onError?.(msg);
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

let stylesInjected = false;
export function injectCouncilStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-council {
      font-family: 'JetBrains Mono', monospace;
      color: var(--color-text, #e0e0e0);
      background: var(--color-surface-1, #0a0a0a);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      overflow: hidden;
    }
    .nw-council-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1.1rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      background: var(--color-surface-2, #0f0f0f);
    }
    .nw-council-pulse {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--color-accent, #ff6600);
      animation: nw-council-pulse 1.6s infinite;
    }
    @keyframes nw-council-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0.55); }
      70%  { box-shadow: 0 0 0 10px rgba(255, 102, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0); }
    }
    .nw-council-title {
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      color: var(--color-accent, #ff6600);
      font-weight: 600;
    }
    .nw-council-status {
      margin-left: auto;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: lowercase;
      color: var(--color-text-muted, #888);
    }
    .nw-council-status[data-status="done"]    { color: #22c55e; }
    .nw-council-status[data-status="verdict"] { color: #22c55e; }
    .nw-council-status[data-status="error"]   { color: #dc2626; }

    .nw-council-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
    }
    @media (max-width: 900px) {
      .nw-council-grid { grid-template-columns: 1fr; }
    }
    .nw-council-col {
      padding: 0.85rem 1rem 1rem;
      border-right: 1px solid var(--color-border, #2a2a2a);
      min-height: 280px;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateY(8px);
      animation: nw-council-col-in 0.5s cubic-bezier(.16,.84,.44,1) forwards;
      animation-delay: calc(var(--col-i, 0) * 0.08s + 0.1s);
    }
    @keyframes nw-council-col-in {
      to { opacity: 1; transform: translateY(0); }
    }
    .nw-council-col:last-child { border-right: none; }
    @media (max-width: 900px) {
      .nw-council-col { border-right: none; border-bottom: 1px solid var(--color-border, #2a2a2a); }
      .nw-council-col:last-child { border-bottom: none; }
    }
    .nw-council-col-header {
      position: relative;
      padding-bottom: 0.65rem;
      margin-bottom: 0.65rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      display: grid;
      grid-template-columns: 28px 1fr;
      grid-template-rows: auto auto;
      gap: 0.15rem 0.55rem;
    }
    .nw-council-col-avatar {
      grid-row: 1 / 3;
      width: 28px; height: 28px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: hsl(var(--col-hue, 28), 80%, 14%);
      color: hsl(var(--col-hue, 28), 90%, 65%);
      border: 1px solid hsl(var(--col-hue, 28), 70%, 32%);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .nw-council-col-meta { min-width: 0; }
    .nw-council-col-label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--color-text, #f0f0f0);
      letter-spacing: 0.02em;
    }
    .nw-council-col-one-line {
      font-size: 0.68rem;
      color: var(--color-text-muted, #888);
      line-height: 1.4;
    }
    .nw-council-col-status {
      grid-column: 2;
      justify-self: end;
      align-self: start;
      font-size: 0.6rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 0.1rem 0.45rem;
      border-radius: 2px;
      background: var(--color-surface-2, #1a1a1a);
      color: var(--color-text-muted, #888);
    }
    .nw-council-col-status[data-col="queued"]  { background: rgba(102, 102, 102, 0.2); color: var(--color-text-muted, #888); }
    .nw-council-col-status[data-col="running"] {
      background: rgba(255, 102, 0, 0.15);
      color: var(--color-accent, #ff6600);
      animation: nw-council-pulse-text 1.4s ease-in-out infinite;
    }
    .nw-council-col-status[data-col="done"]    { background: rgba(34, 197, 94, 0.18); color: #22c55e; }
    .nw-council-col-status[data-col="error"]   { background: rgba(220, 38, 38, 0.18); color: #dc2626; }
    @keyframes nw-council-pulse-text {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }

    .nw-council-col-body {
      flex: 1;
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 0.88rem;
      line-height: 1.55;
      color: var(--color-text, #ddd);
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-y: auto;
      max-height: 420px;
    }
    .nw-council-col-body:empty::before {
      content: '…';
      color: var(--color-text-muted, #555);
      font-family: 'JetBrains Mono', monospace;
    }

    .nw-council-synth {
      padding: 1.2rem 1.4rem 1.4rem;
      background:
        radial-gradient(ellipse at top, rgba(255, 102, 0, 0.07), transparent 70%),
        var(--color-surface-2, #0f0f0f);
      border-top: 1px solid var(--color-border, #2a2a2a);
      animation: nw-council-synth-in 0.4s ease-out;
    }
    @keyframes nw-council-synth-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .nw-council-synth-header {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .nw-council-synth-header::before {
      content: '';
      width: 6px; height: 6px;
      background: var(--color-accent, #ff6600);
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(255, 102, 0, 0.18);
    }
    .nw-council-synth-body {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem;
      line-height: 1.7;
      color: var(--color-text, #e8e8e8);
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .nw-council-bottom-line {
      margin-top: 1.25rem;
      padding: 0.85rem 1.1rem;
      border-left: 3px solid var(--color-accent, #ff6600);
      background: linear-gradient(90deg, rgba(255, 102, 0, 0.14), rgba(255, 102, 0, 0.03));
      display: flex;
      gap: 0.85rem;
      align-items: center;
      animation: nw-council-bl-in 0.35s ease-out;
    }
    @keyframes nw-council-bl-in {
      from { opacity: 0; transform: translateX(-4px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .nw-council-bl-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      flex: 0 0 auto;
    }
    .nw-council-bl-text {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1rem;
      color: var(--color-text, #f4f4f4);
    }
  `;
  document.head.appendChild(style);
}
