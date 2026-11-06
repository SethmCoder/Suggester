export const EXPLORER_CATEGORIES = [
  "restaurants",
  "attractions",
  "architecture",
  "museums",
  "nature",
  "shopping",
  "entertainment",
  "hidden",
] as const;

export type ExplorerCategory = (typeof EXPLORER_CATEGORIES)[number];

export type ExplorerSource = "google" | "openstreetmap";

export type ExplorerPlace = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  hours: string | null;
  mapsUrl: string | null;
  photoName: string | null;
  source: ExplorerSource;
  why: string;
};

export type ExplorerStop = {
  placeId: string;
  startTime: string;
  durationMinutes: number;
  travelMinutes: number;
  note: string;
};

export type ExplorerDay = {
  title: string;
  stops: ExplorerStop[];
};

export type ExplorerPreferences = {
  cuisine: string;
  pace: string;
  avoid: string;
  atmosphere: string;
};

export type ExplorerResult = {
  reply: string;
  city: string;
  source: ExplorerSource | "none";
  notice: string | null;
  places: ExplorerPlace[];
  plan: ExplorerDay[];
  followUps: string[];
  preferences: ExplorerPreferences;
};
