import { describe, expect, it } from "vitest";
import {
  extractSenderCandidates,
  normalizeEmail,
  resolveOwnerBySender,
  sharedInboundAddress,
} from "@/lib/dreamer/mailbox";
import { pickBestMatch, scoreBookingMatch } from "@/lib/dreamer/match-booking";
import {
  inheritBookingContext,
  parseBookingFromEmailText,
  verifyInboundSignature,
} from "@/lib/dreamer/parse-email";
import { datesFromDreamAndBooking } from "@/lib/dreamer/materialize";
import {
  buildDreamerSuggestions,
  materializeDatesFromBooking,
} from "@/lib/dreamer/suggestions";
import { cityFromIata } from "@/lib/dreamer/iata-cities";
import { summarizeParsedBooking } from "@/lib/dreamer/summary";
import { stayAdviseFromEvents } from "@/lib/dreamer/stay-advise";
import { bookingHasConcreteEvidence } from "@/lib/dreamer/ingest";

describe("Dreamer D1–D10", () => {
  it("D1 shared inbox has no +token", () => {
    const prev = process.env.DREAMER_INBOUND_ADDRESS;
    process.env.DREAMER_INBOUND_ADDRESS = "bookings@gmail.com";
    expect(sharedInboundAddress()).toBe("bookings@gmail.com");
    expect(sharedInboundAddress()).not.toMatch(/\+/);
    if (prev == null) delete process.env.DREAMER_INBOUND_ADDRESS;
    else process.env.DREAMER_INBOUND_ADDRESS = prev;
  });

  it("D2 webhook signature reject without secret", () => {
    expect(verifyInboundSignature("{}", null, "secret")).toBe(false);
    expect(verifyInboundSignature("{}", "wrong", "secret")).toBe(false);
    expect(verifyInboundSignature("{}", "secret", "secret")).toBe(true);
  });

  it("D3 idempotent message_id is represented by stable key usage", () => {
    const once = parseBookingFromEmailText({
      subject: "Flight SEA → HND",
      text: "Confirmation: ABC123\nSEA to HND on 2026-07-20",
    });
    const twice = parseBookingFromEmailText({
      subject: "Flight SEA → HND",
      text: "Confirmation: ABC123\nSEA to HND on 2026-07-20",
    });
    expect(once.confirmation).toBe(twice.confirmation);
    expect(once.fromIata).toBe("SEA");
    expect(once.toIata).toBe("HND");
  });

  it("D4 owner by From email", () => {
    const resolved = resolveOwnerBySender(["seth@gmail.com"], [
      { id: "u1", email: "seth@gmail.com" },
      { id: "u2", email: "other@gmail.com" },
    ]);
    expect(resolved?.ownerId).toBe("u1");
    expect(resolved?.matchedBy).toBe("email");
  });

  it("D5 owner by username / local-part", () => {
    const resolved = resolveOwnerBySender(["seth@gmail.com"], [
      { id: "u1", email: "seth@waypoint.app", username: "seth" },
    ]);
    expect(resolved?.ownerId).toBe("u1");
    expect(resolved?.matchedBy).toBe("username");
  });

  it("D6 unassigned isolation — unknown sender", () => {
    const resolved = resolveOwnerBySender(["noreply@airline.com"], [
      { id: "u1", email: "seth@gmail.com" },
    ]);
    expect(resolved).toBeNull();
    expect(normalizeEmail("Seth <seth@example.com>")).toBe("seth@example.com");
  });

  it("D7 parse invent-nothing when PNR missing", () => {
    const parsed = parseBookingFromEmailText({
      subject: "Your trip",
      text: "SEA to HND on 2026-07-20 economy. Enjoy your flight.",
    });
    expect(parsed.confirmation).toBeNull();
    expect(parsed.fromIata).toBe("SEA");
    expect(parsed.toIata).toBe("HND");
    expect(parsed.cabin).toBe("economy");
  });

  it("D8 match best dream prefers Tokyo for HND", () => {
    const parsed = parseBookingFromEmailText({
      text: "SEA → HND July 20 confirmation XYZ99",
    });
    const tokyo = {
      id: "dream-tokyo",
      kind: "dream" as const,
      destination: "Tokyo",
      status: "researching",
    };
    const egypt = {
      id: "dream-egypt",
      kind: "dream" as const,
      destination: "Egypt",
      status: "wishlist",
    };
    expect(scoreBookingMatch(parsed, tokyo)).toBeGreaterThan(
      scoreBookingMatch(parsed, egypt),
    );
    const best = pickBestMatch(parsed, [egypt, tokyo], 3);
    expect(best?.candidate.id).toBe("dream-tokyo");
  });

  it("D9 materialize dates from flight + stay days", () => {
    const dates = materializeDatesFromBooking({
      flightDate: "2026-07-20",
      stayDays: 3,
    });
    expect(dates.startDate).toBe("2026-07-20");
    expect(dates.endDate).toBe("2026-07-22");
    expect(dates.nights).toBe(2);

    const fromDream = datesFromDreamAndBooking({
      booking: { startDate: "2026-07-20", kind: "flight" },
      estimatedDurationDays: 3,
    });
    expect(fromDream.startDate).toBe("2026-07-20");
    expect(fromDream.nights).toBe(2);
  });

  it("D10 climate tip + sender extract from forward body", () => {
    const tips = buildDreamerSuggestions({
      destination: "Tokyo",
      month: 7,
      stayDays: 3,
      hasEvidence: true,
    });
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(tip.body).not.toMatch(/fireworks on 20\d{2}/i);
    }
    expect(
      buildDreamerSuggestions({
        destination: "Tokyo",
        month: 7,
        hasEvidence: false,
      }),
    ).toEqual([]);

    const senders = extractSenderCandidates({
      from: "Delta <noreply@delta.com>",
      textBody:
        "---------- Forwarded message ----------\nFrom: Seth <seth@gmail.com>\n",
    });
    expect(senders).toContain("noreply@delta.com");
    expect(senders).toContain("seth@gmail.com");
  });
});

describe("Dreamer paste / stay / summary", () => {
  it("HND maps to Tokyo and preferred Seattle loses to Tokyo when score gap is large", () => {
    expect(cityFromIata("HND")).toBe("Tokyo");
    const parsed = parseBookingFromEmailText({
      text: "SEA → HND on 2026-12-24 confirmation AB12CD",
    });
    expect(parsed.cities).toContain("Tokyo");
    const seattle = {
      id: "dream-sea",
      kind: "dream" as const,
      destination: "Seattle",
      status: "wishlist",
    };
    const tokyo = {
      id: "dream-tokyo",
      kind: "dream" as const,
      destination: "Tokyo",
      status: "wishlist",
    };
    const best = pickBestMatch(parsed, [seattle, tokyo], 3, {
      preferredId: "dream-sea",
      preferredSlack: 2.5,
    });
    expect(best?.candidate.id).toBe("dream-tokyo");
  });

  it("preferred city wins when scores are close", () => {
    const parsed = parseBookingFromEmailText({
      text: "Hotel confirmation ABCDE12 stay at Park Hyatt on 2026-12-25",
    });
    const tokyo = {
      id: "dream-tokyo",
      kind: "dream" as const,
      destination: "Tokyo",
      status: "wishlist",
    };
    const other = {
      id: "dream-other",
      kind: "dream" as const,
      destination: "Osaka",
      status: "wishlist",
    };
    const best = pickBestMatch(parsed, [tokyo, other], 2, {
      preferredId: "dream-tokyo",
      preferredSlack: 3,
    });
    expect(best?.candidate.id).toBe("dream-tokyo");
  });

  it("hotel inherits flight city/date context", () => {
    const flight = parseBookingFromEmailText({
      text: "SEA → HND on 2026-12-24 confirmation AB12CD",
    });
    const hotel = parseBookingFromEmailText({
      text: "Hotel confirmation ZZ99AA stay at Park Hyatt",
    });
    const merged = inheritBookingContext(hotel, flight);
    expect(merged.startDate).toBe("2026-12-24");
    expect(merged.cities).toContain("Tokyo");
  });

  it("summary is fact-only and evidence gate works", () => {
    const parsed = parseBookingFromEmailText({
      subject: "Pasted booking",
      text: "SEA → HND on 2026-12-24\nConfirmation: AB12CD\neconomy",
    });
    const summary = summarizeParsedBooking(parsed);
    expect(summary).toContain("SEA → HND");
    expect(summary).toContain("2026-12-24");
    expect(summary).toContain("AB12CD");
    expect(parsed.confirmation).toBe("AB12CD");
    expect(bookingHasConcreteEvidence(parsed)).toBe(true);
    expect(
      bookingHasConcreteEvidence({ kind: "other", cities: ["Tokyo"] }),
    ).toBe(false);
  });

  it("stay advise never invents stayUntil without dated events", () => {
    const empty = stayAdviseFromEvents({
      city: "Tokyo",
      landDate: "2026-12-24",
      events: [],
    });
    expect(empty.stayUntil).toBeNull();
    expect(empty.rationale).toMatch(/not invented/i);

    const undatedSnippetsIgnored = stayAdviseFromEvents({
      city: "Tokyo",
      landDate: "2026-12-24",
      events: [],
    });
    expect(undatedSnippetsIgnored.stayUntil).toBeNull();

    const withEvent = stayAdviseFromEvents({
      city: "Tokyo",
      landDate: "2026-12-24",
      events: [
        {
          title: "Winter illumination",
          date: "2026-12-28",
          sourceUrl: "https://example.com/event",
          snippet: "Runs through Dec 28, 2026",
        },
      ],
    });
    expect(withEvent.stayUntil).toBe("2026-12-28");
    expect(withEvent.rationale).toMatch(/2026-12-28/);
  });
});
