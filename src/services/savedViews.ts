/**
 * Saved Map Views — named bookmarks for camera + layer combinations.
 * Stored in localStorage. Max 10 views.
 */

export interface SavedView {
  id: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  layers: string[]; // enabled layer IDs
  createdAt: number;
}

const STORAGE_KEY = 'nw:saved-views';
const MAX_VIEWS = 10;

export function getSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function saveView(view: Omit<SavedView, 'id' | 'createdAt'>): SavedView {
  const views = getSavedViews();
  const newView: SavedView = {
    ...view,
    id: `sv-${Date.now()}`,
    createdAt: Date.now(),
  };
  views.unshift(newView);
  // Cap at MAX_VIEWS
  const trimmed = views.slice(0, MAX_VIEWS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  document.dispatchEvent(new CustomEvent('nw:saved-views-changed'));
  return newView;
}

export function deleteSavedView(id: string): void {
  const views = getSavedViews().filter((v) => v.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  document.dispatchEvent(new CustomEvent('nw:saved-views-changed'));
}

export function renameSavedView(id: string, name: string): void {
  const views = getSavedViews();
  const view = views.find((v) => v.id === id);
  if (view) {
    view.name = name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    document.dispatchEvent(new CustomEvent('nw:saved-views-changed'));
  }
}
