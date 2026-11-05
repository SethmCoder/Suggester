interface PopularityBadgeProps {
  label?: string | null;
  sources?: string[];
  attributionUrls?: string[];
}

/** Subtle interest / popularity chip — Bold & Elegant. No viral/Instagram claims. */
export function PopularityBadge({
  label,
  sources,
}: PopularityBadgeProps) {
  if (!label) return null;

  const isOnlineInterest =
    /online interest|gaining attention|popular destination/i.test(label) ||
    sources?.includes("wikimedia_pageviews");

  const display = isOnlineInterest
    ? label.includes("Gaining")
      ? "Gaining attention"
      : label
    : label;

  return (
    <div
      className={`mt-2 inline-flex max-w-full flex-col gap-0.5 rounded-[10px] px-2.5 py-1 text-xs ${
        isOnlineInterest
          ? "border border-[#DDE1FF] bg-[#F5F7FF] text-[#0400FF]"
          : "bg-[#DDE1FF] text-[#0400FF]"
      }`}
    >
      <span className="font-medium">{display}</span>
    </div>
  );
}
