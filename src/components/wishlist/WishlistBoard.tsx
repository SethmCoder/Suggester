"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShareInviteButton } from "@/components/social/ShareInviteButton";
import { Button } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { LeavePageLink } from "@/components/ui/LeavePageLink";
import { IconPin } from "@/components/ui/Icons";
import { destinationImageUrl } from "@/lib/destination-image";
import type { FutureTrip } from "@/lib/future-trips/types";
import { loadFutureTrips } from "@/lib/future-trips/sync";
import { attachWishlistItem } from "@/lib/future-trips/store";
import { patchFutureTrip } from "@/lib/future-trips/sync";
import {
  WISHLIST_CATEGORIES,
  type WishlistCategory,
  type WishlistCollection,
  type WishlistItem,
  type WishlistPriority,
} from "@/lib/wishlist/types";
import {
  deleteWishlistItem,
  loadWishlist,
  patchWishlistItem,
  removeCollection,
  saveCollection,
  saveWishlistItem,
} from "@/lib/wishlist/sync";
import { moveItem } from "@/lib/wishlist/store";
import { ReelImportPanel } from "@/components/wishlist/ReelImportPanel";

const CATEGORY_LABEL: Record<WishlistCategory, string> = {
  destination: "Destination",
  attraction: "Attraction",
  restaurant: "Restaurant",
  cafe: "Cafe",
  museum: "Museum",
  hotel: "Hotel",
  neighborhood: "Neighborhood",
  outdoor: "Outdoor",
  experience: "Experience",
  custom: "Custom idea",
};

export function WishlistBoard() {
  const [collections, setCollections] = useState<WishlistCollection[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [futureTrips, setFutureTrips] = useState<FutureTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [destination, setDestination] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [sort, setSort] = useState<"saved" | "priority">("saved");
  const [newCollection, setNewCollection] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftCategory, setDraftCategory] = useState<WishlistCategory>("custom");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [wishlist, futures] = await Promise.all([loadWishlist(), loadFutureTrips()]);
      setCollections(wishlist.collections);
      setItems(wishlist.items);
      setFutureTrips(futures.trips);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load wishlist");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const destinations = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.location?.trim()) set.add(item.location.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const priorityRank: Record<WishlistPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };
    return items
      .filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (destination !== "all" && item.location !== destination) return false;
        if (collectionFilter === "none" && item.collectionId) return false;
        if (
          collectionFilter !== "all" &&
          collectionFilter !== "none" &&
          item.collectionId !== collectionFilter
        ) {
          return false;
        }
        if (!q) return true;
        return `${item.name} ${item.location ?? ""} ${item.notes ?? ""} ${item.description ?? ""}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (sort === "priority") {
          return priorityRank[a.priority] - priorityRank[b.priority] || b.savedAt.localeCompare(a.savedAt);
        }
        return b.savedAt.localeCompare(a.savedAt);
      });
  }, [items, search, category, destination, collectionFilter, sort]);

  async function addCollection() {
    if (!newCollection.trim()) return;
    setBusy(true);
    try {
      const collection = await saveCollection({ name: newCollection.trim() });
      setCollections((current) => [collection, ...current.filter((c) => c.id !== collection.id)]);
      setNewCollection("");
    } finally {
      setBusy(false);
    }
  }

  async function addCustomIdea() {
    if (!draftName.trim()) return;
    setBusy(true);
    try {
      const item = await saveWishlistItem({
        name: draftName.trim(),
        location: draftLocation.trim() || null,
        category: draftCategory,
        priority: "medium",
        collectionId: collectionFilter !== "all" && collectionFilter !== "none" ? collectionFilter : null,
      });
      setItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      setDraftName("");
      setDraftLocation("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-[#080B3A]">
            Wishlist
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6B7280]">
            Save places from Reels or type them in. They attach to Future Trips
            when the city matches.
          </p>
        </div>
        <LeavePageLink href="/future-plans" variant="secondary">
          Future Trips
        </LeavePageLink>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4 rounded-[16px] border border-[#E1E5F0] bg-white p-4 shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
          <div>
            <h2 className="text-sm font-semibold text-[#080B3A]">Collections</h2>
            <div className="mt-2 flex gap-2">
              <input
                value={newCollection}
                onChange={(event) => setNewCollection(event.target.value)}
                placeholder="Japan wishlist"
                className="w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
              />
              <Button type="button" onClick={() => void addCollection()} disabled={busy}>
                Add
              </Button>
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            <li>
              <button
                type="button"
                className={`w-full rounded-[10px] px-3 py-2 text-left ${collectionFilter === "all" ? "bg-[#DDE1FF] text-[#0400FF]" : "hover:bg-[#F5F6FB]"}`}
                onClick={() => setCollectionFilter("all")}
              >
                All items ({items.length})
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`w-full rounded-[10px] px-3 py-2 text-left ${collectionFilter === "none" ? "bg-[#DDE1FF] text-[#0400FF]" : "hover:bg-[#F5F6FB]"}`}
                onClick={() => setCollectionFilter("none")}
              >
                Unfiled
              </button>
            </li>
            {collections.map((collection) => (
              <li key={collection.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  className={`min-w-0 flex-1 rounded-[10px] px-3 py-2 text-left ${collectionFilter === collection.id ? "bg-[#DDE1FF] text-[#0400FF]" : "hover:bg-[#F5F6FB]"}`}
                  onClick={() => setCollectionFilter(collection.id)}
                >
                  <span className="block truncate">{collection.name}</span>
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-[#6B7280] opacity-0 group-hover:opacity-100 hover:bg-[#F5F6FB]"
                  onClick={() => {
                    if (!window.confirm(`Delete collection “${collection.name}”? Items stay saved.`)) return;
                    void removeCollection(collection.id).then(() => refresh());
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-4">
          {collectionFilter !== "all" &&
          collectionFilter !== "none" &&
          /^[0-9a-f-]{36}$/i.test(collectionFilter) ? (
            <ShareInviteButton
              kind="wishlist_collection"
              resourceId={collectionFilter}
            />
          ) : null}
          <ReelImportPanel
            collectionId={
              collectionFilter !== "all" && collectionFilter !== "none"
                ? collectionFilter
                : null
            }
            onSaved={(saved) => {
              setItems((current) => {
                const next = [...saved];
                for (const row of current) {
                  if (!saved.some((s) => s.id === row.id)) next.push(row);
                }
                return next;
              });
            }}
          />

          <div className="rounded-[18px] border border-[#E1E5F0] bg-white p-5">
            <h2 className="text-base font-semibold tracking-tight text-[#080B3A]">
              Or type it in
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Name is enough — city and category are optional.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCustomIdea();
                  }
                }}
                placeholder="Tokyo Tower, ramen spot, neighborhood…"
                className="min-w-0 flex-1 rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-2.5 text-sm outline-none focus:border-[#0400FF] focus:bg-white"
              />
              <input
                value={draftLocation}
                onChange={(event) => setDraftLocation(event.target.value)}
                placeholder="City (optional)"
                className="rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-2.5 text-sm sm:w-40 outline-none focus:border-[#0400FF] focus:bg-white"
              />
              <select
                value={draftCategory}
                onChange={(event) =>
                  setDraftCategory(event.target.value as WishlistCategory)
                }
                className="rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3 py-2.5 text-sm sm:w-36 outline-none focus:border-[#0400FF]"
              >
                {WISHLIST_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABEL[value]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => void addCustomIdea()}
                disabled={busy || !draftName.trim()}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search saved ideas"
              className="min-w-[180px] flex-1 rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 text-sm"
            />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 text-sm"
            >
              <option value="all">All categories</option>
              {WISHLIST_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
            <select
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 text-sm"
            >
              <option value="all">All destinations</option>
              {destinations.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "saved" | "priority")}
              className="rounded-[10px] border border-[#E1E5F0] bg-white px-3 py-2 text-sm"
            >
              <option value="saved">Newest saved</option>
              <option value="priority">Priority</option>
            </select>
          </div>

          {loading ? (
            <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
              Loading wishlist…
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-8 py-16 text-center shadow-[0_4px_20px_rgba(8,11,58,0.04)]">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDE1FF] text-[#0400FF]">
                <IconPin size={22} />
              </div>
              <p className="text-lg font-semibold text-[#1F2937]">No wishlist items yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#6B7280]">
                Save a place from a trip card, Local Explorer, Discover, or add a custom idea above.
              </p>
              <Link href="/discover" className="mt-4 inline-flex">
                <Button variant="secondary">Discover destinations</Button>
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => {
                const photo =
                  item.photoUrl ||
                  destinationImageUrl(item.location || item.name.split(",")[0] || "travel");
                return (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-[16px] border border-[#E1E5F0] bg-white shadow-[0_4px_20px_rgba(8,11,58,0.04)]"
                  >
                    <div className="h-28 bg-[#080B3A]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#1F2937]">{item.name}</p>
                          <p className="text-xs text-[#6B7280]">
                            {CATEGORY_LABEL[item.category]}
                            {item.location ? ` · ${item.location}` : ""}
                          </p>
                        </div>
                        <select
                          value={item.priority}
                          onChange={(event) => {
                            const priority = event.target.value as WishlistPriority;
                            void patchWishlistItem(item.id, { priority }).then((updated) => {
                              if (updated) {
                                setItems((current) =>
                                  current.map((row) => (row.id === item.id ? updated : row)),
                                );
                              }
                            });
                          }}
                          className="rounded-md border border-[#E1E5F0] px-2 py-1 text-xs"
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                      {item.description ? (
                        <p className="line-clamp-2 text-sm text-[#4B5563]">{item.description}</p>
                      ) : null}
                      <textarea
                        defaultValue={item.notes ?? ""}
                        placeholder="Personal notes"
                        className="w-full rounded-[10px] border border-[#E1E5F0] px-3 py-2 text-sm"
                        rows={2}
                        onBlur={(event) => {
                          const notes = event.target.value;
                          void patchWishlistItem(item.id, { notes }).then((updated) => {
                            if (updated) {
                              setItems((current) =>
                                current.map((row) => (row.id === item.id ? updated : row)),
                              );
                            }
                          });
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={item.collectionId ?? ""}
                          onChange={(event) => {
                            const collectionId = event.target.value || null;
                            moveItem(item.id, collectionId);
                            void patchWishlistItem(item.id, { collectionId }).then(() => refresh());
                          }}
                          className="min-w-0 flex-1 rounded-[10px] border border-[#E1E5F0] px-2 py-1.5 text-xs"
                        >
                          <option value="">Unfiled</option>
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {collection.name}
                            </option>
                          ))}
                        </select>
                        <select
                          defaultValue=""
                          onChange={(event) => {
                            const futureId = event.target.value;
                            if (!futureId) return;
                            attachWishlistItem(futureId, item.id);
                            void patchFutureTrip(futureId, {
                              wishlistItemIds: [
                                ...(futureTrips.find((trip) => trip.id === futureId)?.wishlistItemIds ?? []),
                                item.id,
                              ].filter((value, index, all) => all.indexOf(value) === index),
                            }).then(() => refresh());
                            event.target.value = "";
                          }}
                          className="rounded-[10px] border border-[#E1E5F0] px-2 py-1.5 text-xs"
                        >
                          <option value="">Add to future trip…</option>
                          {futureTrips.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                              {trip.title || trip.destination}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-[#6B7280]">
                        <span>Saved {new Date(item.savedAt).toLocaleDateString()}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => {
                            if (!window.confirm(`Remove ${item.name}?`)) return;
                            void deleteWishlistItem(item.id).then(() =>
                              setItems((current) => current.filter((row) => row.id !== item.id)),
                            );
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                      {item.estimatedPrice ? (
                        <p className="text-xs text-[#6B7280]">Listed price note: {item.estimatedPrice}</p>
                      ) : (
                        <p className="text-xs text-[#6B7280]">Cost not listed</p>
                      )}
                      {item.sourceUrl ? (
                        <ExternalLink
                          href={item.sourceUrl}
                          className="text-xs font-medium text-[#0400FF]"
                        >
                          Source
                        </ExternalLink>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
