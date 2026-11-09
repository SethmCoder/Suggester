"use client";

import { useEffect, useState } from "react";

type WeatherFocus = {
  date: string;
  label: string;
  wet: boolean;
  summary: string;
  precipitationMm: number;
  precipProbability: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
};

function addDaysYmd(start: string, dayIndex: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, (d || 1) + dayIndex);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function DayWeatherBadge({
  startDate,
  dayIndex,
  city,
  lat,
  lng,
}: {
  startDate?: string;
  dayIndex: number;
  city?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const [weather, setWeather] = useState<WeatherFocus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!startDate) return;
    const date = addDaysYmd(startDate, dayIndex);
    const params = new URLSearchParams({
      date,
      startDate: date,
      endDate: date,
    });
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    } else if (city) {
      params.set("city", city);
    } else {
      return;
    }
    let cancelled = false;
    fetch(`/api/weather?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("weather");
        return res.json() as Promise<{ focus?: WeatherFocus | null }>;
      })
      .then((data) => {
        if (!cancelled) setWeather(data.focus ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, dayIndex, city, lat, lng]);

  if (!startDate || failed || !weather) return null;

  return (
    <span
      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        weather.wet
          ? "bg-[#DBEAFE] text-[#1D4ED8]"
          : "bg-[#ECFDF5] text-[#047857]"
      }`}
      title={weather.summary}
    >
      {weather.wet ? "Rain plan" : weather.label}
      {weather.tempMaxC != null ? ` · ${Math.round(weather.tempMaxC)}°` : ""}
    </span>
  );
}
