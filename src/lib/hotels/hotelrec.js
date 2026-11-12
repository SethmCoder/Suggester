/**
 * Hotel suggestions and review quotes from a local HotelRec subset.
 * Quotes are verbatim dataset text. Nothing here is written by a model.
 *
 * Dataset: Diego Antognini and Boi Faltings, HotelRec (LREC 2020).
 * https://github.com/diegoantognini/HotelRec
 */
import fs from "fs";
import path from "path";
const CITATION = "Diego Antognini and Boi Faltings. HotelRec: a Novel Very Large-Scale Hotel Recommendation Dataset. LREC 2020.";
let cached = null;
let cachedCitation = CITATION;
export function loadHotelRec() {
    if (cached)
        return { hotels: cached, citation: cachedCitation };
    const file = path.join(process.cwd(), "data/hotelrec/subset.json");
    if (!fs.existsSync(file)) {
        cached = [];
        return { hotels: [], citation: cachedCitation };
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    cached = dedupeHotels(Array.isArray(parsed.hotels) ? parsed.hotels : []);
    cachedCitation = parsed.citation?.trim() || CITATION;
    return { hotels: cached, citation: cachedCitation };
}
/** Second half of names like New York or Los Angeles — not a city on its own. */
const COMPOUND_PREFIX = new Set([
    "new",
    "los",
    "las",
    "san",
    "santa",
    "saint",
    "st",
    "hong",
    "tel",
    "abu",
    "kuala",
    "rio",
    "buenos",
    "fort",
    "port",
]);
function normalizePlace(value) {
    return value
        .split(",")[0]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export function cityMatchesLocation(location, city) {
    const needle = normalizePlace(city).split(" ").filter(Boolean);
    const hay = normalizePlace(location).split(" ").filter(Boolean);
    if (!needle.length || needle.join(" ").length < 3)
        return false;
    for (let i = 0; i <= hay.length - needle.length; i++) {
        if (!needle.every((token, j) => hay[i + j] === token))
            continue;
        if (needle.length === 1 && i > 0 && COMPOUND_PREFIX.has(hay[i - 1])) {
            continue;
        }
        return true;
    }
    return false;
}
export function locationStartsWithCity(location, city) {
    const needle = normalizePlace(city);
    const hay = normalizePlace(location);
    return hay === needle || hay.startsWith(`${needle} `);
}
export function dedupeHotels(hotels) {
    const byId = new Map();
    for (const hotel of hotels) {
        const prev = byId.get(hotel.id);
        if (!prev || hotel.n > prev.n)
            byId.set(hotel.id, hotel);
    }
    return [...byId.values()];
}
function placeCount(hotel, place) {
    if (place === "any")
        return 0;
    return hotel[place] ?? 0;
}
function matchesBrand(name, brand) {
    const needle = brand?.trim().toLowerCase() ?? "";
    if (needle.length < 2)
        return true;
    return name.toLowerCase().includes(needle);
}
export function suggestFromHotels(hotels, input) {
    const minRating = input.minRating ?? 0;
    const place = input.place ?? "any";
    const limit = input.limit ?? (input.brand?.trim() ? 3 : 4);
    return dedupeHotels(hotels)
        .filter((hotel) => hotel.rating >= minRating &&
        cityMatchesLocation(hotel.location, input.city) &&
        hotel.quotes?.length &&
        matchesBrand(hotel.name, input.brand))
        .map((hotel) => {
        const mentions = placeCount(hotel, place);
        const mentionRate = hotel.n > 0 ? mentions / hotel.n : 0;
        const score = hotel.rating +
            mentionRate * 3 +
            (hotel.locationScore ?? 0) * 0.25 +
            Math.log10(hotel.n + 1) * 0.2;
        return { hotel, score };
    })
        .sort((a, b) => {
        const aCity = locationStartsWithCity(a.hotel.location, input.city) ? 1 : 0;
        const bCity = locationStartsWithCity(b.hotel.location, input.city) ? 1 : 0;
        if (aCity !== bCity)
            return bCity - aCity;
        return b.score - a.score || b.hotel.n - a.hotel.n;
    })
        .slice(0, limit)
        .map(({ hotel }) => ({
        id: hotel.id,
        name: hotel.name,
        location: hotel.location,
        rating: hotel.rating,
        reviewCount: hotel.n,
        locationScore: hotel.locationScore,
        quotes: hotel.quotes.slice(0, 3),
    }));
}
export function suggestionNote(input) {
    const placeLabel = {
        any: "overall rating and location sub-ratings",
        center: "city-center mentions in the reviews",
        beach: "beach mentions in the reviews",
        sights: "sight mentions and location sub-ratings",
        transit: "transit mentions in the reviews",
    };
    const brand = input.brand?.trim();
    if (!input.count) {
        return brand
            ? `No hotels in ${input.city} match “${brand}”. Try another brand, or enter a hotel you already booked.`
            : `No hotels in ${input.city} match ${input.minRating.toFixed(1)} stars or higher. Try a lower rating, or enter a hotel you already booked.`;
    }
    if (brand) {
        return `${input.count} ${brand} hotels in ${input.city}. Pick one and the days are built around it.`;
    }
    return `${input.count} hotels in ${input.city} at ${input.minRating.toFixed(1)}+ stars, ranked by ${placeLabel[input.place]}. Pick one and the days are built around it.`;
}
/** Fill an empty unbooked leg with the top HotelRec hotel for that city. */
export function anchorUnbookedLegs(legs) {
    return legs.map((leg) => {
        if (leg.hotelBooked !== false)
            return leg;
        if (leg.hotel?.trim())
            return leg;
        const top = suggestHotels({
            city: leg.city,
            minRating: leg.hotelMinRating,
            place: leg.hotelPlace,
            brand: leg.hotelBrand,
            limit: 1,
        }).hotels[0];
        if (!top)
            return leg;
        return {
            ...leg,
            hotel: top.name,
            hotelAddress: leg.hotelAddress?.trim() || top.location,
        };
    });
}
export function suggestHotels(input) {
    const { hotels, citation } = loadHotelRec();
    return { citation, hotels: suggestFromHotels(hotels, input) };
}
export function quotesForHotelName(name) {
    const cleaned = name.replace(/\(demo\)/gi, "").trim().toLowerCase();
    if (cleaned.length < 4)
        return { citation: CITATION, hotel: null };
    const { hotels, citation } = loadHotelRec();
    const hit = hotels.find((hotel) => hotel.name.trim().toLowerCase() === cleaned);
    if (!hit)
        return { citation, hotel: null };
    return {
        citation,
        hotel: {
            id: hit.id,
            name: hit.name,
            location: hit.location,
            rating: hit.rating,
            reviewCount: hit.n,
            locationScore: hit.locationScore,
            quotes: hit.quotes.slice(0, 3),
        },
    };
}
