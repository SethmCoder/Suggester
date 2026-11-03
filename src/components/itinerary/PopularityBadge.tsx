interface PopularityBadgeProps {
  label?: string | null;
  sources?: string[];
  attributionUrls?: string[];
}

export function PopularityBadge({
  label,
  sources,
  attributionUrls,
}: PopularityBadgeProps) {
  if (!label) return null;
  const href = attributionUrls?.[0];

  return (
    <div className="mt-2 inline-flex max-w-full flex-col gap-1 rounded-md bg-[#DDE1FF] px-2 py-1 text-xs text-[#0400FF]">
      <span>{label}</span>
      {sources && sources.length > 0 ? (
        <span className="text-[#6B7280]">Sources: {sources.join(", ")}</span>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate underline"
        >
          View source
        </a>
      ) : null}
    </div>
  );
}
