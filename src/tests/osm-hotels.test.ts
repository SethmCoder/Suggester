import { describe, expect, it } from "vitest";
import { heuristicHotelPick, rankOsmHotels } from "@/lib/hotels/osm-hotels";

const center = { lat: 25.2, lng: 55.27 };

describe("OSM hotel ranking", () => {
  const hotels = [
    {
      id: "far",
      name: "Desert Inn",
      address: null,
      lat: 25.05,
      lng: 55.1,
      stars: 3,
    },
    {
      id: "center",
      name: "Creek Hotel",
      address: "Dubai",
      lat: 25.2,
      lng: 55.27,
      stars: 4,
    },
  ];

  it("ranks a starred central hotel ahead of a farther one", () => {
    const ranked = rankOsmHotels(hotels, center);
    expect(ranked[0]?.id).toBe("center");
    expect(heuristicHotelPick(ranked)).toBe("center");
  });

  it("filters the city list by the typed name", () => {
    const ranked = rankOsmHotels(hotels, center, "desert");
    expect(ranked.map((hotel) => hotel.id)).toEqual(["far"]);
  });
});
