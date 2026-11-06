import { NextResponse } from "next/server";
import { z } from "zod";
import {
  localIntroFollowUp,
  profileFromIntro,
  scriptedIntroTurn,
  type IntroLine,
  type IntroTurn,
} from "@/lib/profile/intro-chat";
import { INTRO_COOKIE, emptyTraveler, type TravelerProfile } from "@/lib/profile/traveler";
import { replyRepeats, type ClarifyChoice } from "@/lib/trips/clarify-chat";

const lineSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(2000),
});

const bodySchema = z.object({
  history: z.array(lineSchema).max(16).optional(),
  message: z.string().max(2000).optional(),
  save: z.boolean().optional(),
});

const SYSTEM = `You are learning how one traveler likes to take trips. Age and dream vacation were already asked. Do not ask those again.

Ask one new multiple-choice question based on their answers. Use it to learn places they have liked, how they like to travel, or what a plan should avoid. Do not invent cities or trips they did not name. If they typed a place, you may ask whether this app should plan more trips like that.

Write 3 or 4 short options. Do not include Other; the app adds it. The reply is one or two sentences, then the question. Never repeat a question from the history.
After two questions beyond age and dream vacation, set done to true, leave choices empty, and recap only what they said.
Return JSON only: {"reply":"...","done":false,"choices":[{"id":"a","label":"..."}]}`;

export async function GET() {
  const profile = await readProfile();
  return NextResponse.json({ profile: profile ?? emptyTraveler() });
}

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const history = (body.history ?? []) as IntroLine[];
  const message = body.message?.trim() ?? "";
  const scripted = scriptedIntroTurn(history, message);
  const local = scripted ?? localIntroFollowUp(history, message);
  const modeled = scripted ? null : await modelIntro(history, message);
  const previous = [...history].reverse().find((line) => line.role === "assistant")?.text;
  const modelOk =
    modeled &&
    modeled.reply.trim().length >= 8 &&
    !replyRepeats(previous, modeled.reply) &&
    (modeled.done || modeled.choices.length >= 2);
  const turn = modelOk && modeled ? modeled : local;
  const profile = turn.done ? profileFromIntro(history, message) : null;
  if (profile) await saveProfile(profile);
  const response = NextResponse.json({
    reply: turn.reply,
    done: turn.done,
    choices: turn.choices,
    allowOther: !turn.done,
    profile,
    source: modelOk ? "model" : "rules",
  });
  if (turn.done) {
    response.cookies.set(INTRO_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

async function modelIntro(history: IntroLine[], message: string): Promise<IntroTurn | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const { groqChat } = await import("@/lib/ai/groq");
    const raw = await groqChat({
      temperature: 0.5,
      effort: "low",
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify({ history, message }) },
      ],
    });
    if (!raw) return null;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { reply?: unknown; done?: unknown; choices?: unknown };
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
    const choices: ClarifyChoice[] = [];
    if (Array.isArray(parsed.choices)) {
      for (const choice of parsed.choices) {
        if (!choice || typeof choice !== "object") continue;
        const label = "label" in choice && typeof choice.label === "string" ? choice.label.trim() : "";
        const id = "id" in choice && typeof choice.id === "string" ? choice.id.trim() : label;
        if (!label) continue;
        choices.push({ id: id.slice(0, 40) || `c${choices.length}`, label: label.slice(0, 80) });
        if (choices.length >= 4) break;
      }
    }
    return { reply: parsed.reply.trim(), done: parsed.done === true, choices };
  } catch {
    return null;
  }
}

async function readProfile(): Promise<TravelerProfile | null> {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("traveler_profile")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { traveler_profile?: TravelerProfile | null }).traveler_profile;
    if (!raw || typeof raw !== "object") return null;
    return { ...emptyTraveler(), ...raw, answers: raw.answers ?? [] };
  } catch {
    return null;
  }
}

async function saveProfile(profile: TravelerProfile) {
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").upsert({ id: user.id, traveler_profile: profile });
  } catch {
    /* the browser keeps a copy when the column is not migrated yet */
  }
}
