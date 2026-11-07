import type { WishlistItem } from "@/lib/wishlist/types";

export const FUTURE_TRIP_STATUSES = [
  "wishlist",
  "researching",
  "comparing",
  "planning",
  "ready",
  "completed",
  "archived",
] as const;

export type FutureTripStatus = (typeof FUTURE_TRIP_STATUSES)[number];

export type FutureTripPlan = {
  id: string;
  futureTripId: string;
  label: string;
  payload: Record<string, unknown>;
  estimatedExpenses?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FutureTrip = {
  id: string;
  title?: string | null;
  destination: string;
  status: FutureTripStatus;
  potentialStart?: string | null;
  potentialEnd?: string | null;
  estimatedDurationDays?: number | null;
  travelers?: number | null;
  budget?: number | null;
  currency?: string | null;
  interests: string[];
  transport?: string | null;
  notes?: string | null;
  preferences: Record<string, unknown>;
  coverImageUrl?: string | null;
  convertedTripId?: string | null;
  wishlistItemIds: string[];
  plans: FutureTripPlan[];
  createdAt: string;
  updatedAt: string;
};

export type FutureTripInput = Partial<
  Omit<FutureTrip, "id" | "createdAt" | "updatedAt" | "plans" | "wishlistItemIds" | "interests">
> & {
  destination: string;
  interests?: string[];
  wishlistItemIds?: string[];
};

export type FutureTripWithItems = FutureTrip & {
  items: WishlistItem[];
};

export function statusLabel(status: FutureTripStatus): string {
  const labels: Record<FutureTripStatus, string> = {
    wishlist: "Wishlist",
    researching: "Researching",
    comparing: "Comparing",
    planning: "Planning",
    ready: "Ready to travel",
    completed: "Completed",
    archived: "Archived",
  };
  return labels[status];
}
