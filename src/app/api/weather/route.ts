import { NextResponse } from "next/server";
import { z } from "zod";
import { geocodeDestination } from "@/lib/maps";
import {
  fetchDailyWeather,
  formatWeatherLine,
  weatherForDate,
} from "@/lib/weather/open-meteo";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  city: z.string().min(1).max(120).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    lat: url.searchParams.get("lat") ?? undefined,
    lng: url.searchParams.get("lng") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    startDate: url.searchParams.get("startDate") ?? url.searchParams.get("date"),
    endDate: url.searchParams.get("endDate") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide startDate (YYYY-MM-DD) and lat/lng or city." },
      { status: 400 },
    );
  }

  let lat = parsed.data.lat;
  let lng = parsed.data.lng;
  if ((lat == null || lng == null) && parsed.data.city) {
    const geo = await geocodeDestination(parsed.data.city);
    if (!geo) {
      return NextResponse.json(
        { error: "Could not place that city for weather." },
        { status: 404 },
      );
    }
    lat = geo.lat;
    lng = geo.lng;
  }
  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: "lat/lng or city is required." },
      { status: 400 },
    );
  }

  const startDate = parsed.data.startDate;
  const endDate = parsed.data.endDate ?? parsed.data.date ?? startDate;
  const forecast = await fetchDailyWeather({ lat, lng, startDate, endDate });
  if (!forecast) {
    return NextResponse.json(
      { error: "Weather forecast unavailable for those dates." },
      { status: 503 },
    );
  }

  const focus = parsed.data.date
    ? weatherForDate(forecast, parsed.data.date)
    : null;

  return NextResponse.json({
    ...forecast,
    focus: focus
      ? { ...focus, summary: formatWeatherLine(focus) }
      : null,
  });
}
