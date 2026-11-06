import { PLAN_COOKIE } from "@/lib/billing/plans";

/** Separate from the old plan cookie. Only the server may set this. */
export const ENTITLEMENT_COOKIE = "waypoint_entitlement";
export const AI_USED_COOKIE = "waypoint_ai_used";
export const AI_MONTH_COOKIE = "waypoint_ai_month";

export const FREE_AI_LIMIT = 5;
export const PRO_AI_LIMIT = 80;

export const PRO_PRICE_USD = 6.99;

export type ProFeature =
  | "generate"
  | "quality"
  | "optimize"
  | "import"
  | "whatif"
  | "advanced";

export type BasicFeature = "basic";

type Getter = (name: string) => string | undefined;

export function isProEntitled(get: Getter): boolean {
  if (process.env.WAYPOINT_PRO_GRANT === "1") return true;
  return get(ENTITLEMENT_COOKIE) === "pro";
}

/** The legacy plan cookie must not grant Pro features. */
export function legacyPlanCookieGrantsPro(get: Getter): boolean {
  return get(PLAN_COOKIE) === "pro" && !isProEntitled(get);
}

export function aiLimit(pro: boolean): number {
  return pro ? PRO_AI_LIMIT : FREE_AI_LIMIT;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function readAiUsed(get: Getter, now = new Date()): number {
  if (get(AI_MONTH_COOKIE) !== currentMonthKey(now)) return 0;
  return Math.max(0, Math.floor(Number(get(AI_USED_COOKIE)) || 0));
}

export function gateFeature(
  feature: ProFeature | BasicFeature,
  get: Getter,
  now = new Date(),
): { allowed: boolean; consumes: boolean; used: number; limit: number } {
  const pro = isProEntitled(get);
  const used = readAiUsed(get, now);
  const limit = aiLimit(pro);
  if (feature === "basic") {
    if (used >= limit) {
      return { allowed: false, consumes: false, used, limit };
    }
    return { allowed: true, consumes: true, used, limit };
  }
  if (!pro) return { allowed: false, consumes: false, used, limit };
  if (used >= limit) return { allowed: false, consumes: false, used, limit };
  const consumes = feature === "generate" || feature === "import" || feature === "advanced";
  return { allowed: true, consumes, used, limit };
}

export function isAdvancedRequest(message: string): boolean {
  return /\b(make day|less busy|reorganize|what if|optimi[sz]e|replace|move the|import|lighter day|reduce travel)\b/i.test(
    message,
  );
}

export const PRO_REQUIRED_MESSAGE =
  "Full itinerary generation, the intelligence panel, optimize, what-if, and import are part of Pro at $6.99 a month. Subscribe from Plans.";
