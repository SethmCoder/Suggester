import { NextResponse } from "next/server";
import { z } from "zod";
import {
  allocateNightsCatalog,
  enrichAllocationExplanations,
  recalculateNights,
} from "@/lib/trips/night-allocation";

const bodySchema = z.object({
  cities: z.array(z.string().min(1)).min(1).max(8),
  totalNights: z.number().int().min(1).max(60),
  interests: z.array(z.string()).optional(),
  pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
  locked: z
    .array(
      z.object({
        city: z.string(),
        nights: z.number().int().min(0).max(60),
        locked: z.boolean().optional(),
      }),
    )
    .optional(),
  enrich: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide cities and totalNights." },
      { status: 400 },
    );
  }

  const { cities, totalNights, interests, pace, locked, enrich } = parsed.data;

  let result = locked?.length
    ? recalculateNights({
        cities: locked.map((row) => ({
          city: row.city,
          nights: row.nights,
          locked: row.locked,
        })),
        totalNights,
        interests,
        pace,
      })
    : allocateNightsCatalog({
        cities,
        totalNights,
        interests,
        pace,
      });

  if (enrich !== false) {
    result = await enrichAllocationExplanations(result, interests ?? []);
  }

  return NextResponse.json(result);
}
