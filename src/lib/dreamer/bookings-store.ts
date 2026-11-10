import type { DreamerBooking } from "@/lib/dreamer/types";

const KEY = "waypoint:dreamer-bookings";

type Store = Record<string, DreamerBooking[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function listDreamerBookings(dreamId: string): DreamerBooking[] {
  return read()[dreamId] ?? [];
}

export function setDreamerBookings(dreamId: string, bookings: DreamerBooking[]) {
  const store = read();
  store[dreamId] = bookings;
  write(store);
}

export function dreamBookingCount(dreamId: string): number {
  return listDreamerBookings(dreamId).length;
}

export function removeDreamerBooking(
  dreamId: string,
  bookingId: string,
): DreamerBooking[] {
  const next = listDreamerBookings(dreamId).filter(
    (booking) => booking.id !== bookingId,
  );
  setDreamerBookings(dreamId, next);
  return next;
}

export function clearDreamerBookings(dreamId: string) {
  const store = read();
  delete store[dreamId];
  write(store);
}

export function titleCasePlace(name: string): string {
  return name
    .trim()
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
