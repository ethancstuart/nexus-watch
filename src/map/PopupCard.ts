// Bloomberg-styled popup card generator for all map layer data points

interface PopupField {
  label: string;
  value: string;
  color?: string;
}

interface PopupConfig {
  type: string;
  typeColor: string;
  title: string;
  fields: PopupField[];
  actionUrl?: string;
  actionLabel?: string;
}

export function renderPopupCard(config: PopupConfig): string {
  const fieldsHtml = config.fields
    .map(
      (f) =>
        `<div class="nw-popup-field"><span class="nw-popup-field-label">${f.label}</span><span class="nw-popup-field-value" ${f.color ? `style="color:${f.color}"` : ''}>${f.value}</span></div>`,
    )
    .join('');

  const actionHtml = config.actionUrl
    ? `<a class="nw-popup-action" href="${config.actionUrl}" target="_blank" rel="noopener">${config.actionLabel || 'Details'} →</a>`
    : '';

  return `<div class="nw-popup-card">
    <div class="nw-popup-header">
      <span class="nw-popup-type" style="color:${config.typeColor}">${config.type}</span>
    </div>
    <div class="nw-popup-title">${config.title}</div>
    <div class="nw-popup-fields">${fieldsHtml}</div>
    ${actionHtml}
  </div>`;
}

// Convenience builders for each layer type

export function earthquakePopup(props: Record<string, unknown>): string {
  const mag = Number(props.magnitude);
  const depth = Number(props.depth);
  const time = Number(props.time);
  const timeAgo = formatTimeAgo(time);

  return renderPopupCard({
    type: `M${mag} EARTHQUAKE`,
    typeColor: mag >= 6 ? '#ff3333' : mag >= 4.5 ? '#ffa500' : '#ff6b6b',
    title: String(props.place),
    fields: [
      { label: 'Depth', value: `${depth.toFixed(1)} km` },
      { label: 'Time', value: timeAgo },
      { label: 'Tsunami', value: props.tsunami ? 'WARNING' : 'No', color: props.tsunami ? '#ff3333' : undefined },
    ],
    actionUrl: String(props.url),
    actionLabel: 'USGS Details',
  });
}

export function flightPopup(props: Record<string, unknown>): string {
  const alt = Number(props.altitude);
  const vel = Number(props.velocity);
  return renderPopupCard({
    type: 'AIRCRAFT',
    typeColor: '#818cf8',
    title: String(props.callsign || props.icao),
    fields: [
      { label: 'Country', value: String(props.country) },
      { label: 'Altitude', value: alt > 0 ? `${(alt * 3.281).toFixed(0)} ft` : 'Ground' },
      { label: 'Speed', value: vel > 0 ? `${(vel * 1.944).toFixed(0)} kts` : '—' },
      { label: 'Heading', value: `${Number(props.heading).toFixed(0)}°` },
    ],
  });
}

export function newsPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `${props.count} ARTICLES`,
    typeColor: String(props.color),
    title: String(props.title),
    fields: [
      { label: 'Source', value: String(props.source) },
      { label: 'Region', value: String(props.country) },
    ],
  });
}

export function firePopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: 'FIRE HOTSPOT',
    typeColor: '#ff6b00',
    title: `FRP: ${Number(props.frp).toFixed(1)} MW`,
    fields: [
      { label: 'Satellite', value: String(props.satellite) },
      { label: 'Confidence', value: String(props.confidence) },
      { label: 'Detected', value: `${props.acqDate} ${props.acqTime}` },
    ],
  });
}

export function militaryPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `${String(props.alliance).toUpperCase()} ${String(props.type).toUpperCase()}`,
    typeColor: String(props.color),
    title: String(props.name),
    fields: [{ label: 'Country', value: String(props.country) }],
  });
}

export function nuclearPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `NUCLEAR ${String(props.type).toUpperCase()}`,
    typeColor: String(props.color),
    title: String(props.name),
    fields: [
      { label: 'Country', value: String(props.country) },
      { label: 'Status', value: String(props.status) },
    ],
  });
}

export function portPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: String(props.type).toUpperCase(),
    typeColor: String(props.color),
    title: String(props.name),
    fields: [{ label: 'Country', value: String(props.country) }],
  });
}

export function conflictPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `${String(props.intensity).toUpperCase()} CONFLICT`,
    typeColor: String(props.color),
    title: String(props.name),
    fields: [{ label: 'Region', value: String(props.region) }],
  });
}

export function weatherPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: String(props.severity).toUpperCase(),
    typeColor: String(props.color),
    title: String(props.description),
    fields: [{ label: 'Location', value: `${props.city}, ${props.country}` }],
  });
}

export function cyberPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `${String(props.level).toUpperCase()} THREAT`,
    typeColor: String(props.color),
    title: String(props.label),
    fields: [{ label: 'Type', value: 'Cyber threat corridor' }],
  });
}

export function cablePopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: 'SUBSEA CABLE',
    typeColor: '#06b6d4',
    title: String(props.name),
    fields: [
      { label: 'Owner', value: String(props.owner) },
      { label: 'Year', value: String(props.year) },
    ],
  });
}

export function pipelinePopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `${String(props.type).toUpperCase()} · ${String(props.status).toUpperCase()}`,
    typeColor: String(props.color),
    title: String(props.name),
    fields: [],
  });
}

export function gpsPopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: `GPS JAMMING · ${String(props.severity).toUpperCase()}`,
    typeColor: String(props.color),
    title: String(props.name),
    fields: [
      { label: 'Region', value: String(props.region) },
      { label: 'Radius', value: `~${props.radius}km` },
    ],
  });
}

export function satellitePopup(props: Record<string, unknown>): string {
  return renderPopupCard({
    type: String(props.type).toUpperCase(),
    typeColor: String(props.color),
    title: String(props.name),
    fields: [
      { label: 'Country', value: String(props.country) },
      { label: 'Altitude', value: `${props.altitude}km` },
    ],
  });
}

export function predictionPopup(props: Record<string, unknown>): string {
  const vol = Number(props.volume);
  const volStr = vol > 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : vol > 1e3 ? `$${(vol / 1e3).toFixed(0)}K` : `$${vol}`;
  return renderPopupCard({
    type: `${props.probability}% PROBABILITY`,
    typeColor: String(props.color),
    title: String(props.question),
    fields: [
      { label: 'Source', value: String(props.source) },
      { label: 'Volume', value: volStr },
    ],
    actionUrl: String(props.url),
    actionLabel: 'View Market',
  });
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
