import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ItineraryEditor } from "@/components/itinerary/ItineraryEditor";
import { OfflineTripLoader } from "@/components/trips/OfflineTripLoader";
import {
  DEMO_TRIP_ID,
  getDemoTripPayload,
  isDemoTripId,
} from "@/lib/demo/data";
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

  if (demo && isDemoTripId(id)) {
    const data = getDemoTripPayload(id);
    return (
      <>
        <DemoBanner />
        <ItineraryEditor
          tripId={id}
          destination={`${data.trip.destination} (Demo)`}
          initialDays={data.days}
          initialActivities={data.activities}
          isDemo
          startDate={data.trip.start_date}
          endDate={data.trip.end_date}
        />
      </>
    );
  }

  // Offline-created trips (no server row) — client hydrates from localStorage
  if (id.startsWith("offline-")) {
    return <OfflineTripLoader tripId={id} />;
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    if (demo) redirect(`/trips/${DEMO_TRIP_ID}`);
    // Allow opening via offline cache when auth/network fails
    return <OfflineTripLoader tripId={id} />;
  }

  if (!userId) {
    if (demo) redirect(`/trips/${DEMO_TRIP_ID}`);
    return <OfflineTripLoader tripId={id} />;
  }

  try {
    const data = await fetchTripFull(id, userId);
    if (!data) {
      return <OfflineTripLoader tripId={id} />;
    }

    return (
      <ItineraryEditor
        tripId={id}
        destination={data.trip.destination}
        initialDays={data.days}
        initialActivities={data.activities}
        startDate={data.trip.start_date}
        endDate={data.trip.end_date}
      />
    );
  } catch {
    return <OfflineTripLoader tripId={id} />;
  }
}
