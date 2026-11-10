import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { dreamerPlaceIdeas } from "@/lib/dreamer/suggestions";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = new URL(_req.url);
  let destination = url.searchParams.get("city")?.trim() || "Tokyo";
  const svc = createServiceClient();
  if (user && svc) {
    const { data: dream } = await svc
      .from("future_trips")
      .select("destination")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (dream) destination = dream.destination;
  }

  return NextResponse.json({
    places: dreamerPlaceIdeas(destination),
    source: "catalog",
    note: "Future Plans places are separate from Trip Wizard — catalog-grounded only.",
  });
}
