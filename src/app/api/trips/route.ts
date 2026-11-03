import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { demoTrip } from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const cookieStore = await cookies();
  if (isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value)) {
    return NextResponse.json({
      trips: [demoTrip],
      isDemo: true,
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ trips: [] });
    }

    const { data: trips } = await supabase
      .from("trips")
      .select("id, destination, start_date, end_date, cover_image_url, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ trips: trips ?? [], isDemo: false });
  } catch {
    return NextResponse.json({ trips: [] });
  }
}
