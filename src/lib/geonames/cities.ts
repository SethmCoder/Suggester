/**
 * GeoNames city subset extracted from allCountries (PPLC/PPLA/PPLA2 + PPL≥50k),
 * plus districts (PPLX/PPLA3/PPLA4, population ≥ 30,000) from cities5000.
 * Source: https://download.geonames.org/export/dump/ — CC BY 4.0 attribution.
 *
 * Server-only: reads TSV from disk. Do not import from Client Components.
 */

import "server-only";
import fs from "fs";
import path from "path";

export type GeonameCity = {
  id: number;
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  countryCode: string;
  admin1: string;
  population: number;
  featureCode: string;
};

let cache: GeonameCity[] | null = null;

function dataPath() {
  return path.join(process.cwd(), "data", "geonames-cities.tsv");
}

function districtsPath() {
  return path.join(process.cwd(), "data", "geonames-districts.tsv");
}

function readCityFile(file: string, seen: Set<number>, rows: GeonameCity[]) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split("\t");
    if (f.length < 9) continue;
    const id = Number(f[0]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      name: f[1],
      asciiName: f[2] || f[1],
      lat: Number(f[3]),
      lng: Number(f[4]),
      countryCode: f[5] || "",
      admin1: f[6] || "",
      population: Number(f[7]) || 0,
      featureCode: f[8] || "",
    });
  }
}

export function loadGeonameCities(): GeonameCity[] {
  if (cache) return cache;
  const rows: GeonameCity[] = [];
  const seen = new Set<number>();
  readCityFile(dataPath(), seen, rows);
  readCityFile(districtsPath(), seen, rows);
  cache = rows;
  return rows;
}

/** Ranked city search for autocomplete / resolution. */
export function searchGeonameCities(
  query: string,
  limit = 8,
): GeonameCity[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const cities = loadGeonameCities();
  const scored: { c: GeonameCity; score: number }[] = [];
  for (const c of cities) {
    const name = c.name.toLowerCase();
    const ascii = c.asciiName.toLowerCase();
    let score = 0;
    if (name === q || ascii === q) score = 1000 + Math.min(c.population / 1e5, 50);
    else if (name.startsWith(q) || ascii.startsWith(q))
      score = 500 + Math.min(c.population / 1e5, 40);
    else if (name.includes(q) || ascii.includes(q))
      score = 100 + Math.min(c.population / 1e5, 30);
    else continue;
    // Capitals / admin seats boost
    if (c.featureCode === "PPLC") score += 80;
    else if (c.featureCode === "PPLA") score += 40;
    scored.push({ c, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);
}

export function resolveGeonameCity(query: string): GeonameCity | null {
  return searchGeonameCities(query, 1)[0] ?? null;
}
