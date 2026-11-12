import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_TRIP_ID } from "@/lib/demo/data";
import {
  clearSupabaseAuthCookies,
  setDemoCookie,
} from "@/lib/demo/session";
import { PLAN_COOKIE, USED_COOKIE } from "@/lib/billing/plans";
import { AI_MONTH_COOKIE, AI_USED_COOKIE } from "@/lib/billing/entitlements";

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
  // Fresh demo quota so prior free-plan usage doesn't block try-it flows.
  const clearOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(USED_COOKIE, "", clearOpts);
  res.cookies.set(AI_USED_COOKIE, "", clearOpts);
  res.cookies.set(AI_MONTH_COOKIE, "", clearOpts);
  res.cookies.set(PLAN_COOKIE, "", clearOpts);
  return res;
}
