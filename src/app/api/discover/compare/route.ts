import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withProfileEntitlement } from "@/lib/billing/access";
import { gateFeature } from "@/lib/billing/entitlements";
import { catalogById, catalogByName } from "@/lib/discover/catalog";
import { compareDestinations } from "@/lib/discover/score";
import type { DiscoverInterest } from "@/lib/discover/types";
import { SCORING_METHODOLOGY } from "@/lib/discover/types";
import { cacheGet, cacheSet } from "@/lib/http/accountless-fetch";

const bodySchema = z.object({
  destinations: z.array(z.string().min(1).max(80)).min(2).max(4),
  interests: z.array(z.string()).max(12).optional(),
  budgetMax: z.number().min(0).max(100000).optional(),
  durationDays: z.number().int().min(1).max(60).optional(),
  seasonMonth: z.number().int().min(1).max(12).optional(),
  transport: z.string().max(40).optional(),
  savedNames: z.array(z.string().max(120)).max(40).optional(),
  dream: z.string().max(300).optional(),
  previousDestinations: z.array(z.string().max(120)).max(20).optional(),
});

export async function POST(req: Request) {
  const cookieStore = await cookies();
  let accessUser: { id: string; email?: string | null } | null = null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const user = (await supabase.auth.getUser()).data.user;
    accessUser = user ? { id: user.id, email: user.email } : null;
  } catch {
    accessUser = null;
  }
  // Comparison is deterministic scoring — allow even when AI quota is spent.
  void gateFeature(
    "basic",
    await withProfileEntitlement((name) => cookieStore.get(name)?.value, accessUser),
  );

  const body = bodySchema.parse(await req.json());
  const { PLAN_LIMITS } = await import("@/lib/billing/limits");
  const { isProEntitled } = await import("@/lib/billing/entitlements");
  const access = await withProfileEntitlement(
    (name) => cookieStore.get(name)?.value,
    accessUser,
  );
  const pro = isProEntitled(access);
  const compareCap = pro
    ? PLAN_LIMITS.pro.compareDestinations
    : PLAN_LIMITS.free.compareDestinations;
  if (body.destinations.length > compareCap) {
    return NextResponse.json(
      {
        error: pro
          ? `Compare up to ${compareCap} destinations.`
          : `Free compares up to ${compareCap} destinations. Pro compares up to ${PLAN_LIMITS.pro.compareDestinations}.`,
        code: "plan_limit",
      },
      { status: 402 },
    );
  }

  let intelInterests: string[] = [];
  let preferredDestinations: string[] = [];
  let downrankedInterests: string[] = [];
  let intelDream: string | undefined;
  let intelBudget: number | undefined;
  let intelDuration: number | undefined;
  if (userId) {
    try {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const {
        loadTravelIntelligence,
        effectiveInterestsServer,
      } = await import("@/lib/intelligence/server");
      const supabase = await createSupabaseServerClient();
      const profile = await loadTravelIntelligence(supabase, userId);
      intelInterests = effectiveInterestsServer(profile);
      preferredDestinations = profile.inferred.preferredDestinations;
      downrankedInterests = profile.inferred.downrankedInterests
        .filter((row) => row.evidence >= 2)
        .map((row) => row.interest);
      intelDream = profile.explicit.favoriteExperiences[0];
      intelBudget = profile.explicit.budgetMax ?? undefined;
      intelDuration = profile.explicit.preferredDurationDays ?? undefined;
    } catch {
      /* optional */
    }
  }

  const cacheKey = `discover-compare:v1:${JSON.stringify({ body, intelInterests })}`;
  const cached = cacheGet<{ comparisons: unknown; methodology: string }>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const records = body.destinations
    .map((name) => catalogById(name.toLowerCase()) || catalogByName(name))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (records.length < 2) {
    return NextResponse.json(
      {
        error:
          "Need two to four destinations from the discovery catalog. Try Tokyo, Rome, Barcelona, or Lisbon.",
      },
      { status: 400 },
    );
  }

  const comparisons = compareDestinations(
    records,
    {
      interests: [
        ...new Set([...(body.interests ?? []), ...intelInterests]),
      ] as DiscoverInterest[],
      budgetMax: body.budgetMax ?? intelBudget,
      durationDays: body.durationDays ?? intelDuration,
      seasonMonth: body.seasonMonth,
      transport: body.transport,
    },
    {
      savedNames: body.savedNames,
      dream: body.dream ?? intelDream,
      previousDestinations: body.previousDestinations,
      preferredDestinations,
      downrankedInterests,
    },
  ).sort((a, b) => b.suitabilityPercent - a.suitabilityPercent);

  const payload = {
    comparisons,
    methodology: SCORING_METHODOLOGY,
    notice:
      "Cost and season fields are catalog estimates. No invented dollar prices or live weather. Attraction lists are well-known places without claimed hours or fees.",
  };
  cacheSet(cacheKey, payload, 10 * 60 * 1000);
  return NextResponse.json({ ...payload, cached: false });
}
