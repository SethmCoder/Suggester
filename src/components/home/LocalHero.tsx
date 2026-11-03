"use client";

import { useEffect, useState } from "react";
import {
  dashboardHeroImage,
  destinationImageUrl,
} from "@/lib/destination-image";

const STORAGE_KEY = "waypoint:local-city-v1";

type LocateResult = {
  city: string | null;
  region?: string | null;
  country?: string | null;
  source?: string;
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

/**
 * Hero background that switches to a curated Unsplash photo for the
 * visitor's city (browser geolocation → Nominatim, else IP via geojs).
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
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const cached = readCachedCity();
      if (cached) {
        if (!cancelled) setCity(cached);
        return;
      }

      const apply = (label: string | null) => {
        if (cancelled || !label) return;
        writeCachedCity(label);
        setCity(label);
      };

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const data = await locateFromCoords(
                pos.coords.latitude,
                pos.coords.longitude,
              );
              apply(data.city);
            } catch {
              try {
                apply((await locateFromIp()).city);
              } catch {
                /* keep default hero */
              }
            }
          },
          async () => {
            try {
              apply((await locateFromIp()).city);
            } catch {
              /* keep default hero */
            }
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 86_400_000 },
        );
        return;
      }

      try {
        apply((await locateFromIp()).city);
      } catch {
        /* keep default hero */
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const src = city ? destinationImageUrl(city) : dashboardHeroImage();

  return (
    <>
      <div
        className={`absolute inset-0 bg-cover bg-center transition-[background-image] duration-700 ${opacityClass} ${className}`}
        style={{ backgroundImage: `url(${src})` }}
        aria-hidden
      />
      {showCaption && city ? (
        <p className="pointer-events-none absolute bottom-3 right-4 z-10 rounded-full bg-[#080B3A]/55 px-2.5 py-1 text-[10px] font-medium text-[#C5CAE5] backdrop-blur">
          Showing {city}
        </p>
      ) : null}
    </>
  );
}
