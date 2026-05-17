/**
 * Tiny WaveSurfer-backed audio player for NexusWatch FM.
 *
 * Lazy-loads wavesurfer.js (~80KB) only when constructed, so the main
 * bundle stays clean for non-audio pages.
 *
 * 2026-05 tier-up Phase 4.
 */

export interface WaveformPlayerOptions {
  url: string;
  /** Optional title shown above the waveform. */
  title?: string;
  /** Optional duration (sec) to display while audio metadata loads. */
  duration?: number;
}

export class WaveformPlayer {
  private root: HTMLElement;
  private opts: WaveformPlayerOptions;
  private ws: unknown = null;
  private playing = false;
  private playBtn!: HTMLButtonElement;
  private timeEl!: HTMLElement;

  constructor(root: HTMLElement, opts: WaveformPlayerOptions) {
    this.root = root;
    this.opts = opts;
    this.scaffold();
    void this.boot();
  }

  private scaffold(): void {
    this.root.classList.add('nw-wave');
    this.root.innerHTML = `
      ${this.opts.title ? `<div class="nw-wave-title">${escapeHtml(this.opts.title)}</div>` : ''}
      <div class="nw-wave-row">
        <button class="nw-wave-btn" data-act="play" aria-label="Play / pause">▶</button>
        <div class="nw-wave-canvas" data-canvas></div>
        <div class="nw-wave-time" data-time>${this.opts.duration ? fmt(this.opts.duration) : '0:00'}</div>
      </div>
    `;
    this.playBtn = this.root.querySelector('[data-act="play"]') as HTMLButtonElement;
    this.timeEl = this.root.querySelector('[data-time]') as HTMLElement;
    this.playBtn.addEventListener('click', () => void this.toggle());
  }

  private async boot(): Promise<void> {
    try {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      const ws = WaveSurfer.create({
        container: this.root.querySelector('[data-canvas]') as HTMLElement,
        url: this.opts.url,
        waveColor: 'rgba(255, 102, 0, 0.45)',
        progressColor: '#ff6600',
        cursorColor: '#ff6600',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        height: 48,
        normalize: true,
        backend: 'WebAudio',
      });
      this.ws = ws;
      ws.on('finish', () => {
        this.playing = false;
        this.playBtn.textContent = '▶';
      });
      ws.on('audioprocess', () => {
        const total = (ws.getDuration?.() as number | undefined) ?? this.opts.duration ?? 0;
        const cur = (ws.getCurrentTime?.() as number | undefined) ?? 0;
        this.timeEl.textContent = `${fmt(cur)} / ${fmt(total)}`;
      });
      ws.on('ready', () => {
        const total = (ws.getDuration?.() as number | undefined) ?? 0;
        this.timeEl.textContent = `0:00 / ${fmt(total)}`;
      });
    } catch (e) {
      this.root.innerHTML = `<div class="nw-wave-error">Audio failed to load: ${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
    }
  }

  private async toggle(): Promise<void> {
    const ws = this.ws as { playPause?: () => Promise<void> } | null;
    if (!ws?.playPause) return;
    await ws.playPause();
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? '❙❙' : '▶';
  }

  destroy(): void {
    const ws = this.ws as { destroy?: () => void } | null;
    ws?.destroy?.();
    this.ws = null;
  }
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let stylesInjected = false;
export function injectWaveformStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-wave {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-left: 2px solid var(--color-accent, #ff6600);
      border-radius: 4px;
      padding: 0.85rem 1rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .nw-wave-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem;
      color: var(--color-text, #f0f0f0);
      margin-bottom: 0.5rem;
    }
    .nw-wave-row {
      display: flex; align-items: center; gap: 0.85rem;
    }
    .nw-wave-btn {
      flex: 0 0 auto;
      width: 36px; height: 36px;
      background: var(--color-accent, #ff6600);
      color: #050505;
      border: none;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .nw-wave-btn:hover { background: #ff7d22; }
    .nw-wave-canvas { flex: 1; min-width: 0; }
    .nw-wave-time {
      font-size: 0.72rem;
      color: var(--color-text-muted, #888);
      flex: 0 0 auto;
      font-variant-numeric: tabular-nums;
    }
    .nw-wave-error {
      color: #dc2626;
      font-size: 0.8rem;
    }
  `;
  document.head.appendChild(style);
}
