import { createServiceClient } from "../supabase/server";

const CAPS: Record<string, number> = {
  "places.searchText": 400,
  "places.details.enterprise": 900,
  "routes.compute.essentials": 9000,
  "places.photo": 9000,
  geocoding: 9000,
};

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function canUseSku(sku: string): Promise<boolean> {
  const cap = CAPS[sku];
  if (!cap) return true;
  const supabase = createServiceClient();
  if (!supabase) return true;
  const { data } = await supabase
    .from("api_usage")
    .select("count")
    .eq("sku", sku)
    .eq("month_key", monthKey())
    .maybeSingle();
  return (data?.count ?? 0) < cap;
}

export async function incrementSku(sku: string, by = 1) {
  const supabase = createServiceClient();
  if (!supabase) return;
  const mk = monthKey();
  const { data } = await supabase
    .from("api_usage")
    .select("count")
    .eq("sku", sku)
    .eq("month_key", mk)
    .maybeSingle();
  const next = (data?.count ?? 0) + by;
  await supabase.from("api_usage").upsert({
    sku,
    month_key: mk,
    count: next,
  });
}
