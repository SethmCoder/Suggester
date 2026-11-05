/**
 * Import hotels for one city into data/hotels/catalog.json via the running app.
 * Usage: node scripts/import-hotels.mjs Seattle
 * The app must already be running. This does not download the whole world.
 */
const city = process.argv[2]?.trim();
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
if (!city) {
  console.error("Usage: node scripts/import-hotels.mjs <city>");
  process.exit(1);
}
const url = `${base}/api/hotels/catalog?city=${encodeURIComponent(city)}&limit=8`;
const res = await fetch(url);
const data = await res.json();
console.log(
  JSON.stringify(
    {
      status: res.status,
      total: data.total ?? 0,
      sample: (data.hotels ?? []).map((hotel) => hotel.name),
      attribution: data.attribution ?? null,
      error: data.error ?? null,
    },
    null,
    2,
  ),
);
if (!res.ok) process.exit(1);
