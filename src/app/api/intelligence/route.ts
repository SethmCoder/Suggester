import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWishlistUser, offlineJson } from "@/lib/wishlist/auth";
import { applySignal, buildExplanations } from "@/lib/intelligence/derive";
import { emptyIntelligence, type TravelIntelligence } from "@/lib/intelligence/types";

const signalSchema = z.object({
  type: z.string(),
}).passthrough();

const profileSchema = z.object({
  version: z.literal(1),
  personalizationEnabled: z.boolean(),
  explicit: z.object({
    interests: z.array(z.string()).max(20),
    pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
    transport: z.string().max(40).optional(),
    budgetMin: z.number().nullable().optional(),
    budgetMax: z.number().nullable().optional(),
    preferredDurationDays: z.number().nullable().optional(),
    destinationTypes: z.array(z.string()).max(20),
    preferredRegions: z.array(z.string()).max(20),
    favoriteExperiences: z.array(z.string()).max(20),
    avoidedExperiences: z.array(z.string()).max(20),
  }),
  inferred: z.object({
    interests: z.array(z.any()).max(40),
    preferredDestinations: z.array(z.string()).max(40),
    previousDestinations: z.array(z.string()).max(40),
    downrankedInterests: z.array(z.any()).max(40),
  }),
  explanations: z.array(z.string()).max(12),
  updatedAt: z.string(),
});

function readProfile(raw: unknown): TravelIntelligence {
  if (!raw || typeof raw !== "object") return emptyIntelligence();
  const bag = raw as { travelIntelligence?: TravelIntelligence } & TravelIntelligence;
  if (bag.travelIntelligence?.version === 1) return bag.travelIntelligence;
  if (bag.version === 1) return bag as TravelIntelligence;
  return emptyIntelligence();
}

export async function GET() {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) {
    return offlineJson({ profile: emptyIntelligence() });
  }
  const { data, error } = await auth.supabase
    .from("profiles")
    .select("traveler_profile")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({
      offline: true,
      profile: emptyIntelligence(),
      error: error.message,
    });
  }
  const profile = readProfile(data?.traveler_profile);
  return NextResponse.json({
    offline: false,
    profile: {
      ...profile,
      explanations: buildExplanations(profile),
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = z.object({ profile: profileSchema }).parse(await req.json());
  const profile = {
    ...body.profile,
    explanations: buildExplanations(body.profile as TravelIntelligence),
    updatedAt: new Date().toISOString(),
  };
  const { data: existing } = await auth.supabase
    .from("profiles")
    .select("traveler_profile")
    .eq("id", auth.user.id)
    .maybeSingle();
  const previous =
    existing?.traveler_profile && typeof existing.traveler_profile === "object"
      ? (existing.traveler_profile as Record<string, unknown>)
      : {};
  const { error } = await auth.supabase.from("profiles").upsert({
    id: auth.user.id,
    traveler_profile: {
      ...previous,
      travelIntelligence: profile,
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const auth = await requireWishlistUser();
  if (auth.offline || !auth.supabase || !auth.user) return offlineJson();
  const body = z.object({ signal: signalSchema }).parse(await req.json());
  const { data: existing } = await auth.supabase
    .from("profiles")
    .select("traveler_profile")
    .eq("id", auth.user.id)
    .maybeSingle();
  const previous =
    existing?.traveler_profile && typeof existing.traveler_profile === "object"
      ? (existing.traveler_profile as Record<string, unknown>)
      : {};
  const current = readProfile(existing?.traveler_profile);
  const next = applySignal(current, body.signal as never);
  const profile = {
    ...next,
    explanations: buildExplanations(next),
    updatedAt: new Date().toISOString(),
  };
  await auth.supabase.from("profiles").upsert({
    id: auth.user.id,
    traveler_profile: {
      ...previous,
      travelIntelligence: profile,
    },
  });
  return NextResponse.json({ profile });
}
