export type SavedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  savedAt: string;
};

const KEY = "waypoint:saved-places";

export function readSavedPlaces(): SavedPlace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedPlace[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlace(place: Omit<SavedPlace, "id" | "savedAt">): SavedPlace[] {
  const current = readSavedPlaces();
  const id = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}:${place.name.toLowerCase()}`;
  const next = [
    { ...place, id, savedAt: new Date().toISOString() },
    ...current.filter((p) => p.id !== id),
  ];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeSavedPlace(id: string): SavedPlace[] {
  const next = readSavedPlaces().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
