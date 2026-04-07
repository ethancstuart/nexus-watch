import { createElement } from '../utils/dom.ts';
import type { CinemaProfile } from './profiles.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';
import type { AmbientAudio } from './AmbientAudio.ts';
import { computeTensionIndex, tensionColor, tensionLabel } from '../services/tensionIndex.ts';

export class HudOverlay {
  private container: HTMLElement | null = null;
  private tensionValueEl: HTMLElement | null = null;
  private tensionTrendEl: HTMLElement | null = null;
  private profileBadgeEl: HTMLElement | null = null;
  private metricsEl: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;
  private profile: CinemaProfile;
  private layerManager: MapLayerManager;
  private getLayerData: () => Map<string, unknown>;
  private audio: AmbientAudio | null = null;
  private active = false;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private dataHandler: ((e: Event) => void) | null = null;

  constructor(
    layerManager: MapLayerManager,
    getLayerData: () => Map<string, unknown>,
    profile: CinemaProfile,
  ) {
    this.layerManager = layerManager;
    this.getLayerData = getLayerData;
    this.profile = profile;
  }

  setAudio(audio: AmbientAudio): void {
    this.audio = audio;
  }

  start(): void {
    this.active = true;
    this.container = this.buildHUD();
    document.body.appendChild(this.container);

    // Stagger reveal
    requestAnimationFrame(() => {
      setTimeout(() => this.container?.classList.add('revealed'), 100);
    });

    // UTC clock
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.updateClock();

    // Data updates
    this.dataHandler = () => this.updateData();
    document.addEventListener('dashview:layer-data', this.dataHandler);

    // Initial data render
    this.updateData();
  }

  stop(): void {
    this.active = false;
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.dataHandler) document.removeEventListener('dashview:layer-data', this.dataHandler);
    this.container?.remove();
    this.container = null;
  }

  setProfile(profile: CinemaProfile): void {
    this.profile = profile;
    if (this.profileBadgeEl) this.profileBadgeEl.textContent = profile.name;
    this.updateMetrics();
  }

  private buildHUD(): HTMLElement {
    const hud = createElement('div', { className: 'cinema-hud' });

    // Top-left: LIVE + time + profile badge
    const topLeft = createElement('div', { className: 'cinema-hud-topleft' });
    const live = createElement('span', { className: 'cinema-hud-live', textContent: 'LIVE' });
    this.timeEl = createElement('span', { className: 'cinema-hud-time', textContent: '--:--:-- UTC' });
    this.profileBadgeEl = createElement('span', {
      className: 'cinema-hud-profile-badge',
      textContent: this.profile.name,
    });
    topLeft.appendChild(live);
    topLeft.appendChild(this.timeEl);
    topLeft.appendChild(this.profileBadgeEl);

    // Top-right: Tension index
    const topRight = createElement('div', { className: 'cinema-hud-topright' });
    this.tensionValueEl = createElement('span', { className: 'cinema-hud-tension-value', textContent: '--' });
    const tensionLabelEl = createElement('span', { className: 'cinema-hud-tension-label', textContent: 'GLOBAL TENSION' });
    this.tensionTrendEl = createElement('span', { className: 'cinema-hud-tension-trend', textContent: '' });
    topRight.appendChild(this.tensionValueEl);
    topRight.appendChild(tensionLabelEl);
    topRight.appendChild(this.tensionTrendEl);

    // Bottom-left: Profile metrics
    const bottomLeft = createElement('div', { className: 'cinema-hud-bottomleft' });
    this.metricsEl = bottomLeft;

    // Bottom-right: Mute button
    const bottomRight = createElement('div', { className: 'cinema-hud-bottomright' });
    const muteBtn = createElement('button', {
      className: 'cinema-mute-btn',
      textContent: this.audio?.isMuted() !== false ? 'AUDIO OFF' : 'AUDIO ON',
    });
    muteBtn.addEventListener('click', () => {
      if (this.audio) {
        const nowMuted = this.audio.toggleMute();
        muteBtn.textContent = nowMuted ? 'AUDIO OFF' : 'AUDIO ON';
      }
    });
    bottomRight.appendChild(muteBtn);

    hud.appendChild(topLeft);
    hud.appendChild(topRight);
    hud.appendChild(bottomLeft);
    hud.appendChild(bottomRight);

    return hud;
  }

  private updateClock(): void {
    if (!this.timeEl) return;
    const now = new Date();
    this.timeEl.textContent = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')} UTC`;
  }

  private updateData(): void {
    if (!this.active) return;
    this.updateTension();
    this.updateMetrics();
  }

  private updateTension(): void {
    if (!this.tensionValueEl || !this.tensionTrendEl) return;

    const data = this.getLayerData();
    const tension = computeTensionIndex(data);

    this.tensionValueEl.textContent = String(tension.global);
    this.tensionValueEl.style.color = tensionColor(tension.global);
    this.tensionValueEl.style.textShadow = `0 0 20px ${tensionColor(tension.global)}, 0 0 40px ${tensionColor(tension.global)}40`;

    const label = tensionLabel(tension.global);
    const trendArrow = tension.trend === 'rising' ? '▲' : tension.trend === 'falling' ? '▼' : '—';
    this.tensionTrendEl.textContent = `${label} ${trendArrow}`;
  }

  private updateMetrics(): void {
    if (!this.metricsEl) return;
    this.metricsEl.textContent = '';

    for (const metric of this.profile.hudMetrics) {
      let value = 0;

      if (metric.countType === 'layers') {
        value = this.layerManager.getEnabledLayers().length;
      } else if (metric.countType === 'features') {
        if (metric.layerIds) {
          for (const id of metric.layerIds) {
            const layers = this.layerManager.getAllLayers();
            const layer = layers.find((l) => l.id === id);
            if (layer) value += layer.getFeatureCount();
          }
        } else {
          // Total features across all enabled layers
          for (const layer of this.layerManager.getEnabledLayers()) {
            value += layer.getFeatureCount();
          }
        }
      }

      const stat = createElement('span', { className: 'cinema-hud-stat' });
      stat.innerHTML = `<strong>${value}</strong> ${metric.label}`;
      this.metricsEl.appendChild(stat);
    }
  }
}
