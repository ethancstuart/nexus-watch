import { createElement } from '../utils/dom.ts';

export interface TimelineConfig {
  onTimeChange: (timestamp: number | null) => void; // null = show all (live mode)
}

export function createTimeline(config: TimelineConfig): HTMLElement {
  const wrapper = createElement('div', { className: 'nw-timeline' });

  const label = createElement('span', { className: 'nw-timeline-label', textContent: 'LIVE' });

  const track = createElement('div', { className: 'nw-timeline-track' });
  const fill = createElement('div', { className: 'nw-timeline-fill' });
  fill.style.width = '100%';
  const thumb = createElement('div', { className: 'nw-timeline-thumb' });
  thumb.style.left = '100%';
  track.appendChild(fill);
  track.appendChild(thumb);

  const rangeSelect = createElement('div', { className: 'nw-timeline-range' });
  const ranges = [
    { label: '1H', hours: 1 },
    { label: '6H', hours: 6 },
    { label: '24H', hours: 24 },
    { label: '7D', hours: 168 },
    { label: 'LIVE', hours: 0 },
  ];

  let currentRange = 0; // 0 = live
  let scrubPosition = 1.0; // 0-1, 1 = now

  for (const range of ranges) {
    const btn = createElement('button', { className: 'nw-timeline-range-btn' });
    btn.textContent = range.label;
    if (range.hours === 0) btn.classList.add('active');

    btn.addEventListener('click', () => {
      currentRange = range.hours;
      rangeSelect.querySelectorAll('.nw-timeline-range-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (range.hours === 0) {
        // Live mode
        scrubPosition = 1.0;
        fill.style.width = '100%';
        thumb.style.left = '100%';
        label.textContent = 'LIVE';
        label.style.color = '#22c55e';
        config.onTimeChange(null);
      } else {
        updateScrub(scrubPosition);
      }
    });

    rangeSelect.appendChild(btn);
  }

  function updateScrub(position: number) {
    scrubPosition = Math.max(0, Math.min(1, position));
    fill.style.width = `${scrubPosition * 100}%`;
    thumb.style.left = `${scrubPosition * 100}%`;

    if (currentRange === 0) {
      label.textContent = 'LIVE';
      label.style.color = '#22c55e';
      config.onTimeChange(null);
      return;
    }

    const now = Date.now();
    const rangeMs = currentRange * 3600000;
    const timestamp = now - rangeMs + scrubPosition * rangeMs;

    const date = new Date(timestamp);
    label.textContent = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    label.style.color = scrubPosition >= 0.95 ? '#22c55e' : '#ff6600';

    config.onTimeChange(timestamp);
  }

  // Drag scrubber
  let dragging = false;
  const onMove = (clientX: number) => {
    const rect = track.getBoundingClientRect();
    const pos = (clientX - rect.left) / rect.width;
    updateScrub(pos);
  };

  track.addEventListener('mousedown', (e) => {
    dragging = true;
    onMove(e.clientX);
  });
  document.addEventListener('mousemove', (e) => {
    if (dragging) onMove(e.clientX);
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
  });

  // Touch support
  track.addEventListener('touchstart', (e) => {
    dragging = true;
    onMove(e.touches[0].clientX);
  });
  document.addEventListener('touchmove', (e) => {
    if (dragging) onMove(e.touches[0].clientX);
  });
  document.addEventListener('touchend', () => {
    dragging = false;
  });

  wrapper.appendChild(label);
  wrapper.appendChild(track);
  wrapper.appendChild(rangeSelect);

  return wrapper;
}
