import { describe, expect, it } from "vitest";
import {
  anchorUnbookedLegs,
  cityMatchesLocation,
  suggestFromHotels,
  suggestHotels,
  type HotelRecord,
} from "@/lib/hotels/hotelrec";

const hotels: HotelRecord[] = [
  {
    id: "1",
    name: "Beach House",
    location: "Paris Ile de France",
    rating: 4.2,
    n: 10,
    locationScore: 4,
    beach: 8,
    center: 1,
    sights: 1,
    transit: 0,
    quotes: [
      {
        author: "A",
        date: "2019-01-01",
        rating: 4,
        title: "Stay",
        text: "The beach shuttle was easy and the staff were kind throughout.",
      },
    ],
  },
  {
    id: "2",
    name: "Center Inn",
    location: "Paris Ile de France",
    rating: 4.8,
    n: 20,
    locationScore: 5,
    beach: 0,
    center: 12,
    sights: 4,
    transit: 2,
    quotes: [
      {
        author: "B",
        date: "2018-06-01",
        rating: 5,
        title: "Central",
        text: "We walked to the city center and the museums in a few minutes.",
      },
    ],
  },
  {
    id: "3",
    name: "Parish Lodge",
    location: "Andorra la Vella Andorra la Vella Parish",
    rating: 5,
    n: 4,
    locationScore: 5,
    beach: 0,
    center: 0,
    sights: 0,
    transit: 0,
    quotes: [
      {
        author: "C",
        date: "2017-01-01",
        rating: 5,
        title: "Fine",
        text: "Quiet rooms and a generous breakfast every morning we stayed.",
      },
    ],
  },
];

describe("HotelRec city matching", () => {
  it("matches Paris and does not treat Parish as Paris", () => {
    expect(cityMatchesLocation("Paris Ile de France", "Paris")).toBe(true);
    expect(
      cityMatchesLocation("Andorra la Vella Andorra la Vella Parish", "Paris"),
    ).toBe(false);
  });

  it("ranks a beach preference above a higher-rated central hotel", () => {
    const picks = suggestFromHotels(hotels, {
      city: "Paris",
      minRating: 4,
      place: "beach",
    });
    expect(picks.map((h) => h.name)).toEqual(["Beach House", "Center Inn"]);
    expect(picks[0].quotes[0].author).toBe("A");
  });

  it("does not treat Drome or York-in-New-York as those cities", () => {
    expect(
      cityMatchesLocation(
        "Saint Marcel les Valence Drome Auvergne Rhone Alpe",
        "Rome",
      ),
    ).toBe(false);
    expect(cityMatchesLocation("New York City New York", "York")).toBe(false);
    expect(cityMatchesLocation("New York City New York", "New York")).toBe(true);
  });

  it("ranks a city-prefix hotel ahead of a same-state outlier", () => {
    const picks = suggestFromHotels(
      [
        {
          ...hotels[1],
          id: "upstate",
          name: "Lake Motel",
          location: "Queensbury New York",
          rating: 5,
          n: 1,
        },
        {
          ...hotels[1],
          id: "nyc",
          name: "Conrad New York",
          location: "New York City New York",
          rating: 4.5,
          n: 80,
        },
      ],
      { city: "New York", minRating: 3, place: "any" },
    );
    expect(picks[0].name).toBe("Conrad New York");
  });

  it("drops hotels under the rating slider", () => {
    const picks = suggestFromHotels(hotels, {
      city: "Paris",
      minRating: 4.5,
      place: "any",
    });
    expect(picks.map((h) => h.name)).toEqual(["Center Inn"]);
  });
});

describe("HotelRec subset", () => {
  it("suggests Paris hotels with verbatim review text", () => {
    const { hotels, citation } = suggestHotels({
      city: "Paris",
      minRating: 4,
      place: "center",
      limit: 4,
    });
    expect(citation).toMatch(/HotelRec/);
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels[0].location.toLowerCase().startsWith("paris")).toBe(true);
    const quote = hotels[0].quotes[0];
    expect(quote.author.length).toBeGreaterThan(1);
    expect(quote.text.length).toBeGreaterThan(40);
    expect(quote.text).not.toMatch(/as an ai|waypoint does not/i);
  });

  it("fills an empty unbooked leg from the top suggestion", () => {
    const [leg] = anchorUnbookedLegs([
      {
        city: "Dubai",
        hotel: "",
        hotelBooked: false,
        hotelMinRating: 4,
        hotelPlace: "beach" as const,
      },
    ]);
    expect(leg.hotel?.length).toBeGreaterThan(3);
    expect(leg.hotelAddress?.toLowerCase()).toContain("dubai");
  });
});
