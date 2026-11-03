import { NextResponse } from "next/server";
import {
  accountlessFetch,
  waypointUserAgent,
} from "@/lib/http/accountless-fetch";

/**
 * Resolve a city label from browser coords (Nominatim reverse) or IP (geojs).
 * Free / no account.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    if (lat && lng) {
      const params = new URLSearchParams({
        format: "json",
        lat,
        lon: lng,
        zoom: "10",
        addressdetails: "1",
      });
      const res = await accountlessFetch(
        `https://nominatim.openstreetmap.org/reverse?${params}`,
        {
          headers: {
            "User-Agent": waypointUserAgent(),
            Accept: "application/json",
          },
          timeoutMs: 12000,
          retryOnce: false,
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          address?: {
            city?: string;
            town?: string;
            village?: string;
            municipality?: string;
            state?: string;
            country?: string;
            country_code?: string;
          };
        };
        const a = data.address ?? {};
        const city =
          a.city || a.town || a.village || a.municipality || a.state || null;
        if (city) {
          return NextResponse.json({
            city,
            region: a.state ?? null,
            country: a.country ?? null,
            countryCode: a.country_code?.toUpperCase() ?? null,
            source: "nominatim",
          });
        }
      }
    }

    // IP fallback — geojs.io, no API key
    const ipRes = await accountlessFetch(
      "https://get.geojs.io/v1/ip/geo.json",
      { timeoutMs: 10000, retryOnce: false },
    );
    if (ipRes.ok) {
      const data = (await ipRes.json()) as {
        city?: string;
        region?: string;
        country?: string;
        country_code?: string;
      };
      if (data.city) {
        return NextResponse.json({
          city: data.city,
          region: data.region ?? null,
          country: data.country ?? null,
          countryCode: data.country_code ?? null,
          source: "geojs",
        });
      }
    }

    return NextResponse.json({ city: null, source: "none" });
  } catch {
    return NextResponse.json({ city: null, source: "error" }, { status: 200 });
  }
}
