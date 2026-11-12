import { NextResponse } from "next/server";
import { z } from "zod";
import { extractPlacesFromReel, looksLikeReelUrl } from "@/lib/wishlist/parse-reel";

const bodySchema = z.object({
  url: z.string().max(2000).optional().nullable(),
  text: z.string().max(12000).optional().nullable(),
  image: z.string().max(6_000_000).optional().nullable(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const url = parsed.data.url?.trim() || null;
  const text = parsed.data.text?.trim() || null;
  const image = parsed.data.image?.trim() || null;

  if (url && !looksLikeReelUrl(url) && !text && !image) {
    return NextResponse.json(
      {
        error:
          "That doesn’t look like an Instagram, TikTok, or YouTube Shorts link. Paste the caption too.",
      },
      { status: 400 },
    );
  }

  const result = await extractPlacesFromReel({ url, text, imageDataUrl: image });
  return NextResponse.json(result);
}
