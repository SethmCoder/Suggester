import { describe, expect, it } from "vitest";
import { applyDayConstraints } from "@/lib/ai/constraints";
import {
  isOutdoorPlace,
  isWetDay,
  isWetWeatherCode,
  weatherLabel,
} from "@/lib/weather/codes";
import {
  formatWeatherLine,
  weatherForDate,
  weatherPromptBlock,
} from "@/lib/weather/open-meteo";
import type { WeatherForecast } from "@/lib/weather/types";

describe("weather domain", () => {
  it("labels rain and thunderstorm codes as wet", () => {
    expect(weatherLabel(61)).toMatch(/rain/i);
    expect(isWetWeatherCode(61)).toBe(true);
    expect(isWetWeatherCode(95)).toBe(true);
    expect(isWetWeatherCode(0)).toBe(false);
    expect(
      isWetDay({
        weatherCode: 3,
        precipitationMm: 0.2,
        precipProbability: 70,
      }),
    ).toBe(true);
  });

  it("detects outdoor parks vs indoor museums", () => {
    expect(isOutdoorPlace(["park"], "Central Park")).toBe(true);
    expect(isOutdoorPlace(["museum"], "Louvre")).toBe(false);
    expect(isOutdoorPlace(["viewpoint"], "Eiffel Tower viewpoint")).toBe(true);
  });

  it("drops outdoor stops on wet days unless must-see", () => {
    const result = applyDayConstraints(
      [
        {
          placeId: "park-1",
          name: "City Park",
          startTime: "10:00",
          durationMinutes: 90,
          types: ["park"],
          priority: "preferred",
        },
        {
          placeId: "museum-1",
          name: "City Museum",
          startTime: "12:00",
          durationMinutes: 90,
          types: ["museum"],
          priority: "preferred",
        },
        {
          placeId: "must-park",
          name: "Famous Garden",
          startTime: "15:00",
          durationMinutes: 60,
          types: ["garden"],
          priority: "must_see",
        },
      ],
      {
        walking: true,
        stepFree: false,
        wetWeather: true,
        isOutdoor: (stop) => isOutdoorPlace(stop.types, stop.name),
        isMustSee: (stop) => stop.priority === "must_see",
      },
    );
    expect(result.kept.map((s) => s.placeId)).toEqual([
      "museum-1",
      "must-park",
    ]);
    expect(result.dropped[0]?.reason).toMatch(/outdoor|wet/i);
  });

  it("builds a prompt block that forbids outdoor wet-day fills", () => {
    const forecast: WeatherForecast = {
      lat: 48.85,
      lng: 2.35,
      attribution: "Weather from Open-Meteo",
      days: [
        {
          date: "2026-11-12",
          weatherCode: 61,
          label: "Rain",
          precipitationMm: 8,
          precipProbability: 80,
          tempMaxC: 14,
          tempMinC: 9,
          wet: true,
          source: "open-meteo",
        },
      ],
    };
    expect(weatherForDate(forecast, "2026-11-12")?.wet).toBe(true);
    expect(formatWeatherLine(forecast.days[0])).toMatch(/prefer indoor/i);
    expect(weatherPromptBlock(forecast)).toMatch(/WET/);
    expect(weatherPromptBlock(forecast)).toMatch(/do not schedule outdoor/i);
  });
});
