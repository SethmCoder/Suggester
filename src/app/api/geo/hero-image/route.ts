import { NextResponse } from "next/server";
import { dashboardHeroImage } from "@/lib/destination-image";
import { resolveLiveHeroImage } from "@/lib/destination-image-live";

/**
 * GET ?q=Boise — curated metro, else Wikipedia thumbnail, else optional Unsplash.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({
      imageUrl: dashboardHeroImage(),
      caption: null,
      source: "fallback",
    });
  }

  const result = await resolveLiveHeroImage(q, dashboardHeroImage());
  return NextResponse.json(result);
}
