import type { NextResponse } from "next/server";

export const DEMO_COOKIE = "waypoint_demo";
export const DEMO_COOKIE_VALUE = "1";

export function isDemoCookie(value: string | undefined | null): boolean {
  return value === DEMO_COOKIE_VALUE;
}

const AUTH_COOKIE_RE = /^(sb-|supabase-)/i;

export function isSupabaseAuthCookieName(name: string): boolean {
  return AUTH_COOKIE_RE.test(name);
}

/** Demo and personal auth must never share a browser session. */
export function clearSupabaseAuthCookies(
  res: NextResponse,
  names: Iterable<string>,
) {
  const secure = process.env.NODE_ENV === "production";
  for (const name of names) {
    if (!isSupabaseAuthCookieName(name)) continue;
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }
}

export function clearDemoCookie(res: NextResponse) {
  res.cookies.set(DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function setDemoCookie(res: NextResponse) {
  res.cookies.set(DEMO_COOKIE, DEMO_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}
