import { Suspense } from "react";
import { cookies } from "next/headers";
import { CreateTripWizard } from "@/components/trips/CreateTripWizard";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";

export default async function NewTripPage() {
  const cookieStore = await cookies();
  const preview = isDemoCookie(cookieStore.get(DEMO_COOKIE)?.value);

  return (
    <Suspense
      fallback={
        <div className="rounded-[16px] border border-[#E1E5F0] bg-white px-6 py-12 text-center text-sm text-[#6B7280]">
          Loading trip planner…
        </div>
      }
    >
      <CreateTripWizard previewMode={preview} />
    </Suspense>
  );
}
