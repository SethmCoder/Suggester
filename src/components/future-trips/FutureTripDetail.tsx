"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LeavePageLink } from "@/components/ui/LeavePageLink";
import {
  FUTURE_TRIP_STATUSES,
  statusLabel,
  type FutureTrip,
  type FutureTripStatus,
} from "@/lib/future-trips/types";
import {
  loadFutureTrips,
  patchFutureTrip,
  startPlanning,
} from "@/lib/future-trips/sync";
import { addPlan, attachWishlistItem, detachWishlistItem } from "@/lib/future-trips/store";
import type { WishlistItem } from "@/lib/wishlist/types";
import { loadWishlist } from "@/lib/wishlist/sync";

export function FutureTripDetail({ id }: { id: string }) {
  const [trip, setTrip] = useState<FutureTrip | null>(null);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planLabel, setPlanLabel] = useState("Option A");
  const [planNotes, setPlanNotes] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [futures, wishlist] = await Promise.all([loadFutureTrips(), loadWishlist()]);
      setTrip(futures.trips.find((row) => row.id === id) ?? null);
      setItems(wishlist.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [id]);

  const attached = useMemo(
    () => items.filter((item) => trip?.wishlistItemIds.includes(item.id)),
    [items, trip],
  );
  const available = useMemo(() => {
    if (!trip) return [];
    const needle = trip.destination.toLowerCase();
    return items.filter(
      (item) =>
        !trip.wishlistItemIds.includes(item.id) &&
        `${item.location ?? ""} ${item.address ?? ""} ${item.name}`.toLowerCase().includes(needle),
    );
  }, [items, trip]);

  async function saveField(patch: Parameters<typeof patchFutureTrip>[1]) {
    if (!trip) return;
    setBusy(true);
    try {
      const updated = await patchFutureTrip(trip.id, patch);
      if (updated) setTrip(updated);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
        Loading project…
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[#6B7280]">That future trip was not found.</p>
        <LeavePageLink href="/future-trips" variant="secondary">
          Back to future trips
        </LeavePageLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/future-trips" className="text-sm font-medium text-[#0400FF]">
            ← Future trips
          </Link>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-[#1F2937]">
            {trip.title || trip.destination}
          </h1>
          <p className="text-sm text-[#6B7280]">{trip.destination}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {trip.convertedTripId ? (
            <LeavePageLink href={`/trips/${trip.convertedTripId}`} variant="primary">
              Open active trip
            </LeavePageLink>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void startPlanning(trip.id).then((result) => {
                  window.location.href = result.redirect;
                });
              }}
            >
              Start planning
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-[16px] border border-[#E1E5F0] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#080B3A]">Project details</h2>
          <label className="block text-sm">
            <span className="text-[#6B7280]">Status</span>
            <select
              value={trip.status}
              onChange={(event) =>
                void saveField({ status: event.target.value as FutureTripStatus })
              }
              className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
            >
              {FUTURE_TRIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[#6B7280]">Title</span>
            <input
              defaultValue={trip.title ?? ""}
              onBlur={(event) => void saveField({ title: event.target.value })}
              className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-[#6B7280]">Potential start</span>
              <input
                type="date"
                defaultValue={trip.potentialStart ?? ""}
                onBlur={(event) =>
                  void saveField({ potentialStart: event.target.value || null })
                }
                className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[#6B7280]">Potential end</span>
              <input
                type="date"
                defaultValue={trip.potentialEnd ?? ""}
                onBlur={(event) => void saveField({ potentialEnd: event.target.value || null })}
                className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-[#6B7280]">Days</span>
              <input
                type="number"
                min={1}
                defaultValue={trip.estimatedDurationDays ?? ""}
                onBlur={(event) =>
                  void saveField({
                    estimatedDurationDays: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[#6B7280]">Travelers</span>
              <input
                type="number"
                min={1}
                defaultValue={trip.travelers ?? ""}
                onBlur={(event) =>
                  void saveField({
                    travelers: event.target.value ? Number(event.target.value) : null,
                  })
                }
                className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[#6B7280]">Budget</span>
              <input
                type="number"
                min={0}
                defaultValue={trip.budget ?? ""}
                onBlur={(event) =>
                  void saveField({
                    budget: event.target.value ? Number(event.target.value) : null,
                  })
                }
                className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[#6B7280]">Interests (comma separated)</span>
            <input
              defaultValue={trip.interests.join(", ")}
              onBlur={(event) =>
                void saveField({
                  interests: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
              className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[#6B7280]">Notes</span>
            <textarea
              defaultValue={trip.notes ?? ""}
              rows={4}
              onBlur={(event) => void saveField({ notes: event.target.value })}
              className="mt-1 w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-[16px] border border-[#E1E5F0] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#080B3A]">Saved attractions</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Linked wishlist items for this destination. They are offered when you start planning, not inserted automatically.
            </p>
            <ul className="mt-3 space-y-2">
              {attached.length === 0 ? (
                <li className="text-sm text-[#6B7280]">No saved places linked yet.</li>
              ) : (
                attached.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-[10px] border border-[#E1E5F0] px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-[#1F2937]">{item.name}</p>
                      <p className="text-xs text-[#6B7280]">
                        {item.category}
                        {item.priority === "high" ? " · high priority" : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => {
                        detachWishlistItem(trip.id, item.id);
                        void saveField({
                          wishlistItemIds: trip.wishlistItemIds.filter((value) => value !== item.id),
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))
              )}
            </ul>
            {available.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-[#6B7280]">Matching wishlist ideas</p>
                <ul className="mt-2 space-y-2">
                  {available.slice(0, 6).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{item.name}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        onClick={() => {
                          attachWishlistItem(trip.id, item.id);
                          void saveField({
                            wishlistItemIds: [...trip.wishlistItemIds, item.id],
                          });
                        }}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-[16px] border border-[#E1E5F0] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#080B3A]">Compare plans</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Keep short preliminary options here. Full itineraries are generated when you start planning.
            </p>
            <div className="mt-3 grid gap-2">
              <input
                value={planLabel}
                onChange={(event) => setPlanLabel(event.target.value)}
                className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                placeholder="Option label"
              />
              <textarea
                value={planNotes}
                onChange={(event) => setPlanNotes(event.target.value)}
                rows={3}
                className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                placeholder="Rough outline or expense notes"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const plan = addPlan(trip.id, {
                    label: planLabel,
                    payload: { notes: planNotes },
                    estimatedExpenses: planNotes.includes("$") ? planNotes : undefined,
                  });
                  if (plan) {
                    void saveField({
                      plan: {
                        label: plan.label,
                        payload: plan.payload,
                        estimatedExpenses: plan.estimatedExpenses,
                      },
                    }).then(() => {
                      setPlanNotes("");
                      void refresh();
                    });
                  }
                }}
              >
                Save plan option
              </Button>
            </div>
            <ul className="mt-4 space-y-2">
              {trip.plans.map((plan) => (
                <li key={plan.id} className="rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm">
                  <p className="font-medium text-[#1F2937]">{plan.label}</p>
                  <p className="text-[#6B7280]">
                    {typeof plan.payload.notes === "string"
                      ? plan.payload.notes
                      : "No notes"}
                  </p>
                  {plan.estimatedExpenses ? (
                    <p className="text-xs text-[#6B7280]">Expenses note: {plan.estimatedExpenses}</p>
                  ) : (
                    <p className="text-xs text-[#6B7280]">Expense amount not listed</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
