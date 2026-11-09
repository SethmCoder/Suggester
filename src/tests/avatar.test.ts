import { describe, expect, it } from "vitest";
import { avatarInitial, letterAvatarDataUrl } from "@/lib/avatar";

describe("avatar", () => {
  it("defaults the letter mark to M", () => {
    expect(avatarInitial(null, null)).toBe("M");
    expect(avatarInitial("Maya", "x@y.com")).toBe("M");
    expect(avatarInitial("", "alex@example.com")).toBe("A");
  });

  it("builds a blue letter SVG data URL", () => {
    const url = letterAvatarDataUrl("M");
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(url)).toContain("#0400FF");
    expect(decodeURIComponent(url)).toContain(">M</text>");
  });
});
