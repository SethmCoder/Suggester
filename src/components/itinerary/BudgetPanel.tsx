import {
  allocationLabel,
  restaurantLabel,
  type BudgetPlan,
} from "@/lib/trips/budget";

function costLabel(note?: string | null): string {
  if (/lists this as free/i.test(note ?? "")) return "Listed as free";
  if (/a fee is listed/i.test(note ?? "")) return "Fee listed, amount not listed";
  return "Cost not listed";
}

export function BudgetPanel({
  plan,
  stops,
}: {
  plan?: BudgetPlan;
  stops: { id: string; name: string; note?: string | null }[];
}) {
  let total = "Not set";
  if (plan?.total && plan.total > 0) {
    try {
      total = new Intl.NumberFormat("en", {
        style: "currency",
        currency: plan.currency || "USD",
        maximumFractionDigits: 0,
      }).format(plan.total);
    } catch {
      total = `${plan.total} ${plan.currency || ""}`.trim();
    }
  }

  return (
    <section className="rounded-[16px] border border-[#E1E5F0] bg-white px-5 py-4 shadow-[0_6px_18px_rgba(8,11,58,0.05)]">
      <h2 className="text-sm font-semibold text-[#080B3A]">Budget</h2>
      <dl className="mt-2 grid gap-1 text-sm text-[#1F2937] sm:grid-cols-3">
        <div>
          <dt className="text-[#6B7280]">Whole trip</dt>
          <dd className="font-medium">{total}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Use it for</dt>
          <dd className="font-medium">{allocationLabel(plan?.allocation)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Restaurants</dt>
          <dd className="font-medium">{restaurantLabel(plan?.restaurantStyle)}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Party</dt>
          <dd className="font-medium capitalize">{plan?.party || "Not set"}</dd>
        </div>
        <div>
          <dt className="text-[#6B7280]">Walk limit</dt>
          <dd className="font-medium">
            {plan?.maxWalkMinutes ? `${plan.maxWalkMinutes} minutes` : "Not set"}
          </dd>
        </div>
      </dl>
      {stops.length ? (
        <ul className="mt-3 space-y-1 text-sm text-[#374151]">
          {stops.map((stop) => (
            <li key={stop.id} className="flex justify-between gap-3">
              <span className="truncate">{stop.name}</span>
              <span className="shrink-0 text-[#6B7280]">{costLabel(stop.note)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-[#6B7280]">
        Known dollar amounts are not listed, so the budget cannot be confirmed.
      </p>
    </section>
  );
}
