import { NextResponse } from "next/server";
import { clearDemoCookie } from "@/lib/demo/session";

export async function POST() {
  const res = NextResponse.json({ ok: true, isDemo: false });
  clearDemoCookie(res);
  return res;
}
