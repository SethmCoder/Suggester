import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ENTITLEMENT_COOKIE,
  gateFeature,
  isProEntitled,
} from "@/lib/billing/entitlements";
import { withProfileEntitlement } from "@/lib/billing/access";
import { LIST_PRICES } from "@/lib/billing/limits";
import {
  emailGrantedPro,
  grantSecretConfigured,
  selfProGrantEnabled,
} from "@/lib/billing/pro-grant";
import { checkoutConfigured } from "@/lib/billing/stripe";
import { DEMO_COOKIE, isDemoCookie } from "@/lib/demo/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PLAN_COOKIE,
  USED_COOKIE,
  readPlan,
  type PlanId,
} from "@/lib/billing/plans";

const bodySchema = z.object({
  action: z.enum(["sync", "upgrade", "downgrade"]),
  created: z.number().int().min(0).max(10000).optional(),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

function applyCookies(res: NextResponse, plan: PlanId, used: number) {
  const options = cookieOptions();
  res.cookies.set(PLAN_COOKIE, plan, options);
  res.cookies.set(USED_COOKIE, String(used), options);
}

async function currentAuthUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  } catch {
    return null;
  }
}

function applyEntitlementCookie(res: NextResponse, entitled: boolean) {
  res.cookies.set(ENTITLEMENT_COOKIE, entitled ? "pro" : "free", cookieOptions());
}

export async function GET() {
  const jar = await cookies();
  const get = (name: string) => jar.get(name)?.value;
  const demo = isDemoCookie(jar.get(DEMO_COOKIE)?.value);
  // Demo account is not a personal login — never report signedIn while demo.
  if (demo) {
    const plan = readPlan(get);
    return NextResponse.json({
      ...plan,
      generateAllowed: true,
      entitled: false,
      priceUsd: LIST_PRICES.proMonthlyUsd,
      priceAnnualUsd: LIST_PRICES.proAnnualUsd,
      checkoutAvailable: checkoutConfigured(),
      signedIn: false,
      isDemo: true,
      selfGrantAvailable: false,
      secretGrantAvailable: grantSecretConfigured(),
      allowlisted: false,
    });
  }
  const user = await currentAuthUser();
  const access = await withProfileEntitlement(get, user ?? undefined);
  const plan = readPlan(get);
  const generate = gateFeature("generate", access);
  const entitled = isProEntitled(access);
  const response = NextResponse.json({
    ...plan,
    generateAllowed: generate.allowed,
    entitled,
    priceUsd: LIST_PRICES.proMonthlyUsd,
    priceAnnualUsd: LIST_PRICES.proAnnualUsd,
    checkoutAvailable: checkoutConfigured(),
    signedIn: Boolean(user),
    isDemo: false,
    selfGrantAvailable: selfProGrantEnabled() && Boolean(user) && !entitled,
    secretGrantAvailable: grantSecretConfigured(),
    allowlisted: emailGrantedPro(user?.email),
  });
  if (entitled) applyEntitlementCookie(response, true);
  return response;
}

export async function POST(req: Request) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Billing request looks invalid" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const jar = await cookies();
  const demo = isDemoCookie(jar.get(DEMO_COOKIE)?.value);
  const current = readPlan((name) => jar.get(name)?.value);
  let plan = current.plan;
  let used = current.used;
  if (body.action === "downgrade") plan = "free";
  if (typeof body.created === "number") used = Math.max(used, body.created);
  const next = readPlan((name) => {
    if (name === PLAN_COOKIE) return plan;
    if (name === USED_COOKIE) return String(used);
    return undefined;
  });
  if (demo) {
    const response = NextResponse.json({
      ...next,
      entitled: false,
      priceUsd: LIST_PRICES.proMonthlyUsd,
      priceAnnualUsd: LIST_PRICES.proAnnualUsd,
      checkoutAvailable: checkoutConfigured(),
      signedIn: false,
      isDemo: true,
      selfGrantAvailable: false,
      secretGrantAvailable: grantSecretConfigured(),
      allowlisted: false,
    });
    applyCookies(response, plan, used);
    return response;
  }
  const user = await currentAuthUser();
  const access = await withProfileEntitlement(
    (name) => jar.get(name)?.value,
    user ?? undefined,
  );
  const entitled = isProEntitled(access);
  const response = NextResponse.json({
    ...next,
    entitled,
    priceUsd: LIST_PRICES.proMonthlyUsd,
    priceAnnualUsd: LIST_PRICES.proAnnualUsd,
    checkoutAvailable: checkoutConfigured(),
    signedIn: Boolean(user),
    isDemo: false,
    selfGrantAvailable: selfProGrantEnabled() && Boolean(user) && !entitled,
    secretGrantAvailable: grantSecretConfigured(),
    allowlisted: emailGrantedPro(user?.email),
    message:
      body.action === "upgrade"
        ? `Plus is $${LIST_PRICES.proMonthlyUsd.toFixed(2)} a month or $${LIST_PRICES.proAnnualUsd.toFixed(2)} a year. Use Subscribe in Pricing. This request does not turn Plus on.`
        : undefined,
  });
  applyCookies(response, plan, used);
  if (entitled) applyEntitlementCookie(response, true);
  return response;
}
