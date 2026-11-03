/**
 * Intercity leg planner — picks flight / major train / ferry / coach / car
 * and a plausible departure window. Uses OpenFlights when a published airline
 * route exists; otherwise distance heuristics (+ optional Groq assist).
 *
 * Not a live booking API — times are illustrative schedule windows.
 */

import { estimateFlight, findAirport } from "@/lib/flights/openflights";
import { haversineKm } from "@/lib/ai/scheduler";

export type IntercityMode =
  | "flight"
  | "major_train"
  | "regional_rail"
  | "coach"
  | "ferry"
  | "car";

export type IntercityTransitPlan = {
  mode: IntercityMode;
  /** Human title shown on the itinerary card */
  name: string;
  fromCity: string;
  toCity: string;
  distanceKm: number;
  durationMinutes: number;
  departLocal: string;
  arriveLocal: string;
  /** Major train / flight / many ferries need advance booking */
  bookingRequired: boolean;
  planningNote: string;
  scheduleWarnings: string[];
  placeId: string;
  address: string;
  fromIata?: string;
  toIata?: string;
  source: "openflights" | "heuristic" | "ai";
};

const MODE_LABEL: Record<IntercityMode, string> = {
  flight: "Flight",
  major_train: "Major train",
  regional_rail: "Regional rail",
  coach: "Coach / bus",
  ferry: "Ferry / boat",
  car: "Car / road",
};

function addMinutesHhmm(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + minutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function bookingRequiredFor(mode: IntercityMode): boolean {
  return mode === "flight" || mode === "major_train" || mode === "ferry";
}

/** Ferry-leaning city pairs / island cues (heuristic, not coastline GIS). */
function likelyFerry(
  fromCity: string,
  toCity: string,
  distanceKm: number,
): boolean {
  const pair = `${fromCity} ${toCity}`.toLowerCase();
  const cues = [
    "ferry",
    "island",
    "santorini",
    "mykonos",
    "capri",
    "ischia",
    "corsica",
    "sardinia",
    "sicily",
    "malta",
    "bali",
    "lombok",
    "penang",
    "langkawi",
    "hong kong",
    "macau",
    "vancouver",
    "victoria",
    "seattle",
    "bainbridge",
    "naples",
    "sorrento",
    "amalfi",
  ];
  if (cues.some((c) => pair.includes(c)) && distanceKm < 250) return true;
  return false;
}

/** Regions where long-distance rail is uncommon — prefer coach/car. */
function weakRailRegion(fromCity: string, toCity: string): boolean {
  const s = `${fromCity} ${toCity}`.toLowerCase();
  return /dubai|abu dhabi|uae|riyadh|jeddah|doha|kuwait|muscat|manama|seattle|portland|los angeles|san francisco|austin|denver|miami|phoenix|las vegas|houston/.test(
    s,
  );
}

function heuristicMode(input: {
  distanceKm: number;
  fromCity: string;
  toCity: string;
  hasFlightRoute: boolean;
  flightMinutes?: number;
  preferredLocalTransport?: string;
}): IntercityMode {
  const { distanceKm, hasFlightRoute, flightMinutes } = input;
  const weakRail = weakRailRegion(input.fromCity, input.toCity);

  if (likelyFerry(input.fromCity, input.toCity, distanceKm)) {
    return "ferry";
  }

  if (distanceKm < 60) {
    return input.preferredLocalTransport === "transit" && !weakRail
      ? "regional_rail"
      : "car";
  }

  if (distanceKm < 120) {
    if (weakRail) {
      return input.preferredLocalTransport === "driving" ? "car" : "coach";
    }
    return "regional_rail";
  }

  // Competitive short-haul flight
  if (
    hasFlightRoute &&
    flightMinutes != null &&
    distanceKm > 280 &&
    flightMinutes + 120 < distanceKm / 0.9 + 60 // flight+airport buffer vs road
  ) {
    return "flight";
  }

  if (distanceKm < 450) {
    if (weakRail) {
      return input.preferredLocalTransport === "driving" ? "car" : "coach";
    }
    // Long enough that reserved seats / HSR tickets are typical
    return "major_train";
  }

  if (distanceKm < 900) {
    if (hasFlightRoute) return "flight";
    if (weakRail) return "coach";
    return "major_train";
  }

  return hasFlightRoute ? "flight" : weakRail ? "coach" : "major_train";
}

function durationForMode(
  mode: IntercityMode,
  distanceKm: number,
  flightMinutes?: number,
): number {
  switch (mode) {
    case "flight":
      return Math.min(
        16 * 60,
        (flightMinutes ?? Math.round((distanceKm / 750) * 60 + 40)) + 90, // + airport buffer in block
      );
    case "major_train":
      return Math.round((distanceKm / (distanceKm > 500 ? 180 : 120)) * 60 + 40);
    case "regional_rail":
      return Math.round((distanceKm / 70) * 60 + 25);
    case "coach":
      return Math.round((distanceKm / 75) * 60 + 30);
    case "ferry":
      return Math.round((distanceKm / 35) * 60 + 45);
    case "car":
    default:
      return Math.round((distanceKm / 85) * 60 + 20);
  }
}

function defaultDepart(mode: IntercityMode, durationMinutes: number): string {
  // Prefer morning for long bookable legs so sightseeing still fits
  if (mode === "flight") return durationMinutes > 360 ? "10:00" : "08:30";
  if (mode === "major_train") return "08:15";
  if (mode === "ferry") return "09:00";
  if (mode === "coach") return "08:45";
  return "09:00";
}

async function maybeAiRefine(input: {
  fromCity: string;
  toCity: string;
  distanceKm: number;
  heuristic: IntercityMode;
  hasFlightRoute: boolean;
  flightNote?: string;
}): Promise<{ mode: IntercityMode; departLocal: string; note: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const Groq = (await import("groq-sdk")).default;
    const client = new Groq({ apiKey });
    const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "IntercityTransit",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["mode", "departLocal", "reason"],
            properties: {
              mode: {
                type: "string",
                enum: [
                  "flight",
                  "major_train",
                  "regional_rail",
                  "coach",
                  "ferry",
                  "car",
                ],
              },
              departLocal: {
                type: "string",
                description: "HH:MM local departure at origin city",
              },
              reason: { type: "string" },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You choose intercity transport for a travel itinerary.
Modes:
- flight: commercial airline
- major_train: long-distance / high-speed rail that typically NEEDS advance booking/reservation
- regional_rail: local/commuter rail, usually turn-up-and-go
- coach: intercity bus
- ferry: boat
- car: private car/rideshare/drive
Prefer realistic modes for the distance. Prefer published airline routes when provided.
Do not invent live seat inventory. Pick a sensible morning/midday departLocal (HH:MM).`,
        },
        {
          role: "user",
          content: JSON.stringify({
            from: input.fromCity,
            to: input.toCity,
            distanceKm: Math.round(input.distanceKm),
            heuristicMode: input.heuristic,
            openFlightsRouteKnown: input.hasFlightRoute,
            openFlightsNote: input.flightNote ?? null,
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      mode: IntercityMode;
      departLocal: string;
      reason: string;
    };
    if (!MODE_LABEL[parsed.mode]) return null;
    const depart = /^\d{2}:\d{2}$/.test(parsed.departLocal)
      ? parsed.departLocal
      : defaultDepart(parsed.mode, 180);
    return {
      mode: parsed.mode,
      departLocal: depart,
      note: parsed.reason,
    };
  } catch {
    return null;
  }
}

/**
 * Plan a labeled intercity transit block for a multi-city arrival day.
 */
export async function planIntercityTransit(input: {
  fromCity: string;
  toCity: string;
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  preferredLocalTransport?: string;
}): Promise<IntercityTransitPlan> {
  const distanceKm =
    input.fromLat != null &&
    input.fromLng != null &&
    input.toLat != null &&
    input.toLng != null
      ? haversineKm(input.fromLat, input.fromLng, input.toLat, input.toLng)
      : 400;

  const fromAirport = await findAirport(input.fromCity);
  const toAirport = await findAirport(input.toCity);
  let flight = null as Awaited<ReturnType<typeof estimateFlight>>;
  if (fromAirport && toAirport) {
    flight = await estimateFlight({
      from: fromAirport.iata,
      to: toAirport.iata,
    });
  }

  const hasFlightRoute = Boolean(flight?.routeKnown);
  const heuristic = heuristicMode({
    distanceKm,
    fromCity: input.fromCity,
    toCity: input.toCity,
    hasFlightRoute,
    flightMinutes: flight?.routeKnown ? flight.durationMinutes : undefined,
    preferredLocalTransport: input.preferredLocalTransport,
  });

  const ai = await maybeAiRefine({
    fromCity: input.fromCity,
    toCity: input.toCity,
    distanceKm,
    heuristic,
    hasFlightRoute,
    flightNote: flight?.note,
  });

  const mode = ai?.mode ?? heuristic;
  const durationMinutes = durationForMode(
    mode,
    distanceKm,
    flight?.routeKnown ? flight.durationMinutes : undefined,
  );
  const departLocal =
    ai?.departLocal ??
    (mode === "flight" && flight?.routeKnown
      ? flight.assumedDepartureLocal
      : defaultDepart(mode, durationMinutes));
  const arriveLocal =
    mode === "flight" && flight?.routeKnown
      ? flight.estimatedArrivalLocal
      : addMinutesHhmm(departLocal, durationMinutes);

  const bookingRequired = bookingRequiredFor(mode);
  const modeTitle = MODE_LABEL[mode];
  const name = `${modeTitle} · ${input.fromCity} → ${input.toCity}`;

  const scheduleWarnings = [
    "Transit times are planned windows, not live booked tickets.",
  ];
  if (bookingRequired) {
    scheduleWarnings.unshift(
      mode === "major_train"
        ? "Major train — reserve seats / buy tickets in advance."
        : mode === "flight"
          ? "Flight — book tickets; arrive early for security."
          : "Ferry — book tickets when required on this route.",
    );
  }

  const planningBits = [
    `${modeTitle} for ~${Math.round(distanceKm)} km.`,
    `Depart ~${departLocal}, arrive ~${arriveLocal} local (estimate).`,
    bookingRequired
      ? "Booking recommended before travel day."
      : "Usually no long-distance reservation required.",
    ai?.note ? `Planner note: ${ai.note}` : null,
    flight?.routeKnown && mode === "flight"
      ? `OpenFlights route ${flight.from.iata}→${flight.to.iata} (${flight.sampleAirlines.slice(0, 2).join(", ") || "airlines"}).`
      : null,
    "Not a live timetable — verify schedules when booking.",
  ].filter(Boolean);

  return {
    mode,
    name,
    fromCity: input.fromCity,
    toCity: input.toCity,
    distanceKm,
    durationMinutes: Math.min(durationMinutes, 16 * 60),
    departLocal,
    arriveLocal,
    bookingRequired,
    planningNote: planningBits.join(" "),
    scheduleWarnings,
    placeId: `transit:${mode}:${input.fromCity}:${input.toCity}`,
    address: `${modeTitle} · ~${Math.round(distanceKm)} km · ~${Math.round(durationMinutes / 60)}h ${durationMinutes % 60}m`,
    fromIata: mode === "flight" ? flight?.from.iata : fromAirport?.iata,
    toIata: mode === "flight" ? flight?.to.iata : toAirport?.iata,
    source: ai ? "ai" : flight?.routeKnown && mode === "flight" ? "openflights" : "heuristic",
  };
}

export function intercityModeFromPlaceId(
  placeId: string | null | undefined,
): IntercityMode | null {
  if (!placeId?.startsWith("transit:")) return null;
  const parts = placeId.split(":");
  // transit:mode:from:to  OR legacy transit:from:to
  if (parts.length >= 4 && MODE_LABEL[parts[1] as IntercityMode]) {
    return parts[1] as IntercityMode;
  }
  return null;
}

export function formatIntercityModeLabel(mode: IntercityMode): string {
  return MODE_LABEL[mode];
}
