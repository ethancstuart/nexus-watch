import { Panel } from './Panel.ts';
import { createElement } from '../utils/dom.ts';
import { fetchSpotifyData, disconnectSpotify } from '../services/spotify.ts';
import type { SpotifyData, SpotifyTrack } from '../types/index.ts';
import type { WidgetSize } from '../types/index.ts';

const CONNECTED_KEY = 'dashview-spotify-connected';

export class SpotifyPanel extends Panel {
  private data: SpotifyData | null = null;
  private connected = false;

  constructor() {
    super({
      id: 'spotify',
      title: 'Spotify',
      enabled: true,
      refreshInterval: 30000,
      priority: 2,
      requiredTier: 'premium',
      category: 'personal',
    });
  }

  getLastData(): SpotifyData | null {
    return this.data;
  }

  override async startDataCycle(): Promise<void> {
    // Check for spotify=connected URL param (redirect back from OAuth)
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      localStorage.setItem(CONNECTED_KEY, 'true');
      this.connected = true;
      // Clean up the URL param
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      window.history.replaceState({}, '', url.toString());
    }
    await super.startDataCycle();
  }

  async fetchData(): Promise<void> {
    this.connected = localStorage.getItem(CONNECTED_KEY) === 'true';
    if (!this.connected) {
      this.render(null);
      return;
    }
    try {
      this.data = await fetchSpotifyData();
    } catch {
      this.data = null;
    }
    this.render(this.data);
  }

  render(data: unknown): void {
    this.contentEl.textContent = '';

    if (!this.connected) {
      this.renderConnectState();
      return;
    }

    const spotifyData = data as SpotifyData | null;

    if (!spotifyData) {
      const empty = createElement('div', {
        className: 'spotify-now-playing',
        textContent: 'Unable to load Spotify data',
      });
      this.contentEl.appendChild(empty);
      this.renderDisconnectBtn();
      return;
    }

    if (spotifyData.currentTrack) {
      this.renderNowPlaying(spotifyData.currentTrack, spotifyData.isPlaying);
    } else {
      this.renderNotPlaying(spotifyData.recentTracks);
    }

    this.renderDisconnectBtn();
  }

  renderAtSize(size: WidgetSize): void {
    if (!this.connected) {
      this.render(null);
      return;
    }

    if (size === 'compact') {
      this.contentEl.textContent = '';
      if (this.data?.currentTrack) {
        const wrap = createElement('div', { className: 'spotify-now-playing' });
        wrap.style.cssText = 'text-align:center;padding:8px 0';
        const name = createElement('div', {});
        name.style.cssText = 'font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        name.textContent = this.data.currentTrack.name;
        const artist = createElement('div', {});
        artist.style.cssText = 'font-size:11px;color:var(--color-text-muted)';
        artist.textContent = this.data.currentTrack.artist;
        wrap.appendChild(name);
        wrap.appendChild(artist);
        this.contentEl.appendChild(wrap);
      } else {
        const wrap = createElement('div', { className: 'spotify-now-playing' });
        wrap.style.cssText = 'text-align:center;padding:8px 0;font-size:12px;color:var(--color-text-muted)';
        wrap.textContent = 'Not playing';
        this.contentEl.appendChild(wrap);
      }
      return;
    }

    if (this.data) this.render(this.data);
  }

  private renderConnectState(): void {
    const wrap = createElement('div', { className: 'spotify-connect' });

    const icon = createElement('div', { className: 'spotify-connect-icon', textContent: '\uD83C\uDFB5' });
    wrap.appendChild(icon);

    const text = createElement('div', {
      className: 'spotify-connect-text',
      textContent: "Connect your Spotify account to see what you're listening to right on your dashboard.",
    });
    wrap.appendChild(text);

    const btn = createElement('button', { className: 'spotify-connect-btn', textContent: 'Connect Spotify' });
    btn.addEventListener('click', () => {
      window.location.href = '/api/spotify/connect';
    });
    wrap.appendChild(btn);

    this.contentEl.appendChild(wrap);
  }

  private renderNowPlaying(track: SpotifyTrack, isPlaying: boolean): void {
    const wrap = createElement('div', { className: 'spotify-now-playing' });

    // Album art
    if (track.albumArt) {
      const img = document.createElement('img');
      img.src = track.albumArt;
      img.alt = track.album;
      img.className = 'spotify-art';
      img.width = 64;
      img.height = 64;
      wrap.appendChild(img);
    }

    // Track info
    const info = createElement('div', { className: 'spotify-track-info' });

    const statusLabel = createElement('div', {});
    statusLabel.style.cssText =
      'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-muted);margin-bottom:4px';
    statusLabel.textContent = isPlaying ? 'Now Playing' : 'Paused';
    info.appendChild(statusLabel);

    const name = createElement('div', { className: 'spotify-track-name', textContent: track.name });
    info.appendChild(name);

    const artist = createElement('div', { className: 'spotify-artist', textContent: track.artist });
    info.appendChild(artist);

    const album = createElement('div', { className: 'spotify-album', textContent: track.album });
    info.appendChild(album);

    wrap.appendChild(info);
    this.contentEl.appendChild(wrap);

    // Progress bar
    if (track.durationMs > 0) {
      const progress = createElement('div', { className: 'spotify-progress' });
      const bar = createElement('div', { className: 'spotify-progress-bar' });
      const fill = createElement('div', { className: 'spotify-progress-fill' });
      const pct = Math.min(100, (track.progressMs / track.durationMs) * 100);
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);

      const times = createElement('div', {});
      times.style.cssText =
        'display:flex;justify-content:space-between;font-size:10px;color:var(--color-text-muted);margin-top:2px';
      const current = createElement('span', { textContent: this.formatMs(track.progressMs) });
      const total = createElement('span', { textContent: this.formatMs(track.durationMs) });
      times.appendChild(current);
      times.appendChild(total);

      progress.appendChild(bar);
      progress.appendChild(times);
      this.contentEl.appendChild(progress);
    }
  }

  private renderNotPlaying(recentTracks: SpotifyTrack[]): void {
    const header = createElement('div', { className: 'spotify-now-playing' });
    header.style.cssText = 'text-align:center;padding:12px 0;color:var(--color-text-muted)';
    header.textContent = 'Nothing playing';
    this.contentEl.appendChild(header);

    if (recentTracks.length > 0) {
      const recentLabel = createElement('div', {});
      recentLabel.style.cssText =
        'font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-muted);padding:8px 12px 4px;border-top:1px solid var(--color-border)';
      recentLabel.textContent = 'Recently Played';
      this.contentEl.appendChild(recentLabel);

      const list = createElement('div', { className: 'spotify-recent' });
      for (const track of recentTracks.slice(0, 10)) {
        const row = createElement('div', { className: 'spotify-recent-track' });

        const trackInfo = createElement('div', {});
        trackInfo.style.cssText = 'flex:1;min-width:0';
        const name = createElement('div', {});
        name.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        name.textContent = track.name;
        const artist = createElement('div', {});
        artist.style.cssText =
          'font-size:11px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        artist.textContent = track.artist;
        trackInfo.appendChild(name);
        trackInfo.appendChild(artist);

        row.appendChild(trackInfo);
        list.appendChild(row);
      }
      this.contentEl.appendChild(list);
    }
  }

  private renderDisconnectBtn(): void {
    const btn = createElement('button', { className: 'spotify-disconnect-btn', textContent: 'Disconnect' });
    btn.addEventListener('click', async () => {
      await disconnectSpotify();
      localStorage.removeItem(CONNECTED_KEY);
      this.connected = false;
      this.data = null;
      this.render(null);
    });
    this.contentEl.appendChild(btn);
  }

  private formatMs(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
