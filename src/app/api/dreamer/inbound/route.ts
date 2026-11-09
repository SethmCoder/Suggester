import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  extractSenderCandidates,
  normalizeEmail,
  resolveOwnerBySender,
  sharedInboundAddress,
} from "@/lib/dreamer/mailbox";
import { pickBestMatch, type MatchCandidate } from "@/lib/dreamer/match-booking";
import {
  parseBookingFromEmailText,
  verifyInboundSignature,
} from "@/lib/dreamer/parse-email";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("resend-signature") ||
    req.headers.get("svix-signature") ||
    req.headers.get("x-waypoint-inbound-secret");

  if (
    !verifyInboundSignature(
      raw,
      signature,
      process.env.RESEND_INBOUND_WEBHOOK_SECRET,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (payload.data as Record<string, unknown>) ?? payload;
  const messageId = String(
    data.message_id ?? data.messageId ?? data.id ?? "",
  ).trim();
  if (!messageId) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  const textBody = String(
    data.text ?? data.text_body ?? data.body ?? "",
  ).slice(0, 50_000);
  const senders = extractSenderCandidates({
    from: data.from ? String(data.from) : null,
    replyTo: data.reply_to
      ? String(data.reply_to)
      : data.replyTo
        ? String(data.replyTo)
        : null,
    sender: data.sender ? String(data.sender) : null,
    textBody,
  });
  const fromAddress = senders[0] ?? normalizeEmail(String(data.from ?? ""));
  const toRaw = data.to ?? data.recipients ?? [];
  const toAddresses = (Array.isArray(toRaw) ? toRaw : [toRaw])
    .map((t) => String(t))
    .filter(Boolean);
  const subject = data.subject ? String(data.subject) : null;

  const svc = createServiceClient();
  if (!svc) {
    // Offline / test path — process in memory only
    const parsed = parseBookingFromEmailText({ subject, text: textBody });
    return NextResponse.json({
      offline: true,
      messageId,
      parsed,
      status: "received",
      inbox: sharedInboundAddress(),
      senders,
    });
  }

  const { data: existing } = await svc
    .from("inbound_emails")
    .select("id, status, owner_id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      reused: true,
      status: existing.status,
    });
  }

  // Match by who sent/forwarded the mail (From), not a +token To address.
  let ownerId: string | null = null;
  let matchedBy: "email" | "username" | null = null;
  if (senders.length) {
    const { data: listed } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const resolved = resolveOwnerBySender(
      senders,
      (listed?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        username:
          (u.user_metadata?.username as string | undefined) ||
          (u.user_metadata?.user_name as string | undefined) ||
          null,
      })),
    );
    if (resolved) {
      ownerId = resolved.ownerId;
      matchedBy = resolved.matchedBy;
    }
  }

  const status = ownerId ? "received" : "unassigned";
  const parsedEarly = parseBookingFromEmailText({ subject, text: textBody });

  const { data: row, error } = await svc
    .from("inbound_emails")
    .insert({
      message_id: messageId,
      owner_id: ownerId,
      from_address: fromAddress,
      to_addresses: toAddresses,
      subject,
      text_body: textBody,
      status,
    })
    .select("id")
    .single();

  if (error || !row) {
    // Migration 009 not applied yet — still return a parse so local/dev can proceed.
    const missingTable = /inbound_emails|schema cache/i.test(error?.message ?? "");
    return NextResponse.json(
      {
        error: error?.message ?? "insert failed",
        needsMigration: missingTable ? "009_dreamer_inbound.sql" : undefined,
        parsed: parsedEarly,
        status: missingTable ? "parsed_offline" : "failed",
        ownerId,
        matchedBy,
      },
      { status: missingTable ? 503 : 400 },
    );
  }

  if (!ownerId) {
    return NextResponse.json({
      id: row.id,
      status: "unassigned",
    });
  }

  const parsed = parseBookingFromEmailText({ subject, text: textBody });

  const { data: dreams } = await svc
    .from("future_trips")
    .select(
      "id, destination, potential_start, potential_end, status, converted_trip_id",
    )
    .eq("owner_id", ownerId);

  const { data: trips } = await svc
    .from("trips")
    .select("id, destination, start_date, end_date, status")
    .eq("owner_id", ownerId);

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

  const best = pickBestMatch(parsed, candidates);
  const title =
    parsed.kind === "flight" && parsed.fromIata && parsed.toIata
      ? `${parsed.fromIata} → ${parsed.toIata}`
      : parsed.hotelName || subject || "Forwarded booking";

  const { data: booking, error: bookErr } = await svc
    .from("dreamer_bookings")
    .insert({
      owner_id: ownerId,
      future_trip_id: best?.candidate.kind === "dream" ? best.candidate.id : null,
      trip_id: best?.candidate.kind === "trip" ? best.candidate.id : null,
      inbound_email_id: row.id,
      kind: parsed.kind ?? "other",
      title,
      parsed,
      starts_at: parsed.startDate ? `${parsed.startDate}T12:00:00Z` : null,
      match_score: best?.score ?? null,
      source: "email_forward",
    })
    .select("id")
    .single();

  await svc
    .from("inbound_emails")
    .update({
      status: best ? "matched" : "parsed",
      parse_error: bookErr?.message ?? null,
    })
    .eq("id", row.id);

  return NextResponse.json({
    id: row.id,
    bookingId: booking?.id,
    status: best ? "matched" : "parsed",
    ownerMatchedBy: matchedBy,
    match: best
      ? { id: best.candidate.id, kind: best.candidate.kind, score: best.score }
      : null,
    parsed,
  });
}
