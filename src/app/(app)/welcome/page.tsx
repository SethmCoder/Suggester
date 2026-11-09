import { redirect } from "next/navigation";
import { TravelerIntro } from "@/components/profile/TravelerIntro";
import {
  normalizeTravelerProfile,
  shouldSkipIntro,
} from "@/lib/profile/intro-status";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const svc = createServiceClient() ?? supabase;
    const { data: profileRow } = await svc
      .from("profiles")
      .select("traveler_profile, created_at")
      .eq("id", user.id)
      .maybeSingle();
    const profile = normalizeTravelerProfile(profileRow?.traveler_profile);
    const profileAgeMs = profileRow?.created_at
      ? Date.now() - Date.parse(String(profileRow.created_at))
      : null;

    const [{ count: tripCount }, { count: futureTripCount }, { count: wishlistCount }] =
      await Promise.all([
        svc
          .from("trips")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),
        svc
          .from("future_trips")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),
        svc
          .from("wishlist_items")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", user.id),
      ]);

    if (
      shouldSkipIntro({
        profile,
        tripCount,
        futureTripCount,
        wishlistCount,
        profileAgeMs,
      })
    ) {
      // Route handler sets the intro cookie (RSC cannot), then sends them home.
      redirect(
        `/api/profile/intro/complete?next=${encodeURIComponent(nextPath)}`,
      );
    }
  }

  return <TravelerIntro nextPath={nextPath} />;
}
