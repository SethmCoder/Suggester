import { redirect } from "next/navigation";

/** Billing moved to Settings — keep this path for old links / Stripe returns. */
export default async function PlanRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") q.set(key, value);
    else if (Array.isArray(value) && value[0]) q.set(key, value[0]);
  }
  const qs = q.toString();
  redirect(qs ? `/pricing?${qs}` : "/pricing");
}
