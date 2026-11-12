export function hotelNameFromActivities(activities) {
    for (const act of activities) {
        if (act.place_id?.startsWith("hotel:")) {
            const name = act.name.trim();
            if (name)
                return name;
        }
        if (act.user_locked &&
            /\b(check[- ]?in|hotel stay|your hotel)\b/i.test(act.name)) {
            return act.name.trim();
        }
    }
    return null;
}
export function legForDay(dayIndex, dayCities, legs) {
    const assignment = dayCities?.[dayIndex];
    const legIndex = assignment?.legIndex ?? 0;
    const leg = legs?.[legIndex];
    if (!leg)
        return null;
    return { leg, legIndex };
}
export function bookedHotelForDay(input) {
    const pair = legForDay(input.dayIndex, input.dayCities, input.legs);
    if (!pair)
        return null;
    const { leg, legIndex } = pair;
    const city = input.dayCities?.[input.dayIndex]?.city?.trim() || leg.city?.trim() || "";
    if (!leg.hotelBooked)
        return null;
    const name = leg.hotel?.trim() ||
        input.dayCities?.[input.dayIndex]?.hotel?.trim() ||
        hotelNameFromActivities(input.activities ?? []) ||
        "";
    if (!name)
        return null;
    return { name, legIndex, city };
}
