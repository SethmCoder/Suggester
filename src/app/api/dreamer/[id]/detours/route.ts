import { NextResponse } from "next/server";
import { createServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";

type Prefs = {
  dreamer?: {
    detours?: Record<string, "accepted" | "dismissed" | "pending">;
    [key: string]: unknown;
  };
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { detourId?: string; decision?: "accepted" | "dismissed" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.detourId || !body.decision) {
    return NextResponse.json(
      { error: "detourId and decision required" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: true, offline: true, ...body });
  }

  const { data: dream } = await svc
    .from("future_trips")
    .select("preferences")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!dream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const prefs = (dream.preferences ?? {}) as Prefs;
  const dreamer = prefs.dreamer ?? {};
  const detours = { ...(dreamer.detours ?? {}) };
  detours[body.detourId] = body.decision;

  await svc
    .from("future_trips")
    .update({
      preferences: { ...prefs, dreamer: { ...dreamer, detours } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  return NextResponse.json({ ok: true, detourId: body.detourId, decision: body.decision });
}
