import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ItineraryEditor } from "@/components/itinerary/ItineraryEditor";
import { DEMO_TRIP_ID, getDemoTripPayload } from "@/lib/demo/data";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { fetchTripFull } from "@/lib/db/trips";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const demo = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  if (demo && id === DEMO_TRIP_ID) {
    const data = getDemoTripPayload();
    return (
      <>
        <DemoBanner />
        <ItineraryEditor
          tripId={id}
          destination={`${data.trip.destination} (Demo)`}
          initialDays={data.days}
          initialActivities={data.activities}
          isDemo
        />
      </>
    );
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    if (demo) redirect("/trips/demo-paris");
    redirect("/login");
  }

  if (!userId) {
    if (demo) redirect("/trips/demo-paris");
    redirect("/login");
  }

  const data = await fetchTripFull(id, userId);
  if (!data) notFound();

  return (
    <ItineraryEditor
      tripId={id}
      destination={data.trip.destination}
      initialDays={data.days}
      initialActivities={data.activities}
    />
  );
}
