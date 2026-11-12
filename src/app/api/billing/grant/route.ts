import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findAuthUserIdByEmail,
  setSubscriptionTier,
} from "@/lib/billing/access";
import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";
import { PLAN_COOKIE } from "@/lib/billing/plans";
import {
  emailGrantedPro,
  grantSecretConfigured,
  grantSecretMatches,
  selfProGrantEnabled,
} from "@/lib/billing/pro-grant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  tier: z.enum(["pro", "free"]).default("pro"),
  /** Unlock Pro for the currently signed-in user. */
  self: z.boolean().optional(),
  /** Admin path: target account email (requires grant secret). */
  email: z.string().email().optional(),
  secret: z.string().optional(),
});

function entitlementCookie(tier: "pro" | "free") {
  return {
    name: ENTITLEMENT_COOKIE,
    value: tier === "pro" ? "pro" : "free",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  };
}

export async function GET() {
  let signedIn = false;
  let email: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    email = user?.email ?? null;
  } catch {
    signedIn = false;
  }
  return NextResponse.json({
    signedIn,
    email,
    allowlisted: emailGrantedPro(email),
    selfGrantAvailable: selfProGrantEnabled() && signedIn,
    secretGrantAvailable: grantSecretConfigured(),
  });
}

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const headerSecret = req.headers.get("x-waypoint-grant-secret");
  const secretOk = grantSecretMatches(body.secret ?? headerSecret);

  let supabaseUser: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) supabaseUser = { id: user.id, email: user.email };
  } catch {
    supabaseUser = null;
  }

  let userId: string | null = null;
  let via: "self" | "secret-email" | "allowlist-self" | null = null;

  if (body.self) {
    if (!supabaseUser) {
      return NextResponse.json(
        { error: "Sign in before unlocking Pro on this account." },
        { status: 401 },
      );
    }
    const allowlisted = emailGrantedPro(supabaseUser.email);
    if (!selfProGrantEnabled() && !allowlisted && !secretOk) {
      return NextResponse.json(
        {
          error:
            "Self Pro unlock is off. Set WAYPOINT_ALLOW_SELF_PRO_GRANT=1, add your email to WAYPOINT_PRO_EMAILS, or pass WAYPOINT_GRANT_SECRET.",
        },
        { status: 403 },
      );
    }
    userId = supabaseUser.id;
    via = allowlisted ? "allowlist-self" : secretOk ? "self" : "self";
  } else if (body.email) {
    if (!secretOk) {
      return NextResponse.json(
        { error: "A valid WAYPOINT_GRANT_SECRET is required to grant by email." },
        { status: 403 },
      );
    }
    userId = await findAuthUserIdByEmail(body.email);
    if (!userId) {
      return NextResponse.json(
        { error: "No auth user found for that email." },
        { status: 404 },
      );
    }
    via = "secret-email";
  } else {
    return NextResponse.json(
      { error: "Provide self: true or an email plus grant secret." },
      { status: 400 },
    );
  }

  const saved = await setSubscriptionTier(userId, body.tier);
  if (!saved.ok) {
    return NextResponse.json(
      {
        error:
          saved.error ??
          "Could not write subscription_tier. Check SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    tier: body.tier,
    userId,
    via,
    entitled: body.tier === "pro",
  });
  const cookie = entitlementCookie(body.tier);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  // Keep legacy trip-cap cookie in sync so Free's 3-trip limit unlocks with Pro.
  response.cookies.set(PLAN_COOKIE, body.tier === "pro" ? "pro" : "free", cookie.options);
  return response;
}
