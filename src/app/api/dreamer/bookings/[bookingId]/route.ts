import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { mapBookingRow } from "@/lib/dreamer/ingest";
import { summarizeParsedBooking } from "@/lib/dreamer/summary";
import type { ParsedBooking } from "@/lib/dreamer/types";

export async function GET(
  _req: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: row, error } = await svc
    .from("dreamer_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = mapBookingRow(row);
  let email: {
    subject: string | null;
    textBody: string | null;
    htmlBody: string | null;
    fromAddress: string | null;
    receivedAt: string | null;
  } | null = null;

  if (row.inbound_email_id) {
    // Metadata only — raw text_body/html_body are intentionally not stored.
    const { data: inbound } = await svc
      .from("inbound_emails")
      .select("subject, from_address, received_at")
      .eq("id", row.inbound_email_id)
      .maybeSingle();
    if (inbound) {
      email = {
        subject: inbound.subject,
        textBody: null,
        htmlBody: null,
        fromAddress: inbound.from_address,
        receivedAt: inbound.received_at,
      };
    }
  }

  const parsed = (row.parsed ?? {}) as ParsedBooking;
  return NextResponse.json({
    booking: {
      ...booking,
      summary: booking.summary ?? summarizeParsedBooking(parsed),
    },
    email,
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // Local-only paste bookings never hit the DB.
  if (bookingId.startsWith("local-")) {
    return NextResponse.json({ ok: true, local: true });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: true, offline: true });
  }

  const { data: row, error: lookupErr } = await svc
    .from("dreamer_bookings")
    .select("id, inbound_email_id")
    .eq("id", bookingId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (lookupErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await svc
    .from("dreamer_bookings")
    .delete()
    .eq("id", bookingId)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (row.inbound_email_id) {
    await svc
      .from("inbound_emails")
      .delete()
      .eq("id", row.inbound_email_id)
      .eq("owner_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
