import { NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  isSupabaseServerConfigured,
} from "@/lib/supabase/env";

/** Lightweight readiness check for Vercel + local. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    supabasePublic: isSupabaseConfigured(),
    supabaseServer: isSupabaseServerConfigured(),
    groq: Boolean(process.env.GROQ_API_KEY),
    mapsProvider: process.env.MAPS_PROVIDER ?? "openstreetmap",
    googleMapsServer: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY),
    googleMapsBrowser: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY),
    openStreetMap: true,
  });
}
