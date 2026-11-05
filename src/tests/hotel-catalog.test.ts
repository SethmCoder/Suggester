import { describe, expect, it } from "vitest";
import { recordFromTags } from "@/lib/hotels/discover";
import { dedupeHotels, filterHotels, type HotelRecord } from "@/lib/hotels/record";

function sample(patch: Partial<HotelRecord> = {}): HotelRecord {
  return {
    id: "way:1",
    osmId: "1",
    osmType: "way",
    wikidataId: null,
    name: "The Westin Seattle",
    altNames: [],
    propertyType: "hotel",
    latitude: 47.613,
    longitude: -122.338,
    address: "1900 5th Avenue, Seattle",
    city: "Seattle",
    region: "Washington",
    country: "United States",
    countryCode: "US",
    postalCode: "98101",
    website: "https://www.marriott.com/en-us/hotels/seawi-the-westin-seattle/overview/",
    phone: null,
    email: null,
    starRating: null,
    amenities: [],
    checkIn: null,
    checkOut: null,
    chain: null,
    openedOn: null,
    lastVerifiedAt: "2026-11-05T00:00:00.000Z",
    source: "openstreetmap",
    sourceUpdatedAt: null,
    ...patch,
  } as HotelRecord;
}

describe("hotel catalog", () => {
  it("parses an OpenStreetMap hotel and ignores a nameless one", () => {
    const hotel = recordFromTags({
      osmType: "way",
      osmId: "331291911",
      lat: 47.613,
      lng: -122.338,
      tags: {
        name: "The Westin Seattle",
        tourism: "hotel",
        website: "https://www.marriott.com/en-us/hotels/seawi-the-westin-seattle/overview/",
        wikidata: "Q7988924",
        stars: "7",
        phone: "+1 206-728-1000",
      },
      address: { city: "Seattle", country: "United States", country_code: "us" },
    });
    expect(hotel?.name).toBe("The Westin Seattle");
    expect(hotel?.wikidataId).toBe("Q7988924");
    expect(hotel?.starRating).toBeNull();
    expect(hotel?.phone).toContain("206");
    expect(
      recordFromTags({
        osmType: "node",
        osmId: "2",
        lat: 1,
        lng: 2,
        tags: { tourism: "hotel" },
      }),
    ).toBeNull();
  });

  it("finds a hotel by name and does not merge different hotels", () => {
    const westin = sample();
    const andra = sample({
      id: "way:2",
      osmId: "2",
      name: "Hotel Andra",
      latitude: 47.616,
    });
    expect(filterHotels([andra, westin], { q: "westin", city: "Seattle" }).map((h) => h.name)).toEqual([
      "The Westin Seattle",
    ]);
    const dup = sample({ website: null });
    expect(dedupeHotels([dup, westin])).toHaveLength(1);
    expect(dedupeHotels([westin, andra])).toHaveLength(2);
  });
});
