interface PopularityBadgeProps {
  label?: string | null;
  sources?: string[];
  attributionUrls?: string[];
}

/** Subtle interest / popularity chip — Bold & Elegant. No viral/Instagram claims. */
export function PopularityBadge({
  label,
  sources,
  attributionUrls,
}: PopularityBadgeProps) {
  if (!label) return null;

  const isOnlineInterest =
    /online interest|gaining attention|popular destination/i.test(label) ||
    sources?.includes("wikimedia_pageviews");

  const href = attributionUrls?.[0];
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
      {isOnlineInterest ? (
        <span className="text-[10px] font-normal text-[#6B7280]">
          Wikipedia pageviews · not visitor counts
        </span>
      ) : sources && sources.length > 0 ? (
        <span className="text-[10px] text-[#6B7280]">
          Sources: {sources.join(", ")}
        </span>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-[10px] underline"
        >
          View source
        </a>
      ) : null}
    </div>
  );
}
