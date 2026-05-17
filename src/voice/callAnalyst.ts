/**
 * "Call the Analyst" — voice-input → analyst-text → spoken-reply.
 *
 * Pipeline:
 *   1. Web Speech API SpeechRecognition transcribes the user's voice
 *   2. POST text to /api/voice/ask → returns { audio_url, transcript }
 *   3. Play the returned mp3 in an <audio> element
 *
 * Falls back to a textarea+button when SpeechRecognition isn't available
 * (Firefox, Safari Mobile, etc.).
 *
 * 2026-05 tier-up Phase 4.
 */

interface CallAnalystOptions {
  endpoint?: string;
  onError?: (msg: string) => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>;
  resultIndex: number;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export class CallAnalyst {
  private root: HTMLElement;
  private opts: CallAnalystOptions;
  private status!: HTMLElement;
  private transcript!: HTMLElement;
  private reply!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private micBtn!: HTMLButtonElement;
  private audioEl!: HTMLAudioElement;
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;

  constructor(root: HTMLElement, opts: CallAnalystOptions = {}) {
    this.root = root;
    this.opts = opts;
    this.scaffold();
    this.initRecognition();
    this.wire();
  }

  private scaffold(): void {
    this.root.classList.add('nw-call');
    this.root.innerHTML = `
      <div class="nw-call-header">
        <span class="nw-call-pulse" aria-hidden="true"></span>
        <span class="nw-call-title">CALL THE ANALYST · live voice agent</span>
        <span class="nw-call-status" data-status>ready</span>
      </div>
      <div class="nw-call-body">
        <textarea class="nw-call-input" data-input
          placeholder="Type a question, or tap the mic. e.g. 'What's the CII for Ukraine?'"
          maxlength="500"></textarea>
        <div class="nw-call-actions">
          <button class="nw-call-mic" data-mic title="Hold to speak (releases on stop)">🎙</button>
          <button class="nw-call-send" data-send>▸ Ask analyst</button>
          <span class="nw-call-cap">10 calls/day per IP</span>
        </div>
      </div>
      <div class="nw-call-reply" hidden>
        <div class="nw-call-reply-label">Transcript</div>
        <div class="nw-call-reply-text" data-reply></div>
      </div>
      <audio data-audio preload="none"></audio>
    `;
    this.status = this.root.querySelector('[data-status]') as HTMLElement;
    this.transcript = this.root.querySelector('.nw-call-reply') as HTMLElement;
    this.reply = this.root.querySelector('[data-reply]') as HTMLElement;
    this.input = this.root.querySelector('[data-input]') as HTMLTextAreaElement;
    this.sendBtn = this.root.querySelector('[data-send]') as HTMLButtonElement;
    this.micBtn = this.root.querySelector('[data-mic]') as HTMLButtonElement;
    this.audioEl = this.root.querySelector('[data-audio]') as HTMLAudioElement;
  }

  private initRecognition(): void {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      this.micBtn.disabled = true;
      this.micBtn.title = 'Voice input unavailable in this browser. Type instead.';
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i][0];
        if (alt?.transcript) final += alt.transcript;
      }
      this.input.value = final;
    };
    rec.onerror = (e) => {
      this.setStatus(`mic error: ${e.error}`, 'error');
      this.listening = false;
      this.micBtn.textContent = '🎙';
    };
    rec.onend = () => {
      this.listening = false;
      this.micBtn.textContent = '🎙';
      this.setStatus('ready', 'ready');
    };
    this.recognition = rec;
  }

  private wire(): void {
    this.sendBtn.addEventListener('click', () => void this.ask());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void this.ask();
      }
    });
    this.micBtn.addEventListener('click', () => {
      if (!this.recognition) return;
      if (this.listening) {
        this.recognition.stop();
      } else {
        this.input.value = '';
        this.recognition.start();
        this.listening = true;
        this.micBtn.textContent = '⏺';
        this.setStatus('listening…', 'listening');
      }
    });
  }

  private async ask(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    this.sendBtn.disabled = true;
    this.setStatus('thinking…', 'thinking');
    this.transcript.hidden = true;

    try {
      const res = await fetch(this.opts.endpoint ?? '/api/voice/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const msg = j.message ?? j.error ?? `voice_ask_${res.status}`;
        this.setStatus(`error: ${msg}`, 'error');
        this.opts.onError?.(msg);
        return;
      }
      const data = (await res.json()) as { audio_url: string; transcript: string; ms: number };
      this.reply.textContent = data.transcript;
      this.transcript.hidden = false;
      this.audioEl.src = data.audio_url;
      this.setStatus(`replied in ${(data.ms / 1000).toFixed(1)}s · playing`, 'playing');
      await this.audioEl.play();
    } catch (e) {
      this.setStatus(`error: ${e instanceof Error ? e.message : 'failed'}`, 'error');
    } finally {
      this.sendBtn.disabled = false;
    }
  }

  private setStatus(label: string, kind: string): void {
    this.status.textContent = label;
    this.status.dataset.status = kind;
  }
}

let stylesInjected = false;
export function injectCallAnalystStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-call {
      font-family: 'JetBrains Mono', monospace;
      background: var(--color-surface-1, #0a0a0a);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 6px;
      overflow: hidden;
    }
    .nw-call-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1.1rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      background: var(--color-surface-2, #0f0f0f);
    }
    .nw-call-pulse {
      width: 9px; height: 9px; border-radius: 50%;
      background: var(--color-accent, #ff6600);
      animation: nw-call-pulse 1.6s infinite;
    }
    @keyframes nw-call-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0.55); }
      70%  { box-shadow: 0 0 0 10px rgba(255, 102, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 102, 0, 0); }
    }
    .nw-call-title {
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      color: var(--color-accent, #ff6600);
      font-weight: 600;
    }
    .nw-call-status {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--color-text-muted, #888);
    }
    .nw-call-status[data-status="error"]    { color: #dc2626; }
    .nw-call-status[data-status="thinking"] { color: var(--color-accent, #ff6600); }
    .nw-call-status[data-status="playing"]  { color: #22c55e; }
    .nw-call-status[data-status="listening"]{ color: var(--color-accent, #ff6600); }

    .nw-call-body { padding: 1rem 1.1rem; }
    .nw-call-input {
      width: 100%;
      min-height: 64px;
      background: var(--color-surface-2, #0f0f0f);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      padding: 0.75rem;
      box-sizing: border-box;
      resize: vertical;
    }
    .nw-call-actions {
      display: flex; align-items: center; gap: 0.75rem; margin-top: 0.65rem;
    }
    .nw-call-mic, .nw-call-send {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      color: var(--color-text, #e0e0e0);
      padding: 0.55rem 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      letter-spacing: 0.05em;
      border-radius: 3px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .nw-call-mic:hover:not(:disabled), .nw-call-send:hover:not(:disabled) {
      border-color: var(--color-accent, #ff6600);
      color: var(--color-accent, #ff6600);
    }
    .nw-call-mic:disabled { opacity: 0.4; cursor: not-allowed; }
    .nw-call-send {
      background: var(--color-accent, #ff6600);
      color: #050505;
      border-color: var(--color-accent, #ff6600);
      font-weight: 700;
    }
    .nw-call-send:hover:not(:disabled) {
      background: #ff7d22; color: #050505;
    }
    .nw-call-cap {
      margin-left: auto;
      font-size: 0.68rem;
      color: var(--color-text-muted, #666);
      font-style: italic;
    }

    .nw-call-reply {
      padding: 0.85rem 1.1rem 1.1rem;
      border-top: 1px solid var(--color-border, #2a2a2a);
      background: var(--color-surface-2, #0f0f0f);
    }
    .nw-call-reply-label {
      font-size: 0.7rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin-bottom: 0.45rem;
    }
    .nw-call-reply-text {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1rem;
      line-height: 1.6;
      color: var(--color-text, #e8e8e8);
      white-space: pre-wrap;
    }
  `;
  document.head.appendChild(style);
}
