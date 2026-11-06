import { NextResponse } from "next/server";
import { getCityBrief } from "@/lib/places/city-brief";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const brief = await getCityBrief(name);
    return NextResponse.json(brief);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load city" },
      { status: 502 },
    );
  }
}
