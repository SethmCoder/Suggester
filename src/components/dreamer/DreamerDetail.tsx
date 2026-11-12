"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShareInviteButton } from "@/components/social/ShareInviteButton";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { BookingEmailModal } from "@/components/dreamer/BookingEmailModal";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import { SegmentedCityHero } from "@/components/dreamer/SegmentedCityHero";
import { buildDreamerSuggestions } from "@/lib/dreamer/suggestions";
import {
  listDreamerBookings,
  removeDreamerBooking,
  setDreamerBookings,
  titleCasePlace,
} from "@/lib/dreamer/bookings-store";
import type {
  DreamerBooking,
  DreamerStayAdvise,
  DreamerSuggestion,
} from "@/lib/dreamer/types";
import { getFutureTrip, updateFutureTrip } from "@/lib/future-trips/store";
import { patchFutureTrip, removeFutureTrip } from "@/lib/future-trips/sync";
import type { FutureTrip } from "@/lib/future-trips/types";
import { useRouter } from "next/navigation";
import { listItems } from "@/lib/wishlist/store";
import { wishlistItemsForFutureTrip } from "@/lib/wishlist/future-link";
import type { WishlistItem } from "@/lib/wishlist/types";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";
import { bookingHasConcreteEvidence } from "@/lib/dreamer/ingest";
import { materializeFutureTripLocally } from "@/lib/dreamer/materialize-local";
import {
  StaySuggestModal,
  type StaySuggestPayload,
} from "@/components/itinerary/StaySuggestModal";
import {
  DreamerBuildGate,
  type DreamerBuildAnswers,
} from "@/components/dreamer/DreamerBuildGate";
import { nightsBetween } from "@/lib/trips/dates";

type Tab = "bookings" | "plan" | "places";

export function DreamerDetail({ id }: { id: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<FutureTrip | null>(null);
  const [bookings, setBookings] = useState<DreamerBooking[]>([]);
  const [suggestions, setSuggestions] = useState<DreamerSuggestion[]>([]);
  const [stayAdvise, setStayAdvise] = useState<DreamerStayAdvise | null>(null);
  const [stayGate, setStayGate] = useState<{
    tripId: string;
    payload: StaySuggestPayload;
  } | null>(null);
  const [buildGateOpen, setBuildGateOpen] = useState(false);
  const [places, setPlaces] = useState<
    { name: string; kind: string; note: string }[]
  >([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("bookings");
  const [selected, setSelected] = useState<DreamerBooking | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [why, setWhy] = useState("");
  const [whySaving, setWhySaving] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [detourState, setDetourState] = useState<
    Record<string, "accepted" | "dismissed" | "pending">
  >({});
  const [materializing, setMaterializing] = useState(false);

  async function deleteBooking(booking: DreamerBooking) {
    if (
      !window.confirm(
        `Remove “${booking.title}” from this plan? This cannot be undone.`,
      )
    ) {
      return;
    }
    const next = removeDreamerBooking(id, booking.id);
    setBookings(next);
    if (selected?.id === booking.id) setSelected(null);
    try {
      await fetch(`/api/dreamer/bookings/${booking.id}`, { method: "DELETE" });
    } catch {
      /* local already removed */
    }
    const local = getFutureTrip(id);
    if (local) refreshSuggestions(next, local);
    if (!next.length) {
      updateFutureTrip(id, { status: "wishlist" });
      setTrip(getFutureTrip(id));
    }
  }

  async function deletePlan() {
    const label = trip?.title || trip?.destination || "this plan";
    if (
      !window.confirm(
        `Delete ${label}? Bookings attached on this device will be removed too.`,
      )
    ) {
      return;
    }
    setDeletingPlan(true);
    try {
      await removeFutureTrip(id);
      router.push("/future-plans");
      router.refresh();
    } finally {
      setDeletingPlan(false);
    }
  }

  const loadBookings = useCallback(async () => {
    const local = listDreamerBookings(id);
    setBookings(local);
    try {
      const res = await fetch(`/api/dreamer/${id}/bookings`);
      const data = (await res.json()) as { bookings?: DreamerBooking[] };
      if (Array.isArray(data.bookings)) {
        setDreamerBookings(id, data.bookings);
        setBookings(data.bookings);
        return data.bookings;
      }
    } catch {
      /* keep local */
    }
    return local;
  }, [id]);

  const refreshSuggestions = useCallback(
    (list: DreamerBooking[], local: FutureTrip) => {
      if (!list.length) {
        setSuggestions([]);
        return;
      }
      const flight = list.find((b) => b.kind === "flight");
      const start = flight?.parsed?.startDate ?? list[0]?.parsed?.startDate ?? null;
      setSuggestions(
        buildDreamerSuggestions({
          destination: local.destination,
          stayDays: local.estimatedDurationDays ?? null,
          month: start ? Number(String(start).slice(5, 7)) : null,
          hasEvidence: true,
        }),
      );
    },
    [],
  );

  const runStayAdvise = useCallback(async () => {
    try {
      const local = getFutureTrip(id);
      const list = listDreamerBookings(id);
      const flight = list.find((b) => b.kind === "flight") ?? list[0];
      const res = await fetch(`/api/dreamer/${id}/stay-advise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: local?.destination,
          landDate:
            flight?.parsed?.startDate ?? local?.potentialStart ?? null,
        }),
      });
      const data = (await res.json()) as DreamerStayAdvise;
      if (res.ok) setStayAdvise(data);
      return data;
    } catch {
      return null;
    }
  }, [id]);

  const loadPlaces = useCallback(async () => {
    try {
      const local = getFutureTrip(id);
      const q = local?.destination
        ? `?city=${encodeURIComponent(local.destination)}`
        : "";
      const res = await fetch(`/api/dreamer/${id}/places${q}`);
      const data = (await res.json()) as {
        places?: { name: string; kind: string; note: string }[];
      };
      if (Array.isArray(data.places)) setPlaces(data.places);
    } catch {
      /* optional */
    }
  }, [id]);

  function refreshWishlist(local: FutureTrip | null) {
    if (!local) {
      setWishlist([]);
      return;
    }
    setWishlist(wishlistItemsForFutureTrip(local, listItems()));
  }

  function openStayGate(tripId: string, advise: DreamerStayAdvise | null) {
    const local = getFutureTrip(id);
    let suggestedDays = local?.estimatedDurationDays ?? null;
    if (
      (suggestedDays == null || suggestedDays <= 0) &&
      local?.potentialStart &&
      local?.potentialEnd
    ) {
      try {
        suggestedDays = nightsBetween(local.potentialStart, local.potentialEnd) + 1;
      } catch {
        suggestedDays = null;
      }
    }
    const payload: StaySuggestPayload = {
      events: advise?.events ?? [],
      stayUntil: advise?.stayUntil ?? null,
      rationale:
        advise?.rationale ||
        `We sketched a calendar from your confirmations for ${titleCasePlace(local?.destination || "this trip")}. Adjust days anytime on the itinerary.`,
      catalogStayHint: advise?.catalogStayHint,
      suggestedDays,
      destination: local?.destination ?? null,
    };
    try {
      sessionStorage.setItem(
        `waypoint:stay-advise:${tripId}`,
        JSON.stringify(payload),
      );
    } catch {
      /* ignore */
    }
    setStayGate({ tripId, payload });
  }

  const materialize = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (materializing) return;
      setMaterializing(true);
      if (!opts?.silent) {
        setBusy(true);
        setMessage(null);
      }
      try {
        const advise = (await runStayAdvise()) ?? stayAdvise;
        const res = await fetch(`/api/dreamer/${id}/materialize`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.tripId) {
          updateFutureTrip(id, {
            convertedTripId: data.tripId,
            status: "planning",
          });
          openStayGate(data.tripId as string, advise);
          return;
        }

        // Demo / unsigned: build from local booking evidence.
        const localTrip = getFutureTrip(id);
        const localBookings = listDreamerBookings(id);
        if (localTrip && localBookings.length) {
          const local = materializeFutureTripLocally({
            trip: localTrip,
            bookings: localBookings,
          });
          if ("tripId" in local) {
            updateFutureTrip(id, {
              convertedTripId: local.tripId,
              status: "planning",
            });
            openStayGate(local.tripId, advise);
            return;
          }
          if (!opts?.silent) {
            throw new Error(
              local.code === "evidence_required"
                ? "Paste a confirmation or screenshot first — trips are built from booking evidence only."
                : local.error,
            );
          }
          return;
        }

        if (!opts?.silent) {
          throw new Error(
            data.code === "evidence_required"
              ? "Paste a confirmation or screenshot first — trips are built from booking evidence only."
              : (data.error ?? "Could not build trip"),
          );
        }
      } catch (e) {
        if (!opts?.silent) {
          setMessage(e instanceof Error ? e.message : "Failed");
        }
      } finally {
        setMaterializing(false);
        setBusy(false);
      }
    },
    [id, materializing, runStayAdvise, stayAdvise],
  );

  useEffect(() => {
    const local = getFutureTrip(id);
    setTrip(local ?? null);
    const dreamer = (local?.preferences?.dreamer ?? {}) as Record<string, unknown>;
    setWhy(
      typeof dreamer.why === "string"
        ? dreamer.why
        : local?.notes?.trim() || "",
    );
    refreshWishlist(local ?? null);
    void loadBookings().then((list) => {
      if (local) refreshSuggestions(list, local);
      if (list.length) {
        void runStayAdvise();
        void loadPlaces();
        if (local && local.status !== "planning" && !local.convertedTripId) {
          updateFutureTrip(id, { status: "planning" });
          setTrip(getFutureTrip(id));
        }
        const hasEvidence = list.some((b) =>
          bookingHasConcreteEvidence(b.parsed),
        );
        // Ready to build — open date + vibe gate (never silent-build).
        if (hasEvidence && !local?.convertedTripId) {
          setBuildGateOpen(true);
        }
      }
    });
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string }) => {
        if (d.address) setMailbox(d.address);
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per id
  }, [id]);

  async function saveWhy() {
    if (!trip) return;
    setWhySaving(true);
    try {
      const nextPrefs = {
        ...trip.preferences,
        dreamer: {
          ...((trip.preferences.dreamer as object) || {}),
          why: why.trim(),
        },
      };
      updateFutureTrip(id, { notes: why.trim() || null, preferences: nextPrefs });
      await patchFutureTrip(id, {
        notes: why.trim() || null,
        preferences: nextPrefs,
      }).catch(() => null);
      setTrip(getFutureTrip(id));
    } finally {
      setWhySaving(false);
    }
  }

  async function reviewDetour(
    detourId: string,
    decision: "accepted" | "dismissed",
  ) {
    setDetourState((prev) => ({ ...prev, [detourId]: decision }));
    try {
      await fetch(`/api/dreamer/${id}/detours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detourId, decision }),
      });
    } catch {
      /* local state kept */
    }
  }

  const whyHint = useMemo(
    () =>
      why.trim()
        ? null
        : "e.g. leisure, anniversary, cherry blossom season, conference…",
    [why],
  );

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="text-sm text-[#6B7280]">Trip not found on this device.</p>
        <Link
          href="/future-plans"
          className="mt-3 inline-block text-sm font-semibold text-[#0400FF]"
        >
          Back to Future Trips
        </Link>
      </div>
    );
  }

  const name = titleCasePlace(trip.title || trip.destination);
  const waiting = bookings.length === 0;
  const isPlan =
    trip.status === "planning" || Boolean(trip.convertedTripId) || !waiting;

  const pasteDone = async (result: {
    booking?: unknown;
    planShift?: { shifted?: boolean };
  }) => {
    const booking = result.booking as DreamerBooking | undefined;
    if (booking?.id?.startsWith("local-")) {
      const next = [...listDreamerBookings(id), booking];
      setDreamerBookings(id, next);
      setBookings(next);
      refreshSuggestions(next, trip);
      updateFutureTrip(id, { status: "planning" });
      setTrip(getFutureTrip(id));
    } else {
      const list = await loadBookings();
      refreshSuggestions(list, trip);
      updateFutureTrip(id, { status: "planning" });
      setTrip(getFutureTrip(id));
    }
    void runStayAdvise();
    void loadPlaces();
    setTab("plan");
    const evidence = booking && bookingHasConcreteEvidence(booking.parsed);
    if (evidence || result.planShift?.shifted) {
      setBuildGateOpen(true);
    }
  };

  async function confirmBuild(answers: DreamerBuildAnswers) {
    const prev = getFutureTrip(id);
    updateFutureTrip(id, {
      potentialStart: answers.startDate,
      potentialEnd: answers.endDate,
      estimatedDurationDays: answers.estimatedDurationDays,
      preferences: {
        ...(prev?.preferences ?? {}),
        prefersHiddenGems: answers.prefersHiddenGems,
        intensity: answers.intensity,
        dreamer: {
          ...((prev?.preferences?.dreamer as Record<string, unknown>) ?? {}),
          vibe: answers.vibe,
          idealTripNote: answers.idealTripNote,
        },
      },
      notes: [prev?.notes?.trim() || "", answers.idealTripNote]
        .filter(Boolean)
        .join("\n")
        .trim(),
    });
    setTrip(getFutureTrip(id));
    setBuildGateOpen(false);
    await materialize();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/future-plans"
          className="text-sm font-medium text-[#6B7280] transition hover:text-[#0400FF]"
        >
          ← Future Trips
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/^[0-9a-f-]{36}$/i.test(id) ? (
            <ShareInviteButton kind="future_trip" resourceId={id} />
          ) : null}
          <button
            type="button"
            className="text-xs font-medium text-[#9CA3AF] hover:text-[#B91C1C]"
            disabled={deletingPlan}
            onClick={() => void deletePlan()}
          >
            {deletingPlan ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <header className="overflow-hidden rounded-[18px] border border-[#E1E5F0] shadow-[0_8px_30px_rgba(8,11,58,0.06)]">
        <SegmentedCityHero
          destination={trip.destination}
          title={name}
          subtitle={
            waiting
              ? "Waiting for your first confirmation"
              : isPlan
                ? "Planning from booking evidence"
                : `${bookings.length} booking${bookings.length === 1 ? "" : "s"} in`
          }
          heightClass="h-44 sm:h-56"
        />
      </header>

      <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
        <Label htmlFor="why-going">Why are you going?</Label>
        <textarea
          id="why-going"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          onBlur={() => void saveWhy()}
          rows={2}
          placeholder={whyHint ?? undefined}
          className="mt-2 w-full resize-none rounded-[12px] border border-[#E1E5F0] bg-[#FAFBFF] px-3.5 py-2.5 text-sm leading-relaxed text-[#080B3A] outline-none transition focus:border-[#0400FF] focus:bg-white"
        />
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={whySaving}
            onClick={() => void saveWhy()}
          >
            {whySaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-[#080B3A]">
          Add booking evidence
        </h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Forward email in any language, or paste / screenshot a confirmation.
        </p>
        {mailbox ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-[#F5F7FF] px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate text-xs text-[#080B3A]">
              {mailbox}
            </code>
            <button
              type="button"
              className="text-xs font-semibold text-[#0400FF] hover:underline"
              onClick={() => void navigator.clipboard.writeText(mailbox)}
            >
              Copy
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-[#6B7280] hover:text-[#080B3A]"
              onClick={() => void loadBookings()}
            >
              Refresh
            </button>
          </div>
        ) : null}
        <div className="mt-4">
          <PasteDropZone preferredFutureTripId={id} onDone={pasteDone} />
        </div>
      </section>

      <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight text-[#080B3A]">
            Collections
          </h2>
          <Link
            href="/wishlist"
            className="text-xs font-semibold text-[#0400FF] hover:underline"
          >
            Manage
          </Link>
        </div>
        {wishlist.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
            Places saved for {name} appear here automatically.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {wishlist.map((item) => (
              <li
                key={item.id}
                className="flex gap-3 overflow-hidden rounded-[12px] bg-[#FAFBFF]"
              >
                {item.photoUrl || hasCuratedCityImage(item.location || name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      item.photoUrl ||
                      destinationImageUrl(item.location || name)
                    }
                    alt=""
                    className="h-14 w-14 shrink-0 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#EEF2FF] text-sm font-semibold text-[#3730A3]">
                    {item.name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 py-2.5 pr-3">
                  <p className="truncate text-sm font-medium text-[#080B3A]">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-[#6B7280]">
                    {item.location || item.category}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-1 border-b border-[#E1E5F0]">
        {(
          [
            ["bookings", "Bookings"],
            ["plan", "Plan"],
            ["places", "Places"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "border-b-2 border-[#0400FF] text-[#0400FF]"
                : "border-b-2 border-transparent text-[#6B7280] hover:text-[#080B3A]"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#080B3A]">Bookings</h2>
            <span className="text-xs text-[#9CA3AF]">
              {waiting
                ? "None yet"
                : `${bookings.length} item${bookings.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {waiting ? (
            <div className="mt-5 rounded-[12px] border border-dashed border-[#D1D7E5] bg-[#FAFBFF] px-4 py-10 text-center">
              <p className="text-sm font-semibold text-[#080B3A]">
                No bookings yet
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">
                Paste, screenshot, or forward a confirmation above.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#F0F2F8]">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex items-stretch gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                    onClick={() => {
                      setSelected(b);
                      setShowEmail(false);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#080B3A]">
                        {b.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        {b.summary ||
                          [
                            b.kind,
                            b.parsed.startDate,
                            b.parsed.confirmation
                              ? `conf ${b.parsed.confirmation}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#047857]">
                      {b.source === "paste" ? "Pasted" : "Email"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 self-center px-1 text-xs font-medium text-[#9CA3AF] hover:text-[#B91C1C]"
                    onClick={() => void deleteBooking(b)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "plan" ? (
        <section className="space-y-4 rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#080B3A]">
            Plan from evidence
          </h2>
          {waiting ? (
            <p className="text-sm leading-relaxed text-[#6B7280]">
              Add a confirmation first. Stay length and places unlock from that
              evidence, then a calendar trip opens automatically.
            </p>
          ) : (
            <>
              <div className="rounded-[12px] bg-[#F5F7FF] px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
                  Stay length
                </p>
                {stayAdvise ? (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-[#080B3A]">
                      {stayAdvise.rationale}
                    </p>
                    {trip.estimatedDurationDays ? (
                      <p className="mt-2 text-sm font-semibold text-[#0400FF]">
                        Suggested {trip.estimatedDurationDays} day
                        {trip.estimatedDurationDays === 1 ? "" : "s"}
                        {stayAdvise.stayUntil
                          ? ` · until ${stayAdvise.stayUntil}`
                          : ""}
                      </p>
                    ) : stayAdvise.stayUntil ? (
                      <p className="mt-2 text-sm font-semibold text-[#0400FF]">
                        Suggested until {stayAdvise.stayUntil}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[#6B7280]">
                    Looking up dated events…
                  </p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => void runStayAdvise()}
                >
                  Refresh
                </Button>
              </div>

              {suggestions.map((s) => {
                const status = detourState[s.id] ?? s.reviewStatus ?? "pending";
                return (
                  <article key={s.id} className="border-t border-[#F0F2F8] pt-4">
                    <p className="text-sm font-semibold text-[#080B3A]">
                      {s.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[#4B5563]">
                      {s.body}
                    </p>
                    {s.kind === "detour" && status === "pending" ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          onClick={() => void reviewDetour(s.id, "accepted")}
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void reviewDetour(s.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </>
          )}
        </section>
      ) : null}

      {tab === "places" ? (
        <section className="rounded-[18px] border border-[#E1E5F0] bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#080B3A]">Places</h2>
          {waiting ? (
            <p className="mt-3 text-sm text-[#6B7280]">
              Add a confirmation first.
            </p>
          ) : places.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7280]">
              No catalog places for this city yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[#F0F2F8]">
              {places.map((p) => (
                <li key={p.name} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-[#080B3A]">{p.name}</p>
                  <p className="mt-0.5 text-xs text-[#6B7280]">{p.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#F0F2F8] pt-2">
        <Button
          type="button"
          disabled={busy || waiting || materializing}
          onClick={() => {
            if (trip.convertedTripId) {
              void (async () => {
                const advise = stayAdvise ?? (await runStayAdvise());
                openStayGate(trip.convertedTripId as string, advise);
              })();
              return;
            }
            setBuildGateOpen(true);
          }}
        >
          {busy || materializing
            ? "Opening calendar…"
            : waiting
              ? "Waiting for first booking"
              : trip.convertedTripId
                ? "Open day-by-day itinerary"
                : "Choose dates & build itinerary"}
        </Button>
        {trip.convertedTripId ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || materializing}
            onClick={() => {
              void (async () => {
                const advise = stayAdvise ?? (await runStayAdvise());
                openStayGate(trip.convertedTripId as string, advise);
              })();
            }}
          >
            Open trip
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-[#B91C1C]">{message}</p> : null}

      <BookingEmailModal
        booking={selected}
        open={Boolean(selected)}
        showFullEmail={showEmail}
        onClose={() => {
          setSelected(null);
          setShowEmail(false);
        }}
        onShowEmail={() => setShowEmail(true)}
      />

      <DreamerBuildGate
        open={buildGateOpen}
        destination={trip.destination}
        initialStart={trip.potentialStart}
        initialEnd={trip.potentialEnd}
        initialDays={trip.estimatedDurationDays}
        busy={busy || materializing}
        onCancel={() => setBuildGateOpen(false)}
        onConfirm={(answers) => void confirmBuild(answers)}
      />

      <StaySuggestModal
        open={Boolean(stayGate)}
        payload={stayGate?.payload ?? null}
        onConfirm={() => {
          const next = stayGate?.tripId;
          setStayGate(null);
          if (next) router.push(`/trips/${next}`);
        }}
        onSkip={() => {
          const next = stayGate?.tripId;
          setStayGate(null);
          if (next) router.push(`/trips/${next}`);
        }}
      />
    </div>
  );
}
