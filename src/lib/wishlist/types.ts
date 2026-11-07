export const WISHLIST_CATEGORIES = [
  "destination",
  "attraction",
  "restaurant",
  "cafe",
  "museum",
  "hotel",
  "neighborhood",
  "outdoor",
  "experience",
  "custom",
] as const;

export type WishlistCategory = (typeof WISHLIST_CATEGORIES)[number];
export type WishlistPriority = "high" | "medium" | "low";

export type WishlistCollection = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WishlistItem = {
  id: string;
  collectionId?: string | null;
  name: string;
  location?: string | null;
  description?: string | null;
  category: WishlistCategory;
  sourceUrl?: string | null;
  externalPlaceId?: string | null;
  photoUrl?: string | null;
  photoAttribution?: string | null;
  estimatedPrice?: string | null;
  notes?: string | null;
  priority: WishlistPriority;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  associatedTripId?: string | null;
  associatedFutureTripId?: string | null;
  savedAt: string;
  updatedAt: string;
};

export type WishlistItemInput = Partial<Omit<WishlistItem, "id" | "savedAt" | "updatedAt">> & {
  name: string;
  category?: WishlistCategory;
};
