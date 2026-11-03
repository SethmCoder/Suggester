import { NextResponse } from "next/server";
import { canUseSku, incrementSku } from "@/lib/google/api-usage";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  if (!(await canUseSku("places.photo"))) {
    return NextResponse.json({ error: "Photo quota reached" }, { status: 429 });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxHeightPx=400&maxWidthPx=600&key=${key}`,
    { redirect: "follow" },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Photo fetch failed" }, { status: 502 });
  }
  await incrementSku("places.photo");
  const blob = await res.blob();
  return new NextResponse(blob, {
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg" },
  });
}
