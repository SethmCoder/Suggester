import { describe, expect, it } from "vitest";
import {
  heuristicReelPlaces,
  looksLikeReelUrl,
} from "@/lib/wishlist/parse-reel";

describe("parse-reel helpers", () => {
  it("detects common reel hosts", () => {
    expect(
      looksLikeReelUrl("https://www.instagram.com/reel/AbCdEf123/"),
    ).toBe(true);
    expect(
      looksLikeReelUrl("https://www.tiktok.com/@travel/video/1234567890"),
    ).toBe(true);
    expect(looksLikeReelUrl("https://example.com/video/1")).toBe(false);
  });

  it("pulls rough place guesses from caption text", () => {
    const places = heuristicReelPlaces({
      url: "https://www.instagram.com/reel/AbCdEf123/",
      text: "Spent the morning visiting Tokyo Tower then ramen in Shinjuku #ShibuyaSky",
    });
    expect(places.length).toBeGreaterThan(0);
    expect(places.some((p) => /tokyo|shinjuku|shibuya/i.test(p.name))).toBe(
      true,
    );
  });
});
