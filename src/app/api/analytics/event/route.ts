import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyticsEvent } from "@/lib/analytics/events";
import { trackServerEvent } from "@/lib/analytics/track";

const ALLOWED = new Set<string>(Object.values(AnalyticsEvent));

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: {
    event?: string;
    properties?: Record<string, unknown>;
    path?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(body.event ?? "").trim();
  if (!ALLOWED.has(event)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  await trackServerEvent({
    event,
    userId: user.id,
    properties: body.properties ?? {},
    path: body.path ?? null,
  });

  return NextResponse.json({ ok: true });
}
