/** Parse YYYY-MM-DD as a local calendar date to avoid UTC/server hydration skew. */
export function formatTripDate(value, pattern = "long") {
    const dateOnly = value.slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
    if (!m) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime()))
            return value;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: pattern === "long" ? "numeric" : undefined,
        });
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    if (pattern === "short")
        return `${months[month - 1]} ${day}`;
    return `${months[month - 1]} ${day}, ${year}`;
}
