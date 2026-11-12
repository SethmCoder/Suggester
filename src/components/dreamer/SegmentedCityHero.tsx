"use client";

import {
  destinationImageUrl,
  hasCuratedCityImage,
} from "@/lib/destination-image";

/** Split "Tokyo → Kyoto" / "Tokyo, Kyoto" / "Tokyo and Kyoto" into city parts. */
export function splitDestinationCities(destination: string): string[] {
  const parts = destination
    .split(/\s*(?:→|->|,|\/|\band\b|\+)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique.length ? unique.slice(0, 4) : [destination.trim() || "Trip"];
}

export function SegmentedCityHero({
  destination,
  title,
  subtitle,
  className = "",
  heightClass = "h-40 sm:h-52",
  showLabel = true,
}: {
  destination: string;
  title?: string;
  subtitle?: string;
  className?: string;
  heightClass?: string;
  showLabel?: boolean;
}) {
  const cities = splitDestinationCities(destination);
  const label = title || cities.join(" · ");

  return (
    <div
      className={`relative overflow-hidden ${heightClass} ${className}`}
    >
      <div
        className={`absolute inset-0 grid ${
          cities.length === 1
            ? "grid-cols-1"
            : cities.length === 2
              ? "grid-cols-2"
              : cities.length === 3
                ? "grid-cols-3"
                : "grid-cols-2 grid-rows-2"
        }`}
      >
        {cities.map((city) => {
          const photo = hasCuratedCityImage(city);
          return photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={city}
              src={destinationImageUrl(city)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              key={city}
              className="flex h-full w-full items-center justify-center bg-[#080B3A] text-2xl font-bold text-white"
            >
              {city.slice(0, 1).toUpperCase()}
            </div>
          );
        })}
      </div>
      {showLabel ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-[#080B3A]/80 via-[#080B3A]/20 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5">
            <p className="text-2xl font-bold text-white sm:text-3xl">{label}</p>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/85">{subtitle}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
