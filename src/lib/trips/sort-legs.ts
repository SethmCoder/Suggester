/** Sort trip stops by arrival date (never creation order). */

export function sortLegsByArrivalDate<
  T extends { arrivalDate?: string | null },
>(legs: T[]): T[] {
  return [...legs].sort((a, b) => {
    const aa = a.arrivalDate || "";
    const bb = b.arrivalDate || "";
    if (!aa && !bb) return 0;
    if (!aa) return 1;
    if (!bb) return -1;
    return aa.localeCompare(bb);
  });
}
