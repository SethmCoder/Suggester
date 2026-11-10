/**
 * Format City, ST, Country for wizard hero overlay.
 * Never invents a region code — omit ST when unknown.
 */

const CITY_META: Record<
  string,
  { region?: string; country: string }
> = {
  seattle: { region: "WA", country: "United States" },
  portland: { region: "OR", country: "United States" },
  "san francisco": { region: "CA", country: "United States" },
  "los angeles": { region: "CA", country: "United States" },
  chicago: { region: "IL", country: "United States" },
  boston: { region: "MA", country: "United States" },
  miami: { region: "FL", country: "United States" },
  denver: { region: "CO", country: "United States" },
  austin: { region: "TX", country: "United States" },
  "new york": { region: "NY", country: "United States" },
  washington: { region: "DC", country: "United States" },
  vancouver: { region: "BC", country: "Canada" },
  montreal: { region: "QC", country: "Canada" },
  toronto: { region: "ON", country: "Canada" },
  london: { country: "United Kingdom" },
  edinburgh: { country: "United Kingdom" },
  paris: { country: "France" },
  tokyo: { country: "Japan" },
  kyoto: { country: "Japan" },
  osaka: { country: "Japan" },
  rome: { country: "Italy" },
  florence: { country: "Italy" },
  barcelona: { country: "Spain" },
  madrid: { country: "Spain" },
  lisbon: { country: "Portugal" },
  amsterdam: { country: "Netherlands" },
  berlin: { country: "Germany" },
  sydney: { region: "NSW", country: "Australia" },
  melbourne: { region: "VIC", country: "Australia" },
  singapore: { country: "Singapore" },
  seoul: { country: "South Korea" },
  dubai: { country: "United Arab Emirates" },
  "abu dhabi": { country: "United Arab Emirates" },
  bangkok: { country: "Thailand" },
  istanbul: { country: "Turkey" },
  athens: { country: "Greece" },
  prague: { country: "Czechia" },
  vienna: { country: "Austria" },
  "mexico city": { country: "Mexico" },
  cairo: { country: "Egypt" },
};

const CC_COUNTRY: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  UK: "United Kingdom",
  FR: "France",
  JP: "Japan",
  IT: "Italy",
  ES: "Spain",
  PT: "Portugal",
  NL: "Netherlands",
  DE: "Germany",
  AU: "Australia",
  SG: "Singapore",
  KR: "South Korea",
  AE: "United Arab Emirates",
  TH: "Thailand",
  TR: "Turkey",
  GR: "Greece",
  CZ: "Czechia",
  AT: "Austria",
  MX: "Mexico",
  EG: "Egypt",
};

function titleCase(s: string) {
  return s
    .trim()
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function resolveCityMeta(
  city: string,
  countryCode?: string | null,
): { city: string; region: string | null; country: string | null } {
  const name = titleCase(city.split(",")[0]?.trim() || city);
  const key = name.toLowerCase();
  const meta =
    CITY_META[key] ||
    Object.entries(CITY_META).find(([k]) => key.includes(k))?.[1];

  const countryFromCode = countryCode
    ? CC_COUNTRY[countryCode.toUpperCase()] ?? null
    : null;

  return {
    city: name,
    region: meta?.region ?? null,
    country: meta?.country ?? countryFromCode,
  };
}

/** Overlay label: City, ST, Country — omit ST when unknown. */
export function formatCityOverlay(
  city: string,
  countryCode?: string | null,
): string {
  const meta = resolveCityMeta(city, countryCode);
  const parts = [meta.city];
  if (meta.region) parts.push(meta.region);
  if (meta.country) parts.push(meta.country);
  return parts.join(", ");
}
