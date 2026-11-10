import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBooking } from "@/lib/dreamer/types";

export type UserFlightRow = {
  id: string;
  flight_number: string;
  from_iata: string;
  to_iata: string;
  travel_date: string;
  departure_local: string | null;
  arrival_local: string | null;
  cabin: string | null;
  airline: string | null;
  report_count: number;
};

/** Enough schedule facts to contribute — never stores PNR. */
export function flightContributionFromParsed(parsed: ParsedBooking): {
  flight_number: string;
  from_iata: string;
  to_iata: string;
  travel_date: string;
  departure_local: string | null;
  arrival_local: string | null;
  cabin: string | null;
} | null {
  const flight_number = parsed.flightNumber?.replace(/\s+/g, "").toUpperCase();
  const from_iata = parsed.fromIata?.toUpperCase() ?? null;
  const to_iata = parsed.toIata?.toUpperCase() ?? null;
  const travel_date = parsed.startDate ?? null;
  if (
    !flight_number ||
    !/^[A-Z]{2}\d{1,4}$/.test(flight_number) ||
    !from_iata ||
    !to_iata ||
    !travel_date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(travel_date)
  ) {
    return null;
  }
  return {
    flight_number,
    from_iata,
    to_iata,
    travel_date,
    departure_local: parsed.departureLocal ?? null,
    arrival_local: parsed.arrivalLocal ?? null,
    cabin: parsed.cabin ?? null,
  };
}

export async function upsertUserFlightFromParsed(
  svc: SupabaseClient,
  parsed: ParsedBooking,
  userId?: string | null,
): Promise<UserFlightRow | null> {
  const contrib = flightContributionFromParsed(parsed);
  if (!contrib) return null;

  const { data: existing } = await svc
    .from("user_flights")
    .select("*")
    .eq("flight_number", contrib.flight_number)
    .eq("travel_date", contrib.travel_date)
    .eq("from_iata", contrib.from_iata)
    .eq("to_iata", contrib.to_iata)
    .maybeSingle();

  if (existing) {
    const { data, error } = await svc
      .from("user_flights")
      .update({
        departure_local:
          contrib.departure_local ?? existing.departure_local ?? null,
        arrival_local: contrib.arrival_local ?? existing.arrival_local ?? null,
        cabin: contrib.cabin ?? existing.cabin ?? null,
        report_count: (existing.report_count as number) + 1,
        last_reported_by: userId ?? existing.last_reported_by ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) return null;
    return data as UserFlightRow;
  }

  const { data, error } = await svc
    .from("user_flights")
    .insert({
      ...contrib,
      first_reported_by: userId ?? null,
      last_reported_by: userId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return data as UserFlightRow;
}

export async function findUserFlight(
  svc: SupabaseClient,
  input: {
    flightNumber: string;
    date?: string | null;
    fromIata?: string | null;
    toIata?: string | null;
  },
): Promise<UserFlightRow | null> {
  const flight_number = input.flightNumber.replace(/\s+/g, "").toUpperCase();
  if (!flight_number) return null;

  let q = svc
    .from("user_flights")
    .select("*")
    .eq("flight_number", flight_number)
    .order("report_count", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (input.date) q = q.eq("travel_date", input.date);
  if (input.fromIata) q = q.eq("from_iata", input.fromIata.toUpperCase());
  if (input.toIata) q = q.eq("to_iata", input.toIata.toUpperCase());

  const { data } = await q.maybeSingle();
  return (data as UserFlightRow | null) ?? null;
}
