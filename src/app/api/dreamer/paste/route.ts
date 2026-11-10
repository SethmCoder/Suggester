import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bookingHasConcreteEvidence,
  mapBookingRow,
  parseAndSummarize,
  resolveMatch,
} from "@/lib/dreamer/ingest";
import type { MatchCandidate } from "@/lib/dreamer/match-booking";
import type { ParsedBooking } from "@/lib/dreamer/types";
import { datesFromDreamAndBooking } from "@/lib/dreamer/materialize";

function localPasteResponse(input: {
  ownerId: string;
  text: string;
  html: string | null;
  subject: string;
  preferredFutureTripId: string | null;
}) {
  const messageId = `paste:${input.ownerId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const { parsed, title, summary } = parseAndSummarize({
    subject: input.subject,
    text: input.text || input.html || "",
  });
  const booking = {
    id: `local-${messageId}`,
    ownerId: input.ownerId,
    futureTripId: input.preferredFutureTripId,
    tripId: null,
    inboundEmailId: null,
    kind: parsed.kind ?? "other",
    title,
    summary,
    parsed,
    startsAt: parsed.startDate ? `${parsed.startDate}T12:00:00Z` : null,
    endsAt: null,
    matchScore: input.preferredFutureTripId ? 5 : null,
    source: "paste" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return {
    offline: true as const,
    booking,
    matched: Boolean(input.preferredFutureTripId),
    planShift: {
      shifted: bookingHasConcreteEvidence(parsed),
      startDate: parsed.startDate ?? undefined,
    },
    match: input.preferredFutureTripId
      ? { id: input.preferredFutureTripId, kind: "dream", score: 5 }
      : null,
    parsed,
    summary,
  };
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: {
    text?: string;
    html?: string;
    subject?: string;
    preferredFutureTripId?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  const html = body.html ? String(body.html).slice(0, 100_000) : null;
  if (text.length < 8 && !html) {
    return NextResponse.json(
      { error: "Paste a confirmation email (at least a few lines)." },
      { status: 400 },
    );
  }

  const subject = body.subject?.trim() || "Pasted booking";
  const preferredFutureTripId = body.preferredFutureTripId ?? null;

  // Demo / unsigned: keep bookings on-device so paste still works.
  if (!user) {
    return NextResponse.json(
      localPasteResponse({
        ownerId: "local",
        text,
        html,
        subject,
        preferredFutureTripId,
      }),
    );
  }

  const messageId = `paste:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const svc = createServiceClient();

  // Offline / local path — return parsed booking for client store.
  if (!svc) {
    return NextResponse.json(
      localPasteResponse({
        ownerId: user.id,
        text,
        html,
        subject,
        preferredFutureTripId,
      }),
    );
  }

  const { data: priorBookings } = preferredFutureTripId
    ? await svc
        .from("dreamer_bookings")
        .select("parsed, kind")
        .eq("owner_id", user.id)
        .eq("future_trip_id", preferredFutureTripId)
        .order("created_at", { ascending: true })
    : { data: null };

  const primary =
    ((priorBookings ?? []).find((b) => b.kind === "flight")?.parsed as
      | ParsedBooking
      | undefined) ??
    ((priorBookings ?? [])[0]?.parsed as ParsedBooking | undefined) ??
    null;

  const { parsed, title, summary } = parseAndSummarize({
    subject,
    text: text || html || "",
    primaryContext: primary,
  });

  const { data: emailRow, error: emailErr } = await svc
    .from("inbound_emails")
    .insert({
      message_id: messageId,
      owner_id: user.id,
      from_address: user.email ?? null,
      to_addresses: ["paste"],
      subject,
      text_body: text.slice(0, 50_000) || null,
      html_body: html,
      status: "received",
    })
    .select("id")
    .single();

  if (emailErr || !emailRow) {
    const missing = /inbound_emails|schema cache/i.test(emailErr?.message ?? "");
    return NextResponse.json(
      {
        error: emailErr?.message ?? "Could not store email",
        needsMigration: missing ? "009_dreamer_inbound.sql" : undefined,
        parsed,
        summary,
      },
      { status: missing ? 503 : 400 },
    );
  }

  const { data: dreams } = await svc
    .from("future_trips")
    .select(
      "id, destination, potential_start, potential_end, status, converted_trip_id",
    )
    .eq("owner_id", user.id);

  const { data: trips } = await svc
    .from("trips")
    .select("id, destination, start_date, end_date, status")
    .eq("owner_id", user.id);

  const candidates: MatchCandidate[] = [
    ...(dreams ?? []).map((d) => ({
      id: d.id,
      kind: "dream" as const,
      destination: d.destination,
      startDate: d.potential_start,
      endDate: d.potential_end,
      status: d.status,
    })),
    ...(trips ?? []).map((t) => ({
      id: t.id,
      kind: "trip" as const,
      destination: t.destination,
      startDate: t.start_date,
      endDate: t.end_date,
      status: t.status,
    })),
  ];

  const best = resolveMatch({
    parsed,
    candidates,
    preferredFutureTripId,
  });

  let source: "paste" | "manual" = "paste";
  const insertPayload = {
    owner_id: user.id,
    future_trip_id:
      best?.candidate.kind === "dream" ? best.candidate.id : preferredFutureTripId,
    trip_id: best?.candidate.kind === "trip" ? best.candidate.id : null,
    inbound_email_id: emailRow.id,
    kind: parsed.kind ?? "other",
    title,
    parsed: { ...parsed, summary },
    starts_at: parsed.startDate ? `${parsed.startDate}T12:00:00Z` : null,
    match_score: best?.score ?? (preferredFutureTripId ? 4 : null),
    source: source as string,
  };

  let { data: bookingRow, error: bookErr } = await svc
    .from("dreamer_bookings")
    .insert(insertPayload)
    .select("*")
    .single();

  // Fallback if paste source not migrated yet.
  if (bookErr && /source|check/i.test(bookErr.message)) {
    source = "manual";
    const retry = await svc
      .from("dreamer_bookings")
      .insert({ ...insertPayload, source: "manual" })
      .select("*")
      .single();
    if (retry.error || !retry.data) {
      await svc
        .from("inbound_emails")
        .update({
          status: "failed",
          parse_error: retry.error?.message ?? bookErr.message,
        })
        .eq("id", emailRow.id);
      return NextResponse.json(
        { error: retry.error?.message ?? bookErr.message },
        { status: 400 },
      );
    }
    bookingRow = retry.data;
    bookErr = null;
  }

  if (bookErr || !bookingRow) {
    await svc
      .from("inbound_emails")
      .update({ status: "failed", parse_error: bookErr?.message ?? null })
      .eq("id", emailRow.id);
    return NextResponse.json(
      { error: bookErr?.message ?? "Could not save booking" },
      { status: 400 },
    );
  }

  const matchedDreamId =
    best?.candidate.kind === "dream"
      ? best.candidate.id
      : preferredFutureTripId;

  await svc
    .from("inbound_emails")
    .update({
      status: matchedDreamId || best ? "matched" : "parsed",
      parse_error: null,
    })
    .eq("id", emailRow.id);

  let planShift: {
    shifted: boolean;
    tripId?: string;
    startDate?: string;
    endDate?: string;
  } = { shifted: false };

  if (matchedDreamId && bookingHasConcreteEvidence(parsed)) {
    const dream = (dreams ?? []).find((d) => d.id === matchedDreamId);
    if (dream && !dream.converted_trip_id) {
      const dates = datesFromDreamAndBooking({
        booking: parsed,
        potentialStart: dream.potential_start,
        potentialEnd: dream.potential_end,
        estimatedDurationDays: null,
      });
      await svc
        .from("future_trips")
        .update({
          status: "planning",
          potential_start: dates.startDate,
          potential_end: dates.endDate,
          preferences: {
            dreamer: {
              awaitingBookings: false,
              evidenceReady: true,
              planShiftAt: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchedDreamId)
        .eq("owner_id", user.id);
      planShift = {
        shifted: true,
        startDate: dates.startDate,
        endDate: dates.endDate,
      };
    } else if (dream?.converted_trip_id) {
      planShift = {
        shifted: true,
        tripId: dream.converted_trip_id,
      };
    }
  }

  const booking = mapBookingRow(
    (bookingRow ?? {
      id: "unknown",
      owner_id: user.id,
      kind: parsed.kind ?? "other",
      title,
      parsed,
      source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }) as Parameters<typeof mapBookingRow>[0],
  );

  return NextResponse.json({
    booking: { ...booking, summary },
    match: best
      ? { id: best.candidate.id, kind: best.candidate.kind, score: best.score }
      : preferredFutureTripId
        ? { id: preferredFutureTripId, kind: "dream", score: 4 }
        : null,
    planShift,
    parsed,
    summary,
  });
}
