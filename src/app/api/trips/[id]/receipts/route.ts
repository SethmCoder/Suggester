import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { parseReceiptInput } from "@/lib/trips/parse-receipt";

const bodySchema = z.object({
  text: z.string().max(20_000).optional(),
  screenshotDataUrl: z.string().max(6_000_000).optional(),
  tripCurrency: z.string().max(8).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tripId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data: trip } = await svc
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const result = await parseReceiptInput({
      text: body.text,
      screenshotDataUrl: body.screenshotDataUrl,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { receipt } = result;
    return NextResponse.json({
      label: receipt.label,
      amount: receipt.amount,
      currency: receipt.currency,
      category: receipt.category,
      purchasedAt: receipt.purchasedAt,
      note: receipt.note,
      tripCurrency: body.tripCurrency?.trim().toUpperCase(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
