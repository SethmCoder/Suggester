import { NextResponse } from "next/server";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { computeSignupToPlanFunnel } from "@/lib/analytics/funnel";
import { isAnalyticsAdmin } from "@/lib/analytics/track";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isAnalyticsAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Number(new URL(req.url).searchParams.get("days") ?? "30");
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({
      days,
      signedUp: 0,
      cohortSource: "events",
      wizardOpened: 0,
      generateClicked: 0,
      tripPlanned: 0,
      signedUpThenPlanned: 0,
      signupToPlanRate: 0,
      secondTripUsers: 0,
      secondTripRate: 0,
      offline: true,
    });
  }

  const stats = await computeSignupToPlanFunnel(svc, days);
  return NextResponse.json(stats);
}
