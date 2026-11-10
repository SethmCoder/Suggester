import { NextResponse } from "next/server";
import { z } from "zod";
import { convertCurrency } from "@/lib/trips/fx";

const bodySchema = z.object({
  amount: z.number().min(0).max(1_000_000_000),
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
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
    return NextResponse.json({ error: "Invalid FX request" }, { status: 400 });
  }
  try {
    const result = await convertCurrency(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "FX rates unavailable",
      },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount") ?? "1");
  const from = url.searchParams.get("from") ?? "USD";
  const to = url.searchParams.get("to") ?? "USD";
  const parsed = bodySchema.safeParse({ amount, from, to });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid FX request" }, { status: 400 });
  }
  try {
    const result = await convertCurrency(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "FX rates unavailable",
      },
      { status: 502 },
    );
  }
}
