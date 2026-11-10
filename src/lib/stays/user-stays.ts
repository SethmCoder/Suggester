import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBooking } from "@/lib/dreamer/types";

function normalizeHotel(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

function cityFromParsed(parsed: ParsedBooking): string | null {
  const city = parsed.cities?.[0]?.trim();
  return city ? city.slice(0, 80) : null;
}

export function stayContributionFromParsed(parsed: ParsedBooking): {
  city: string;
  hotel_name: string;
  check_in: string;
  check_out: string | null;
  nights: number | null;
} | null {
  if (parsed.kind !== "hotel" && !parsed.hotelName) return null;
  const hotel_name = parsed.hotelName
    ? normalizeHotel(parsed.hotelName)
    : null;
  const city = cityFromParsed(parsed);
  const check_in = parsed.startDate;
  if (!hotel_name || !city || !check_in || !/^\d{4}-\d{2}-\d{2}$/.test(check_in)) {
    return null;
  }
  return {
    city,
    hotel_name,
    check_in,
    check_out: parsed.endDate ?? null,
    nights: parsed.nights ?? null,
  };
}

export async function upsertUserStayFromParsed(
  svc: SupabaseClient,
  parsed: ParsedBooking,
  userId?: string | null,
): Promise<boolean> {
  const contrib = stayContributionFromParsed(parsed);
  if (!contrib) return false;

  const { data: existing } = await svc
    .from("user_stays")
    .select("id, report_count, check_out, nights")
    .eq("city", contrib.city)
    .eq("hotel_name", contrib.hotel_name)
    .eq("check_in", contrib.check_in)
    .maybeSingle();

  if (existing) {
    const { error } = await svc
      .from("user_stays")
      .update({
        check_out: contrib.check_out ?? existing.check_out ?? null,
        nights: contrib.nights ?? existing.nights ?? null,
        report_count: (existing.report_count as number) + 1,
        last_reported_by: userId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return !error;
  }

  const { error } = await svc.from("user_stays").insert({
    ...contrib,
    first_reported_by: userId ?? null,
    last_reported_by: userId ?? null,
  });
  return !error;
}
