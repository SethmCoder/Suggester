"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDemoTripPayload, listDemoTrips } from "@/lib/demo/data";
import { saveOfflineTrip } from "@/lib/offline/trips";

function seedDemoOffline() {
  for (const trip of listDemoTrips()) {
    const payload = getDemoTripPayload(trip.id);
    saveOfflineTrip({
      trip: { ...payload.trip, day_count: payload.days.length },
      days: payload.days,
      activities: payload.activities,
      updatedAt: new Date().toISOString(),
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
    try {
      seedDemoOffline();
    } catch {
      /* localStorage may be blocked */
    }
    try {
      const res = await fetch("/api/demo/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start demo");
      router.push("/dashboard");
      router.refresh();
    } catch {
      // Offline demo: local copies are enough to browse Paris + Dubai
      router.push("/dashboard");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={loading}
      onClick={startDemo}
    >
      {loading ? "Starting demo…" : "Try demo"}
    </Button>
  );
}
