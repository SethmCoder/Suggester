"use client";

import { useEffect, useState } from "react";
import { dashboardHeroImage } from "@/lib/destination-image";

const STORAGE_KEY = "waypoint:local-city-v2";
const HERO_CACHE_KEY = "waypoint:local-hero-v1";

type LocateResult = {
  city: string | null;
  region?: string | null;
  country?: string | null;
  source?: string;
};

type HeroPayload = {
  imageUrl: string;
  caption: string | null;
  source: string;
  attribution?: string | null;
};

async function locateFromCoords(
  lat: number,
  lng: number,
): Promise<LocateResult> {
  const res = await fetch(
    `/api/geo/locate?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
  );
  return res.json();
}

async function locateFromIp(): Promise<LocateResult> {
  const res = await fetch("/api/geo/locate");
  return res.json();
}

function readCachedCity(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { city?: string; at?: number };
    if (!parsed.city) return null;
    if (parsed.at && Date.now() - parsed.at > 7 * 86_400_000) return null;
    return parsed.city;
  } catch {
    return null;
  }
}

function writeCachedCity(city: string) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ city, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function readCachedHero(place: string): HeroPayload | null {
  try {
    const raw = localStorage.getItem(HERO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      place?: string;
      hero?: HeroPayload;
      at?: number;
    };
    if (parsed.place?.toLowerCase() !== place.toLowerCase()) return null;
    if (parsed.at && Date.now() - parsed.at > 7 * 86_400_000) return null;
    return parsed.hero ?? null;
  } catch {
    return null;
  }
}

function writeCachedHero(place: string, hero: HeroPayload) {
  try {
    localStorage.setItem(
      HERO_CACHE_KEY,
      JSON.stringify({ place, hero, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

async function fetchHero(place: string): Promise<HeroPayload> {
  const cached = readCachedHero(place);
  if (cached) return cached;
  const res = await fetch(
    `/api/geo/hero-image?q=${encodeURIComponent(place)}`,
  );
  const data = (await res.json()) as HeroPayload;
  writeCachedHero(place, data);
  return data;
}

/**
 * Hero background for the visitor's city.
 * Curated metros (Seattle area, etc.) first; otherwise live Wikipedia
 * (or Unsplash if UNSPLASH_ACCESS_KEY is configured).
 */
export function LocalHeroBackground({
  className = "",
  opacityClass = "opacity-35",
  showCaption = false,
}: {
  className?: string;
  opacityClass?: string;
  showCaption?: boolean;
}) {
  const [hero, setHero] = useState<HeroPayload>({
    imageUrl: dashboardHeroImage(),
    caption: null,
    source: "fallback",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadForPlace(place: string) {
      try {
        const data = await fetchHero(place);
        if (!cancelled) setHero(data);
      } catch {
        /* keep default */
      }
    }

    async function run() {
      const cached = readCachedCity();
      if (cached) {
        await loadForPlace(cached);
        return;
      }

      const apply = async (label: string | null) => {
        if (cancelled || !label) return;
        writeCachedCity(label);
        await loadForPlace(label);
      };

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const data = await locateFromCoords(
                pos.coords.latitude,
                pos.coords.longitude,
              );
              await apply(data.city);
            } catch {
              try {
                await apply((await locateFromIp()).city);
              } catch {
                /* keep default hero */
              }
            }
          },
          async () => {
            try {
              await apply((await locateFromIp()).city);
            } catch {
              /* keep default hero */
            }
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 86_400_000 },
        );
        return;
      }

      try {
        await apply((await locateFromIp()).city);
      } catch {
        /* keep default hero */
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const showLabel =
    showCaption &&
    hero.caption &&
    (hero.source === "curated" ||
      hero.source === "wikipedia" ||
      hero.source === "unsplash");

  return (
    <>
      <div
        className={`absolute inset-0 bg-cover bg-center transition-[background-image] duration-700 ${opacityClass} ${className}`}
        style={{ backgroundImage: `url(${hero.imageUrl})` }}
        aria-hidden
      />
      {showLabel ? (
        <p className="pointer-events-none absolute bottom-3 right-4 z-10 max-w-[70%] truncate rounded-full bg-[#080B3A]/55 px-2.5 py-1 text-[10px] font-medium text-[#C5CAE5] backdrop-blur">
          {hero.caption}
        </p>
      ) : null}
    </>
  );
}
