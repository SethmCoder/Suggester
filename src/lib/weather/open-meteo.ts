import { isWetDay, weatherLabel } from "./codes";
import type { DayWeather, WeatherForecast } from "./types";

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchDailyWeather(input: {
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  signal?: AbortSignal;
}): Promise<WeatherForecast | null> {
  const params = new URLSearchParams({
    latitude: String(input.lat),
    longitude: String(input.lng),
    daily:
      "weathercode,precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    start_date: input.startDate.slice(0, 10),
    end_date: input.endDate.slice(0, 10),
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  try {
    const res = await fetch(url, {
      signal: input.signal ?? AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weathercode?: number[];
        precipitation_sum?: number[];
        precipitation_probability_max?: (number | null)[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
      };
    };
    const daily = data.daily;
    if (!daily?.time?.length) return null;
    const days: DayWeather[] = daily.time.map((date, i) => {
      const weatherCode = Number(daily.weathercode?.[i] ?? 0);
      const precipitationMm = Number(daily.precipitation_sum?.[i] ?? 0);
      const precipProbability =
        daily.precipitation_probability_max?.[i] == null
          ? null
          : Number(daily.precipitation_probability_max[i]);
      return {
        date,
        weatherCode,
        label: weatherLabel(weatherCode),
        precipitationMm,
        precipProbability,
        tempMaxC:
          daily.temperature_2m_max?.[i] == null
            ? null
            : Number(daily.temperature_2m_max[i]),
        tempMinC:
          daily.temperature_2m_min?.[i] == null
            ? null
            : Number(daily.temperature_2m_min[i]),
        wet: isWetDay({ weatherCode, precipitationMm, precipProbability }),
        source: "open-meteo",
      };
    });
    return {
      lat: input.lat,
      lng: input.lng,
      days,
      attribution: "Weather from Open-Meteo",
    };
  } catch {
    return null;
  }
}

export function weatherForDate(
  forecast: WeatherForecast | null | undefined,
  date: Date | string,
): DayWeather | null {
  if (!forecast?.days.length) return null;
  const key = typeof date === "string" ? date.slice(0, 10) : ymd(date);
  return forecast.days.find((day) => day.date === key) ?? null;
}

export function formatWeatherLine(day: DayWeather): string {
  const temp =
    day.tempMaxC != null && day.tempMinC != null
      ? ` · ${Math.round(day.tempMinC)}–${Math.round(day.tempMaxC)}°C`
      : "";
  const rain =
    day.precipitationMm > 0
      ? ` · ${day.precipitationMm.toFixed(1)} mm`
      : day.precipProbability != null
        ? ` · ${day.precipProbability}% precip chance`
        : "";
  return `${day.label}${temp}${rain}${day.wet ? " · prefer indoor stops" : ""}`;
}

export function weatherPromptBlock(
  forecast: WeatherForecast | null | undefined,
): string {
  if (!forecast?.days.length) return "";
  const lines = forecast.days.map(
    (day) =>
      `- ${day.date}: ${formatWeatherLine(day)}${day.wet ? " (WET — do not schedule outdoor parks/beaches/viewpoints; use museums, markets, indoor food)" : ""}`,
  );
  return `Weather forecast (${forecast.attribution}):
${lines.join("\n")}
On wet days, schedule indoor places only for sightseeing. Outdoor must-sees may stay only if no indoor alternative exists.`;
}
