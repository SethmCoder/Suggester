import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { INTRO_COOKIE } from "@/lib/profile/traveler";

const PROTECTED = [
  "/dashboard",
  "/profile",
  "/settings",
  "/saved-places",
  "/explore",
  "/things",
  "/help",
  "/plan",
  "/trips/new",
  "/welcome",
];
const PROTECTED_PREFIX = "/trips/";

/** Sample itineraries available without an account (keep in sync with lib/demo/data). */
const DEMO_TRIP_PATHS = new Set(["/trips/demo-paris", "/trips/demo-dubai"]);

function isDemoTripPath(path: string) {
  return DEMO_TRIP_PATHS.has(path);
}

function isDemoCreatedTrip(path: string) {
  return path.startsWith("/trips/offline-");
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const demo = isDemoCookie(request.cookies.get(DEMO_COOKIE)?.value);

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (path !== "/auth/callback" && (code || tokenHash)) {
    const callback = new URL("/auth/callback", request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== "next") callback.searchParams.set(key, value);
    });
    const next =
      path === "/" || path === "/login" || path === "/signup"
        ? "/dashboard"
        : path;
    callback.searchParams.set("next", next);
    return NextResponse.redirect(callback);
  }

  const isProtected =
    PROTECTED.some((p) => path === p || path.startsWith(`${p}/`)) ||
    (path.startsWith(PROTECTED_PREFIX) &&
      !path.startsWith("/trips/preview") &&
      path !== "/trips/new");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (isProtected && !demo) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (demo) {
      response.cookies.set(DEMO_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    const introDone = request.cookies.get(INTRO_COOKIE)?.value === "1";
    if (path === "/login" || path === "/signup") {
      const redirect = NextResponse.redirect(
        new URL(introDone ? "/dashboard" : "/welcome", request.url),
      );
      response.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie);
      });
      return redirect;
    }
    if (!introDone && path !== "/welcome" && isProtected) {
      const welcomeUrl = new URL("/welcome", request.url);
      welcomeUrl.searchParams.set("next", path);
      const welcome = NextResponse.redirect(welcomeUrl);
      response.cookies.getAll().forEach((cookie) => {
        welcome.cookies.set(cookie);
      });
      return welcome;
    }
    return response;
  }

  // Demo cookie unlocks dashboard, sample trips, the planner, and trips it creates.
  if (demo && isProtected) {
    if (
      path.startsWith("/trips/") &&
      !isDemoTripPath(path) &&
      !isDemoCreatedTrip(path) &&
      path !== "/trips/new"
    ) {
      return NextResponse.redirect(new URL("/trips/demo-paris", request.url));
    }
    return NextResponse.next();
  }

  if (isProtected && !demo) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/saved-places/:path*",
    "/explore",
    "/explore/:path*",
    "/things",
    "/things/:path*",
    "/help/:path*",
    "/plan",
    "/plan/:path*",
    "/trips/:path*",
    "/login",
    "/signup",
    "/welcome",
  ],
};
