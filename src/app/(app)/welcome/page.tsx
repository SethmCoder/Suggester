import { redirect } from "next/navigation";
import { TravelerIntro } from "@/components/profile/TravelerIntro";
import {
  isIntroComplete,
  normalizeTravelerProfile,
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
      .select("traveler_profile")
      .eq("id", user.id)
      .maybeSingle();
    const profile = normalizeTravelerProfile(profileRow?.traveler_profile);

    const { count: tripCount } = await svc
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);

    const returning =
      isIntroComplete(profile) || (typeof tripCount === "number" && tripCount > 0);

    if (returning) {
      // Route handler sets the intro cookie (RSC cannot), then sends them home.
      redirect(
        `/api/profile/intro/complete?next=${encodeURIComponent(nextPath)}`,
      );
    }
  }

  return <TravelerIntro nextPath={nextPath} />;
}
