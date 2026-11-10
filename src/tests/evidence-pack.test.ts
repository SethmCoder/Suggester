import { describe, expect, it } from "vitest";
import { evidencePackFromBookings } from "@/lib/dreamer/evidence-pack";
import { applySignal, buildExplanations } from "@/lib/intelligence/derive";
import { emptyIntelligence } from "@/lib/intelligence/types";
import { stayContributionFromParsed } from "@/lib/stays/user-stays";

describe("evidence pack (copy-hard spine)", () => {
  it("requires concrete booking facts before materialize is ready", () => {
    const empty = evidencePackFromBookings([
      { kind: "other", parsed: { cities: ["Tokyo"] } },
    ]);
    expect(empty.ready).toBe(false);

    const packed = evidencePackFromBookings([
      {
        kind: "flight",
        parsed: {
          kind: "flight",
          fromIata: "HND",
          toIata: "SEA",
          startDate: "2026-11-10",
          flightNumber: "NH118",
          departureLocal: "21:15",
          arrivalLocal: "13:20",
          confirmation: "K2P8NH",
        },
      },
      {
        kind: "hotel",
        parsed: {
          kind: "hotel",
          hotelName: "Park Hyatt",
          cities: ["Seattle"],
          startDate: "2026-11-10",
          confirmation: "HTL99",
        },
      },
    ]);
    expect(packed.ready).toBe(true);
    expect(packed.flightNumber).toBe("NH118");
    expect(packed.arrivalLocal).toBe("13:20");
    expect(packed.hotelName).toBe("Park Hyatt");
    expect(packed.provenance.join(" ")).toMatch(/NH118/);
    expect(packed.provenance.join(" ")).toMatch(/Park Hyatt/);
  });

  it("hotel confirmations contribute to community stays without PNR", () => {
    const row = stayContributionFromParsed({
      kind: "hotel",
      hotelName: "Park Hyatt Seattle",
      cities: ["Seattle"],
      startDate: "2026-11-10",
      endDate: "2026-11-14",
      nights: 4,
      confirmation: "SECRET99",
    });
    expect(row?.hotel_name).toBe("Park Hyatt Seattle");
    expect(row?.city).toBe("Seattle");
    expect(JSON.stringify(row)).not.toMatch(/SECRET99/);
  });

  it("booking confirmations strengthen intelligence more than one-off clicks", () => {
    let profile = emptyIntelligence();
    profile = applySignal(profile, {
      type: "booking_confirmation",
      kind: "flight",
      cities: ["Seattle", "Tokyo"],
      cabin: "economy",
      route: "HND → SEA",
    });
    expect(profile.inferred.preferredDestinations[0]).toBe("Seattle");
    expect(profile.inferred.previousDestinations).toContain("Tokyo");
    const lines = buildExplanations(profile);
    expect(lines.some((l) => /Confirmation evidence/i.test(l))).toBe(true);
  });
});
