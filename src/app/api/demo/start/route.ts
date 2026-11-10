import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_TRIP_ID } from "@/lib/demo/data";
import {
  clearSupabaseAuthCookies,
  setDemoCookie,
} from "@/lib/demo/session";

export async function POST() {
  const cookieStore = await cookies();
  const authCookieNames = cookieStore.getAll().map((c) => c.name);

  const res = NextResponse.json({
    ok: true,
    tripId: DEMO_TRIP_ID,
    message: "Demo session started. Sample data only.",
    isDemo: true,
    signedIn: false,
  });
  setDemoCookie(res);
  // Personal auth must not ride along — demo is its own account.
  clearSupabaseAuthCookies(res, authCookieNames);
  return res;
}
