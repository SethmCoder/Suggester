import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
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
  return NextResponse.json(readPlan((name) => jar.get(name)?.value));
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
    checkoutAvailable: false,
    message:
      body.action === "upgrade"
        ? "Pro is $6.99 a month. Checkout is not taking cards yet, so this browser was not upgraded."
        : undefined,
  });
  applyCookies(response, plan, used);
  return response;
}
