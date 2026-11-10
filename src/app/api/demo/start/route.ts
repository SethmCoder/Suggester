import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE } from "@/lib/demo/session";
import { DEMO_TRIP_ID } from "@/lib/demo/data";

function clearAuthCookies(res: NextResponse, names: string[]) {
  for (const name of names) {
    if (!name.startsWith("sb-")) continue;
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function POST() {
  const cookieStore = await cookies();
  const authCookieNames = cookieStore.getAll().map((c) => c.name);

  const res = NextResponse.json({
    ok: true,
    tripId: DEMO_TRIP_ID,
    message: "Demo session started. Sample data only.",
    isDemo: true,
  });
  res.cookies.set(DEMO_COOKIE, DEMO_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  // Drop personal Supabase session so the shell shows the demo account.
  clearAuthCookies(res, authCookieNames);
  return res;
}
