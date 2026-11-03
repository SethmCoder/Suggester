import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";

const PROTECTED = [
  "/dashboard",
  "/profile",
  "/settings",
  "/saved-places",
  "/help",
  "/trips/new",
];
const PROTECTED_PREFIX = "/trips/";

/** Sample itineraries available without an account (keep in sync with lib/demo/data). */
const DEMO_TRIP_PATHS = new Set(["/trips/demo-paris", "/trips/demo-dubai"]);

function isDemoTripPath(path: string) {
  return DEMO_TRIP_PATHS.has(path);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const demo = isDemoCookie(request.cookies.get(DEMO_COOKIE)?.value);

  const isProtected =
    PROTECTED.some((p) => path === p || path.startsWith(`${p}/`)) ||
    (path.startsWith(PROTECTED_PREFIX) &&
      !path.startsWith("/trips/preview") &&
      path !== "/trips/new");

  // Demo cookie unlocks dashboard + demo trips + create-trip preview
  if (demo && isProtected) {
    // /trips/new is allowed as an interactive preview (submit still requires signup)
    if (
      path.startsWith("/trips/") &&
      !isDemoTripPath(path) &&
      path !== "/trips/new"
    ) {
      return NextResponse.redirect(new URL("/trips/demo-paris", request.url));
    }
    return NextResponse.next();
  }

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

  if (isProtected && !user && !demo) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  if (user && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/saved-places/:path*",
    "/help/:path*",
    "/trips/:path*",
    "/login",
    "/signup",
  ],
};
