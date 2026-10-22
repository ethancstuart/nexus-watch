/**
 * Share View — Encode/decode current map state into shareable URLs.
 *
 * URL format: https://nexuswatch.io/#/intel?v=BASE64_ENCODED_STATE
 * State includes: center, zoom, pitch, bearing, enabled layers, active profile.
 */

export interface ViewState {
  c: [number, number]; // center [lng, lat]
  z: number; // zoom
  p: number; // pitch
  b: number; // bearing
  l: string[]; // enabled layer IDs
  pr?: string; // cinema profile ID (if in cinema mode)
}

export function encodeViewState(state: ViewState): string {
  try {
    const json = JSON.stringify(state);
    return btoa(json);
  } catch {
    return '';
  }
}

export function decodeViewState(encoded: string): ViewState | null {
  try {
    const json = atob(encoded);
    return JSON.parse(json) as ViewState;
  } catch {
    return null;
  }
}

export function getShareUrl(state: ViewState): string {
  const encoded = encodeViewState(state);
  if (!encoded) return window.location.href;
  const base = window.location.origin + window.location.pathname;
  return `${base}?v=${encoded}`;
}

export function getViewStateFromUrl(): ViewState | null {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('v');
  if (!v) return null;
  return decodeViewState(v);
}

export async function copyShareUrl(state: ViewState): Promise<boolean> {
  const url = getShareUrl(state);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    return true;
  }
}
