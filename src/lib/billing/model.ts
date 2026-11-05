import { cookies } from "next/headers";
import { ENTITLEMENT_COOKIE } from "@/lib/billing/entitlements";
import { FREE_MODEL, proModel } from "@/lib/billing/plans";

/** Free stays on the smaller model. The old plan cookie does not select Pro. */
export async function plannerModel(): Promise<string> {
  try {
    const jar = await cookies();
    return jar.get(ENTITLEMENT_COOKIE)?.value === "pro" ? proModel() : FREE_MODEL;
  } catch {
    return FREE_MODEL;
  }
}
