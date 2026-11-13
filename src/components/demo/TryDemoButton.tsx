"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  DEMO_CONTENT_VERSION,
  getDemoTripPayload,
  listDemoTrips,
} from "@/lib/demo/data";
import { DEMO_AVATAR_USER_ID, clearMismatchedAvatarKeys } from "@/lib/avatar";
import { clearDemoLocalStorage } from "@/lib/demo/cleanup";
import { saveOfflineTrip } from "@/lib/offline/trips";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

function seedDemoOffline() {
  for (const trip of listDemoTrips()) {
    const payload = getDemoTripPayload(trip.id);
    saveOfflineTrip({
      trip: { ...payload.trip, day_count: payload.days.length },
      days: payload.days,
      activities: payload.activities,
      legs: payload.legs,
      updatedAt: new Date().toISOString(),
      contentVersion: DEMO_CONTENT_VERSION,
    });
  }
}

export function TryDemoButton({
  variant = "secondary",
  className = "",
}: {
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startDemo() {
    setLoading(true);
    clearMismatchedAvatarKeys(DEMO_AVATAR_USER_ID);
    clearDemoLocalStorage();
    try {
      seedDemoOffline();
    } catch {
      /* localStorage may be blocked */
    }

    try {
      const res = await fetch("/api/demo/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start demo");
    } catch {
      // Offline demo: local copies are enough to browse Paris
    }

    // Clear any leftover personal session from browser storage.
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* continue into demo anyway */
      }
    }

    router.push("/dashboard");
    router.refresh();
    setLoading(false);
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={loading}
      onClick={() => void startDemo()}
    >
      {loading ? "Starting demo…" : "Try demo"}
    </Button>
  );
}
