import { createServiceClient } from "@/lib/supabase/server";
import type { AnalyticsEventName } from "./events";

export async function trackServerEvent(input: {
  event: AnalyticsEventName | string;
  userId?: string | null;
  properties?: Record<string, unknown>;
  path?: string | null;
}): Promise<void> {
  const svc = createServiceClient();
  if (!svc) return;
  try {
    await svc.from("analytics_events").insert({
      user_id: input.userId ?? null,
      event_name: input.event,
      properties: input.properties ?? {},
      path: input.path ?? null,
    });
  } catch {
    /* never block product flows on analytics */
  }
}

export function isAnalyticsAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ANALYTICS_ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) {
    // Solo-dev default: any signed-in user can see funnel until admins are set.
    return true;
  }
  return allowed.includes(email.trim().toLowerCase());
}
