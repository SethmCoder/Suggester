import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE } from "@/lib/demo/session";
import { DEMO_TRIP_ID } from "@/lib/demo/data";

export async function POST() {
  const res = NextResponse.json({
    ok: true,
    tripId: DEMO_TRIP_ID,
    message: "Demo session started. Sample data only.",
  });
  res.cookies.set(DEMO_COOKIE, DEMO_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
