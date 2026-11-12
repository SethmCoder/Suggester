import { redirect } from "next/navigation";
import { SignupToPlanFunnel } from "@/components/settings/SignupToPlanFunnel";
import { isAnalyticsAdmin } from "@/lib/analytics/track";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminAnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAnalyticsAdmin(user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Admin-only product funnel. Set{" "}
          <code className="rounded bg-[#F5F7FF] px-1 text-xs">
            ANALYTICS_ADMIN_EMAILS
          </code>{" "}
          to grant access.
        </p>
      </div>
      <SignupToPlanFunnel />
    </div>
  );
}
