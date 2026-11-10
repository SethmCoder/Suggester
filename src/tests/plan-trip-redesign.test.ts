import { describe, expect, it } from "vitest";
import { formatCityOverlay, resolveCityMeta } from "@/lib/trips/city-label";
import { sortLegsByArrivalDate } from "@/lib/trips/sort-legs";
import { localClarifyReply } from "@/lib/trips/clarify-chat";
import {
  parseBookingFromEmailText,
  parseClockToHHMM,
} from "@/lib/dreamer/parse-email";
import { hasCuratedCityImage } from "@/lib/destination-image";

describe("Plan trip redesign helpers", () => {
  it("formats City, ST, Country and omits inventing ST", () => {
    expect(formatCityOverlay("Seattle")).toBe("Seattle, WA, United States");
    expect(formatCityOverlay("London")).toBe("London, United Kingdom");
    expect(resolveCityMeta("Tokyo").region).toBeNull();
    expect(resolveCityMeta("Tokyo").country).toBe("Japan");
  });

  it("sorts legs by arrival date not creation order", () => {
    const legs = [
      { city: "Osaka", arrivalDate: "2026-12-28" },
      { city: "Tokyo", arrivalDate: "2026-12-24" },
      { city: "Kyoto", arrivalDate: "2026-12-26" },
    ];
    expect(sortLegsByArrivalDate(legs).map((l) => l.city)).toEqual([
      "Tokyo",
      "Kyoto",
      "Osaka",
    ]);
  });

  it("clarify never ends with ready-to-generate", () => {
    const history = [
      { role: "assistant" as const, text: "Which of these is closest to the days you want?" },
      { role: "user" as const, text: "A mix of walking, food, and a few highlights" },
      { role: "assistant" as const, text: "who is traveling" },
      { role: "user" as const, text: "Just me" },
      { role: "assistant" as const, text: "how long a walk between stops" },
      { role: "user" as const, text: "15 minutes" },
      { role: "assistant" as const, text: "indoors or outdoors" },
      { role: "user" as const, text: "Either" },
      { role: "assistant" as const, text: "how full should the days feel" },
      { role: "user" as const, text: "Steady" },
      { role: "assistant" as const, text: "How much is set aside for the whole trip?" },
      { role: "user" as const, text: "$1500" },
      { role: "assistant" as const, text: "How do you want to spend the money?" },
      { role: "user" as const, text: "Mix" },
      { role: "assistant" as const, text: "What restaurant style fits?" },
      { role: "user" as const, text: "Casual" },
    ];
    const turn = localClarifyReply(
      {
        destination: "Tokyo",
        cities: ["Tokyo"],
        interests: ["food"],
      },
      history,
      "Casual",
    );
    expect(turn.done).toBe(false);
    expect(turn.reply).not.toMatch(/Generate itinerary|ready to generate/i);
    expect(turn.choices.length).toBeGreaterThan(0);
  });

  it("confirmation email supplies flight number and times — no lookup", () => {
    expect(parseClockToHHMM("9:15 PM")).toBe("21:15");
    expect(parseClockToHHMM("1:20 PM")).toBe("13:20");
    const parsed = parseBookingFromEmailText({
      subject: "Your ANA e-ticket — NH118 Tokyo to Seattle",
      text: `
Flight number: NH118
Route: HND → SEA
Travel date: 2026-11-10
Confirmation code: K2P8NH
Cabin: Economy
Scheduled departure: 9:15 PM (Tokyo local)
Scheduled arrival: 1:20 PM (Seattle local)
`,
    });
    expect(parsed.flightNumber).toBe("NH118");
    expect(parsed.fromIata).toBe("HND");
    expect(parsed.toIata).toBe("SEA");
    expect(parsed.departureLocal).toBe("21:15");
    expect(parsed.arrivalLocal).toBe("13:20");
    expect(parsed.confirmation).toBe("K2P8NH");
  });

  it("landmark heroes exist for London Paris Tokyo", () => {
    expect(hasCuratedCityImage("London")).toBe(true);
    expect(hasCuratedCityImage("Paris")).toBe(true);
    expect(hasCuratedCityImage("Tokyo")).toBe(true);
  });
});
