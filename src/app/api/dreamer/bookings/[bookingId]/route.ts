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
    const { data: inbound } = await svc
      .from("inbound_emails")
      .select("subject, text_body, html_body, from_address, received_at")
      .eq("id", row.inbound_email_id)
      .maybeSingle();
    if (inbound) {
      email = {
        subject: inbound.subject,
        textBody: inbound.text_body,
        htmlBody: inbound.html_body,
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
