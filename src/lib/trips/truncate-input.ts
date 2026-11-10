/** Soft caps so large pastes never crash create / clarify validation. */
export const IDEAL_TRIP_MAX = 12_000;
export const TRAVELER_NOTES_MAX = 4_000;
export const LIST_ITEM_MAX = 200;
export const LIST_MAX = 40;

export function truncateText(value: string | undefined, max: number): string | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export function truncateStringList(
  values: string[] | undefined,
  maxItems = LIST_MAX,
  maxItem = LIST_ITEM_MAX,
): string[] {
  if (!values?.length) return [];
  return values
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxItem));
}
