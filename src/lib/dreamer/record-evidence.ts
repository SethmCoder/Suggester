import type { SupabaseClient } from "@supabase/supabase-js";
import { applySignal, buildExplanations } from "@/lib/intelligence/derive";
import {
  emptyIntelligence,
  type TravelIntelligence,
} from "@/lib/intelligence/types";
import { upsertUserFlightFromParsed } from "@/lib/flights/user-flights";
import { upsertUserStayFromParsed } from "@/lib/stays/user-stays";
import type { ParsedBooking } from "./types";

function readIntelligence(raw: unknown): TravelIntelligence {
  if (!raw || typeof raw !== "object") return emptyIntelligence();
  const bag = raw as {
    travelIntelligence?: TravelIntelligence;
  } & TravelIntelligence;
  if (bag.travelIntelligence?.version === 1) return bag.travelIntelligence;
  if (bag.version === 1) return bag as TravelIntelligence;
  return emptyIntelligence();
}

/**
 * After a confirmation is accepted: grow community DBs + booking-grounded intelligence.
 * Never stores PNR in community tables.
 */
export async function recordConfirmationEvidence(input: {
  svc: SupabaseClient;
  userId: string;
  parsed: ParsedBooking;
}): Promise<void> {
  const { svc, userId, parsed } = input;

  if (parsed.kind === "flight") {
    await upsertUserFlightFromParsed(svc, parsed, userId).catch(() => null);
  }
  if (parsed.kind === "hotel" || parsed.hotelName) {
    await upsertUserStayFromParsed(svc, parsed, userId).catch(() => null);
  }

  const route =
    parsed.fromIata && parsed.toIata
      ? `${parsed.fromIata} → ${parsed.toIata}`
      : parsed.hotelName
        ? `stay ${parsed.hotelName}`
        : null;

  try {
    const { data: existing } = await svc
      .from("profiles")
      .select("traveler_profile")
      .eq("id", userId)
      .maybeSingle();
    const previous =
      existing?.traveler_profile && typeof existing.traveler_profile === "object"
        ? (existing.traveler_profile as Record<string, unknown>)
        : {};
    const current = readIntelligence(existing?.traveler_profile);
    const next = applySignal(current, {
      type: "booking_confirmation",
      kind: parsed.kind ?? "other",
      cities: parsed.cities ?? [],
      cabin: parsed.cabin ?? null,
      route,
    });
    const profile = {
      ...next,
      explanations: buildExplanations(next),
      updatedAt: new Date().toISOString(),
    };
    await svc.from("profiles").upsert({
      id: userId,
      traveler_profile: {
        ...previous,
        travelIntelligence: profile,
      },
    });
  } catch {
    /* never block booking ingest on intelligence */
  }
}
