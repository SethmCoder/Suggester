"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LeavePageLink } from "@/components/ui/LeavePageLink";
import { BookingEmailModal } from "@/components/dreamer/BookingEmailModal";
import { PasteDropZone } from "@/components/dreamer/PasteDropZone";
import { buildDreamerSuggestions } from "@/lib/dreamer/suggestions";
import {
  listDreamerBookings,
  setDreamerBookings,
  titleCasePlace,
} from "@/lib/dreamer/bookings-store";
import type {
  DreamerBooking,
  DreamerStayAdvise,
  DreamerSuggestion,
} from "@/lib/dreamer/types";
import { getFutureTrip, updateFutureTrip } from "@/lib/future-trips/store";
import type { FutureTrip } from "@/lib/future-trips/types";
import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";

type Tab = "bookings" | "plan" | "places";

export function DreamerDetail({ id }: { id: string }) {
  const [trip, setTrip] = useState<FutureTrip | null>(null);
  const [bookings, setBookings] = useState<DreamerBooking[]>([]);
  const [suggestions, setSuggestions] = useState<DreamerSuggestion[]>([]);
  const [stayAdvise, setStayAdvise] = useState<DreamerStayAdvise | null>(null);
  const [places, setPlaces] = useState<
    { name: string; kind: string; note: string }[]
  >([]);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("bookings");
  const [selected, setSelected] = useState<DreamerBooking | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [detourState, setDetourState] = useState<
    Record<string, "accepted" | "dismissed" | "pending">
  >({});

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
    } catch {
      /* optional */
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

  useEffect(() => {
    const local = getFutureTrip(id);
    setTrip(local ?? null);
    void loadBookings().then((list) => {
      if (local) refreshSuggestions(list, local);
      if (list.length) {
        void runStayAdvise();
        void loadPlaces();
        if (local && local.status !== "planning" && !local.convertedTripId) {
          updateFutureTrip(id, { status: "planning" });
          setTrip(getFutureTrip(id));
        }
      }
    });
    void fetch("/api/dreamer/mailbox")
      .then((r) => r.json())
      .then((d: { address?: string }) => {
        if (d.address) setMailbox(d.address);
      })
      .catch(() => null);
  }, [id, loadBookings, loadPlaces, refreshSuggestions, runStayAdvise]);

  async function materialize() {
    if (!bookings.length) {
      setMessage("Add a confirmation email first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/dreamer/${id}/materialize`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.code === "evidence_required"
            ? "Paste a confirmation email first — trips are built from booking evidence only."
            : (data.error ?? "Could not build trip"),
        );
      }
      if (data.tripId) {
        updateFutureTrip(id, {
          convertedTripId: data.tripId,
          status: "planning",
        });
        window.location.href = `/trips/${data.tripId}`;
        return;
      }
      setMessage("Trip ready.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
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

  if (!trip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-[#6B7280]">Dream not found on this device.</p>
        <Link href="/future-plans" className="text-sm font-semibold text-[#0400FF]">
          Back to Future Plans
        </Link>
      </div>
    );
  }

  const name = titleCasePlace(trip.title || trip.destination);
  const waiting = bookings.length === 0;
  const isPlan =
    trip.status === "planning" || Boolean(trip.convertedTripId) || !waiting;
  const photo = hasCuratedCityImage(name);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/future-plans" className="text-sm font-semibold text-[#0400FF]">
        ← Future Plans
      </Link>

      <header className="overflow-hidden rounded-[20px] border border-[#E1E5F0] bg-white">
        {photo ? (
          <div className="relative h-40 sm:h-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={destinationImageUrl(name)}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/75 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5">
              <p className="text-3xl font-bold text-white">{name}</p>
              <p className="mt-1 text-sm text-white/80">
                {waiting
                  ? "Waiting for your first confirmation"
                  : isPlan
                    ? "Planning from booking evidence"
                    : `${bookings.length} booking${bookings.length === 1 ? "" : "s"} in`}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#080B3A] px-5 py-8 text-white">
            <p className="text-3xl font-bold">{name}</p>
            <p className="mt-1 text-sm text-white/80">
              {waiting
                ? "Waiting for your first confirmation"
                : "Planning from booking evidence"}
            </p>
          </div>
        )}
      </header>

      {mailbox ? (
        <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <p className="text-xs font-semibold uppercase text-[#6B7280]">
            Forward confirmations to
          </p>
          <code className="mt-2 block text-sm text-[#080B3A]">{mailbox}</code>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => void loadBookings()}
          >
            Check for new forwards
          </Button>
        </section>
      ) : null}

      <PasteDropZone
        preferredFutureTripId={id}
        onDone={async (result) => {
          const booking = result.booking as DreamerBooking | undefined;
          if (booking?.id?.startsWith("local-")) {
            const raw =
              typeof window !== "undefined"
                ? sessionStorage.getItem(`waypoint:last-paste:${id}`)
                : null;
            void raw;
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
        }}
      />

      <div className="flex gap-2 border-b border-[#E1E5F0]">
        {(
          [
            ["bookings", "Bookings"],
            ["plan", "Plan & AI"],
            ["places", "Places"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`px-3 py-2 text-sm font-semibold ${
              tab === key
                ? "border-b-2 border-[#0400FF] text-[#0400FF]"
                : "text-[#6B7280]"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "bookings" ? (
        <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#080B3A]">Bookings</h2>
            <span className="text-xs text-[#9CA3AF]">
              {waiting
                ? "None yet"
                : `${bookings.length} item${bookings.length === 1 ? "" : "s"}`}
            </span>
          </div>
          {waiting ? (
            <div className="mt-4 rounded-[12px] border border-dashed border-[#D1D7E5] bg-[#FAFBFF] px-4 py-8 text-center">
              <p className="text-sm font-semibold text-[#080B3A]">
                Empty itinerary
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">
                Paste or forward a confirmation to add concrete evidence.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {bookings.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-[10px] border border-[#F0F2F8] px-3 py-2 text-left hover:border-[#0400FF]/30"
                    onClick={() => {
                      setSelected(b);
                      setShowEmail(false);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium text-[#080B3A]">
                        {b.title}
                      </p>
                      <p className="text-xs text-[#6B7280]">
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
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
                      {b.source === "paste" ? "Pasted" : "From email"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "plan" ? (
        <section className="space-y-4 rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#080B3A]">
            Plan from evidence
          </h2>
          {waiting ? (
            <p className="text-sm text-[#6B7280]">
              Suggestions stay off until the first dated booking lands. This is
              not the Trip Wizard — Future Plans only advises from confirmations.
            </p>
          ) : (
            <>
              <p className="text-sm text-[#4B5563]">
                Concrete bookings are in. Stay length is researched first; climate
                detours come after for your review.
              </p>

              <div className="rounded-[10px] border border-[#EEF2FF] bg-[#F8F9FF] px-3 py-3">
                <p className="text-xs font-semibold uppercase text-[#3730A3]">
                  Stay length (cited events only)
                </p>
                {stayAdvise ? (
                  <>
                    <p className="mt-2 text-sm text-[#080B3A]">
                      {stayAdvise.rationale}
                    </p>
                    {stayAdvise.stayUntil ? (
                      <p className="mt-1 text-sm font-semibold text-[#0400FF]">
                        Suggested stay until {stayAdvise.stayUntil}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-[#6B7280]">
                        No stay-until date — no dated evidence found.
                      </p>
                    )}
                    {stayAdvise.catalogStayHint ? (
                      <p className="mt-1 text-xs text-[#9CA3AF]">
                        {stayAdvise.catalogStayHint}
                      </p>
                    ) : null}
                    {stayAdvise.events.length ? (
                      <ul className="mt-2 space-y-1">
                        {stayAdvise.events.map((ev) => (
                          <li key={`${ev.sourceUrl}-${ev.date}`} className="text-xs">
                            <a
                              href={ev.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-[#0400FF] underline"
                            >
                              {ev.title}
                            </a>{" "}
                            · {ev.date}
                          </li>
                        ))}
                      </ul>
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
                  Refresh stay advice
                </Button>
              </div>

              {suggestions.map((s) => {
                const status = detourState[s.id] ?? s.reviewStatus ?? "pending";
                return (
                  <article
                    key={s.id}
                    className="rounded-[10px] border border-[#F0F2F8] px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-[#080B3A]">
                      {s.title}
                    </p>
                    <p className="mt-1 text-sm text-[#4B5563]">{s.body}</p>
                    {s.kind === "detour" ? (
                      <div className="mt-2 space-y-1">
                        {s.transportMethod ? (
                          <p className="text-xs text-[#6B7280]">
                            Transport: {s.transportMethod}
                          </p>
                        ) : null}
                        {s.costEstimateLabel ? (
                          <p className="text-xs text-[#6B7280]">
                            {s.costEstimateLabel}
                          </p>
                        ) : null}
                        {status === "pending" ? (
                          <div className="flex gap-2 pt-1">
                            <Button
                              type="button"
                              onClick={() => void reviewDetour(s.id, "accepted")}
                            >
                              Accept detour
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void reviewDetour(s.id, "dismissed")}
                            >
                              Dismiss
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs font-semibold uppercase text-[#047857]">
                            {status}
                          </p>
                        )}
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
        <section className="rounded-[14px] border border-[#E1E5F0] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#080B3A]">
            Places
          </h2>
          <p className="mt-1 text-sm text-[#6B7280]">
            Separate from Trip Wizard — catalog attractions for {name}. Confirm
            hours locally.
          </p>
          {waiting ? (
            <p className="mt-3 text-sm text-[#6B7280]">
              Add booking evidence first, then places unlock around your dates.
            </p>
          ) : places.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7280]">
              No catalog places for this city yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {places.map((p) => (
                <li
                  key={p.name}
                  className="rounded-[10px] border border-[#F0F2F8] px-3 py-2"
                >
                  <p className="text-sm font-medium text-[#080B3A]">{p.name}</p>
                  <p className="text-xs text-[#6B7280]">{p.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy || waiting}
          onClick={() => void materialize()}
        >
          {busy
            ? "Building…"
            : waiting
              ? "Waiting for first booking"
              : "Open day-by-day itinerary"}
        </Button>
        {trip.convertedTripId ? (
          <LeavePageLink
            href={`/trips/${trip.convertedTripId}`}
            variant="secondary"
          >
            Open trip
          </LeavePageLink>
        ) : null}
      </div>
      <p className="text-xs text-[#6B7280]">
        {waiting
          ? "Waypoint won’t invent a trip — paste a confirmation so dates and flights come from evidence."
          : "This itinerary is built from your confirmation evidence (times, route, hotel), not a guessed schedule."}
      </p>
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
    </div>
  );
}
