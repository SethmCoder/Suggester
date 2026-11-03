import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
