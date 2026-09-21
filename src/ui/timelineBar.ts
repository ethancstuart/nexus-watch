import { createElement } from '../utils/dom.ts';

export interface TimelineEvent {
  timestamp: string;
  layer: string;
  count: number;
  data: unknown[];
}

export interface TimelineCIIDay {
  day: string;
  countries: Array<{ code: string; name: string; score: number }>;
}

interface TimelineState {
  days: 7 | 14 | 30;
  playing: boolean;
  speed: number; // 1, 2, 5, 10
  currentIndex: number;
  dateRange: string[];
  snapshots: TimelineEvent[];
  cii: TimelineCIIDay[];
}

type ScrubCallback = (date: string, snapshots: TimelineEvent[], cii: TimelineCIIDay | null) => void;

const SPEEDS = [1, 2, 5, 10];

export class TimelineBar {
  private container: HTMLElement;
  private state: TimelineState;
  private onScrub: ScrubCallback;
  private playInterval: ReturnType<typeof setInterval> | null = null;
  private collapsed = true;
  private sliderEl: HTMLInputElement | null = null;
  private dateLabel: HTMLElement | null = null;
  private playBtn: HTMLElement | null = null;
  private speedBtn: HTMLElement | null = null;
  private eventDotsEl: HTMLElement | null = null;
  private loading = false;

  constructor(parent: HTMLElement, onScrub: ScrubCallback) {
    this.container = createElement('div', { className: 'nw-timeline-bar collapsed' });
    this.onScrub = onScrub;
    this.state = {
      days: 7,
      playing: false,
      speed: 1,
      currentIndex: 0,
      dateRange: [],
      snapshots: [],
      cii: [],
    };
    this.render();
    parent.appendChild(this.container);
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="nw-timeline-toggle">
        <button class="nw-timeline-toggle-btn" title="Toggle timeline">
          <span class="nw-timeline-toggle-icon">▲</span>
          <span class="nw-timeline-toggle-text">TIMELINE</span>
        </button>
      </div>
      <div class="nw-timeline-content">
        <div class="nw-timeline-controls">
          <div class="nw-timeline-range-btns">
            <button class="nw-timeline-range active" data-days="7">7D</button>
            <button class="nw-timeline-range" data-days="14">14D</button>
            <button class="nw-timeline-range" data-days="30">30D</button>
          </div>
          <div class="nw-timeline-playback">
            <button class="nw-timeline-play" title="Play/Pause">▶</button>
            <button class="nw-timeline-step" data-dir="-1" title="Step back">◀</button>
            <button class="nw-timeline-step" data-dir="1" title="Step forward">▶</button>
            <button class="nw-timeline-speed" title="Playback speed">1x</button>
          </div>
          <div class="nw-timeline-date-label">Select a date</div>
        </div>
        <div class="nw-timeline-slider-row">
          <div class="nw-timeline-event-dots"></div>
          <input type="range" class="nw-timeline-slider" min="0" max="0" value="0">
          <div class="nw-timeline-axis"></div>
        </div>
      </div>
    `;

    // Toggle collapse
    const toggleBtn = this.container.querySelector('.nw-timeline-toggle-btn')!;
    toggleBtn.addEventListener('click', () => this.toggleCollapse());

    // Range buttons (7D, 14D, 30D)
    this.container.querySelectorAll('.nw-timeline-range').forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = parseInt((btn as HTMLElement).dataset.days || '7', 10) as 7 | 14 | 30;
        this.container.querySelectorAll('.nw-timeline-range').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.days = days;
        void this.loadData();
      });
    });

    // Play/pause
    this.playBtn = this.container.querySelector('.nw-timeline-play');
    this.playBtn?.addEventListener('click', () => this.togglePlay());

    // Step buttons
    this.container.querySelectorAll('.nw-timeline-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = parseInt((btn as HTMLElement).dataset.dir || '1', 10);
        this.step(dir);
      });
    });

    // Speed button
    this.speedBtn = this.container.querySelector('.nw-timeline-speed');
    this.speedBtn?.addEventListener('click', () => this.cycleSpeed());

    // Slider
    this.sliderEl = this.container.querySelector('.nw-timeline-slider');
    this.sliderEl?.addEventListener('input', () => {
      this.state.currentIndex = parseInt(this.sliderEl!.value, 10);
      this.emitScrub();
    });

    // Date label
    this.dateLabel = this.container.querySelector('.nw-timeline-date-label');

    // Event dots
    this.eventDotsEl = this.container.querySelector('.nw-timeline-event-dots');
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.container.classList.toggle('collapsed', this.collapsed);
    const icon = this.container.querySelector('.nw-timeline-toggle-icon');
    if (icon) icon.textContent = this.collapsed ? '▲' : '▼';
    if (!this.collapsed && this.state.dateRange.length === 0) {
      void this.loadData();
    }
  }

  private async loadData(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    if (this.dateLabel) this.dateLabel.textContent = 'Loading...';

    try {
      const res = await fetch(`/api/v1/timeline-data?days=${this.state.days}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as {
        dateRange: string[];
        snapshots: TimelineEvent[];
        cii: TimelineCIIDay[];
      };

      this.state.dateRange = data.dateRange;
      this.state.snapshots = data.snapshots;
      this.state.cii = data.cii;
      this.state.currentIndex = data.dateRange.length - 1; // Start at present

      // Update slider
      if (this.sliderEl) {
        this.sliderEl.max = String(data.dateRange.length - 1);
        this.sliderEl.value = String(this.state.currentIndex);
      }

      // Render axis labels
      this.renderAxis();
      this.renderEventDots();
      this.emitScrub();
    } catch {
      if (this.dateLabel) this.dateLabel.textContent = 'Failed to load timeline data';
    } finally {
      this.loading = false;
    }
  }

  private renderAxis(): void {
    const axis = this.container.querySelector('.nw-timeline-axis');
    if (!axis) return;

    const dates = this.state.dateRange;
    // Show ~5-7 evenly spaced labels
    const step = Math.max(1, Math.floor(dates.length / 6));
    const labels: string[] = [];
    for (let i = 0; i < dates.length; i += step) {
      const d = new Date(dates[i] + 'T12:00:00Z');
      labels.push(
        `<span style="left:${(i / (dates.length - 1)) * 100}%">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`,
      );
    }
    axis.innerHTML = labels.join('');
  }

  private renderEventDots(): void {
    if (!this.eventDotsEl) return;
    const dates = this.state.dateRange;
    if (dates.length === 0) return;

    // Count events per day from snapshots
    const countByDate = new Map<string, number>();
    for (const snap of this.state.snapshots) {
      const day = new Date(snap.timestamp).toISOString().split('T')[0];
      countByDate.set(day, (countByDate.get(day) || 0) + snap.count);
    }

    const maxCount = Math.max(1, ...Array.from(countByDate.values()));
    const dots = dates.map((date, i) => {
      const count = countByDate.get(date) || 0;
      const opacity = count > 0 ? 0.3 + (count / maxCount) * 0.7 : 0;
      const size = count > 0 ? 2 + (count / maxCount) * 4 : 0;
      return `<span class="nw-timeline-dot" style="left:${(i / (dates.length - 1)) * 100}%;opacity:${opacity};width:${size}px;height:${size}px;" title="${date}: ${count} events"></span>`;
    });
    this.eventDotsEl.innerHTML = dots.join('');
  }

  private emitScrub(): void {
    const date = this.state.dateRange[this.state.currentIndex];
    if (!date) return;

    // Update date label
    if (this.dateLabel) {
      const d = new Date(date + 'T12:00:00Z');
      const isToday = date === new Date().toISOString().split('T')[0];
      this.dateLabel.textContent = isToday
        ? 'Today'
        : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Find snapshots closest to this date
    const dateSnapshots = this.state.snapshots.filter((s) => {
      const snapDay = new Date(s.timestamp).toISOString().split('T')[0];
      return snapDay === date;
    });

    // Find CII for this date
    const cii = this.state.cii.find((c) => c.day === date) || null;

    this.onScrub(date, dateSnapshots, cii);
  }

  private togglePlay(): void {
    this.state.playing = !this.state.playing;
    if (this.playBtn) this.playBtn.textContent = this.state.playing ? '⏸' : '▶';

    if (this.state.playing) {
      // Start from beginning if at end
      if (this.state.currentIndex >= this.state.dateRange.length - 1) {
        this.state.currentIndex = 0;
      }
      this.playInterval = setInterval(() => {
        this.step(1);
        if (this.state.currentIndex >= this.state.dateRange.length - 1) {
          this.togglePlay(); // Stop at end
        }
      }, 1000 / this.state.speed);
    } else if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  private step(dir: number): void {
    this.state.currentIndex = Math.max(0, Math.min(this.state.dateRange.length - 1, this.state.currentIndex + dir));
    if (this.sliderEl) this.sliderEl.value = String(this.state.currentIndex);
    this.emitScrub();
  }

  private cycleSpeed(): void {
    const idx = SPEEDS.indexOf(this.state.speed);
    this.state.speed = SPEEDS[(idx + 1) % SPEEDS.length];
    if (this.speedBtn) this.speedBtn.textContent = `${this.state.speed}x`;

    // Restart interval if playing
    if (this.state.playing && this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = setInterval(() => {
        this.step(1);
        if (this.state.currentIndex >= this.state.dateRange.length - 1) {
          this.togglePlay();
        }
      }, 1000 / this.state.speed);
    }
  }

  show(): void {
    if (this.collapsed) this.toggleCollapse();
  }

  destroy(): void {
    if (this.playInterval) clearInterval(this.playInterval);
    this.container.remove();
  }
}
