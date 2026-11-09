import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withProfileEntitlement } from "@/lib/billing/access";
import {
  AI_MONTH_COOKIE,
  AI_USED_COOKIE,
  currentMonthKey,
  gateFeature,
} from "@/lib/billing/entitlements";
import { parseDiscoveryQuery, parseDiscoveryQueryLocal } from "@/lib/discover/parse";
import { buildDiscoverSections } from "@/lib/discover/sections";
import type { DiscoverInterest, DiscoverRegion } from "@/lib/discover/types";
import { cacheGet, cacheSet } from "@/lib/http/accountless-fetch";

const bodySchema = z.object({
  query: z.string().max(500).optional(),
  interests: z.array(z.string()).max(12).optional(),
  budgetMax: z.number().min(0).max(100000).optional(),
  durationDays: z.number().int().min(1).max(60).optional(),
  region: z
    .enum([
      "europe",
      "asia",
      "north-america",
      "latin-america",
      "middle-east",
      "africa",
      "oceania",
    ])
    .optional(),
  seasonMonth: z.number().int().min(1).max(12).optional(),
  climate: z.enum(["warm", "cool", "either"]).optional(),
  similarTo: z.string().max(80).optional(),
  lesserKnownOnly: z.boolean().optional(),
  international: z.boolean().optional(),
  homeCountryCode: z.string().max(4).optional(),
  savedNames: z.array(z.string().max(120)).max(40).optional(),
  previousDestinations: z.array(z.string().max(120)).max(20).optional(),
  dream: z.string().max(300).optional(),
  preferredDestinations: z.array(z.string().max(120)).max(40).optional(),
  downrankedInterests: z.array(z.string().max(40)).max(20).optional(),
  personalizationEnabled: z.boolean().optional(),
});

async function loadIntelligenceContext(userId: string | null) {
  if (!userId) return null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const {
      loadTravelIntelligence,
      effectiveInterestsServer,
    } = await import("@/lib/intelligence/server");
    const supabase = await createSupabaseServerClient();
    const profile = await loadTravelIntelligence(supabase, userId);
    if (!profile.personalizationEnabled) {
      return {
        interests: profile.explicit.interests,
        preferredDestinations: [] as string[],
        previousDestinations: profile.inferred.previousDestinations,
        downrankedInterests: [] as string[],
        dream: profile.explicit.favoriteExperiences[0],
        budgetMax: profile.explicit.budgetMax ?? undefined,
        durationDays: profile.explicit.preferredDurationDays ?? undefined,
      };
    }
    return {
      interests: effectiveInterestsServer(profile),
      preferredDestinations: profile.inferred.preferredDestinations,
      previousDestinations: profile.inferred.previousDestinations,
      downrankedInterests: profile.inferred.downrankedInterests
        .filter((row) => row.evidence >= 2)
        .map((row) => row.interest),
      dream: profile.explicit.favoriteExperiences[0],
      budgetMax: profile.explicit.budgetMax ?? undefined,
      durationDays: profile.explicit.preferredDurationDays ?? undefined,
    };
  } catch {
    return null;
  }
}

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
  const userId = accessUser?.id ?? null;
  const intelligence = await loadIntelligenceContext(userId);

  function mergeContext(
    body: z.infer<typeof bodySchema>,
    interests: string[],
  ) {
    return {
      savedNames: body.savedNames,
      previousDestinations: [
        ...new Set([
          ...(body.previousDestinations ?? []),
          ...(intelligence?.previousDestinations ?? []),
        ]),
      ],
      preferredDestinations: [
        ...new Set([
          ...(body.preferredDestinations ?? []),
          ...(intelligence?.preferredDestinations ?? []),
        ]),
      ],
      downrankedInterests:
        body.personalizationEnabled === false
          ? []
          : [
              ...new Set([
                ...(body.downrankedInterests ?? []),
                ...(intelligence?.downrankedInterests ?? []),
              ]),
            ],
      dream: body.dream ?? intelligence?.dream,
      interests,
    };
  }

  const gate = gateFeature(
    "basic",
    await withProfileEntitlement((name) => cookieStore.get(name)?.value, accessUser),
  );
  if (!gate.allowed) {
    // Still return local rule-based discovery without consuming AI.
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const filters = body.query
      ? parseDiscoveryQueryLocal(body.query)
      : {
          interests: (body.interests ?? []) as DiscoverInterest[],
          budgetMax: body.budgetMax,
          durationDays: body.durationDays,
          region: body.region as DiscoverRegion | undefined,
          seasonMonth: body.seasonMonth,
          climate: body.climate ?? "either",
          similarTo: body.similarTo,
          lesserKnownOnly: body.lesserKnownOnly,
          international: body.international,
          homeCountryCode: body.homeCountryCode,
        };
    const interests = [
      ...new Set([
        ...(filters.interests ?? []),
        ...((body.interests ?? []) as DiscoverInterest[]),
        ...((intelligence?.interests ?? []) as DiscoverInterest[]),
      ]),
    ];
    const built = buildDiscoverSections(
      {
        ...filters,
        interests,
        budgetMax: body.budgetMax ?? filters.budgetMax ?? intelligence?.budgetMax,
        durationDays:
          body.durationDays ?? filters.durationDays ?? intelligence?.durationDays,
        region: (body.region as DiscoverRegion | undefined) ?? filters.region,
        seasonMonth: body.seasonMonth ?? filters.seasonMonth,
        climate: body.climate ?? filters.climate,
        similarTo: body.similarTo ?? filters.similarTo,
        lesserKnownOnly: body.lesserKnownOnly ?? filters.lesserKnownOnly,
        international: body.international ?? filters.international,
        homeCountryCode: body.homeCountryCode ?? filters.homeCountryCode,
      },
      mergeContext(body, interests),
    );
    return NextResponse.json({
      ...built,
      limited: true,
      notice: `${built.notice} AI request limit reached, so this response used rule-based parsing only.`,
    });
  }

  const body = bodySchema.parse(await req.json());
  const cacheKey = `discover:v1:${JSON.stringify({ body, intelligence })}`;
  const cached = cacheGet<ReturnType<typeof buildDiscoverSections>>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true, limited: false });
  }

  const parsed = body.query
    ? await parseDiscoveryQuery(body.query)
    : {
        interests: (body.interests ?? []) as DiscoverInterest[],
        budgetMax: body.budgetMax,
        durationDays: body.durationDays,
        region: body.region as DiscoverRegion | undefined,
        seasonMonth: body.seasonMonth,
        climate: body.climate ?? "either",
        similarTo: body.similarTo,
        lesserKnownOnly: body.lesserKnownOnly,
        international: body.international,
        homeCountryCode: body.homeCountryCode,
      };

  const interests = [
    ...new Set([
      ...(parsed.interests ?? []),
      ...((body.interests ?? []) as DiscoverInterest[]),
      ...((intelligence?.interests ?? []) as DiscoverInterest[]),
    ]),
  ];

  const filters = {
    ...parsed,
    interests,
    budgetMax: body.budgetMax ?? parsed.budgetMax ?? intelligence?.budgetMax,
    durationDays:
      body.durationDays ?? parsed.durationDays ?? intelligence?.durationDays,
    region: (body.region as DiscoverRegion | undefined) ?? parsed.region,
    seasonMonth: body.seasonMonth ?? parsed.seasonMonth,
    climate: body.climate ?? parsed.climate,
    similarTo: body.similarTo ?? parsed.similarTo,
    lesserKnownOnly: body.lesserKnownOnly ?? parsed.lesserKnownOnly,
    international: body.international ?? parsed.international,
    homeCountryCode: body.homeCountryCode ?? parsed.homeCountryCode,
  };

  const built = buildDiscoverSections(filters, mergeContext(body, interests));
  cacheSet(cacheKey, built, 10 * 60 * 1000);

  if (gate.consumes) {
    const used = gate.used + 1;
    cookieStore.set(AI_USED_COOKIE, String(used), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    cookieStore.set(AI_MONTH_COOKIE, currentMonthKey(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return NextResponse.json({ ...built, cached: false, limited: false });
}
