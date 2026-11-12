import { NextResponse } from "next/server";
import { DEMO_LOCAL_STORAGE_TARGETS } from "@/lib/demo/cleanup";
import { clearDemoCookie } from "@/lib/demo/session";

export async function POST() {
  const res = NextResponse.json({
    ok: true,
    isDemo: false,
    clearLocal: true,
    localStorageKeys: [...DEMO_LOCAL_STORAGE_TARGETS],
    localStoragePrefixes: [
      "waypoint:offline-trip:demo-",
      "waypoint:dreamer-email:",
    ],
  });
  clearDemoCookie(res);
  return res;
}
