export type DayWeather = {
  date: string;
  weatherCode: number;
  label: string;
  precipitationMm: number;
  precipProbability: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  /** True when outdoor sightseeing should be avoided or deferred. */
  wet: boolean;
  source: "open-meteo";
};

export type WeatherForecast = {
  lat: number;
  lng: number;
  days: DayWeather[];
  attribution: string;
};
