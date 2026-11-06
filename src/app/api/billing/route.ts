import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { gateFeature, isProEntitled } from "@/lib/billing/entitlements";
import { withProfileEntitlement } from "@/lib/billing/access";
import { checkoutConfigured } from "@/lib/billing/stripe";
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

export async function GET() {
  const jar = await cookies();
  const get = (name: string) => jar.get(name)?.value;
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const access = await withProfileEntitlement(get, userId);
  const plan = readPlan(get);
  const generate = gateFeature("generate", access);
  return NextResponse.json({
    ...plan,
    generateAllowed: generate.allowed,
    entitled: isProEntitled(access),
    priceUsd: 6.99,
    checkoutAvailable: checkoutConfigured(),
  });
}

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const jar = await cookies();
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
  const response = NextResponse.json({
    ...next,
    priceUsd: 6.99,
    checkoutAvailable: checkoutConfigured(),
    message:
      body.action === "upgrade"
        ? "Pro is $6.99 a month. Use Subscribe on the Plans page. This request does not turn Pro on."
        : undefined,
  });
  applyCookies(response, plan, used);
  return response;
}
