import { NextResponse } from "next/server";
import {
  markIntroComplete,
  normalizeTravelerProfile,
} from "@/lib/profile/intro-status";
import { INTRO_COOKIE, emptyTraveler } from "@/lib/profile/traveler";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";

function setIntroCookie(res: NextResponse) {
  res.cookies.set(INTRO_COOKIE, "1", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Sets the intro cookie for returning accounts and redirects into the app. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextRaw = url.searchParams.get("next") || "/dashboard";
  const nextPath =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const svc = createServiceClient() ?? supabase;
    const { data } = await svc
      .from("profiles")
      .select("traveler_profile")
      .eq("id", user.id)
      .maybeSingle();
    const profile = markIntroComplete(
      normalizeTravelerProfile(data?.traveler_profile) || emptyTraveler(),
    );
    await svc.from("profiles").upsert({
      id: user.id,
      traveler_profile: profile,
    });
  }

  const res = NextResponse.redirect(new URL(nextPath, req.url));
  setIntroCookie(res);
  return res;
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const svc = createServiceClient() ?? supabase;
  const { data } = await svc
    .from("profiles")
    .select("traveler_profile")
    .eq("id", user.id)
    .maybeSingle();
  const profile = markIntroComplete(
    normalizeTravelerProfile(data?.traveler_profile) || emptyTraveler(),
  );
  await svc.from("profiles").upsert({
    id: user.id,
    traveler_profile: profile,
  });
  const res = NextResponse.json({ ok: true, profile });
  setIntroCookie(res);
  return res;
}
