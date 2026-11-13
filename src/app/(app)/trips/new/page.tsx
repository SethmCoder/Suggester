import { Suspense } from "react";
import { cookies } from "next/headers";
import { CreateTripWizard } from "@/components/trips/CreateTripWizard";
import { ProgressiveTripPlanner } from "@/components/planner/ProgressiveTripPlanner";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const preview = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);
  const params = await searchParams;

  // Bare /trips/new → progressive Dream→Organize. Deep links / advanced → wizard.
  const useWizard =
    params.wizard === "1" ||
    typeof params.future === "string" ||
    typeof params.destination === "string";

  return (
    <Suspense
      fallback={
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Loading trip planner…
        </div>
      }
    >
      {useWizard ? (
        <CreateTripWizard previewMode={preview} />
      ) : (
        <ProgressiveTripPlanner />
      )}
    </Suspense>
  );
}
