/** Distinct stop colors by city (or day) so the itinerary is easy to scan. */
export const STOP_COLORS = [
    {
        solid: "#0400FF",
        soft: "#EEF0FF",
        text: "#FFFFFF",
        border: "#0400FF",
        chip: "#0400FF",
    },
    {
        solid: "#0F766E",
        soft: "#F0FDFA",
        text: "#FFFFFF",
        border: "#0F766E",
        chip: "#0F766E",
    },
    {
        solid: "#B45309",
        soft: "#FFF7ED",
        text: "#FFFFFF",
        border: "#B45309",
        chip: "#B45309",
    },
    {
        solid: "#6D28D9",
        soft: "#F5F3FF",
        text: "#FFFFFF",
        border: "#6D28D9",
        chip: "#6D28D9",
    },
    {
        solid: "#BE123C",
        soft: "#FFF1F2",
        text: "#FFFFFF",
        border: "#BE123C",
        chip: "#BE123C",
    },
    {
        solid: "#0369A1",
        soft: "#F0F9FF",
        text: "#FFFFFF",
        border: "#0369A1",
        chip: "#0369A1",
    },
];
export function stopColorForKey(key) {
    const raw = (key ?? "").trim().toLowerCase();
    if (!raw)
        return STOP_COLORS[0];
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return STOP_COLORS[hash % STOP_COLORS.length];
}
export function stopColorForIndex(index) {
    return STOP_COLORS[Math.abs(index) % STOP_COLORS.length];
}
