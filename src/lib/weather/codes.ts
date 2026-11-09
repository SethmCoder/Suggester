/** WMO weather interpretation codes used by Open-Meteo. */
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Mixed";
}

export function isWetWeatherCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code >= 95 ||
    (code >= 71 && code <= 77) ||
    (code >= 85 && code <= 86)
  );
}

export function isWetDay(input: {
  weatherCode: number;
  precipitationMm: number;
  precipProbability: number | null;
}): boolean {
  if (isWetWeatherCode(input.weatherCode)) return true;
  if (input.precipitationMm >= 2) return true;
  if (input.precipProbability != null && input.precipProbability >= 55) return true;
  return false;
}

const OUTDOOR =
  /park|garden|beach|viewpoint|nature|outdoor|trail|promenade|plaza|square|zoo|botanical|waterfront|pier|lookout|hike|scenic/i;
const INDOOR =
  /museum|gallery|mall|library|theatre|theater|aquarium|indoor|cinema|church|cathedral|temple|mosque|market_hall|shopping/i;

export function isOutdoorPlace(types: string[] = [], name = ""): boolean {
  const blob = `${types.join(" ")} ${name}`.toLowerCase();
  if (INDOOR.test(blob) && !OUTDOOR.test(blob)) return false;
  return OUTDOOR.test(blob);
}
