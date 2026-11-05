import { NextResponse } from "next/server";
import { quoteProPrice } from "@/lib/billing/price";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const quote = await quoteProPrice({
    country: searchParams.get("country"),
    lang: searchParams.get("lang"),
  });
  return NextResponse.json(quote);
}
