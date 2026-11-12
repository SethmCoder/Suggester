import { addCalendarDays, calendarDaysInclusive, nightsBetween, } from "@/lib/trips/dates";
/**
 * Fill nights/days from arrival/departure when present.
 * Inclusive calendar days drive itinerary day count; nights = overnight stays.
 */
export function normalizeLegDates(leg) {
    if (leg.arrivalDate && leg.departureDate) {
        const nights = nightsBetween(leg.arrivalDate, leg.departureDate);
        const days = Math.max(1, calendarDaysInclusive(leg.arrivalDate, leg.departureDate));
        return { ...leg, nights, days };
    }
    const days = Math.max(1, Math.floor(leg.days) || 1);
    return {
        ...leg,
        nights: leg.nights ?? Math.max(0, days - 1),
        days,
    };
}
/** Spread trip start/end across legs that only have day counts. */
export function applyTripDatesToLegs(legs, startDate, endDate) {
    if (!legs.length)
        return legs;
    const normalized = legs.map(normalizeLegDates);
    const hasAllDates = normalized.every((l) => l.arrivalDate && l.departureDate);
    if (hasAllDates)
        return normalized.map(normalizeLegDates);
    let cursor = startDate;
    return normalized.map((leg, i) => {
        const days = Math.max(1, Math.floor(leg.days) || 1);
        const arrivalDate = leg.arrivalDate ?? cursor;
        const departureDate = leg.departureDate ??
            (i === normalized.length - 1
                ? endDate
                : addCalendarDays(arrivalDate, days - 1));
        cursor = departureDate;
        return normalizeLegDates({ ...leg, arrivalDate, departureDate });
    });
}
/** Expand ordered legs into per-day city/hotel anchors. */
export function expandLegsToDays(legs) {
    const out = [];
    let dayIndex = 0;
    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
        const leg = normalizeLegDates(legs[legIndex]);
        const days = Math.max(1, Math.floor(leg.days) || 1);
        const anchorLat = leg.hotelLat ?? leg.lat ?? 0;
        const anchorLng = leg.hotelLng ?? leg.lng ?? 0;
        for (let d = 0; d < days; d++) {
            out.push({
                dayIndex,
                city: leg.city,
                legIndex,
                isArrivalTransitDay: legIndex > 0 && d === 0,
                previousCity: legIndex > 0 ? legs[legIndex - 1].city : null,
                hotel: leg.hotel,
                anchorLat,
                anchorLng,
            });
            dayIndex += 1;
        }
    }
    return out;
}
export function legsLabel(legs) {
    return legs
        .map((l) => {
        const n = normalizeLegDates(l);
        const nights = n.nights ?? Math.max(0, n.days - 1);
        return `${n.city} (${nights} night${nights === 1 ? "" : "s"})`;
    })
        .join(" → ");
}
/** Haversine km for intercity transit estimates. */
export function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
/** Rough train/car block time between cities (no live timetable). */
export function estimateIntercityMinutes(distanceKm) {
    // ~90 km/h average including transfers for medium European hops
    const cruise = distanceKm > 800 ? 200 : 90; // high-speed vs regional blend
    return Math.round((distanceKm / cruise) * 60 + 45);
}
