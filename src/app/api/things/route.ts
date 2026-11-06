import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withProfileEntitlement } from "@/lib/billing/access";
import {
  AI_MONTH_COOKIE,
  AI_USED_COOKIE,
  currentMonthKey,
  gateFeature,
  PRO_REQUIRED_MESSAGE,
} from "@/lib/billing/entitlements";
import { searchThings } from "@/lib/things/ask";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  city: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const cookieStore = await cookies();
  let userId: string | null = null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const gate = gateFeature(
    "basic",
    await withProfileEntitlement((name) => cookieStore.get(name)?.value, userId),
  );
  if (!gate.allowed) {
    return NextResponse.json({ error: PRO_REQUIRED_MESSAGE, code: "pro_required" }, { status: 402 });
  }

  const result = await searchThings({
    message: body.message,
    city: body.city?.trim() ?? "",
  });
  const response = NextResponse.json(result);
  if (gate.consumes) {
    response.cookies.set(AI_USED_COOKIE, String(gate.used + 1), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    response.cookies.set(AI_MONTH_COOKIE, currentMonthKey(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}
