import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withProfileEntitlement } from "@/lib/billing/access";
import {
  gateFeature,
  PRO_REQUIRED_MESSAGE,
  type ProFeature,
} from "@/lib/billing/entitlements";
import {
  applyOperations,
  inspectDay,
  proposeOptimize,
  proposeWhatIf,
  scoreIfChanged,
  verificationFor,
  type EngineStop,
  type OptimizeMode,
} from "@/lib/trips/engine";

const stopSchema = z.object({
  id: z.string(),
  name: z.string(),
  start: z.string(),
  durationMinutes: z.number(),
  travelMinutesFromPrev: z.number().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  openingHours: z.string().nullable(),
  priority: z.string().nullable().optional(),
  sortOrder: z.number(),
});

const bodySchema = z.object({
  action: z.enum(["quality", "optimize", "whatif", "import"]),
  stops: z.array(stopSchema).default([]),
  mode: z.enum(["balanced", "maximum", "relaxed"]).optional(),
  removeId: z.string().optional(),
  previousSignature: z.string().nullable().optional(),
  pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
  text: z.string().optional(),
});

function parseImport(text: string): EngineStop[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const stops: EngineStop[] = [];
  let day = 0;
  lines.forEach((line, index) => {
    const dayMatch = line.match(/^day\s*(\d+)/i);
    if (dayMatch && line.length < 24) {
      day = Number(dayMatch[1]);
      return;
    }
    const time = line.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let start = "10:00";
    if (time) {
      let hour = Number(time[1]);
      const minute = Number(time[2] ?? 0);
      const mer = time[3]?.toLowerCase();
      if (mer === "pm" && hour < 12) hour += 12;
      if (mer === "am" && hour === 12) hour = 0;
      start = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    stops.push({
      id: `import-${day}-${index}`,
      name: line.replace(/^day\s*\d+\s*[:.-]?\s*/i, "").slice(0, 140) || "Untitled stop",
      start,
      durationMinutes: 60,
      travelMinutesFromPrev: index === 0 ? null : 20,
      lat: null,
      lng: null,
      openingHours: null,
      priority: "preferred",
      sortOrder: stops.length,
    });
  });
  return stops;
}

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const jar = await cookies();
  const feature: ProFeature =
    body.action === "quality"
      ? "quality"
      : body.action === "optimize"
        ? "optimize"
        : body.action === "whatif"
          ? "whatif"
          : "import";
  let userId: string | null = null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const gate = gateFeature(
    feature,
    await withProfileEntitlement((name) => jar.get(name)?.value, userId),
  );
  if (!gate.allowed) {
    return NextResponse.json(
      { error: PRO_REQUIRED_MESSAGE, code: "pro_required" },
      { status: 402 },
    );
  }

  const stops = body.stops as EngineStop[];
  if (body.action === "quality") {
    const scored = scoreIfChanged(body.previousSignature ?? null, stops, {
      pace: body.pace,
    });
    return NextResponse.json({
      ...scored,
      verification: stops.map((stop) => ({
        id: stop.id,
        ...verificationFor(stop),
      })),
      saved: false,
    });
  }

  if (body.action === "import") {
    const preview = parseImport(body.text ?? "");
    return NextResponse.json({
      preview,
      uncertain: preview.filter((s) => s.lat == null).map((s) => s.id),
      saved: false,
      message: "Review these stops before saving. Places without a location were not guessed.",
    });
  }

  const proposal =
    body.action === "whatif"
      ? proposeWhatIf(stops, {
          removeId: body.removeId,
          mode: (body.mode ?? "balanced") as OptimizeMode,
        })
      : proposeOptimize(stops, (body.mode ?? "balanced") as OptimizeMode);
  return NextResponse.json({
    ...proposal,
    findings: inspectDay(proposal.preview, { pace: body.pace }),
    saved: false,
    appliedPreview: applyOperations(stops, proposal.operations),
  });
}
